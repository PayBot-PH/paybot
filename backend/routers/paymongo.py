"""
PayMongo API Router — Alipay and WeChat Pay QR code generation.
Webhook handler credits the user's PHP wallet on successful payment.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/paymongo", tags=["paymongo"])


# ---------- Schemas ----------

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


# ---------- Endpoints ----------

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

    txn = await _save_transaction(
        db, str(current_user.id), "alipay_qr", result, req.amount, req.description,
    )

    return PaymentResponse(
        success=True,
        message="Alipay QR created. Scan to pay — wallet credited automatically on success.",
        data={
            "transaction_id": txn.id if txn else None,
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

    txn = await _save_transaction(
        db, str(current_user.id), "wechat_qr", result, req.amount, req.description,
    )

    return PaymentResponse(
        success=True,
        message="WeChat Pay QR created. Scan to pay — wallet credited automatically on success.",
        data={
            "transaction_id": txn.id if txn else None,
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
):
    """
    Receive PayMongo webhook events (no auth required).
    Credits the user's PHP wallet when a source becomes 'chargeable' (payment successful).

    Configure in PayMongo dashboard:
      URL: https://<your-domain>/api/v1/paymongo/webhook
      Events: source.chargeable
    """
    try:
        body = await request.json()
        logger.info(f"PayMongo webhook received: {body}")

        event_type = body.get("data", {}).get("attributes", {}).get("type", "")
        resource = body.get("data", {}).get("attributes", {}).get("data", {})
        attrs = resource.get("attributes", {})

        # source.chargeable means the user completed payment (Alipay/WeChat redirected back)
        if event_type != "source.chargeable":
            return {"status": "ok"}

        source_id = resource.get("id", "")
        reference_number = attrs.get("metadata", {}).get("reference_number", "")
        amount_centavos = attrs.get("amount", 0)
        amount = amount_centavos / 100

        # Find matching transaction
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
            await db.commit()

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

            # Credit PHP wallet
            if old_status != "paid" and txn.user_id:
                try:
                    wallet_res = await db.execute(
                        select(Wallets).where(
                            Wallets.user_id == txn.user_id,
                            Wallets.currency == "PHP",
                        )
                    )
                    wallet = wallet_res.scalar_one_or_none()
                    if not wallet:
                        now_w = datetime.now()
                        wallet = Wallets(
                            user_id=txn.user_id, balance=0.0, currency="PHP",
                            created_at=now_w, updated_at=now_w,
                        )
                        db.add(wallet)
                        await db.flush()

                    balance_before = wallet.balance
                    wallet.balance += txn.amount
                    wallet.updated_at = datetime.now()

                    wtxn = Wallet_transactions(
                        user_id=txn.user_id,
                        wallet_id=wallet.id,
                        transaction_type="top_up",
                        amount=txn.amount,
                        balance_before=balance_before,
                        balance_after=wallet.balance,
                        note=f"PayMongo payment received: {txn.description or txn.external_id}",
                        status="completed",
                        reference_id=txn.external_id,
                        created_at=datetime.now(),
                    )
                    db.add(wtxn)
                    await db.commit()

                    payment_event_bus.publish({
                        "event_type": "wallet_update",
                        "user_id": txn.user_id,
                        "wallet_id": wallet.id,
                        "balance": wallet.balance,
                        "transaction_type": "top_up",
                        "amount": txn.amount,
                        "transaction_id": wtxn.id,
                    })
                    logger.info(f"Wallet credited +{txn.amount} PHP for user {txn.user_id} via PayMongo")
                except Exception as we:
                    logger.error(f"Wallet credit error: {we}", exc_info=True)
        else:
            logger.warning(f"No transaction found for PayMongo source {source_id} / ref {reference_number}")

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"PayMongo webhook error: {str(e)}", exc_info=True)
        return {"status": "error", "message": str(e)}


@router.get("/redirect/success")
async def redirect_success(id: Optional[str] = None):
    """PayMongo payment success redirect."""
    return {"status": "success", "message": "Payment completed", "source_id": id}


@router.get("/redirect/failed")
async def redirect_failed(id: Optional[str] = None):
    """PayMongo payment failed/cancelled redirect."""
    return {"status": "failed", "message": "Payment was not completed", "source_id": id}
