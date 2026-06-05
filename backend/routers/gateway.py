import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.disbursements import Disbursements
from models.refunds import Refunds
from models.subscriptions import Subscriptions
from models.customers import Customers
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
# Xendit removed. Use Maya Manager for supported checkout flows.
from services.maya_service import MayaService
from services.paymongo_service import PayMongoService
from services.otp_service import OTPService
from services.event_bus import payment_event_bus
from services.transactions import TransactionsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gateway", tags=["gateway"])


# ==================== SCHEMAS ====================
class GatewayResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict = {}

class CreateVARequest(BaseModel):
    amount: float
    bank_code: str
    name: str

class CreateEWalletRequest(BaseModel):
    amount: float
    channel_code: str
    mobile_number: str = ""

class CreateMayaTerminalRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""
    mobile_number: str = ""
    channel_code: str = "PH_MAYA"
    terminal_id: str = ""
    otp_reference: str = ""
    otp_code: str = ""

class CreateVirtualTerminalRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""
    mobile_number: str = ""
    channel_code: str = "PH_MAYA"
    terminal_id: str = ""
    otp_reference: str = ""
    otp_code: str = ""

class CreateCardTerminalRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: str = ""
    customer_email: str = ""
    mobile_number: str = ""
    otp_reference: str = ""
    otp_code: str = ""


async def _refresh_maya_transaction(db: AsyncSession, checkout_id: str) -> dict:
    txn_service = TransactionsService(db)
    txn = await txn_service.find_by_external_or_gateway_id(checkout_id)
    if not txn:
        return {"success": False, "message": "Transaction not found"}

    if txn.status == "paid":
        return {"success": True, "message": "Transaction is already paid", "status": txn.status, "transaction_id": txn.id}

    service = MayaService()
    status_result = await service.get_checkout_status(checkout_id)
    if not status_result.get("success"):
        return status_result

    status = status_result.get("status", "").upper()
    if status in ("PAID", "COMPLETED", "SETTLED", "SUCCESS", "AUTHORIZED"):
        await txn_service.mark_as_paid(txn, "Maya")
        return {"success": True, "message": "Transaction marked paid and wallet credited", "status": txn.status, "transaction_id": txn.id}

    if status in ("FAILED", "CANCELLED", "DECLINED", "EXPIRED"):
        txn.status = "failed" if status in ("FAILED", "DECLINED") else status.lower()
        txn.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": False, "message": f"Transaction status is {status}"}

    return {"success": False, "message": f"Transaction status is {status}"}


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

class CreateSubscriptionRequest(BaseModel):
    plan_name: str
    amount: float
    interval: str  # daily, weekly, monthly, yearly
    customer_name: str = ""
    customer_email: str = ""

class UpdateSubscriptionRequest(BaseModel):
    status: str  # active, paused, cancelled

