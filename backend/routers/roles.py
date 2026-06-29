"""
Custom Roles Router
CRUD endpoints for managing persistent custom role templates.
Only super admins can create / update / delete roles.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.custom_roles import CustomRole
from models.admin_users import AdminUser
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


# ---------- Schemas ----------


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: str
    is_system: bool
    is_super_admin: bool
    can_manage_payments: bool
    can_manage_disbursements: bool
    can_view_reports: bool
    can_manage_wallet: bool
    can_manage_transactions: bool
    can_manage_bot: bool
    can_approve_topups: bool
    created_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "blue"
    is_super_admin: bool = False
    can_manage_payments: bool = False
    can_manage_disbursements: bool = False
    can_view_reports: bool = False
    can_manage_wallet: bool = False
    can_manage_transactions: bool = False
    can_manage_bot: bool = False
    can_approve_topups: bool = False


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_super_admin: Optional[bool] = None
    can_manage_payments: Optional[bool] = None
    can_manage_disbursements: Optional[bool] = None
    can_view_reports: Optional[bool] = None
    can_manage_wallet: Optional[bool] = None
    can_manage_transactions: Optional[bool] = None
    can_manage_bot: Optional[bool] = None
    can_approve_topups: Optional[bool] = None


class RoleApplyRequest(BaseModel):
    admin_id: int


def _require_super_admin(current_user: UserResponse) -> None:
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required.",
        )


# ---------- Endpoints ----------


@router.get("", response_model=List[RoleOut])
async def list_roles(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all custom roles. Any admin can view."""
    res = await db.execute(select(CustomRole).order_by(CustomRole.is_system.desc(), CustomRole.id))
    return res.scalars().all()


@router.post("", response_model=RoleOut, status_code=201)
async def create_role(
    data: RoleCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom role. Super admin only."""
    _require_super_admin(current_user)

    existing = await db.execute(select(CustomRole).where(CustomRole.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A role with this name already exists.")

    role = CustomRole(
        name=data.name,
        description=data.description,
        color=data.color,
        is_system=False,
        is_super_admin=data.is_super_admin,
        can_manage_payments=data.can_manage_payments,
        can_manage_disbursements=data.can_manage_disbursements,
        can_view_reports=data.can_view_reports,
        can_manage_wallet=data.can_manage_wallet,
        can_manage_transactions=data.can_manage_transactions,
        can_manage_bot=data.can_manage_bot,
        can_approve_topups=data.can_approve_topups,
        created_by=current_user.id,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    logger.info("Super admin %s created role '%s'", current_user.id, data.name)
    return role


@router.patch("/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom role. Super admin only."""
    _require_super_admin(current_user)

    res = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")

    update_data = data.model_dump(exclude_none=True)

    # If renaming, check uniqueness
    if "name" in update_data and update_data["name"] != role.name:
        dup = await db.execute(select(CustomRole).where(CustomRole.name == update_data["name"]))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="A role with this name already exists.")

    for field, value in update_data.items():
        setattr(role, field, value)

    await db.commit()
    await db.refresh(role)
    logger.info("Super admin %s updated role %s", current_user.id, role_id)
    return role


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom role. Super admin only. System roles cannot be deleted."""
    _require_super_admin(current_user)

    res = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")

    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted.")

    await db.delete(role)
    await db.commit()
    logger.info("Super admin %s deleted role %s ('%s')", current_user.id, role_id, role.name)


@router.post("/{role_id}/apply/{admin_id}", response_model=dict)
async def apply_role_to_admin(
    role_id: int,
    admin_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply a role's permissions to an admin user. Super admin only."""
    _require_super_admin(current_user)

    role_res = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = role_res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")

    admin_res = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = admin_res.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin user not found.")

    # Protect current super admin from downgrading themselves
    if admin.telegram_id == current_user.id and not role.is_super_admin:
        raise HTTPException(status_code=400, detail="Cannot remove your own super admin status.")

    admin.is_super_admin = role.is_super_admin
    admin.can_manage_payments = role.can_manage_payments
    admin.can_manage_disbursements = role.can_manage_disbursements
    admin.can_view_reports = role.can_view_reports
    admin.can_manage_wallet = role.can_manage_wallet
    admin.can_manage_transactions = role.can_manage_transactions
    admin.can_manage_bot = role.can_manage_bot
    admin.can_approve_topups = role.can_approve_topups

    await db.commit()
    logger.info(
        "Super admin %s applied role '%s' to admin %s",
        current_user.id, role.name, admin_id,
    )
    return {"success": True, "message": f"Role '{role.name}' applied to {admin.name or admin.telegram_id}"}
