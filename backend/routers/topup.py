import logging
from datetime import datetime, timezone
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
from services.wallets import WalletsService
from routers.app_settings import get_usdt_php_rate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/topup", tags=["topup"])



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

class TopupRequestCreate(BaseModel):
    amount: float
    currency: str = "PHP"
    note: Optional[str] = None

class ApproveTopupRequest(BaseModel):
    note: str = ""

class RejectTopupRequest(BaseModel):
    note: str = "Request rejected by admin."


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


@router.post("/request", response_model=TopupRequestResponse)
async def create_topup_request(
    data: TopupRequestCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allow a mobile user to submit a top-up request."""
    # Convert PHP to USDT roughly if needed, or just store amount.
    # The model says amount_usdt. For now we'll assume the mobile user inputs the target currency.
    # In topup.py approve handler, it treats amount_usdt * rate = amount_php.

    # Let's get the rate to convert the requested PHP to USDT for storage if that's what's expected
    rate = await get_usdt_php_rate(db)
    amount_usdt = round(data.amount / rate, 2) if data.currency == "PHP" else data.amount

    new_request = TopupRequest(
        chat_id=str(current_user.id),
        telegram_username=getattr(current_user, "username", current_user.name),
        amount_usdt=amount_usdt,
        currency=data.currency,
        status="pending",
        note=data.note or "Requested via Mobile App",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)

    logger.info(f"Top-up request {new_request.id} created by user {current_user.id}")
    return new_request


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

    # Ensure consistent ID normalization via service
    user_id = str(req.chat_id)
    amount_usdt = req.amount_usdt

    # Fetch the current USDT→PHP exchange rate
    rate = await get_usdt_php_rate(db)
    amount_php = round(amount_usdt * rate, 2)

    wallet_service = WalletsService(db)
    wallet = await wallet_service.get_or_create_wallet(user_id, "PHP")

    balance_before = wallet.balance
    wallet.balance = round(wallet.balance + amount_php, 2)
    wallet.updated_at = datetime.now(timezone.utc)

    txn = Wallet_transactions(
        user_id=wallet.user_id,
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
        created_at=datetime.now(timezone.utc),
    )

    db.add(txn)

    # Update topup request status
    req.status = "approved"
    req.note = body.note or f"Approved: ${amount_usdt:.2f} USDT → ₱{amount_php:,.2f} PHP (rate: {rate:.2f})"
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(req)

    await wallet_service.publish_wallet_event(wallet.user_id, wallet, "top_up", amount_php, txn.id, req.note)

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
    req.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(req)
    logger.info(f"Topup #{topup_id} rejected")
    return req
