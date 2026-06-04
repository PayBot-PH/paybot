import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.wallets import Wallets
from schemas.auth import UserResponse
from services.maya_service import MayaService

logger = logging.getLogger(__name__)

# We use the prefix /api/v1/xendit to satisfy the frontend's hardcoded paths
router = APIRouter(prefix="/api/v1/xendit", tags=["Maya (Legacy Xendit Path)"])


class CreateInvoiceRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    external_id: Optional[str] = None


@router.post("/create-invoice")
@router.post("/create-payment-link")
async def create_maya_checkout(
    data: CreateInvoiceRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for Maya Checkout (fulfills frontend Xendit requests)"""
    try:
        service = MayaService()
        result = await service.create_checkout(
            amount=data.amount,
            description=data.description,
            customer_name=data.customer_name or "",
            customer_email=data.customer_email or "",
            external_id=data.external_id or "",
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Maya checkout failed"))

        # Save to transactions table
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="invoice",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("checkout_id", ""), # Store Maya ID in xendit_id col for now
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            payment_url=result.get("checkout_url", ""),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(txn)
        await db.commit()
        
        return {
            "success": True,
            "invoice_url": result.get("checkout_url"),
            "external_id": result.get("external_id"),
            "amount": data.amount,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Maya Checkout Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-qr-code")
async def create_maya_qr(
    data: CreateInvoiceRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for Maya QR (fulfills frontend Xendit requests)"""
    try:
        service = MayaService()
        result = await service.create_qr_payment(
            amount=data.amount,
            description=data.description,
            external_id=data.external_id or "",
        )
        
        if not result.get("success"):
             # Fallback to checkout if QR fails
             return await create_maya_checkout(data, current_user, db)

        # Save to transactions table
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="qr_code",
            external_id=result.get("external_id", ""),
            xendit_id=result.get("qr_id", ""),
            amount=data.amount,
            currency="PHP",
            status="pending",
            description=data.description,
            payment_url=result.get("redirect_url", ""),
            qr_content=result.get("qr_content", ""),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(txn)
        await db.commit()
        
        return {
            "success": True,
            "qr_string": result.get("qr_content"),
            "external_id": result.get("external_id"),
            "amount": data.amount,
        }
    except Exception as e:
        logger.error(f"Maya QR Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transaction-stats")
async def get_maya_stats(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch transaction statistics from local DB (replaces Xendit stats)"""
    user_id = str(current_user.id)
    
    # Revenue this month
    start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    res = await db.execute(
        select(func.sum(Transactions.amount)).where(
            Transactions.user_id == user_id,
            Transactions.status == "paid",
            Transactions.created_at >= start_of_month
        )
    )
    monthly_revenue = res.scalar() or 0
    
    res_count = await db.execute(
        select(func.count(Transactions.id)).where(
            Transactions.user_id == user_id,
            Transactions.status == "paid"
        )
    )
    total_paid = res_count.scalar() or 0
    
    return {
        "success": True,
        "monthly_revenue": float(monthly_revenue),
        "total_paid_transactions": total_paid,
        "currency": "PHP"
    }


@router.get("/balance")
async def get_maya_balance(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch user balance from local wallet (replaces Xendit balance)"""
    res = await db.execute(
        select(Wallets.balance).where(Wallets.user_id == str(current_user.id), Wallets.currency == "PHP")
    )
    balance = res.scalar() or 0.0
    return {
        "success": True,
        "balance": balance,
        "currency": "PHP"
    }
