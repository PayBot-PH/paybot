import logging
import time
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services.maya_service import MayaService
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

# We use the prefix /api/v1/xendit to satisfy the frontend's hardcoded paths
router = APIRouter(prefix="/api/v1/xendit", tags=["Maya (Legacy Xendit Path)"])


class CreateInvoiceRequest(BaseModel):
    amount: float
    description: str = ""
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    external_id: Optional[str] = None


class UnifiedBalanceResponse(BaseModel):
    """Unified balance response for both PHP and USD wallets."""
    success: bool
    php_balance: float
    usd_balance: float
    currency: str = "PHP"


def _tg_user_id(user_id: str) -> str:
    """Return the Telegram-prefixed user_id used by the bot for USD wallet storage."""
    return f"tg-{user_id}"


async def _compute_usd_balance(db: AsyncSession, user_id: str) -> float:
    """Compute USD wallet balance from completed wallet_transactions (credits minus debits)."""
    _USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
    _USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")
    
    from sqlalchemy import case
    row = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(_USD_CREDIT_TYPES),
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("credits"),
            func.coalesce(
                func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(_USD_DEBIT_TYPES),
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("debits"),
        ).where(
            Wallet_transactions.user_id == user_id,
            Wallet_transactions.status == "completed",
        )
    )
    result = row.one()
    credits = float(result.credits or 0.0)
    debits = float(result.debits or 0.0)
    return max(0.0, credits - debits)


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


@router.get("/balance", response_model=UnifiedBalanceResponse)
async def get_unified_balance(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unified endpoint: Fetch both PHP and USD balances in a single request.
    - PHP balance: from Wallets table (user_id directly)
    - USD balance: computed from wallet_transactions (tg-prefixed user_id)
    """
    user_id = str(current_user.id)
    
    # Get PHP wallet balance
    php_res = await db.execute(
        select(Wallets.balance).where(
            Wallets.user_id == user_id,
            Wallets.currency == "PHP"
        )
    )
    php_balance = float(php_res.scalar() or 0.0)
    
    # Get USD balance (keyed by tg-prefixed user_id)
    tg_user_id = _tg_user_id(user_id)
    usd_balance = await _compute_usd_balance(db, tg_user_id)
    
    logger.debug(f"Unified balance for user {user_id}: PHP={php_balance}, USD={usd_balance}")
    
    return UnifiedBalanceResponse(
        success=True,
        php_balance=php_balance,
        usd_balance=usd_balance,
        currency="PHP"
    )
