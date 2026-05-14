import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
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
from services.xendit_service import XenditService
from services.paymongo_service import PayMongoService
from services.event_bus import payment_event_bus

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
    try:
        service = XenditService()
        result = await service.create_virtual_account(amount=data.amount, bank_code=data.bank_code, name=data.name)
        if not result.get("success"):
            return GatewayResponse(success=False, message=result.get("error", "Failed"))
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id), transaction_type="virtual_account",
            external_id=result.get("external_id", ""), xendit_id=result.get("va_id", ""),
            amount=data.amount, currency="PHP", status="pending",
            description=f"VA: {data.bank_code} - {data.name}",
            customer_name=data.name, created_at=now, updated_at=now,
        )
        db.add(txn)
        await db.commit()
        return GatewayResponse(success=True, message="Virtual account created", data={
            "transaction_id": txn.id, "va_id": result.get("va_id", ""),
            "account_number": result.get("account_number", ""),
            "bank_code": data.bank_code, "external_id": result.get("external_id", ""),
            "amount": data.amount,
        })
    except Exception as e:
        logger.error(f"VA creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== E-WALLET CHARGES ====================
@router.post("/ewallet-charge", response_model=GatewayResponse)
async def create_ewallet_charge(
    data: CreateEWalletRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = XenditService()
        result = await service.create_ewallet_charge(
            amount=data.amount, channel_code=data.channel_code, mobile_number=data.mobile_number,
        )
        if not result.get("success"):
            return GatewayResponse(success=False, message=result.get("error", "Failed"))
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id), transaction_type="ewallet",
            external_id=result.get("external_id", ""), xendit_id=result.get("charge_id", ""),
            amount=data.amount, currency="PHP", status="pending",
            description=f"E-Wallet: {data.channel_code}",
            payment_url=result.get("checkout_url", ""), created_at=now, updated_at=now,
        )
        db.add(txn)
        await db.commit()
        return GatewayResponse(success=True, message="E-wallet charge created", data={
            "transaction_id": txn.id, "charge_id": result.get("charge_id", ""),
            "checkout_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", ""), "amount": data.amount,
        })
    except Exception as e:
        logger.error(f"E-wallet charge error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DISBURSEMENTS ====================
@router.post("/disbursement", response_model=GatewayResponse)
async def create_disbursement(
    data: CreateDisbursementRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = XenditService()
        result = await service.create_disbursement(
            amount=data.amount, bank_code=data.bank_code,
            account_number=data.account_number, account_name=data.account_name,
            description=data.description,
        )
        if not result.get("success"):
            return GatewayResponse(success=False, message=result.get("error", "Failed"))
        now = datetime.now()
        disb = Disbursements(
            user_id=str(current_user.id), external_id=result.get("external_id", ""),
            xendit_id=result.get("disbursement_id", ""), amount=data.amount,
            currency="PHP", bank_code=data.bank_code, account_number=data.account_number,
            account_name=data.account_name, description=data.description,
            status="pending", disbursement_type="single", created_at=now, updated_at=now,
        )
        db.add(disb)
        await db.commit()
        # Deduct from wallet
        wallet_result = await db.execute(select(Wallets).where(Wallets.user_id == str(current_user.id)))
        wallet = wallet_result.scalar_one_or_none()
        if wallet and wallet.balance >= data.amount:
            balance_before = wallet.balance
            wallet.balance -= data.amount
            wallet.updated_at = now
            wtxn = Wallet_transactions(
                user_id=str(current_user.id), wallet_id=wallet.id,
                transaction_type="withdraw", amount=data.amount,
                balance_before=balance_before, balance_after=wallet.balance,
                note=f"Disbursement to {data.account_name} ({data.bank_code})",
                status="completed", reference_id=result.get("external_id", ""), created_at=now,
            )
            db.add(wtxn)
            await db.commit()
            payment_event_bus.publish({
                "event_type": "wallet_update", "user_id": str(current_user.id),
                "wallet_id": wallet.id, "balance": wallet.balance,
                "transaction_type": "withdraw", "amount": data.amount, "transaction_id": wtxn.id,
            })
        return GatewayResponse(success=True, message="Disbursement created", data={
            "disbursement_id": disb.id, "xendit_id": result.get("disbursement_id", ""),
            "external_id": result.get("external_id", ""), "amount": data.amount, "status": "pending",
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
        user_id = str(current_user.id)
        txn_result = await db.execute(
            select(Transactions).where(Transactions.id == data.transaction_id, Transactions.user_id == user_id)
        )
        txn = txn_result.scalar_one_or_none()
        if not txn:
            return GatewayResponse(success=False, message="Transaction not found")
        if txn.status != "paid":
            return GatewayResponse(success=False, message="Only paid transactions can be refunded")
        if data.amount > txn.amount:
            return GatewayResponse(success=False, message="Refund amount exceeds transaction amount")

        service = XenditService()
        result = await service.create_refund(invoice_id=txn.xendit_id, amount=data.amount, reason=data.reason)

        now = datetime.now()
        refund_type = "full" if data.amount >= txn.amount else "partial"
        ref = Refunds(
            user_id=user_id, transaction_id=data.transaction_id,
            external_id=result.get("external_id", f"ref-{txn.id}"),
            xendit_id=result.get("refund_id", ""),
            amount=data.amount, reason=data.reason,
            status="pending" if result.get("success") else "failed",
            refund_type=refund_type, created_at=now, updated_at=now,
        )
        db.add(ref)
        if result.get("success"):
            txn.status = "refunded" if refund_type == "full" else "partially_refunded"
            txn.updated_at = now
        await db.commit()
        return GatewayResponse(
            success=result.get("success", False),
            message="Refund processed" if result.get("success") else result.get("error", "Refund failed"),
            data={"refund_id": ref.id, "amount": data.amount, "type": refund_type, "status": ref.status},
        )
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
        now = datetime.now()
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
    sub.updated_at = datetime.now()
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
    now = datetime.now()
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
    cust.updated_at = datetime.now()
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
    service = XenditService()
    result = service.calculate_fees(data.amount, data.method)
    return result


# ==================== XENDIT BALANCE ====================
@router.get("/xendit-balance")
async def get_xendit_balance(
    current_user: UserResponse = Depends(get_current_user),
):
    service = XenditService()
    result = await service.get_balance()
    if result.get("success"):
        return {"success": True, "balance": result.get("balance", 0)}
    return {"success": False, "error": result.get("error", "Failed")}


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
    service = XenditService()
    result = await service.get_available_banks()
    if result.get("success"):
        return {"success": True, "banks": result.get("banks", [])}
    return {"success": False, "banks": []}


# ==================== REPORTS & ANALYTICS ====================
@router.get("/reports")
async def get_reports(
    period: str = "monthly",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = str(current_user.id)
    now = datetime.now()
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


# ==================== EXPIRE/CANCEL INVOICE ====================
@router.post("/expire-invoice/{txn_id}", response_model=GatewayResponse)
async def expire_invoice(
    txn_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transactions).where(Transactions.id == txn_id, Transactions.user_id == str(current_user.id))
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return GatewayResponse(success=False, message="Transaction not found")
    if txn.status != "pending":
        return GatewayResponse(success=False, message="Only pending transactions can be expired")
    if txn.xendit_id:
        service = XenditService()
        await service.expire_invoice(txn.xendit_id)
    txn.status = "expired"
    txn.updated_at = datetime.now()
    await db.commit()
    payment_event_bus.publish({
        "event_type": "status_change", "transaction_id": txn.id,
        "external_id": txn.external_id, "old_status": "pending",
        "new_status": "expired", "amount": txn.amount,
        "transaction_type": txn.transaction_type, "user_id": txn.user_id,
    })
    return GatewayResponse(success=True, message="Invoice expired", data={"transaction_id": txn.id})