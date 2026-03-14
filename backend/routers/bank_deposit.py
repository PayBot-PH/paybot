import logging
import os
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.bank_deposit_requests import BankDepositRequest
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bank-deposits", tags=["bank-deposits"])

# PayBot PH bank accounts
_PAYBOT_ACCOUNTS: dict[str, dict[str, str]] = {
    "GoTyme Digital Bank": {"number": "012116012891", "name": "PayBot PH"},
    "Security Bank Corporation": {"number": "0000068888173", "name": "PayBot PH"},
    "Asia United Bank": {"number": "934105321485", "name": "PayBot PH"},
}

# Directory for uploaded bank transfer receipts (relative to this file's package root)
_RECEIPTS_SUBDIR = "bank-receipts"


# ---------- Schemas ----------
class BankDepositRequestResponse(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    channel: str
    account_number: str
    amount_php: float
    receipt_file_id: Optional[str] = None
    status: str
    note: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BankDepositListResponse(BaseModel):
    items: List[BankDepositRequestResponse]
    total: int


class ApproveBankDepositRequest(BaseModel):
    note: str = ""


class RejectBankDepositRequest(BaseModel):
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

@router.post("", response_model=BankDepositRequestResponse, status_code=201)
async def create_bank_deposit_request(
    amount_php: float = Form(...),
    channel: str = Form(...),
    account_number: str = Form(...),
    transfer_method: str = Form(...),
    ref_number: Optional[str] = Form(None),
    receipt: Optional[UploadFile] = File(None),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a bank deposit request with an optional receipt file."""
    receipt_path: Optional[str] = None
    if receipt and receipt.filename:
        uploads_dir = os.path.join(os.path.dirname(__file__), "..", "static", "uploads", _RECEIPTS_SUBDIR)
        os.makedirs(uploads_dir, exist_ok=True)
        ext = os.path.splitext(receipt.filename)[1] or ".bin"
        filename = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(uploads_dir, filename)
        content = await receipt.read()
        with open(file_path, "wb") as f:
            f.write(content)
        receipt_path = f"/uploads/{_RECEIPTS_SUBDIR}/{filename}"

    note_parts = [f"Transfer method: {transfer_method}"]
    if ref_number:
        note_parts.append(f"Ref: {ref_number}")
    note_text = " | ".join(note_parts)

    req = BankDepositRequest(
        chat_id=current_user.id,
        telegram_username=current_user.name,
        channel=channel,
        account_number=account_number,
        amount_php=amount_php,
        receipt_file_id=receipt_path,
        status="pending",
        note=note_text,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    try:
        payment_event_bus.publish({
            "event_type": "bank_deposit_request",
            "request_id": req.id,
            "user_id": f"tg-{current_user.id}",
            "amount_php": amount_php,
            "channel": channel,
        })
    except Exception:
        pass

    logger.info(
        "Bank deposit request #%s created by %s — ₱%.2f via %s",
        req.id, current_user.id, amount_php, channel,
    )
    return req


@router.get("", response_model=BankDepositListResponse)
async def list_bank_deposit_requests(
    status: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all bank deposit requests (super admin only)."""
    stmt = select(BankDepositRequest).order_by(BankDepositRequest.created_at.desc())
    if status:
        stmt = stmt.where(BankDepositRequest.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return BankDepositListResponse(items=list(items), total=len(items))


@router.get("/{deposit_id}", response_model=BankDepositRequestResponse)
async def get_bank_deposit_request(
    deposit_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BankDepositRequest).where(BankDepositRequest.id == deposit_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Bank deposit request not found")
    return req


@router.post("/{deposit_id}/approve", response_model=BankDepositRequestResponse)
async def approve_bank_deposit_request(
    deposit_id: int,
    body: ApproveBankDepositRequest = ApproveBankDepositRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a bank deposit request: credit PHP amount to user's PHP wallet."""
    result = await db.execute(select(BankDepositRequest).where(BankDepositRequest.id == deposit_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Bank deposit request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    user_wallet_id = f"tg-{req.chat_id}"
    amount_php = req.amount_php
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
            f"Bank deposit: ₱{amount_php:,.2f} via {req.channel} ({req.account_number})"
            f" (request #{deposit_id})"
            + (f" — {body.note}" if body.note else "")
        ),
        status="completed",
        reference_id=str(deposit_id),
        created_at=now,
    )
    db.add(txn)

    req.status = "approved"
    req.note = body.note or f"Approved: ₱{amount_php:,.2f} PHP credited"
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = now

    await db.commit()
    await db.refresh(req)

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
        "Bank deposit #%s approved — ₱%.2f PHP credited to %s",
        deposit_id, amount_php, user_wallet_id,
    )
    return req


@router.post("/{deposit_id}/reject", response_model=BankDepositRequestResponse)
async def reject_bank_deposit_request(
    deposit_id: int,
    body: RejectBankDepositRequest = RejectBankDepositRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a bank deposit request."""
    result = await db.execute(select(BankDepositRequest).where(BankDepositRequest.id == deposit_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Bank deposit request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "rejected"
    req.note = body.note
    req.approved_by = getattr(current_user, "telegram_id", str(current_user.id))
    req.updated_at = datetime.now()

    await db.commit()
    await db.refresh(req)
    logger.info("Bank deposit #%s rejected", deposit_id)
    return req
