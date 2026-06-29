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
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

# Change prefix to /api/v1/maya to avoid conflicts with xendit.py
# Payment creation endpoints (create-invoice, create-qr-code, create-payment-link)
# are now exclusively handled by xendit.py router with Maya as a fallback service.
# This file provides utility endpoints only.
router = APIRouter(prefix="/api/v1/maya", tags=["Maya Utilities"])


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


@router.get("/transaction/{external_id}")
async def get_transaction_status(
    external_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch status of a specific transaction and sync with Maya if needed."""
    txn_service = TransactionsService(db)
    txn = await txn_service.get_by_field("external_id", external_id)

    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.user_id != str(current_user.id) and not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # If pending, try to sync with Maya
    if txn.status == "pending":
        try:
            service = MayaService()
            maya_res = await service.get_checkout_status(txn.xendit_id) # Using xendit_id as checkout_id
            if maya_res.get("success"):
                status = maya_res.get("status", "").upper()
                new_status = "paid" if status in ["COMPLETED", "SUCCESS", "AUTHORIZED"] else "expired" if status in ["EXPIRED", "CANCELLED"] else "pending"

                if new_status != txn.status:
                    old_status = txn.status
                    txn.status = new_status
                    txn.updated_at = datetime.now()
                    await db.commit()

                    # Notify event bus
                    payment_event_bus.publish({
                        "event_type": "status_change",
                        "transaction_id": txn.id,
                        "external_id": txn.external_id,
                        "old_status": old_status,
                        "new_status": new_status,
                        "amount": txn.amount,
                        "description": txn.description,
                        "transaction_type": txn.transaction_type,
                        "user_id": txn.user_id,
                    })
        except Exception as e:
            logger.warning(f"Failed to sync Maya transaction {external_id}: {e}")

    return {
        "success": True,
        "id": txn.id,
        "external_id": txn.external_id,
        "status": txn.status,
        "amount": txn.amount,
        "description": txn.description,
        "payment_url": txn.payment_url,
        "created_at": txn.created_at
    }
