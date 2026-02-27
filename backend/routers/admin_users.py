"""
Admin User Management Router
CRUD for managing Telegram-based admin users and their permissions.
Only super admins can add/remove/modify other admins.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.admin_users import AdminUser
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin-users", tags=["admin-users"])


# ---------- Schemas ----------

class AdminUserOut(BaseModel):
    id: int
    telegram_id: str
    telegram_username: Optional[str] = None
    name: Optional[str] = None
    is_active: bool
    is_super_admin: bool
    can_manage_payments: bool
    can_manage_disbursements: bool
    can_view_reports: bool
    can_manage_wallet: bool
    can_manage_transactions: bool
    can_manage_bot: bool
    can_approve_topups: bool
    added_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminUserCreate(BaseModel):
    telegram_id: str
    telegram_username: Optional[str] = None
    name: Optional[str] = None
    is_super_admin: bool = False
    can_manage_payments: bool = True
    can_manage_disbursements: bool = True
    can_view_reports: bool = True
    can_manage_wallet: bool = True
    can_manage_transactions: bool = True
    can_manage_bot: bool = False
    can_approve_topups: bool = False


class AdminUserUpdate(BaseModel):
    telegram_username: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    can_manage_payments: Optional[bool] = None
    can_manage_disbursements: Optional[bool] = None
    can_view_reports: Optional[bool] = None
    can_manage_wallet: Optional[bool] = None
    can_manage_transactions: Optional[bool] = None
    can_manage_bot: Optional[bool] = None
    can_approve_topups: Optional[bool] = None


def _require_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required to manage admin users.",
        )


# ---------- Endpoints ----------

@router.get("", response_model=List[AdminUserOut])
async def list_admin_users(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all admin users. Any admin can view."""
    res = await db.execute(select(AdminUser).order_by(AdminUser.id))
    return res.scalars().all()


@router.post("", response_model=AdminUserOut, status_code=201)
async def create_admin_user(
    data: AdminUserCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new admin user. Only super admins can do this."""
    _require_super_admin(current_user)

    existing = await db.execute(select(AdminUser).where(AdminUser.telegram_id == data.telegram_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Admin with this Telegram ID already exists.")

    admin = AdminUser(
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
        name=data.name,
        is_active=True,
        is_super_admin=data.is_super_admin,
        can_manage_payments=data.can_manage_payments,
        can_manage_disbursements=data.can_manage_disbursements,
        can_view_reports=data.can_view_reports,
        can_manage_wallet=data.can_manage_wallet,
        can_manage_transactions=data.can_manage_transactions,
        can_manage_bot=data.can_manage_bot,
        can_approve_topups=data.can_approve_topups,
        added_by=current_user.id,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    logger.info("Admin %s added user %s", current_user.id, data.telegram_id)
    return admin


@router.patch("/{admin_id}", response_model=AdminUserOut)
async def update_admin_user(
    admin_id: int,
    data: AdminUserUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update admin user permissions or status. Only super admins can do this."""
    _require_super_admin(current_user)

    res = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = res.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin user not found.")

    # Prevent removing super admin status from yourself
    if admin.telegram_id == current_user.id and data.is_super_admin is False:
        raise HTTPException(status_code=400, detail="Cannot remove your own super admin status.")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(admin, field, value)

    await db.commit()
    await db.refresh(admin)
    return admin


@router.delete("/{admin_id}", status_code=204)
async def delete_admin_user(
    admin_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an admin user. Only super admins can do this."""
    _require_super_admin(current_user)

    res = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = res.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin user not found.")

    if admin.telegram_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself.")

    await db.delete(admin)
    await db.commit()
