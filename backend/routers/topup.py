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
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from routers.app_settings import get_usdt_php_rate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/topup", tags=["topup"])

# ---------- Constants ----------
USDT_TRC20_ADDRESS = "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx"



# ---------- Schemas ----------
class TopupRequestResponse(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    amount_usdt: float
    currency: str = "PHP"
    reference_code: Optional[str] = None
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
async def _get_or_create_php_wallet(db: AsyncSession, user_id: str) -> Wallets:
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "PHP")
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        now = datetime.now()
        wallet = Wallets(user_id=user_id, balance=0.0, currency="PHP", created_at=now, updated_at=now)
        db.add(wallet)
        await db.flush()
    return wallet


# ---------- Endpoints ----------

@router.get("/rate")
async def get_conversion_rate(db: AsyncSession = Depends(get_db)):
    """Return the current USDT→PHP exchange rate used for topup conversion. Publicly accessible."""
    rate = await get_usdt_php_rate(db)
    return {"usdt_php_rate": rate}


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
    """Approve a USDT topup request: convert USDT→PHP at the configured rate and credit the PHP wallet."""
    result = await db.execute(select(TopupRequest).where(TopupRequest.id == topup_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Topup request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    user_wallet_id = f"tg-{req.chat_id}"
    amount_usdt = req.amount_usdt

    # Fetch the current USDT→PHP exchange rate
    rate = await get_usdt_php_rate(db)
    amount_php = round(amount_usdt * rate, 2)

    now = datetime.now()

    wallet = await _get_or_create_php_wallet(db, user_wallet_id)
    balance_before = wallet.balance
    wallet.balance = round(wallet.balance + amount_php, 2)
    wallet.updated_at = now
    txn = Wallet_transactions(
        user_id=user_wallet_id,
        wallet_id=wallet.id,
        transaction_type="top_up",
        amount=amount_php,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=(
            f"USDT→PHP topup: ${amount_usdt:.2f} USDT × ₱{rate:.2f} = ₱{amount_php:,.2f}"
            f" (request #{topup_id})"
            + (f" — {body.note}" if body.note else "")
        ),
        status="completed",
        reference_id=str(topup_id),
        created_at=now,
    )

    db.add(txn)

    # Update topup request status
    req.status = "approved"
    req.note = body.note or f"Approved: ${amount_usdt:.2f} USDT → ₱{amount_php:,.2f} PHP (rate: {rate:.2f})"
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = now

    await db.commit()
    await db.refresh(req)

    # Fire wallet update event
    try:
        payment_event_bus.publish({
            "event_type": "wallet_update",
            "user_id": user_wallet_id,
            "wallet_id": wallet.id,
            "balance": wallet.balance,
            "transaction_type": "top_up",
            "amount": amount_php,
        })
    except Exception:
        pass

    logger.info(
        "Topup #%s approved — $%.2f USDT → ₱%.2f PHP (rate %.2f) credited to %s",
        topup_id, amount_usdt, amount_php, rate, user_wallet_id,
    )
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
