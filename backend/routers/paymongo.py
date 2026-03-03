"""
PayMongo API Router.

Endpoints
---------
POST /topup              — Initiate a wallet top-up (checkout session or source).
POST /alipay-qr          — Alipay QR payment (legacy / direct source creation).
POST /wechat-qr          — WeChat Pay QR payment (legacy / direct source creation).
GET  /sources/{id}       — Poll source status.
POST /webhook            — Receive PayMongo webhook events (signature-verified,
                           idempotent).
GET  /redirect/success   — PayMongo payment success redirect landing.
GET  /redirect/failed    — PayMongo payment failed/cancelled redirect landing.

Webhook processing
------------------
* Verifies the ``Paymongo-Signature`` header before processing.
* Records each PayMongo event ID in ``paymongo_webhook_events`` to prevent
  double-crediting on duplicate deliveries.
* On ``source.chargeable`` (Alipay / WeChat) or
  ``checkout_session.payment.paid`` / ``payment.paid`` events, credits the
  user's PHP wallet via an immutable ``wallet_transactions`` ledger entry.
* On ``source.failed`` / ``checkout_session.payment.failed`` events, marks
  the top-up record as failed.

Configure the webhook in the PayMongo dashboard:
  URL    : https://<your-domain>/api/v1/paymongo/webhook
  Events : source.chargeable, checkout_session.payment.paid,
           checkout_session.payment.failed, payment.paid, payment.failed
"""
import hashlib
import hmac as _hmac
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.paymongo_webhook_events import PaymongoWebhookEvent
from models.transactions import Transactions
from models.wallet_topups import WalletTopup
from models.wallet_transactions import Wallet_transactions
from models.wallets import Wallets
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/paymongo", tags=["paymongo"])


# ---------- Schemas ----------

class TopupRequest(BaseModel):
    amount: float
    description: str = "Wallet Top Up"
    payment_method: str = "checkout"  # "checkout" | "alipay" | "wechat"
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None
    payment_method_types: Optional[List[str]] = None


class AlipayQRRequest(BaseModel):
    amount: float
    description: str = "Alipay payment"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


class WeChatQRRequest(BaseModel):
    amount: float
    description: str = "WeChat Pay"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


class PaymentResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict = {}


class ClaimDepositRequest(BaseModel):
    payment_channel: str   # "gcash", "maya", "bdo", "bpi", etc.
    account_number: str    # mobile number or bank account used to send
    amount: float


# Map user-friendly channel names to PayMongo source types
CHANNEL_SOURCE_TYPES: dict = {
    "gcash":      ["gcash"],
    "maya":       ["paymaya"],
    "paymaya":    ["paymaya"],
    "bdo":        ["dob", "brankas_bdo"],
    "bpi":        ["dob", "brankas_bpi"],
    "metrobank":  ["dob", "brankas_metrobank"],
    "landbank":   ["dob", "brankas_landbank"],
    "unionbank":  ["dob"],
    "card":       ["card"],
}


# ---------- Helpers ----------

