import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.admin_users import AdminUser
from models.bot_settings import Bot_settings
from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services.bot_settings import Bot_settingsService
from services.telegram_service import TelegramService
from services.xendit_service import XenditService
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)


async def _send_payment_notification(db: AsyncSession, txn: Transactions, new_status: str) -> None:
    """Send a Telegram notification to the merchant when payment status changes."""
    if not txn.telegram_chat_id:
        return
    try:
        # Look up bot_settings for this merchant
        settings_svc = Bot_settingsService(db)
        # Transactions created via bot have user_id="tg-{chat_id}"; look up the AdminUser
        admin_user = None
        try:
            chat_id_str = str(txn.telegram_chat_id)
            adm_res = await db.execute(
                select(AdminUser).where(AdminUser.telegram_id == chat_id_str)
            )
            admin_user = adm_res.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"Could not look up admin user for chat {txn.telegram_chat_id}: {e}")

        cfg = None
        if admin_user:
            try:
                cfg_result = await settings_svc.get_list(skip=0, limit=1, user_id=str(admin_user.id))
                if cfg_result["total"] > 0:
                    cfg = cfg_result["items"][0]
            except Exception as e:
                logger.warning(f"Could not retrieve bot_settings for user {admin_user.id}: {e}")

        # Select the right template
        tmpl = None
        if cfg:
            if new_status == "paid":
                tmpl = cfg.payment_success_message
            elif new_status in ("expired", "failed"):
                tmpl = cfg.payment_failed_message
            elif new_status == "pending":
                tmpl = cfg.payment_pending_message

        if not tmpl:
            return  # No custom template configured; skip notification

        msg = (
            tmpl
            .replace("{name}", txn.customer_name or "")
            .replace("{amount}", f"{txn.amount:,.2f}" if txn.amount is not None else "")
            .replace("{description}", txn.description or "")
            .replace("{external_id}", txn.external_id or "")
        )
        tg = TelegramService()
        await tg.send_message(str(txn.telegram_chat_id), msg)
    except Exception as e:
        logger.error(f"Failed to send payment notification: {e}")

router = APIRouter(prefix="/api/v1/xendit", tags=["xendit"])


# ---------- Request/Response Schemas ----------
class CreateInvoiceRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""


class CreateQRCodeRequest(BaseModel):
    amount: float
    description: str = ""


class CreateAlipayQRRequest(BaseModel):
    amount: float
    description: str = ""


class CreatePaymentLinkRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""


class PayQRPHRequest(BaseModel):
    qr_data: str
    amount: float
    description: str = ""
    merchant_name: str = ""
    reference_number: str = ""


class PaymentResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict = {}


class TransactionStatsResponse(BaseModel):
    total_count: int = 0
    paid_count: int = 0
    pending_count: int = 0
    expired_count: int = 0
    total_amount: float = 0
    paid_amount: float = 0
    pending_amount: float = 0


