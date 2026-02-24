import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.topup_requests import TopupRequest
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.admin_users import AdminUser
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/topup", tags=["topup"])

USDT_TRC20_ADDRESS = "TBKoUfHZG2kABV5CpMnACpdWsscguYzaUe"


# ---------- Schemas ----------
class TopupRequestResponse(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    amount_usdt: float
    receipt_file_id: Optional[str] = None
    status: str
    note: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class TopupListResponse(BaseModel):
    items: List[TopupRequestResponse]
    total: int

class ApproveTopupRequest(BaseModel):
    note: str = ""

class RejectTopupRequest(BaseModel):
    note: str = "Request rejected by admin."


# ---------- Helpers ----------
async def _get_or_create_usd_wallet(db: AsyncSession, user_id: str) -> Wallets:
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "USD")
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        now = datetime.now()
        wallet = Wallets(user_id=user_id, balance=0.0, currency="USD", created_at=now, updated_at=now)
        db.add(wallet)
        await db.flush()
    return wallet


# ---------- Endpoints ----------
@router.get("", response_model=TopupListResponse)
async def list_topup_requests(
    status: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all topup requests (super admin only)."""
    stmt = select(TopupRequest).order_by(TopupRequest.created_at.desc())
    if status:
        stmt = stmt.where(TopupRequest.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return TopupListResponse(items=list(items), total=len(items))


@router.get("/{topup_id}", response_model=TopupRequestResponse)
async def get_topup_request(
    topup_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TopupRequest).where(TopupRequest.id == topup_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Topup request not found")
    return req


@router.post("/{topup_id}/approve", response_model=TopupRequestResponse)
async def approve_topup_request(
    topup_id: int,
    body: ApproveTopupRequest = ApproveTopupRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a topup request and credit the user's USD wallet."""
    result = await db.execute(select(TopupRequest).where(TopupRequest.id == topup_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Topup request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    # Credit USD wallet
    user_wallet_id = f"tg-{req.chat_id}"
    wallet = await _get_or_create_usd_wallet(db, user_wallet_id)
    balance_before = wallet.balance
    wallet.balance += req.amount_usdt
    wallet.updated_at = datetime.now()

    # Record wallet transaction
    now = datetime.now()
    txn = Wallet_transactions(
        user_id=user_wallet_id,
        wallet_id=wallet.id,
        transaction_type="topup",
        amount=req.amount_usdt,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=f"USDT TRC20 topup approved (request #{topup_id})" + (f" — {body.note}" if body.note else ""),
        status="completed",
        reference_id=str(topup_id),
        created_at=now,
    )
    db.add(txn)

    # Update topup request status
    req.status = "approved"
    req.note = body.note or "Approved"
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = now

    await db.commit()
    await db.refresh(req)

    # Fire wallet update event
    try:
        await payment_event_bus.publish({
            "type": "wallet_update",
            "user_id": user_wallet_id,
            "balance": wallet.balance,
            "currency": "USD",
        })
    except Exception:
        pass

    logger.info(f"Topup #{topup_id} approved — credited ${req.amount_usdt} USD to {user_wallet_id}")
    return req


@router.post("/{topup_id}/reject", response_model=TopupRequestResponse)
async def reject_topup_request(
    topup_id: int,
    body: RejectTopupRequest = RejectTopupRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a topup request."""
    result = await db.execute(select(TopupRequest).where(TopupRequest.id == topup_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Topup request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "rejected"
    req.note = body.note
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = datetime.now()

    await db.commit()
    await db.refresh(req)
    logger.info(f"Topup #{topup_id} rejected")
    return req