async def _save_transaction(
    db: AsyncSession,
    user_id: str,
    transaction_type: str,
    result: dict,
    amount: float,
    description: str,
) -> Optional[Transactions]:
    try:
        now = datetime.now()
        txn = Transactions(
            user_id=user_id,
            transaction_type=transaction_type,
            external_id=result.get("reference_number", ""),
            xendit_id=result.get("source_id", ""),
            amount=amount,
            currency="PHP",
            status="pending",
            description=description,
            qr_code_url=result.get("checkout_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)
        return txn
    except Exception as e:
        logger.error("DB save failed for PayMongo transaction: %s", e, exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return None


async def _credit_wallet(
    db: AsyncSession,
    user_id: str,
    amount: float,
    note: str,
    reference_id: str,
) -> None:
    """Credit the user's PHP wallet and publish a wallet_update event."""
    wallet_res = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "PHP")
    )
    wallet = wallet_res.scalar_one_or_none()
    if not wallet:
        now_w = datetime.now()
        wallet = Wallets(
            user_id=user_id, balance=0.0, currency="PHP",
            created_at=now_w, updated_at=now_w,
        )
        db.add(wallet)
        await db.flush()

    balance_before = wallet.balance
    wallet.balance += amount
    wallet.updated_at = datetime.now()

    wtxn = Wallet_transactions(
        user_id=user_id,
        wallet_id=wallet.id,
        transaction_type="top_up",
        amount=amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=note,
        status="completed",
        reference_id=reference_id,
        created_at=datetime.now(),
    )
    db.add(wtxn)
    await db.commit()

    payment_event_bus.publish({
        "event_type": "wallet_update",
        "user_id": user_id,
        "wallet_id": wallet.id,
        "balance": wallet.balance,
        "transaction_type": "top_up",
        "amount": amount,
        "transaction_id": wtxn.id,
    })
    logger.info("Wallet credited +%s PHP for user %s via PayMongo", amount, user_id)


# ---------- Endpoints ----------

@router.post("/topup", response_model=PaymentResponse)
async def initiate_topup(
    req: TopupRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate a PayMongo wallet top-up.

    Creates a PayMongo Checkout Session (for GCash, Maya, cards, etc.) or a
    Source (for Alipay / WeChat Pay) and persists a ``wallet_topups`` record
    linking this top-up to the authenticated user.

    The wallet is credited automatically when PayMongo confirms payment via
    the ``/webhook`` endpoint.
    """
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    svc = PayMongoService()
    now = datetime.now()

    if req.payment_method in ("alipay", "wechat"):
        result = await svc.create_source(
            amount=req.amount,
            payment_type=req.payment_method,
            description=req.description,
            success_url=req.success_url or "",
            failed_url=req.cancel_url or "",
        )
        if not result.get("success"):
            raise HTTPException(status_code=502, detail=result.get("error", "PayMongo API error"))

        topup = WalletTopup(
            user_id=str(current_user.id),
            amount=req.amount,
            currency="PHP",
            paymongo_source_id=result.get("source_id", ""),
            reference_number=result.get("reference_number", ""),
            payment_method=req.payment_method,
            status="pending",
            description=req.description,
            checkout_url=result.get("checkout_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(topup)
        await db.commit()
        await db.refresh(topup)

        return PaymentResponse(
            success=True,
            message=f"{req.payment_method.title()} QR created. Scan to pay — wallet credited automatically on success.",
            data={
                "topup_id": topup.id,
                "source_id": result.get("source_id", ""),
                "checkout_url": result.get("checkout_url", ""),
                "reference_number": result.get("reference_number", ""),
                "amount": req.amount,
            },
        )

    # Default: checkout session (GCash, Maya, card, etc.)
    result = await svc.create_checkout_session(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url or "",
        cancel_url=req.cancel_url or "",
        payment_method_types=req.payment_method_types,
        customer_email=req.customer_email or "",
        customer_name=req.customer_name or "",
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "PayMongo API error"))

    topup = WalletTopup(
        user_id=str(current_user.id),
        amount=req.amount,
        currency="PHP",
        paymongo_checkout_session_id=result.get("checkout_session_id", ""),
        reference_number=result.get("reference_number", ""),
        payment_method=req.payment_method,
        status="pending",
        description=req.description,
        checkout_url=result.get("checkout_url", ""),
        created_at=now,
        updated_at=now,
    )
    db.add(topup)
    await db.commit()
    await db.refresh(topup)

    return PaymentResponse(
        success=True,
        message="Checkout session created. Complete payment to credit your PHP wallet.",
        data={
            "topup_id": topup.id,
            "checkout_session_id": result.get("checkout_session_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "reference_number": result.get("reference_number", ""),
            "amount": req.amount,
        },
    )


@router.post("/claim-deposit")
async def claim_deposit(
    req: ClaimDepositRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim a manually-sent bank/e-wallet deposit.

    The user sends money to the PayMongo merchant account via GCash, Maya, bank
    transfer, etc., then submits the payment channel, account/mobile number used,
    and the exact amount.  The backend fetches recent PayMongo payments and matches
    on (status=paid, amount, source type).  If a unique unclaimed match is found,
    the user's PHP wallet is credited and the payment ID is recorded to prevent
    double-claiming.
    """
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    amount_centavos = int(round(req.amount * 100))
    channel = req.payment_channel.strip().lower()
    allowed_source_types = CHANNEL_SOURCE_TYPES.get(channel, [channel])

    svc = PayMongoService()
    result = await svc.list_payments(limit=50)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail="Failed to fetch payments from PayMongo")

    matched_payment = None
    for payment in result.get("data", []):
        attrs = payment.get("attributes", {})
        if attrs.get("status") != "paid":
            continue
        if attrs.get("amount", 0) != amount_centavos:
            continue
        source_type = (attrs.get("source") or {}).get("type", "")
        if source_type not in allowed_source_types:
            continue

        pay_id = payment.get("id", "")
        # Check this payment hasn't already been claimed
        existing = await db.execute(
            select(WalletTopup).where(WalletTopup.reference_number == pay_id)
        )
        if existing.scalar_one_or_none():
            continue  # already claimed — skip

        matched_payment = payment
        break

    if not matched_payment:
        raise HTTPException(
            status_code=404,
            detail="No matching unclaimed payment found. Please verify your payment channel, account number, and amount then try again.",
        )

    pay_id = matched_payment.get("id", "")
    now = datetime.now()
    topup = WalletTopup(
        user_id=str(current_user.id),
        amount=req.amount,
        currency="PHP",
        reference_number=pay_id,  # stores PayMongo payment ID to block double-claims
        payment_method=channel,
        status="paid",
        description=f"Manual deposit via {req.payment_channel.upper()}",
        created_at=now,
        updated_at=now,
    )
    db.add(topup)
    await db.flush()

    await _credit_wallet(
        db,
        str(current_user.id),
        req.amount,
        note=f"Manual deposit — {req.payment_channel.upper()} account {req.account_number}",
        reference_id=pay_id,
    )

    return {
        "success": True,
        "message": f"₱{req.amount:,.2f} has been credited to your PHP wallet.",
        "payment_id": pay_id,
        "amount": req.amount,
    }


@router.post("/alipay-qr", response_model=PaymentResponse)
async def create_alipay_qr(
    req: AlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an Alipay QR checkout via PayMongo. On payment, PHP wallet is credited automatically."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    svc = PayMongoService()
    result = await svc.create_alipay_qr(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url or "",
        failed_url=req.failed_url or "",
    )

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "PayMongo API error"))

    now = datetime.now()
    topup = WalletTopup(
        user_id=str(current_user.id),
        amount=req.amount,
        currency="PHP",
        paymongo_source_id=result.get("source_id", ""),
        reference_number=result.get("reference_number", ""),
        payment_method="alipay",
        status="pending",
        description=req.description,
        checkout_url=result.get("checkout_url", ""),
        created_at=now,
        updated_at=now,
    )
    db.add(topup)

    txn = await _save_transaction(
        db, str(current_user.id), "alipay_qr", result, req.amount, req.description,
    )

    return PaymentResponse(
        success=True,
        message="Alipay QR created. Scan to pay — wallet credited automatically on success.",
        data={
            "transaction_id": txn.id if txn else None,
            "topup_id": topup.id if topup else None,
            "source_id": result.get("source_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "reference_number": result.get("reference_number", ""),
            "amount": req.amount,
        },
    )


@router.post("/wechat-qr", response_model=PaymentResponse)
async def create_wechat_qr(
    req: WeChatQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a WeChat Pay QR checkout via PayMongo. On payment, PHP wallet is credited automatically."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    svc = PayMongoService()
    result = await svc.create_wechat_qr(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url or "",
        failed_url=req.failed_url or "",
    )

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "PayMongo API error"))

    now = datetime.now()
    topup = WalletTopup(
        user_id=str(current_user.id),
        amount=req.amount,
        currency="PHP",
        paymongo_source_id=result.get("source_id", ""),
        reference_number=result.get("reference_number", ""),
        payment_method="wechat",
        status="pending",
        description=req.description,
        checkout_url=result.get("checkout_url", ""),
        created_at=now,
        updated_at=now,
    )
    db.add(topup)

    txn = await _save_transaction(
        db, str(current_user.id), "wechat_qr", result, req.amount, req.description,
    )

    return PaymentResponse(
        success=True,
        message="WeChat Pay QR created. Scan to pay — wallet credited automatically on success.",
        data={
            "transaction_id": txn.id if txn else None,
            "topup_id": topup.id if topup else None,
            "source_id": result.get("source_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "reference_number": result.get("reference_number", ""),
            "amount": req.amount,
        },
    )


@router.get("/sources/{source_id}")
async def get_source_status(
    source_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Check the status of a PayMongo source."""
    svc = PayMongoService()
    result = await svc.get_source(source_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Source not found"))
    return result


@router.post("/webhook")
async def paymongo_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    paymongo_signature: Optional[str] = Header(None, alias="Paymongo-Signature"),
):
    """
    Receive PayMongo webhook events (no auth required).

    Processing guarantees:
    * Signature is verified using PAYMONGO_WEBHOOK_SECRET (when configured).
    * Each PayMongo event ID is persisted; duplicate deliveries are silently
      skipped so the wallet is never double-credited.
    * On success events the user's PHP wallet is credited via an immutable
      ledger entry and a real-time SSE event is broadcast.
    * On failure/cancel events the wallet_topups record is marked failed.

    Configure in PayMongo dashboard:
      URL   : https://<your-domain>/api/v1/paymongo/webhook
      Events: source.chargeable, checkout_session.payment.paid,
              checkout_session.payment.failed, payment.paid, payment.failed
    """
    try:
        raw_body = await request.body()

        # ── Signature verification ────────────────────────────────────────
        svc = PayMongoService()
        if svc.webhook_secret:
            if not paymongo_signature:
                logger.warning("PayMongo webhook received without Paymongo-Signature header")
                return {"status": "error", "message": "Missing signature"}
            if not svc.verify_webhook_signature(raw_body, paymongo_signature):
                logger.warning("PayMongo webhook signature verification failed")
                return {"status": "error", "message": "Invalid signature"}
        else:
            logger.debug("PAYMONGO_WEBHOOK_SECRET not set — skipping signature verification")

        # ── Parse body ────────────────────────────────────────────────────
        import json
        try:
            body = json.loads(raw_body)
        except Exception:
            return {"status": "error", "message": "Invalid JSON body"}

        logger.info("PayMongo webhook received: %s", body.get("data", {}).get("attributes", {}).get("type", "unknown"))

        event_id = body.get("data", {}).get("id", "")
        event_type = body.get("data", {}).get("attributes", {}).get("type", "")

        # ── Idempotency check ─────────────────────────────────────────────
        if event_id:
            try:
                existing = await db.execute(
                    select(PaymongoWebhookEvent).where(PaymongoWebhookEvent.event_id == event_id)
                )
                if existing.scalar_one_or_none():
                    logger.info("Duplicate PayMongo event %s — skipping", event_id)
                    return {"status": "ok", "message": "duplicate"}

                db.add(PaymongoWebhookEvent(
                    event_id=event_id,
                    event_type=event_type,
                    processed_at=datetime.now(),
                ))
                await db.flush()
            except IntegrityError:
                await db.rollback()
                logger.info("Duplicate PayMongo event %s (race) — skipping", event_id)
                return {"status": "ok", "message": "duplicate"}

        resource = body.get("data", {}).get("attributes", {}).get("data", {})
        attrs = resource.get("attributes", {})

        # ── Route by event type ───────────────────────────────────────────

        if event_type == "source.chargeable":
            await _handle_source_chargeable(db, resource, attrs)

        elif event_type in ("checkout_session.payment.paid", "payment.paid"):
            await _handle_payment_paid(db, resource, attrs, event_type)

        elif event_type in ("source.failed", "checkout_session.payment.failed", "payment.failed"):
            await _handle_payment_failed(db, resource, attrs)

        await db.commit()
        return {"status": "ok"}

    except Exception as e:
        logger.error("PayMongo webhook error: %s", str(e), exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return {"status": "error", "message": str(e)}


async def _handle_source_chargeable(
    db: AsyncSession, resource: dict, attrs: dict
) -> None:
    """Process a source.chargeable event (Alipay / WeChat Pay)."""
    source_id = resource.get("id", "")
    reference_number = attrs.get("metadata", {}).get("reference_number", "")
    amount_centavos = attrs.get("amount", 0)
    amount = amount_centavos / 100

    # Prefer wallet_topups lookup; fall back to legacy transactions table
    topup = None
    if reference_number:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.reference_number == reference_number)
        )
        topup = res.scalar_one_or_none()
    if not topup and source_id:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.paymongo_source_id == source_id)
        )
        topup = res.scalar_one_or_none()

    if topup:
        if topup.status == "paid":
            logger.info("Top-up %s already paid — skipping wallet credit", topup.id)
            return
        topup.status = "paid"
        topup.updated_at = datetime.now()
        await db.flush()
        await _credit_wallet(
            db, topup.user_id, topup.amount,
            note=f"PayMongo payment received: {topup.description or reference_number}",
            reference_id=reference_number or source_id,
        )
        return

    # Legacy: look up transactions table
    txn = None
    if reference_number:
        res = await db.execute(
            select(Transactions).where(Transactions.external_id == reference_number)
        )
        txn = res.scalar_one_or_none()
    if not txn and source_id:
        res = await db.execute(
            select(Transactions).where(Transactions.xendit_id == source_id)
        )
        txn = res.scalar_one_or_none()

    if txn:
        old_status = txn.status
        txn.status = "paid"
        txn.updated_at = datetime.now()
        await db.flush()

        payment_event_bus.publish({
            "event_type": "status_change",
            "transaction_id": txn.id,
            "external_id": txn.external_id,
            "old_status": old_status,
            "new_status": "paid",
            "amount": txn.amount,
            "description": txn.description or "",
            "transaction_type": txn.transaction_type,
            "user_id": txn.user_id,
        })

        if old_status != "paid" and txn.user_id:
            await _credit_wallet(
                db, txn.user_id, txn.amount,
                note=f"PayMongo payment received: {txn.description or txn.external_id}",
                reference_id=txn.external_id or source_id,
            )
    else:
        logger.warning(
            "No top-up or transaction found for PayMongo source %s / ref %s",
            source_id, reference_number,
        )


async def _handle_payment_paid(
    db: AsyncSession, resource: dict, attrs: dict, event_type: str
) -> None:
    """Process checkout_session.payment.paid or payment.paid events."""
    checkout_id = ""
    reference_number = ""
    amount = 0.0

    if event_type == "checkout_session.payment.paid":
        checkout_id = resource.get("id", "")
        reference_number = attrs.get("metadata", {}).get("reference_number", "")
        # amount comes from the payment inside the checkout session
        payments = attrs.get("payments", [])
        if payments:
            amount = payments[0].get("attributes", {}).get("amount", 0) / 100
    else:
        # payment.paid
        reference_number = attrs.get("metadata", {}).get("reference_number", "")
        amount = attrs.get("amount", 0) / 100

    topup = None
    if checkout_id:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.paymongo_checkout_session_id == checkout_id)
        )
        topup = res.scalar_one_or_none()
    if not topup and reference_number:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.reference_number == reference_number)
        )
        topup = res.scalar_one_or_none()

    if topup:
        if topup.status == "paid":
            logger.info("Top-up %s already paid — skipping wallet credit", topup.id)
            return
        topup.status = "paid"
        topup.updated_at = datetime.now()
        credit_amount = topup.amount if topup.amount else amount
        await db.flush()
        await _credit_wallet(
            db, topup.user_id, credit_amount,
            note=f"PayMongo checkout payment: {topup.description or reference_number}",
            reference_id=reference_number or checkout_id,
        )
    else:
        logger.warning(
            "No top-up found for PayMongo %s checkout=%s ref=%s",
            event_type, checkout_id, reference_number,
        )


async def _handle_payment_failed(
    db: AsyncSession, resource: dict, attrs: dict
) -> None:
    """Mark top-up as failed/cancelled on failure events."""
    source_id = resource.get("id", "")
    reference_number = attrs.get("metadata", {}).get("reference_number", "")

    topup = None
    if reference_number:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.reference_number == reference_number)
        )
        topup = res.scalar_one_or_none()
    if not topup and source_id:
        res = await db.execute(
            select(WalletTopup).where(WalletTopup.paymongo_source_id == source_id)
        )
        topup = res.scalar_one_or_none()

    if topup and topup.status == "pending":
        topup.status = "failed"
        topup.updated_at = datetime.now()
        logger.info("Top-up %s marked as failed", topup.id)


@router.get("/redirect/success")
async def redirect_success(id: Optional[str] = None):
    """PayMongo payment success redirect."""
    return {"status": "success", "message": "Payment completed", "source_id": id}


@router.get("/redirect/failed")
async def redirect_failed(id: Optional[str] = None):
    """PayMongo payment failed/cancelled redirect."""
    return {"status": "failed", "message": "Payment was not completed", "source_id": id}
