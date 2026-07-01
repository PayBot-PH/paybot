import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.kyb_registrations import KybRegistration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kyb", tags=["kyb"])


class KybOut(BaseModel):
    id: int
    chat_id: str
    telegram_username: Optional[str] = None
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
    items: List[KybOut]
    total: int


@router.get("", response_model=KybListResponse)
async def list_kyb_registrations(status: Optional[str] = None, current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Super admin only
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    stmt = select(KybRegistration).order_by(KybRegistration.created_at.desc())
    if status:
        stmt = stmt.where(KybRegistration.status == status)
    result = await db.execute(stmt)
    items = result.scalars().all()
    return KybListResponse(items=list(items), total=len(items))


@router.get("/{kyb_id}", response_model=KybOut)
async def get_kyb(kyb_id: int, current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    res = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = res.scalar_one_or_none()
    if not kyb:
        raise HTTPException(status_code=404, detail="Registration not found")
    return kyb


class ApproveBody(BaseModel):
    note: str = ""


class RejectBody(BaseModel):
    reason: str = "Rejected by admin."


@router.post("/{kyb_id}/approve", response_model=KybOut)
async def approve_kyb(kyb_id: int, body: ApproveBody = ApproveBody(), current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    res = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = res.scalar_one_or_none()
    if not kyb or kyb.status != "pending_review":
        raise HTTPException(status_code=400, detail="Invalid or already processed request.")

    kyb.status = "approved"
    kyb.rejection_reason = None
    kyb.reviewed_by = str(current_user.id)
    kyb.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(kyb)
    logger.info(f"KYB #{kyb_id} approved by {current_user.id}")
    return kyb


@router.post("/{kyb_id}/reject", response_model=KybOut)
async def reject_kyb(kyb_id: int, body: RejectBody = RejectBody(), current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    res = await db.execute(select(KybRegistration).where(KybRegistration.id == kyb_id))
    kyb = res.scalar_one_or_none()
    if not kyb or kyb.status != "pending_review":
        raise HTTPException(status_code=400, detail="Invalid or already processed request.")

    kyb.status = "rejected"
    kyb.rejection_reason = body.reason
    kyb.reviewed_by = str(current_user.id)
    kyb.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(kyb)
    logger.info(f"KYB #{kyb_id} rejected by {current_user.id}: {body.reason}")
    return kyb
"""
KYB (Know Your Business) Registration Management Router
Super admins can list, approve, and reject KYB registration applications.
"""
import logging
import hashlib
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.admin_users import AdminUser
from models.kyb_registrations import KybRegistration
from models.team_invitations import TeamInvitation
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

    # Resolve organization assignment from invitation when available.
    # If there is no invitation, create/assign a dedicated organization for this direct registration.
    org_id: Optional[str] = None
    org_name: Optional[str] = None
    invitation = None
    email = (kyb.email or "").strip().lower()
    if email:
        inv_res = await db.execute(
            select(TeamInvitation)
            .where(
                func.lower(TeamInvitation.email) == email,
                TeamInvitation.status.in_(["pending", "accepted"]),
            )
            .order_by(TeamInvitation.created_at.desc())
        )
        invitation = inv_res.scalar_one_or_none()

    if invitation and invitation.organization_id:
        org_id = invitation.organization_id
        org_name = invitation.organization_name or kyb.bank_name or kyb.full_name
    else:
        # Direct website registration: user becomes owner under their own organization.
        stable_key = (kyb.chat_id or email or str(kyb.id)).strip().lower().encode()
        org_id = f"org-{hashlib.sha256(stable_key).hexdigest()[:16]}"
        org_name = (kyb.bank_name or kyb.full_name or "My Organization").strip()

    invitation_permissions = invitation.permissions if invitation and isinstance(invitation.permissions, dict) else {}
    is_invited_user = invitation is not None and invitation.organization_id is not None

    # Create or update AdminUser for approved registration with organization context.
    existing = await db.execute(select(AdminUser).where(AdminUser.telegram_id == kyb.chat_id))
    admin_user = existing.scalar_one_or_none()

    if is_invited_user:
        can_manage_team = bool(invitation_permissions.get("can_manage_team", False))
        can_manage_payments = bool(
            invitation_permissions.get("can_edit_business_settings", False)
            or invitation_permissions.get("can_add_edit_delete_cards_promotion", False)
            or invitation_permissions.get("can_refund_cards_charges", False)
        )
        can_manage_disbursements = bool(
            invitation_permissions.get("can_upload_delete_batch_disbursements", False)
            or invitation_permissions.get("can_validate_batch_disbursements", False)
            or invitation_permissions.get("can_approve_batch_disbursements", False)
        )
        can_view_reports = bool(
            invitation_permissions.get("can_view_transaction_details", False)
            or invitation_permissions.get("can_download_csv_report", False)
        )
        can_manage_wallet = bool(
            invitation_permissions.get("can_withdraw_funds", False)
            or invitation_permissions.get("can_create_transfers", False)
            or invitation_permissions.get("can_add_edit_delete_withdrawal_account", False)
        )
        can_manage_transactions = bool(
            invitation_permissions.get("can_generate_invoice", False)
            or invitation_permissions.get("can_add_edit_customers", False)
            or invitation_permissions.get("can_view_transaction_details", False)
        )
        can_manage_bot = bool(
            invitation_permissions.get("can_see_api_keys", False)
            or invitation_permissions.get("can_resend_callbacks", False)
            or invitation_permissions.get("can_change_callback_urls", False)
        )
        can_approve_topups = bool(invitation_permissions.get("can_approve_batch_disbursements", False))
    else:
        # Organization owner defaults for direct registrants.
        can_manage_team = True
        can_manage_payments = True
        can_manage_disbursements = True
        can_view_reports = True
        can_manage_wallet = True
        can_manage_transactions = True
        can_manage_bot = False
        can_approve_topups = False

    if admin_user:
        admin_user.telegram_username = kyb.telegram_username
        admin_user.name = kyb.full_name or kyb.telegram_username or kyb.chat_id
        admin_user.is_active = True
        admin_user.organization_id = org_id
        admin_user.organization_name = org_name
        admin_user.can_manage_team = can_manage_team
        admin_user.can_manage_payments = can_manage_payments
        admin_user.can_manage_disbursements = can_manage_disbursements
        admin_user.can_view_reports = can_view_reports
        admin_user.can_manage_wallet = can_manage_wallet
        admin_user.can_manage_transactions = can_manage_transactions
        admin_user.can_manage_bot = can_manage_bot
        admin_user.can_approve_topups = can_approve_topups
    else:
        admin_user = AdminUser(
            telegram_id=kyb.chat_id,
            telegram_username=kyb.telegram_username,
            name=kyb.full_name or kyb.telegram_username or kyb.chat_id,
            is_active=True,
            is_super_admin=False,
            can_manage_payments=can_manage_payments,
            can_manage_disbursements=can_manage_disbursements,
            can_view_reports=can_view_reports,
            can_manage_wallet=can_manage_wallet,
            can_manage_transactions=can_manage_transactions,
            can_manage_bot=can_manage_bot,
            can_approve_topups=can_approve_topups,
            can_manage_team=can_manage_team,
            organization_id=org_id,
            organization_name=org_name,
            added_by=current_user.id,
        )
        db.add(admin_user)

    if invitation and invitation.status == "pending":
        invitation.status = "accepted"
        invitation.accepted_at = datetime.utcnow()

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
