"""
KYC (Know Your Customer) Verification Management Router
Super admins can list, approve, and reject KYC verification applications.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.kyc_verifications import KycVerification
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kyc", tags=["kyc"])


# ---------- Schemas ----------

class KycVerificationOut(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    step: str
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_photo_file_id: Optional[str] = None
    selfie_file_id: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class KycListResponse(BaseModel):
    items: List[KycVerificationOut]
    total: int


class ApproveKycRequest(BaseModel):
    note: str = ""


class RejectKycRequest(BaseModel):
    reason: str = "No reason provided."


# ---------- Helpers ----------

def _require_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required to manage KYC verifications.",
        )


# ---------- Endpoints ----------

@router.get("", response_model=KycListResponse)
async def list_kyc_verifications(
    status: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all KYC verifications. Super admin only."""
    _require_super_admin(current_user)
    stmt = select(KycVerification).order_by(KycVerification.created_at.desc())
    if status:
        stmt = stmt.where(KycVerification.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return KycListResponse(items=list(items), total=len(items))


@router.get("/{kyc_id}", response_model=KycVerificationOut)
async def get_kyc_verification(
    kyc_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific KYC verification. Super admin only."""
    _require_super_admin(current_user)
    result = await db.execute(select(KycVerification).where(KycVerification.id == kyc_id))
    kyc = result.scalar_one_or_none()
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC verification not found")
    return kyc


@router.post("/{kyc_id}/approve", response_model=KycVerificationOut)
async def approve_kyc_verification(
    kyc_id: int,
    body: ApproveKycRequest = ApproveKycRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a KYC verification. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KycVerification).where(KycVerification.id == kyc_id))
    kyc = result.scalar_one_or_none()
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC verification not found")
    if kyc.status == "approved":
        raise HTTPException(status_code=400, detail="KYC verification is already approved")
    if kyc.status not in ("pending_review", "in_progress", "rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot approve a verification with status: {kyc.status}")

    kyc.status = "approved"
    kyc.rejection_reason = None

    await db.commit()
    await db.refresh(kyc)

    # Optionally notify the user via Telegram
    try:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        await tg.send_message(
            kyc.chat_id,
            "✅ <b>KYC Verification Approved!</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "Your identity has been verified successfully. You now have full access.\n\n"
            "Type /start to continue.",
        )
    except Exception as e:
        logger.warning("Failed to send KYC approval notification to %s: %s", kyc.chat_id, e)

    logger.info("KYC #%d approved by admin %s — chat_id %s (%s)", kyc_id, current_user.id, kyc.chat_id, kyc.full_name)
    return kyc


@router.post("/{kyc_id}/reject", response_model=KycVerificationOut)
async def reject_kyc_verification(
    kyc_id: int,
    body: RejectKycRequest = RejectKycRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a KYC verification with an optional reason. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KycVerification).where(KycVerification.id == kyc_id))
    kyc = result.scalar_one_or_none()
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC verification not found")
    if kyc.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot reject an already-approved KYC verification")

    kyc.status = "rejected"
    kyc.rejection_reason = body.reason

    await db.commit()
    await db.refresh(kyc)

    # Optionally notify the user via Telegram
    try:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        await tg.send_message(
            kyc.chat_id,
            f"❌ <b>KYC Verification Rejected</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Reason: {body.reason}\n\n"
            f"Please contact the bot administrator for more information.",
        )
    except Exception as e:
        logger.warning("Failed to send KYC rejection notification to %s: %s", kyc.chat_id, e)

    logger.info("KYC #%d rejected by admin %s — chat_id %s", kyc_id, current_user.id, kyc.chat_id)
    return kyc
