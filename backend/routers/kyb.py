"""
KYB (Know Your Business) Registration Management Router
Super admins can list, approve, and reject KYB registrations submitted via the Telegram bot.
Approval automatically creates an AdminUser record, granting bot access.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.admin_users import AdminUser
from models.kyb_registrations import KybRegistration
from schemas.auth import UserResponse
from services.telegram_service import TelegramService, _resolve_bot_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kyb", tags=["kyb"])

# ---------- Message templates ----------

_MSG_APPROVED = (
    "🎉 <b>KYB Registration Approved!</b>\n"
    "━━━━━━━━━━━━━━━━━━━━\n"
    "Your registration has been approved. You can now use all bot commands.\n\n"
    "Type /start to begin."
)

_MSG_REJECTED_TEMPLATE = (
    "❌ <b>KYB Registration Rejected</b>\n"
    "━━━━━━━━━━━━━━━━━━━━\n"
    "Reason: {reason}\n\n"
    "Please contact the bot administrator for more information."
)

# ---------- Schemas ----------

class KybRegistrationOut(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
    step: str
    full_name: Optional[str] = None
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


class KybRejectRequest(BaseModel):
    reason: str = "No reason provided."


# ---------- Helpers ----------

def _require_super_admin(current_user: UserResponse) -> None:
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")


async def _notify_user(chat_id: str, message: str) -> None:
    """Send a Telegram message to the user (best-effort; errors are logged only)."""
    try:
        token = _resolve_bot_token(None)
        if token:
            tg = TelegramService(token)
            await tg.send_message(chat_id, message)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send Telegram notification to %s: %s", chat_id, exc)


# ---------- Endpoints ----------

@router.get("", response_model=KybListResponse)
async def list_kyb_registrations(
    status: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List KYB registrations. Optionally filter by status. Super admin only."""
    _require_super_admin(current_user)
    stmt = select(KybRegistration).order_by(KybRegistration.created_at.desc())
    if status:
        stmt = stmt.where(KybRegistration.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return KybListResponse(items=list(items), total=len(items))


@router.post("/{chat_id}/approve", response_model=KybRegistrationOut)
async def approve_kyb_registration(
    chat_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a KYB registration and grant the user admin access. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == chat_id))
    kyb = result.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="KYB registration not found.")
    if kyb.status == "approved":
        raise HTTPException(status_code=400, detail="KYB registration is already approved.")

    kyb.status = "approved"
    kyb.rejection_reason = None

    # Create AdminUser record if it does not already exist
    existing = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
    if not existing.scalar_one_or_none():
        new_admin = AdminUser(
            telegram_id=chat_id,
            telegram_username=kyb.telegram_username,
            name=kyb.full_name or kyb.telegram_username or chat_id,
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
    await _notify_user(chat_id, _MSG_APPROVED)
    return kyb


@router.post("/{chat_id}/reject", response_model=KybRegistrationOut)
async def reject_kyb_registration(
    chat_id: str,
    body: KybRejectRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a KYB registration with an optional reason. Super admin only."""
    _require_super_admin(current_user)

    result = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == chat_id))
    kyb = result.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="KYB registration not found.")

    kyb.status = "rejected"
    kyb.rejection_reason = body.reason
    await db.commit()
    await db.refresh(kyb)
    await _notify_user(chat_id, _MSG_REJECTED_TEMPLATE.format(reason=body.reason))
    return kyb

