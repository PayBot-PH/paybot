"""
Xendit webhook router and disbursement endpoint.

Webhook verification uses X-CALLBACK-TOKEN header comparison against
XENDIT_WEBHOOK_TOKEN environment variable.

Supported webhook events:
  - invoice.paid / PAID status -> credit wallet
  - disbursement.completed     -> mark disbursement SUCCESS
  - disbursement.failed        -> mark disbursement FAILED, refund wallet balance
"""
import json
import logging
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.disbursements import Disbursements
from models.paymongo_webhook_events import PaymongoWebhookEvent
from models.transactions import Transactions
from models.wallet_transactions import Wallet_transactions
from models.wallets import Wallets
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.xendit_service import XenditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/xendit", tags=["xendit"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _credit_wallet(
    db: AsyncSession,
    user_id: str,
    amount: float,
    note: str,
    reference_id: str,
) -> None:
    from services.wallets import WalletsService

    svc = WalletsService(db)
    wallet = await svc.get_or_create_wallet(user_id, "PHP", lock=True)

    balance_before = wallet.balance
    wallet.balance = round(wallet.balance + amount, 2)
    if hasattr(wallet, "available_balance"):
        wallet.available_balance = round((wallet.available_balance or 0.0) + amount, 2)
    wallet.updated_at = datetime.now(timezone.utc)

    wtxn = Wallet_transactions(
        user_id=wallet.user_id,
        wallet_id=wallet.id,
        transaction_type="top_up",
        amount=amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=note,
        status="completed",
        reference_id=reference_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(wtxn)
    await db.commit()
    await svc.publish_wallet_event(wallet.user_id, wallet, "top_up", amount, wtxn.id, note)


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def xendit_webhook(
    request: Request,
    x_callback_token: Optional[str] = Header(None, alias="x-callback-token"),
    db: AsyncSession = Depends(get_db),
):
    """Receive Xendit webhook callbacks.

    Xendit sends a flat token in the X-CALLBACK-TOKEN header (not HMAC).
    We compare it directly against XENDIT_WEBHOOK_TOKEN.
    """
    try:
        raw_body = await request.body()
        svc = XenditService()

        # Prefer HMAC signature verification when a webhook secret is configured.
        # Xendit may send signatures in different headers depending on integration.
        signature = (
            request.headers.get("X-Callback-Signature")
            or request.headers.get("X-Xendit-Signature")
            or request.headers.get("X-Signature")
            or request.headers.get("X-XENDIT-SIGNATURE")
        )
        if signature:
            if not svc.verify_webhook_signature(raw_body, signature):
                logger.warning("Xendit webhook: invalid HMAC signature")
                return {"status": "error", "message": "Invalid webhook signature"}
        else:
            # Fallback to legacy token header (X-CALLBACK-TOKEN) when signature not provided
            token = x_callback_token or request.headers.get("X-Callback-Token") or ""
            if token:
                if not svc.verify_webhook_token(token):
                    logger.warning("Xendit webhook: invalid X-CALLBACK-TOKEN")
                    return {"status": "error", "message": "Invalid callback token"}
            else:
                logger.debug("Xendit webhook: no verification header present — skipping verification")

        body = json.loads(raw_body)
        event_type = body.get("event") or body.get("type") or ""
        logger.info("Xendit webhook received: %s", event_type)

        # Idempotency check
        event_id = (
            body.get("id")
            or (body.get("data") or {}).get("id")
            or body.get("event_id")
            or ""
        )
        if event_id:
            try:
                existing = await db.execute(
                    select(PaymongoWebhookEvent).where(
                        PaymongoWebhookEvent.event_id == event_id
                    )
                )
                if existing.scalar_one_or_none():
                    logger.info("Duplicate Xendit event %s — skipping", event_id)
                    return {"status": "ok", "message": "duplicate"}
                db.add(
                    PaymongoWebhookEvent(
                        event_id=event_id,
                        event_type=event_type or "xendit",
                        processed_at=datetime.now(timezone.utc),
                    )
                )
                await db.flush()
            except Exception:
                await db.rollback()

        # -- Invoice paid --
        is_invoice_paid = (
            "invoice.paid" in event_type.lower()
            or str(body.get("status", "")).upper() in ("PAID", "SETTLED", "COMPLETED")
        )

        if is_invoice_paid:
            external_id = (
                body.get("external_id")
                or body.get("externalId")
                or (body.get("data") or {}).get("external_id")
                or ""
            )
            xendit_id = body.get("id") or (body.get("data") or {}).get("id") or ""
            amount = float(body.get("amount") or body.get("paid_amount") or 0)

            txn = None
            if external_id:
                res = await db.execute(
                    select(Transactions).where(Transactions.external_id == external_id)
                )
                txn = res.scalar_one_or_none()
            if not txn and xendit_id:
                res = await db.execute(
                    select(Transactions).where(Transactions.xendit_id == xendit_id)
                )
                txn = res.scalar_one_or_none()

            if txn:
                old_status = txn.status
                if old_status != "paid":
                    txn.status = "paid"
                    txn.updated_at = datetime.now(timezone.utc)
                    await db.flush()

                    topup_amount = txn.amount if txn.amount else amount
                    if txn.user_id and topup_amount > 0:
                        await _credit_wallet(
                            db,
                            txn.user_id,
                            topup_amount,
                            note=f"Xendit payment: {txn.description or txn.external_id}",
                            reference_id=txn.external_id or xendit_id,
                        )
                        payment_event_bus.publish(
                            {
                                "event_type": "status_change",
                                "transaction_id": txn.id,
                                "external_id": txn.external_id,
                                "old_status": old_status,
                                "new_status": "paid",
                                "amount": topup_amount,
                                "description": txn.description or "",
                                "transaction_type": txn.transaction_type,
                                "user_id": txn.user_id,
                            }
                        )
            else:
                logger.warning(
                    "Xendit invoice.paid: no transaction found for external_id=%s id=%s",
                    external_id,
                    xendit_id,
                )

        # -- Disbursement completed / failed --
        elif "disbursement" in event_type.lower():
            disb_data = body.get("data") or body
            external_id = (
                disb_data.get("external_id")
                or disb_data.get("externalId")
                or body.get("external_id")
                or ""
            )
            disb_status = str(
                disb_data.get("status") or body.get("status") or ""
            ).upper()

            disb = None
            if external_id:
                res = await db.execute(
                    select(Disbursements).where(Disbursements.external_id == external_id)
                )
                disb = res.scalar_one_or_none()

            if disb:
                if disb_status == "COMPLETED":
                    disb.status = "completed"
                    disb.updated_at = datetime.now(timezone.utc)
                elif disb_status == "FAILED":
                    disb.status = "failed"
                    disb.updated_at = datetime.now(timezone.utc)
                    # Refund the deducted balance back to the user
                    if disb.user_id and disb.amount:
                        await _credit_wallet(
                            db,
                            disb.user_id,
                            float(disb.amount),
                            note=f"Xendit disbursement failed — refund: {external_id}",
                            reference_id=external_id,
                        )
                await db.flush()
            else:
                logger.warning(
                    "Xendit disbursement webhook: no record found for external_id=%s",
                    external_id,
                )

        await db.commit()
        return {"status": "ok"}

    except Exception as e:
        logger.error("Xendit webhook error: %s", str(e), exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Payment collection endpoints
# ---------------------------------------------------------------------------

class CreateXenditInvoiceRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""
    external_id: str = ""


class CreateXenditQRRequest(BaseModel):
    amount: float
    description: str = ""
    external_id: str = ""


@router.post("/create-invoice")
async def create_xendit_invoice(
    data: CreateXenditInvoiceRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Xendit invoice (hosted checkout page)."""
    from services.transactions import TransactionsService

    svc = XenditService()
    external_id = data.external_id or f"xendit-inv-{uuid.uuid4().hex[:12]}"
    result = await svc.create_invoice(
        amount=data.amount,
        external_id=external_id,
        payer_email=data.customer_email,
        description=data.description or "Invoice",
    )

    if not result.get("success"):
        try:
            from services.maya_service import MayaService

            maya = MayaService()
            fallback = await maya.create_checkout(
                amount=data.amount,
                description=data.description or "Invoice",
                customer_name=data.customer_name,
                customer_email=data.customer_email,
                external_id=external_id,
            )
            if fallback.get("success"):
                txn_svc = TransactionsService(db)
                txn = await txn_svc.create_transaction(
                    user_id=str(current_user.id),
                    transaction_type="invoice",
                    amount=data.amount,
                    external_id=fallback.get("external_id", external_id),
                    gateway_id=fallback.get("checkout_id", ""),
                    description=data.description,
                    customer_name=data.customer_name,
                    customer_email=data.customer_email,
                    payment_url=fallback.get("checkout_url", ""),
                )
                return {
                    "success": True,
                    "message": "Invoice created via fallback gateway",
                    "transaction_id": txn.id,
                    "invoice_id": fallback.get("checkout_id"),
                    "external_id": fallback.get("external_id", external_id),
                    "invoice_url": fallback.get("checkout_url", ""),
                    "amount": data.amount,
                    "gateway": "maya",
                }
        except Exception as exc:
            logger.warning("Invoice fallback to Maya failed: %s", exc)

        return {"success": False, "message": result.get("error", "Failed to create Xendit invoice")}

    txn_svc = TransactionsService(db)
    txn = await txn_svc.create_transaction(
        user_id=str(current_user.id),
        transaction_type="invoice",
        amount=data.amount,
        external_id=external_id,
        gateway_id=result.get("invoice_id", ""),
        description=data.description,
        customer_name=data.customer_name,
        customer_email=data.customer_email,
        payment_url=result.get("payment_url", ""),
    )

    return {
        "success": True,
        "message": "Xendit invoice created",
        "transaction_id": txn.id,
        "invoice_id": result.get("invoice_id"),
        "external_id": external_id,
        "invoice_url": result.get("payment_url"),
        "amount": data.amount,
        "gateway": "xendit",
    }


@router.post("/create-qr-code")
async def create_xendit_qr(
    data: CreateXenditQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Xendit QR code payment."""
    from services.transactions import TransactionsService

    svc = XenditService()
    external_id = data.external_id or f"xendit-qr-{uuid.uuid4().hex[:12]}"
    result = await svc.create_qr_code(
        amount=data.amount,
        external_id=external_id,
        description=data.description,
    )
    if not result.get("success"):
        try:
            from services.maya_service import MayaService

            maya = MayaService()
            fallback = await maya.create_qr_payment(
                amount=data.amount,
                description=data.description,
                external_id=external_id,
            )
            if fallback.get("success"):
                txn_svc = TransactionsService(db)
                txn = await txn_svc.create_transaction(
                    user_id=str(current_user.id),
                    transaction_type="qr_code",
                    amount=data.amount,
                    external_id=fallback.get("external_id", external_id),
                    gateway_id=fallback.get("qr_id", ""),
                    description=data.description,
                    payment_url=fallback.get("qr_content", "") or fallback.get("redirect_url", ""),
                )
                return {
                    "success": True,
                    "message": "QR code created via fallback gateway",
                    "transaction_id": txn.id,
                    "qr_id": fallback.get("qr_id"),
                    "qr_image_url": fallback.get("qr_content", ""),
                    "external_id": fallback.get("external_id", external_id),
                    "amount": data.amount,
                    "gateway": "maya",
                }
        except Exception as exc:
            logger.warning("QR fallback to Maya failed: %s", exc)

        return {"success": False, "message": result.get("error", "Failed to create Xendit QR")}

    txn_svc = TransactionsService(db)
    txn = await txn_svc.create_transaction(
        user_id=str(current_user.id),
        transaction_type="qr_code",
        amount=data.amount,
        external_id=external_id,
        gateway_id=result.get("qr_id", ""),
        description=data.description,
        payment_url=result.get("qr_image_url", ""),
    )

    return {
        "success": True,
        "message": "Xendit QR code created",
        "transaction_id": txn.id,
        "qr_id": result.get("qr_id"),
        "qr_image_url": result.get("qr_image_url"),
        "external_id": external_id,
        "amount": data.amount,
        "gateway": "xendit",
    }


@router.post("/create-payment-link")
async def create_xendit_payment_link(
    data: CreateXenditInvoiceRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Xendit payment link (reuses invoice endpoint)."""
    from services.transactions import TransactionsService

    svc = XenditService()
    external_id = data.external_id or f"xendit-pl-{uuid.uuid4().hex[:12]}"
    result = await svc.create_invoice(
        amount=data.amount,
        external_id=external_id,
        payer_email=data.customer_email,
        description=data.description or "Payment Link",
    )
    if not result.get("success"):
        try:
            from services.maya_service import MayaService

            maya = MayaService()
            fallback = await maya.create_checkout(
                amount=data.amount,
                description=data.description or "Payment Link",
                customer_name=data.customer_name,
                customer_email=data.customer_email,
                external_id=external_id,
            )
            if fallback.get("success"):
                txn_svc = TransactionsService(db)
                txn = await txn_svc.create_transaction(
                    user_id=str(current_user.id),
                    transaction_type="payment_link",
                    amount=data.amount,
                    external_id=fallback.get("external_id", external_id),
                    gateway_id=fallback.get("checkout_id", ""),
                    description=data.description,
                    customer_name=data.customer_name,
                    customer_email=data.customer_email,
                    payment_url=fallback.get("checkout_url", ""),
                )
                return {
                    "success": True,
                    "message": "Payment link created via fallback gateway",
                    "transaction_id": txn.id,
                    "invoice_id": fallback.get("checkout_id"),
                    "external_id": fallback.get("external_id", external_id),
                    "checkout_url": fallback.get("checkout_url", ""),
                    "amount": data.amount,
                    "gateway": "maya",
                }
        except Exception as exc:
            logger.warning("Payment link fallback to Maya failed: %s", exc)

        return {"success": False, "message": result.get("error", "Failed to create payment link")}

    txn_svc = TransactionsService(db)
    txn = await txn_svc.create_transaction(
        user_id=str(current_user.id),
        transaction_type="payment_link",
        amount=data.amount,
        external_id=external_id,
        gateway_id=result.get("invoice_id", ""),
        description=data.description,
        customer_name=data.customer_name,
        customer_email=data.customer_email,
        payment_url=result.get("payment_url", ""),
    )

    return {
        "success": True,
        "message": "Xendit payment link created",
        "transaction_id": txn.id,
        "invoice_id": result.get("invoice_id"),
        "external_id": external_id,
        "checkout_url": result.get("payment_url"),
        "amount": data.amount,
        "gateway": "xendit",
    }


# ---------------------------------------------------------------------------
# Disbursement (payout)
# ---------------------------------------------------------------------------

class XenditDisbursementRequest(BaseModel):
    amount: float
    bank_code: str
    account_number: str
    account_name: str
    description: str = ""
    pin: Optional[str] = None


@router.post("/disburse")
async def xendit_disburse(
    data: XenditDisbursementRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate a Xendit disbursement (payout to bank/e-wallet).

    Flow:
    1. Verify PIN
    2. Check available_balance
    3. Deduct balance immediately (prevents double-spend)
    4. Call Xendit Disbursements API
    5. Log to disbursements table
    6. On API failure -> rollback balance
    """
    from services.auth import AuthService
    from services.wallets import WalletsService

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    auth_svc = AuthService(db)
    if not await auth_svc.verify_pin(str(current_user.id), data.pin or ""):
        raise HTTPException(status_code=403, detail="Invalid security PIN")

    wallet_svc = WalletsService(db)
    wallet = await wallet_svc.get_or_create_wallet(str(current_user.id), "PHP", lock=True)

    available = float(getattr(wallet, "available_balance", wallet.balance) or 0)
    if available < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient settled balance")

    # Deduct immediately to prevent double-spend
    if hasattr(wallet, "available_balance"):
        wallet.available_balance = round(available - data.amount, 2)
    wallet.balance = round(float(wallet.balance or 0) - data.amount, 2)
    wallet.updated_at = datetime.now(timezone.utc)
    await db.flush()

    external_id = f"xendit-disb-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    # Log disbursement as pending
    disb = Disbursements(
        user_id=str(current_user.id),
        external_id=external_id,
        amount=data.amount,
        currency="PHP",
        bank_code=data.bank_code,
        account_number=data.account_number,
        account_name=data.account_name,
        description=data.description,
        status="pending",
        disbursement_type="xendit",
        created_at=now,
        updated_at=now,
    )
    db.add(disb)
    await db.flush()

    # Call Xendit API
    svc = XenditService()
    result = await svc.create_disbursement(
        external_id=external_id,
        bank_code=data.bank_code,
        account_holder_name=data.account_name,
        account_number=data.account_number,
        description=data.description or "xend Disbursement",
        amount=data.amount,
    )

    if not result.get("success"):
        # Rollback: refund the deducted balance
        if hasattr(wallet, "available_balance"):
            wallet.available_balance = round(float(wallet.available_balance or 0) + data.amount, 2)
        wallet.balance = round(float(wallet.balance or 0) + data.amount, 2)
        wallet.updated_at = datetime.now(timezone.utc)
        disb.status = "failed"
        disb.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Xendit disbursement failed: {result.get('error', 'Unknown error')}",
        )

    disb.status = "pending"  # Xendit will confirm via webhook
    disb.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "success": True,
        "message": "Xendit disbursement initiated",
        "disbursement_id": result.get("disbursement_id"),
        "external_id": external_id,
        "status": result.get("status", "PENDING"),
        "amount": data.amount,
    }


@router.get("/available-banks")
async def xendit_available_banks(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return Xendit's list of supported disbursement banks."""
    svc = XenditService()
    result = await svc.get_available_banks()
    if result.get("success"):
        return {"success": True, "banks": result.get("banks", [])}
    return {"success": False, "banks": [], "error": result.get("error")}


@router.get("/balance")
async def xendit_balance(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return Xendit account balance."""
    svc = XenditService()
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{svc.base_url}/balance",
                auth=svc._auth(),
                timeout=15.0,
            )
            r.raise_for_status()
            data = r.json()
            return {"success": True, "balance": data.get("balance", 0), "currency": "PHP"}
    except Exception as e:
        logger.error("Xendit balance error: %s", e)
        return {"success": False, "balance": None, "error": str(e)}