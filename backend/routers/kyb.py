"""
KYB (Know Your Business) Registration Management Router
Super admins can list, approve, and reject KYB registration applications.
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
from models.admin_users import AdminUser
from models.kyb_registrations import KybRegistration
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kyb", tags=["kyb"])


# ---------- Schemas ----------

class KybRegistrationOut(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    step: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    id_photo_file_id: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class KybListResponse(BaseModel):
    items: List[KybRegistrationOut]
    total: int


class ApproveKybRequest(BaseModel):
    note: str = ""


class RejectKybRequest(BaseModel):
    reason: str = "No reason provided."


# ---------- Helpers ----------

def _require_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required to manage KYB registrations.",
        )


# ---------- Endpoints ----------

@router.get("", response_model=KybListResponse)
async def list_kyb_registrations(
    status: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all KYB registrations. Super admin only."""
    _require_super_admin(current_user)
    stmt = select(KybRegistration).order_by(KybRegistration.created_at.desc())
    if status:
        stmt = stmt.where(KybRegistration.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return KybListResponse(items=list(items), total=len(items))


@router.get("/{kyb_id}", response_model=KybRegistrationOut)
async def get_kyb_registration(
    kyb_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific KYB registration. Super admin only."""
    _require_super_admin(current_user)
    result = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = result.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="KYB registration not found")
    return kyb


@router.post("/{kyb_id}/approve", response_model=KybRegistrationOut)
async def approve_kyb_registration(
    kyb_id: int,
    body: ApproveKybRequest = ApproveKybRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a KYB registration and create an AdminUser for the applicant. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = result.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="KYB registration not found")
    if kyb.status == "approved":
        raise HTTPException(status_code=400, detail="KYB registration is already approved")
    if kyb.status not in ("pending_review", "in_progress", "rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot approve a registration with status: {kyb.status}")

    kyb.status = "approved"
    kyb.rejection_reason = None

    # Create an AdminUser record for the approved user if one doesn't already exist
    existing = await db.execute(select(AdminUser).where(AdminUser.telegram_id == kyb.chat_id))
    if not existing.scalar_one_or_none():
        new_admin = AdminUser(
            telegram_id=kyb.chat_id,
            telegram_username=kyb.telegram_username,
            name=kyb.full_name or kyb.telegram_username or kyb.chat_id,
            is_active=True,
            is_super_admin=False,
            can_manage_payments=True,
            can_manage_disbursements=True,
            can_view_reports=True,
            can_manage_wallet=True,
            can_manage_transactions=True,
            can_manage_bot=False,
            can_approve_topups=False,
            added_by=current_user.id,
        )
        db.add(new_admin)

    await db.commit()
    await db.refresh(kyb)

    # Optionally notify the user via Telegram
    try:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        await tg.send_message(
            kyb.chat_id,
            "🎉 <b>KYB Registration Approved!</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "Your registration has been approved. You can now use all bot commands.\n\n"
            "Type /start to begin.",
        )
    except Exception as e:
        logger.warning("Failed to send KYB approval notification to %s: %s", kyb.chat_id, e)

    logger.info("KYB #%d approved by admin %s — chat_id %s (%s)", kyb_id, current_user.id, kyb.chat_id, kyb.full_name)
    return kyb


@router.post("/{kyb_id}/reject", response_model=KybRegistrationOut)
async def reject_kyb_registration(
    kyb_id: int,
    body: RejectKybRequest = RejectKybRequest(),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a KYB registration with an optional reason. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = result.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="KYB registration not found")
    if kyb.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot reject an already-approved KYB registration")

    kyb.status = "rejected"
    kyb.rejection_reason = body.reason

    await db.commit()
    await db.refresh(kyb)

    # Optionally notify the user via Telegram
    try:
        from services.telegram_service import TelegramService
        tg = TelegramService()
        await tg.send_message(
            kyb.chat_id,
            f"❌ <b>KYB Registration Rejected</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Reason: {body.reason}\n\n"
            f"Please contact the bot administrator for more information.",
        )
    except Exception as e:
        logger.warning("Failed to send KYB rejection notification to %s: %s", kyb.chat_id, e)

    logger.info("KYB #%d rejected by admin %s — chat_id %s", kyb_id, current_user.id, kyb.chat_id)
    return kyb