class CreateCustomerRequest(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    notes: str = ""

class UpdateCustomerRequest(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    notes: str = ""

class FeeCalcRequest(BaseModel):
    amount: float
    method: str

class SendReminderRequest(BaseModel):
    transaction_id: int
    message: str = ""

class ReportRequest(BaseModel):
    period: str = "monthly"  # daily, weekly, monthly


# ==================== VIRTUAL ACCOUNTS ====================
@router.post("/virtual-account", response_model=GatewayResponse)
async def create_virtual_account(
    data: CreateVARequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Virtual Accounts are Xendit-specific and not supported by Maya Manager."""
    return GatewayResponse(success=False, message="Virtual accounts are not supported after removing Xendit. Use an alternative gateway.")


# ==================== E-WALLET CHARGES ====================
@router.post("/ewallet-charge", response_model=GatewayResponse)
async def create_ewallet_charge(
    data: CreateEWalletRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = MayaService()
        result = await service.create_ewallet_charge(
            amount=data.amount, channel_code=data.channel_code, mobile_number=data.mobile_number,
        )
        if not result.get("success"):
            return GatewayResponse(success=False, message=result.get("error", "Failed"))

        txn_service = TransactionsService(db)
        txn = await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="ewallet",
            amount=data.amount,
            external_id=result.get("external_id", ""),
            gateway_id=result.get("checkout_id", ""),
            description=f"E-Wallet: {data.channel_code}",
            payment_url=result.get("checkout_url", ""),
        )

        return GatewayResponse(success=True, message="E-wallet charge created", data={
            "transaction_id": txn.id, "checkout_id": result.get("checkout_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", ""), "amount": data.amount,
        })
    except Exception as e:
        logger.error(f"E-wallet charge error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/maya-virtual-terminal", response_model=GatewayResponse)
@router.post("/virtual-terminal", response_model=GatewayResponse)
async def create_virtual_terminal(
    data: CreateVirtualTerminalRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if data.amount <= 0:
            return GatewayResponse(success=False, message="Amount must be greater than zero")

        if not data.otp_code:
            challenge = OTPService.create_terminal_challenge(
                amount=data.amount,
                description=data.description or "Maya Virtual Terminal",
                customer_name=data.customer_name,
                customer_email=data.customer_email,
                mobile_number=data.mobile_number,
                terminal_id=data.terminal_id,
                channel_code=data.channel_code,
                terminal_mode="virtual",
            )
            response_data = {
                "otp_required": True,
                "otp_reference": challenge["otp_reference"],
            }
            if "otp_code" in challenge:
                response_data["otp_code"] = challenge["otp_code"]
            return GatewayResponse(
                success=True,
                message="OTP challenge generated. Enter the OTP to complete the virtual terminal payment.",
                data=response_data,
            )

        if not data.otp_reference:
            return GatewayResponse(success=False, message="OTP reference is required when submitting the OTP code")

        verify_result = OTPService.verify_otp(data.otp_reference, data.otp_code)
        if not verify_result.get("success"):
            return GatewayResponse(success=False, message=verify_result.get("error", "OTP verification failed"))

        payload = verify_result["payload"]
        service = MayaService()
        result = await service.create_virtual_terminal(
            amount=payload["amount"],
            description=payload["description"],
            customer_name=payload["customer_name"],
            customer_email=payload["customer_email"],
            mobile_number=payload["mobile_number"],
            terminal_id=payload["terminal_id"],
            channel_code=payload["channel_code"],
        )
        if not result.get("success"):
            return GatewayResponse(success=False, message=result.get("error", "Failed"))

        txn_service = TransactionsService(db)
        txn = await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="virtual_terminal",
            amount=payload["amount"],
            external_id=result.get("external_id", ""),
            gateway_id=result.get("checkout_id", ""),
            description=payload["description"],
            customer_name=payload["customer_name"],
            customer_email=payload["customer_email"],
            payment_url=result.get("checkout_url", ""),
        )

        return GatewayResponse(success=True, message="Virtual terminal created", data={
            "transaction_id": txn.id,
            "checkout_id": result.get("checkout_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", ""),
            "amount": payload["amount"],
        })
    except Exception as e:
        logger.error(f"Virtual terminal error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/maya-terminal", response_model=GatewayResponse)
async def create_maya_terminal(
    data: CreateMayaTerminalRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if data.amount <= 0:
            return GatewayResponse(success=False, message="Amount must be greater than zero")

        if not data.otp_code:
            challenge = OTPService.create_terminal_challenge(
                amount=data.amount,
                description=data.description or "Maya Terminal POS",
                customer_name=data.customer_name,
                customer_email=data.customer_email,
                mobile_number=data.mobile_number,
                terminal_id=data.terminal_id,
                channel_code=data.channel_code,
                terminal_mode="real",
            )
            response_data = {
                "otp_required": True,
                "otp_reference": challenge["otp_reference"],
            }
            if "otp_code" in challenge:
                response_data["otp_code"] = challenge["otp_code"]
            return GatewayResponse(
                success=True,
                message="OTP challenge generated. Enter the OTP to complete the Maya terminal payment.",
                data=response_data,
            )

        if not data.otp_reference:
            return GatewayResponse(success=False, message="OTP reference is required when submitting the OTP code")

        verify_result = OTPService.verify_otp(data.otp_reference, data.otp_code)
        if not verify_result.get("success"):
            return GatewayResponse(success=False, message=verify_result.get("error", "OTP verification failed"))

        payload = verify_result["payload"]
        service = MayaService()
        result = await service.create_terminal_payment(
            amount=payload["amount"],
            description=payload["description"],
            customer_name=payload["customer_name"],
            customer_email=payload["customer_email"],
            mobile_number=payload["mobile_number"],
            terminal_id=payload["terminal_id"],
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed")
            # Notify the bank via SMS even if it failed (as requested)
            try:
                from services.notification_service import SMSService
                await SMSService.notify_bank_of_failure(
                    bank_code=data.bank_code,
                    amount=data.amount,
                    reference_id=result.get("external_id", "N/A"),
                    error_detail=error_msg
                )
            except Exception as notify_err:
                logger.error(f"Failed to send SMS notification to bank: {notify_err}")

            return GatewayResponse(success=False, message=error_msg)

        txn_service = TransactionsService(db)
        txn = await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="maya_terminal",
            amount=payload["amount"],
            external_id=result.get("external_id", ""),
            gateway_id=result.get("checkout_id", ""),
            description=payload["description"],
            customer_name=payload["customer_name"],
            customer_email=payload["customer_email"],
            payment_url=result.get("checkout_url", ""),
        )

        return GatewayResponse(success=True, message="Maya terminal created", data={
            "transaction_id": txn.id,
            "checkout_id": result.get("checkout_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", ""),
            "amount": payload["amount"],
        })
    except Exception as e:
        logger.error(f"Maya terminal error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/card-terminal", response_model=GatewayResponse)
async def create_card_terminal(
    data: CreateCardTerminalRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        if data.amount <= 0:
            return GatewayResponse(success=False, message="Amount must be greater than zero")

        if not data.otp_code:
            challenge = OTPService.create_terminal_challenge(
                amount=data.amount,
                description=data.description or "Card terminal payment",
                customer_name=data.customer_name,
                customer_email=data.customer_email,
                mobile_number=data.mobile_number,
                terminal_id="card-terminal",
                channel_code="PAYMONGO_CARD",
                terminal_mode="card",
            )
            response_data = {
                "otp_required": True,
                "otp_reference": challenge["otp_reference"],
            }
            if "otp_code" in challenge:
                response_data["otp_code"] = challenge["otp_code"]
            return GatewayResponse(
                success=True,
                message="OTP challenge generated. Enter the OTP to complete the card terminal payment.",
                data=response_data,
            )

        if not data.otp_reference:
            return GatewayResponse(success=False, message="OTP reference is required when submitting the OTP code")

        verify_result = OTPService.verify_otp(data.otp_reference, data.otp_code)
        if not verify_result.get("success"):
            return GatewayResponse(success=False, message=verify_result.get("error", "OTP verification failed"))

        payload = verify_result["payload"]
        service = PayMongoService()
        result = await service.create_checkout_session(
            amount=payload["amount"],
            description=payload["description"],
            payment_method_types=["card"],
            reference_number="",
            customer_email=payload["customer_email"],
            customer_name=payload["customer_name"],
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed")
            # Notify the bank via SMS even if it failed (as requested)
            try:
                from services.notification_service import SMSService
                await SMSService.notify_bank_of_failure(
                    bank_code=data.bank_code,
                    amount=data.amount,
                    reference_id=result.get("external_id", "N/A"),
                    error_detail=error_msg
                )
            except Exception as notify_err:
                logger.error(f"Failed to send SMS notification to bank: {notify_err}")

            return GatewayResponse(success=False, message=error_msg)

        txn_service = TransactionsService(db)
        txn = await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="card_terminal",
            amount=payload["amount"],
            external_id=result.get("reference_number", ""),
            gateway_id=result.get("checkout_session_id", ""),
            description=payload["description"],
            customer_name=payload["customer_name"],
            customer_email=payload["customer_email"],
            payment_url=result.get("checkout_url", ""),
        )

        return GatewayResponse(success=True, message="Card terminal created", data={
            "transaction_id": txn.id,
            "checkout_session_id": result.get("checkout_session_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "reference_number": result.get("reference_number", ""),
            "amount": payload["amount"],
        })
    except Exception as e:
        logger.error(f"Card terminal error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DISBURSEMENTS ====================
@router.post("/disbursement", response_model=GatewayResponse)
async def create_disbursement(
    data: CreateDisbursementRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = MayaService()
        result = await service.create_disbursement(
            amount=data.amount,
            bank_code=data.bank_code,
            account_number=data.account_number,
            account_name=data.account_name,
            description=data.description,
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed")
            # Notify the bank via SMS even if it failed (as requested)
            try:
                from services.notification_service import SMSService
                await SMSService.notify_bank_of_failure(
                    bank_code=data.bank_code,
                    amount=data.amount,
                    reference_id=result.get("external_id", "N/A"),
                    error_detail=error_msg
                )
            except Exception as notify_err:
                logger.error(f"Failed to send SMS notification to bank: {notify_err}")

            return GatewayResponse(success=False, message=error_msg)

        # Log to DB
        now = datetime.now(timezone.utc)
        disb = Disbursements(
            user_id=str(current_user.id),
            external_id=result.get("external_id", ""),
            amount=data.amount,
            currency="PHP",
            bank_code=data.bank_code,
            account_number=data.account_number,
            account_name=data.account_name,
            description=data.description,
            status="pending",
            disbursement_type="single",
            created_at=now,
            updated_at=now,
        )
        db.add(disb)
        await db.commit()

        return GatewayResponse(success=True, message=result.get("message", "Disbursement created"), data={
            "disbursement_id": result.get("disbursement_id"),
            "external_id": result.get("external_id"),
        })
    except Exception as e:
        logger.error(f"Disbursement error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/disbursements")
async def list_disbursements(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Disbursements).where(Disbursements.user_id == str(current_user.id))
        .order_by(Disbursements.id.desc()).limit(50)
    )
    items = result.scalars().all()
    return {"items": [{"id": d.id, "external_id": d.external_id, "amount": d.amount,
                        "bank_code": d.bank_code, "account_number": d.account_number,
                        "account_name": d.account_name, "description": d.description,
                        "status": d.status, "disbursement_type": d.disbursement_type,
                        "created_at": str(d.created_at) if d.created_at else None} for d in items],
            "total": len(items)}


# ==================== REFUNDS ====================
@router.post("/refund", response_model=GatewayResponse)
async def create_refund(
    data: CreateRefundRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        # Find transaction
        txn_res = await db.execute(select(Transactions).where(Transactions.id == data.transaction_id))
        txn = txn_res.scalar_one_or_none()
        if not txn:
            return GatewayResponse(success=False, message="Transaction not found")

        service = MayaService()
        result = await service.create_refund(
            invoice_id=txn.gateway_id or txn.external_id,
            amount=data.amount,
            reason=data.reason,
        )

        if not result.get("success"):
            error_msg = result.get("error", "Failed")
            # Notify the bank via SMS even if it failed (as requested)
            try:
                from services.notification_service import SMSService
                await SMSService.notify_bank_of_failure(
                    bank_code=data.bank_code,
                    amount=data.amount,
                    reference_id=result.get("external_id", "N/A"),
                    error_detail=error_msg
                )
            except Exception as notify_err:
                logger.error(f"Failed to send SMS notification to bank: {notify_err}")

            return GatewayResponse(success=False, message=error_msg)

        # Log to DB
        now = datetime.now(timezone.utc)
        ref = Refunds(
            user_id=str(current_user.id),
            transaction_id=txn.id,
            external_id=result.get("refund_id", ""),
            amount=data.amount,
            reason=data.reason,
            status="completed",
            refund_type="full" if data.amount >= txn.amount else "partial",
            created_at=now,
            updated_at=now,
        )
        db.add(ref)

        # Update transaction status
        if data.amount >= txn.amount:
            txn.status = "refunded"
        else:
            txn.status = "partially_refunded"

        await db.commit()

        return GatewayResponse(success=True, message="Refund processed successfully", data={
            "refund_id": result.get("refund_id"),
        })
    except Exception as e:
        logger.error(f"Refund error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/refunds")
async def list_refunds(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Refunds).where(Refunds.user_id == str(current_user.id))
        .order_by(Refunds.id.desc()).limit(50)
    )
    items = result.scalars().all()
    return {"items": [{"id": r.id, "transaction_id": r.transaction_id, "amount": r.amount,
                        "reason": r.reason, "status": r.status, "refund_type": r.refund_type,
                        "created_at": str(r.created_at) if r.created_at else None} for r in items],
            "total": len(items)}


# ==================== SUBSCRIPTIONS ====================
@router.post("/subscription", response_model=GatewayResponse)
async def create_subscription(
    data: CreateSubscriptionRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        now = datetime.now(timezone.utc)
        interval_days = {"daily": 1, "weekly": 7, "monthly": 30, "yearly": 365}
        next_billing = now + timedelta(days=interval_days.get(data.interval, 30))
        sub = Subscriptions(
            user_id=str(current_user.id), plan_name=data.plan_name,
            amount=data.amount, currency="PHP", interval=data.interval,
            customer_name=data.customer_name, customer_email=data.customer_email,
            status="active", next_billing_date=next_billing, total_cycles=0,
            external_id=f"sub-{__import__('uuid').uuid4().hex[:12]}",
            created_at=now, updated_at=now,
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
        return GatewayResponse(success=True, message="Subscription created", data={
            "subscription_id": sub.id, "plan_name": data.plan_name,
            "amount": data.amount, "interval": data.interval, "status": "active",
            "next_billing_date": str(next_billing),
        })
    except Exception as e:
        logger.error(f"Subscription error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/subscription/{sub_id}", response_model=GatewayResponse)
async def update_subscription(
    sub_id: int, data: UpdateSubscriptionRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscriptions).where(Subscriptions.id == sub_id, Subscriptions.user_id == str(current_user.id))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return GatewayResponse(success=False, message="Subscription not found")
    sub.status = data.status
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return GatewayResponse(success=True, message=f"Subscription {data.status}", data={"subscription_id": sub.id, "status": data.status})

@router.get("/subscriptions")
async def list_subscriptions(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscriptions).where(Subscriptions.user_id == str(current_user.id))
        .order_by(Subscriptions.id.desc()).limit(50)
    )
    items = result.scalars().all()
    return {"items": [{"id": s.id, "plan_name": s.plan_name, "amount": s.amount,
                        "interval": s.interval, "customer_name": s.customer_name,
                        "customer_email": s.customer_email, "status": s.status,
                        "next_billing_date": str(s.next_billing_date) if s.next_billing_date else None,
                        "total_cycles": s.total_cycles,
                        "created_at": str(s.created_at) if s.created_at else None} for s in items],
            "total": len(items)}


# ==================== CUSTOMERS ====================
@router.post("/customer", response_model=GatewayResponse)
async def create_customer(
    data: CreateCustomerRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    cust = Customers(
        user_id=str(current_user.id), name=data.name, email=data.email,
        phone=data.phone, notes=data.notes, total_payments=0, total_amount=0,
        created_at=now, updated_at=now,
    )
    db.add(cust)
    await db.commit()
    await db.refresh(cust)
    return GatewayResponse(success=True, message="Customer created", data={
        "customer_id": cust.id, "name": cust.name, "email": cust.email,
    })

@router.put("/customer/{cust_id}", response_model=GatewayResponse)
async def update_customer(
    cust_id: int, data: UpdateCustomerRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Customers).where(Customers.id == cust_id, Customers.user_id == str(current_user.id))
    )
    cust = result.scalar_one_or_none()
    if not cust:
        return GatewayResponse(success=False, message="Customer not found")
    if data.name:
        cust.name = data.name
    if data.email:
        cust.email = data.email
    if data.phone:
        cust.phone = data.phone
    if data.notes:
        cust.notes = data.notes
    cust.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return GatewayResponse(success=True, message="Customer updated", data={"customer_id": cust.id})

@router.delete("/customer/{cust_id}")
async def delete_customer(
    cust_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Customers).where(Customers.id == cust_id, Customers.user_id == str(current_user.id))
    )
    cust = result.scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.delete(cust)
    await db.commit()
    return {"success": True, "message": "Customer deleted"}

@router.get("/customers")
async def list_customers(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Customers).where(Customers.user_id == str(current_user.id))
        .order_by(Customers.id.desc()).limit(100)
    )
    items = result.scalars().all()
    return {"items": [{"id": c.id, "name": c.name, "email": c.email, "phone": c.phone,
                        "notes": c.notes, "total_payments": c.total_payments,
                        "total_amount": c.total_amount,
                        "created_at": str(c.created_at) if c.created_at else None} for c in items],
            "total": len(items)}


# ==================== FEE CALCULATION ====================
@router.post("/calculate-fees")
async def calculate_fees(data: FeeCalcRequest):
    # Use Maya fee estimates (Xendit removed). Maya and our local fee table
    # share the same `calculate_fees` signature.
    service = MayaService()
    result = service.calculate_fees(data.amount, data.method)
    return result


# ==================== XENDIT BALANCE ====================
@router.get("/xendit-balance")
async def get_xendit_balance(
    current_user: UserResponse = Depends(get_current_user),
):
    # Xendit has been removed; live balance lookup is unavailable.
    return {"success": False, "error": "Xendit integration removed: balance lookup unavailable."}


# ==================== PAYMONGO BALANCE ====================
@router.get("/paymongo-balance")
async def get_paymongo_balance(
    current_user: UserResponse = Depends(get_current_user),
):
    svc = PayMongoService()
    result = await svc.get_balance()
    if result.get("success"):
        available = result.get("available", [])
        php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
        balance = (php_entry["amount"] / 100.0) if php_entry else 0.0
        pending_list = result.get("pending", [])
        php_pending = next((e for e in pending_list if e.get("currency", "").upper() == "PHP"), None)
        pending = (php_pending["amount"] / 100.0) if php_pending else 0.0
        return {"success": True, "balance": balance, "pending": pending}
    return {"success": False, "error": result.get("error", "Failed")}


# ==================== AVAILABLE BANKS ====================
@router.get("/available-banks")
async def get_available_banks(
    current_user: UserResponse = Depends(get_current_user),
):
    # Available banks list was previously provided by Xendit. Not available
    # when Xendit has been removed. Return empty list and a helpful message.
    return {"success": False, "banks": [], "message": "Available bank list unavailable: Xendit integration removed."}


# ==================== REPORTS & ANALYTICS ====================
@router.get("/reports")
async def get_reports(
    period: str = "monthly",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = str(current_user.id)
    now = datetime.now(timezone.utc)
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)

    # Revenue by status
    paid_result = await db.execute(
        select(func.coalesce(func.sum(Transactions.amount), 0)).where(
            Transactions.user_id == user_id, Transactions.status == "paid",
            Transactions.created_at >= start,
        )
    )
    paid_revenue = float(paid_result.scalar() or 0)

    pending_result = await db.execute(
        select(func.coalesce(func.sum(Transactions.amount), 0)).where(
            Transactions.user_id == user_id, Transactions.status == "pending",
            Transactions.created_at >= start,
        )
    )
    pending_revenue = float(pending_result.scalar() or 0)

    # Count by type
    type_counts = {}
    for t in ["invoice", "qr_code", "payment_link", "virtual_account", "ewallet"]:
        cnt_result = await db.execute(
            select(func.count(Transactions.id)).where(
                Transactions.user_id == user_id, Transactions.transaction_type == t,
                Transactions.created_at >= start,
            )
        )
        type_counts[t] = cnt_result.scalar() or 0

    # Count by status
    status_counts = {}
    for s in ["paid", "pending", "expired", "refunded"]:
        cnt_result = await db.execute(
            select(func.count(Transactions.id)).where(
                Transactions.user_id == user_id, Transactions.status == s,
                Transactions.created_at >= start,
            )
        )
        status_counts[s] = cnt_result.scalar() or 0

    total_txns = sum(status_counts.values())
    success_rate = round((status_counts.get("paid", 0) / total_txns * 100) if total_txns > 0 else 0, 1)

    # Disbursement totals
    disb_result = await db.execute(
        select(func.coalesce(func.sum(Disbursements.amount), 0)).where(
            Disbursements.user_id == user_id, Disbursements.created_at >= start,
        )
    )
    total_disbursed = float(disb_result.scalar() or 0)

    # Refund totals
    ref_result = await db.execute(
        select(func.coalesce(func.sum(Refunds.amount), 0)).where(
            Refunds.user_id == user_id, Refunds.created_at >= start,
        )
    )
    total_refunded = float(ref_result.scalar() or 0)

    return {
        "period": period, "start_date": str(start), "end_date": str(now),
        "paid_revenue": paid_revenue, "pending_revenue": pending_revenue,
        "total_disbursed": total_disbursed, "total_refunded": total_refunded,
        "net_revenue": paid_revenue - total_refunded - total_disbursed,
        "type_breakdown": type_counts, "status_breakdown": status_counts,
        "total_transactions": total_txns, "success_rate": success_rate,
    }


# ==================== PAYMENT REMINDERS ====================
@router.post("/send-reminder", response_model=GatewayResponse)
async def send_reminder(
    data: SendReminderRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transactions).where(
            Transactions.id == data.transaction_id,
            Transactions.user_id == str(current_user.id),
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return GatewayResponse(success=False, message="Transaction not found")
    if txn.status != "pending":
        return GatewayResponse(success=False, message="Only pending transactions can receive reminders")

    # If it has a telegram chat ID, send via telegram
    if txn.telegram_chat_id:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        msg = data.message or f"💳 Payment Reminder: ₱{txn.amount:,.2f} for {txn.description or 'your order'}"
        if txn.payment_url:
            msg += f"\n🔗 Pay here: {txn.payment_url}"
        await tg.send_message(txn.telegram_chat_id, msg)
        return GatewayResponse(success=True, message="Reminder sent via Telegram")

    return GatewayResponse(success=True, message="Reminder logged (no delivery channel available)", data={
        "transaction_id": txn.id, "amount": txn.amount,
    })


@router.get("/maya/checkouts/{checkout_id}/refresh", response_model=GatewayResponse)
async def refresh_maya_checkout_status(
    checkout_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await _refresh_maya_transaction(db, checkout_id)
    return GatewayResponse(success=result.get("success", False), message=result.get("message", ""), data={
        "status": result.get("status"),
        "transaction_id": result.get("transaction_id"),
        "response": result.get("response"),
    })


@router.get("/maya/redirect/success", response_model=GatewayResponse)
async def maya_redirect_success(checkout_id: str = "", external_id: str = "", db: AsyncSession = Depends(get_db)):
    if not checkout_id and not external_id:
        return GatewayResponse(success=False, message="Missing checkout_id or external_id")
    lookup_id = checkout_id or external_id
    result = await _refresh_maya_transaction(db, lookup_id)
    return GatewayResponse(success=result.get("success", False), message=result.get("message", ""), data={
        "status": result.get("status"),
        "transaction_id": result.get("transaction_id"),
    })


@router.get("/maya/redirect/failed", response_model=GatewayResponse)
async def maya_redirect_failed(checkout_id: str = "", external_id: str = "", db: AsyncSession = Depends(get_db)):
    lookup_id = checkout_id or external_id
    if lookup_id:
        result = await _refresh_maya_transaction(db, lookup_id)
        return GatewayResponse(success=result.get("success", False), message=f"Payment failed or cancelled. {result.get('message', '')}", data={
            "status": result.get("status"),
            "transaction_id": result.get("transaction_id"),
        })
    return GatewayResponse(success=False, message="Payment failed or cancelled.")


@router.get("/maya/redirect/cancelled", response_model=GatewayResponse)
async def maya_redirect_cancelled(checkout_id: str = "", external_id: str = "", db: AsyncSession = Depends(get_db)):
    lookup_id = checkout_id or external_id
    if lookup_id:
        result = await _refresh_maya_transaction(db, lookup_id)
        return GatewayResponse(success=result.get("success", False), message=f"Payment cancelled. {result.get('message', '')}", data={
            "status": result.get("status"),
            "transaction_id": result.get("transaction_id"),
        })
    return GatewayResponse(success=False, message="Payment cancelled.")


# ==================== EXPIRE/CANCEL INVOICE ====================
@router.post("/expire-invoice/{txn_id}", response_model=GatewayResponse)
async def expire_invoice(
    txn_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    txn_service = TransactionsService(db)
    txn = await txn_service.get_by_id(txn_id, user_id=str(current_user.id))
    if not txn:
        return GatewayResponse(success=False, message="Transaction not found")

    success = await txn_service.mark_as_expired(txn)
    if not success:
        return GatewayResponse(success=False, message="Only pending transactions can be expired")

    return GatewayResponse(success=True, message="Invoice expired", data={"transaction_id": txn.id})
