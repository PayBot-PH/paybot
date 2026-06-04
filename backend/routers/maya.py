import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.wallets import Wallets
from schemas.auth import UserResponse
from services.maya_service import MayaService
from services.transactions import TransactionsService

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
        txn_service = TransactionsService(db)
        await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="invoice",
            amount=data.amount,
            external_id=result.get("external_id", ""),
            gateway_id=result.get("checkout_id", ""),
            description=data.description,
            payment_url=result.get("checkout_url", ""),
        )

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
        txn_service = TransactionsService(db)
        txn = await txn_service.create_transaction(
            user_id=str(current_user.id),
            transaction_type="qr_code",
            amount=data.amount,
            external_id=result.get("external_id", ""),
            gateway_id=result.get("qr_id", ""),
            description=data.description,
            payment_url=result.get("redirect_url", ""),
        )
        # Note: qr_content is currently mapped to qr_code_url in the model
        txn.qr_code_url = result.get("qr_content", "")
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
    txn_service = TransactionsService(db)
    stats = await txn_service.get_user_stats(str(current_user.id))
    return {
        "success": True,
        **stats
    }


@router.get("/balance")
async def get_maya_balance(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch user balance."""
    perms = current_user.permissions
    if perms and perms.is_super_admin:
        try:
            from services.paymongo_service import PayMongoService
            pm_svc = PayMongoService()
            pm_bal = await pm_svc.get_balance()
            if pm_bal.get("success"):
                available = pm_bal.get("available", [])
                php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
                if php_entry is not None:
                    return {
                        "success": True,
                        "balance": float(php_entry["amount"]) / 100.0,
                        "currency": "PHP",
                        "is_live": True
                    }
        except Exception as e:
            logger.warning(f"PayMongo balance fetch failed for super admin: {e}")

    # Fallback to internal wallet balance
    res = await db.execute(
        select(Wallets.balance).where(Wallets.user_id == str(current_user.id), Wallets.currency == "PHP")
    )
    balance = res.scalar() or 0.0
    return {
        "success": True,
        "balance": balance,
        "currency": "PHP",
        "is_live": False
    }


@router.get("/wallet")
async def get_maya_internal_wallet(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Fetch the internal wallet balance explicitly."""
    res = await db.execute(
        select(Wallets.balance).where(Wallets.user_id == str(current_user.id), Wallets.currency == "PHP")
    )
    balance = res.scalar() or 0.0
    return {
        "success": True,
        "balance": balance,
        "currency": "PHP"
    }