# ---------- Routes ----------
@router.post("/create-invoice", response_model=PaymentResponse)
async def create_invoice(
    data: CreateInvoiceRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Xendit invoice"""
    try:
        service = XenditService()
        result = await service.create_invoice(
            amount=data.amount,
            description=data.description,
            customer_name=data.customer_name,
            customer_email=data.customer_email,
        )

        if not result.get("success"):
            return PaymentResponse(
                success=False,
                message=result.get("error", "Failed to create invoice"),
            )

        # Save transaction to DB
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="invoice",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("invoice_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            customer_name=data.customer_name,
            customer_email=data.customer_email,
            payment_url=result.get("invoice_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)

        return PaymentResponse(
            success=True,
            message="Invoice created successfully",
            data={
                "transaction_id": txn.id,
                "invoice_id": result.get("invoice_id", ""),
                "invoice_url": result.get("invoice_url", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-qr-code", response_model=PaymentResponse)
async def create_qr_code(
    data: CreateQRCodeRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a QR code payment"""
    try:
        service = XenditService()
        result = await service.create_qr_code(
            amount=data.amount,
            description=data.description,
        )

        if not result.get("success"):
            return PaymentResponse(
                success=False,
                message=result.get("error", "Failed to create QR code"),
            )

        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="qr_code",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("qr_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            qr_code_url=result.get("qr_string", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)

        return PaymentResponse(
            success=True,
            message="QR code created successfully",
            data={
                "transaction_id": txn.id,
                "qr_id": result.get("qr_id", ""),
                "qr_string": result.get("qr_string", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating QR code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-alipay-qr", response_model=PaymentResponse)
async def create_alipay_qr(
    data: CreateAlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an Alipay QR code payment"""
    try:
        service = XenditService()
        result = await service.create_alipay_qr(
            amount=data.amount,
            description=data.description,
        )

        if not result.get("success"):
            return PaymentResponse(
                success=False,
                message=result.get("error", "Failed to create Alipay QR code"),
            )

        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="alipay_qr",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("qr_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            qr_code_url=result.get("qr_string", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)

        return PaymentResponse(
            success=True,
            message="Alipay QR code created successfully",
            data={
                "transaction_id": txn.id,
                "qr_id": result.get("qr_id", ""),
                "qr_string": result.get("qr_string", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating Alipay QR code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-payment-link", response_model=PaymentResponse)
async def create_payment_link(
    data: CreatePaymentLinkRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a payment link"""
    try:
        service = XenditService()
        result = await service.create_payment_link(
            amount=data.amount,
            description=data.description,
            customer_name=data.customer_name,
            customer_email=data.customer_email,
        )

        if not result.get("success"):
            return PaymentResponse(
                success=False,
                message=result.get("error", "Failed to create payment link"),
            )

        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="payment_link",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("payment_link_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            customer_name=data.customer_name,
            customer_email=data.customer_email,
            payment_url=result.get("payment_link_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)

        return PaymentResponse(
            success=True,
            message="Payment link created successfully",
            data={
                "transaction_id": txn.id,
                "payment_link_id": result.get("payment_link_id", ""),
                "payment_link_url": result.get("payment_link_url", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating payment link: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pay-qrph", response_model=PaymentResponse)
async def pay_qrph(
    data: PayQRPHRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record an outbound payment initiated by scanning a merchant's QRPH code."""
    try:
        external_id = f"qrph-{uuid.uuid4().hex[:12]}"
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="qrph_payment",
            external_id=external_id,
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description or data.merchant_name or "QRPH payment",
            customer_name=data.merchant_name,
            # Reuse qr_code_url to store the raw QRPH/EMVCo string (existing schema field;
            # capped at 500 chars to fit the column — full data is not needed for audit).
            qr_code_url=data.qr_data[:500] if data.qr_data else "",
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)

        logger.info(
            f"QRPH payment recorded: transaction_id={txn.id} amount={data.amount} "
            f"merchant={data.merchant_name} ref={data.reference_number}"
        )

        return PaymentResponse(
            success=True,
            message="QRPH payment recorded successfully. Complete the payment via your bank or e-wallet app.",
            data={
                "transaction_id": txn.id,
                "external_id": external_id,
                "amount": data.amount,
                "merchant_name": data.merchant_name,
                "reference_number": data.reference_number,
                "status": "pending",
            },
        )
    except Exception as e:
        logger.error(f"Error recording QRPH payment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def xendit_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive Xendit payment webhook notifications (no auth required)"""
    try:
        body = await request.json()
        logger.info(f"Xendit webhook received: {body}")

        external_id = body.get("external_id", "")
        status_raw = body.get("status", "").lower()

        status_map = {
            "paid": "paid",
            "settled": "paid",
            "expired": "expired",
            "pending": "pending",
        }
        status = status_map.get(status_raw, status_raw)

        if external_id:
            result = await db.execute(
                select(Transactions).where(Transactions.external_id == external_id)
            )
            txn = result.scalar_one_or_none()
            if txn:
                old_status = txn.status
                txn.status = status
                txn.updated_at = datetime.now()
                await db.commit()
                logger.info(f"Updated transaction {txn.id} status to {status}")

                # Publish real-time event
                payment_event_bus.publish({
                    "event_type": "status_change",
                    "transaction_id": txn.id,
                    "external_id": txn.external_id,
                    "old_status": old_status,
                    "new_status": status,
                    "amount": txn.amount,
                    "description": txn.description or "",
                    "transaction_type": txn.transaction_type,
                    "user_id": txn.user_id,
                })

                # Send Telegram notification using bot_settings template
                if old_status != status:
                    await _send_payment_notification(db, txn, status)

                # Credit wallet on successful payment
                if status == "paid" and old_status != "paid" and txn.user_id:
                    try:
                        wallet_result = await db.execute(
                            select(Wallets).where(Wallets.user_id == txn.user_id)
                        )
                        wallet = wallet_result.scalar_one_or_none()
                        if not wallet:
                            now_w = datetime.now()
                            wallet = Wallets(
                                user_id=txn.user_id,
                                balance=0.0,
                                currency="PHP",
                                created_at=now_w,
                                updated_at=now_w,
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
                            note=f"Payment received: {txn.description or txn.external_id}",
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
                        logger.info(f"Wallet credited: +{txn.amount} for user {txn.user_id}")
                    except Exception as we:
                        logger.error(f"Error crediting wallet: {str(we)}")

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook processing error: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.get("/transaction-stats", response_model=TransactionStatsResponse)
async def get_transaction_stats(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get transaction statistics for the logged-in user"""
    try:
        user_id = str(current_user.id)

        # Total count
        total_result = await db.execute(
            select(func.count(Transactions.id)).where(Transactions.user_id == user_id)
        )
        total_count = total_result.scalar() or 0

        # Total amount
        total_amount_result = await db.execute(
            select(func.coalesce(func.sum(Transactions.amount), 0)).where(
                Transactions.user_id == user_id
            )
        )
        total_amount = float(total_amount_result.scalar() or 0)

        # Paid
        paid_result = await db.execute(
            select(func.count(Transactions.id)).where(
                Transactions.user_id == user_id, Transactions.status == "paid"
            )
        )
        paid_count = paid_result.scalar() or 0

        paid_amount_result = await db.execute(
            select(func.coalesce(func.sum(Transactions.amount), 0)).where(
                Transactions.user_id == user_id, Transactions.status == "paid"
            )
        )
        paid_amount = float(paid_amount_result.scalar() or 0)

        # Pending
        pending_result = await db.execute(
            select(func.count(Transactions.id)).where(
                Transactions.user_id == user_id, Transactions.status == "pending"
            )
        )
        pending_count = pending_result.scalar() or 0

        pending_amount_result = await db.execute(
            select(func.coalesce(func.sum(Transactions.amount), 0)).where(
                Transactions.user_id == user_id, Transactions.status == "pending"
            )
        )
        pending_amount = float(pending_amount_result.scalar() or 0)

        # Expired
        expired_result = await db.execute(
            select(func.count(Transactions.id)).where(
                Transactions.user_id == user_id, Transactions.status == "expired"
            )
        )
        expired_count = expired_result.scalar() or 0

        return TransactionStatsResponse(
            total_count=total_count,
            paid_count=paid_count,
            pending_count=pending_count,
            expired_count=expired_count,
            total_amount=total_amount,
            paid_amount=paid_amount,
            pending_amount=pending_amount,
        )
    except Exception as e:
        logger.error(f"Error getting transaction stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))