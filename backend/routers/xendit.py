import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.disbursements import Disbursements
from models.refunds import Refunds
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services.xendit_service import XenditService
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

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

# ==================== ADDITIONAL SCHEMAS ====================

class CreateVARequest(BaseModel):
    amount: float
    bank_code: str
    name: str


class CreateEWalletRequest(BaseModel):
    amount: float
    channel_code: str
    mobile_number: str = ""


class CreateDisbursementRequest(BaseModel):
    amount: float
    bank_code: str
    account_number: str
    account_name: str
    description: str = ""


class CreateRefundRequest(BaseModel):
    transaction_id: int
    amount: float
    reason: str = ""


class FeeCalcRequest(BaseModel):
    amount: float
    method: str


# ==================== BALANCE ====================

@router.get("/balance")
async def get_xendit_balance(
    current_user: UserResponse = Depends(get_current_user),
):
    """Get Xendit account balance"""
    try:
        service = XenditService()
        result = await service.get_balance()
        if not result.get("success"):
            raise HTTPException(status_code=502, detail=result.get("error", "Failed to fetch balance"))
        return {"success": True, "balance": result.get("balance", 0), "currency": "PHP"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Xendit balance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AVAILABLE BANKS ====================

@router.get("/available-banks")
async def get_available_banks(
    current_user: UserResponse = Depends(get_current_user),
):
    """Get list of available banks for virtual accounts and disbursements"""
    try:
        service = XenditService()
        result = await service.get_available_banks()
        if not result.get("success"):
            raise HTTPException(status_code=502, detail=result.get("error", "Failed to fetch banks"))
        return {"success": True, "banks": result.get("banks", [])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching available banks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== FEE CALCULATOR ====================

@router.post("/calculate-fees")
async def calculate_fees(
    data: FeeCalcRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Calculate estimated fees for a payment method"""
    try:
        service = XenditService()
        result = service.calculate_fees(amount=data.amount, method=data.method)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Error calculating fees: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VIRTUAL ACCOUNT ====================

@router.post("/create-virtual-account", response_model=PaymentResponse)
async def create_virtual_account(
    data: CreateVARequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a virtual account payment"""
    try:
        service = XenditService()
        result = await service.create_virtual_account(
            amount=data.amount,
            bank_code=data.bank_code,
            name=data.name,
        )
        if not result.get("success"):
            return PaymentResponse(success=False, message=result.get("error", "Failed to create virtual account"))
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="virtual_account",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("va_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=f"VA: {data.bank_code} — {data.name}",
            customer_name=data.name,
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)
        return PaymentResponse(
            success=True,
            message="Virtual account created successfully",
            data={
                "transaction_id": txn.id,
                "va_id": result.get("va_id", ""),
                "account_number": result.get("account_number", ""),
                "bank_code": data.bank_code,
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating virtual account: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== E-WALLET CHARGE ====================

@router.post("/create-ewallet-charge", response_model=PaymentResponse)
async def create_ewallet_charge(
    data: CreateEWalletRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an e-wallet charge"""
    try:
        service = XenditService()
        result = await service.create_ewallet_charge(
            amount=data.amount,
            channel_code=data.channel_code,
            mobile_number=data.mobile_number,
        )
        if not result.get("success"):
            return PaymentResponse(success=False, message=result.get("error", "Failed to create e-wallet charge"))
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="ewallet",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("charge_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=f"E-Wallet: {data.channel_code}",
            payment_url=result.get("checkout_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)
        return PaymentResponse(
            success=True,
            message="E-wallet charge created successfully",
            data={
                "transaction_id": txn.id,
                "charge_id": result.get("charge_id", ""),
                "checkout_url": result.get("checkout_url", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
            },
        )
    except Exception as e:
        logger.error(f"Error creating e-wallet charge: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DISBURSEMENT ====================

@router.post("/create-disbursement", response_model=PaymentResponse)
async def create_disbursement(
    data: CreateDisbursementRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a bank disbursement (send money)"""
    try:
        service = XenditService()
        result = await service.create_disbursement(
            amount=data.amount,
            bank_code=data.bank_code,
            account_number=data.account_number,
            account_name=data.account_name,
            description=data.description,
        )
        if not result.get("success"):
            return PaymentResponse(success=False, message=result.get("error", "Failed to create disbursement"))
        now = datetime.now()
        disb = Disbursements(
            user_id=str(current_user.id),
            external_id=result.get("external_id", ""),
            xendit_id=result.get("disbursement_id", ""),
            amount=data.amount,
            currency="PHP",
            bank_code=data.bank_code,
            account_number=data.account_number,
            account_name=data.account_name,
            description=data.description or "Disbursement",
            status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(disb)
        await db.commit()
        await db.refresh(disb)
        return PaymentResponse(
            success=True,
            message="Disbursement created successfully",
            data={
                "disbursement_id": disb.id,
                "xendit_id": result.get("disbursement_id", ""),
                "external_id": result.get("external_id", ""),
                "amount": data.amount,
                "status": result.get("status", "pending"),
            },
        )
    except Exception as e:
        logger.error(f"Error creating disbursement: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== REFUND ====================

@router.post("/create-refund", response_model=PaymentResponse)
async def create_refund(
    data: CreateRefundRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Refund a transaction"""
    try:
        # Look up the original transaction
        result = await db.execute(
            select(Transactions).where(
                Transactions.id == data.transaction_id,
                Transactions.user_id == str(current_user.id),
            )
        )
        txn = result.scalar_one_or_none()
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")

        service = XenditService()
        refund_result = await service.create_refund(
            invoice_id=txn.xendit_id or txn.external_id,
            amount=data.amount,
            reason=data.reason,
        )
        if not refund_result.get("success"):
            return PaymentResponse(success=False, message=refund_result.get("error", "Failed to create refund"))

        now = datetime.now()
        refund = Refunds(
            user_id=str(current_user.id),
            transaction_id=txn.id,
            xendit_id=refund_result.get("refund_id", ""),
            amount=data.amount,
            reason=data.reason or "REQUESTED_BY_CUSTOMER",
            status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(refund)
        await db.commit()
        await db.refresh(refund)
        return PaymentResponse(
            success=True,
            message="Refund created successfully",
            data={
                "refund_id": refund.id,
                "xendit_id": refund_result.get("refund_id", ""),
                "amount": data.amount,
                "status": refund_result.get("status", "pending"),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating refund: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
