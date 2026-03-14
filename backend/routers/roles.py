"""
Roles Router
Provides role preset definitions for the admin management UI.
"""
import logging
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dependencies.auth import get_current_user
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


# ---------- Schemas ----------

class RolePermissions(BaseModel):
    is_super_admin: bool
    can_manage_payments: bool
    can_manage_disbursements: bool
    can_view_reports: bool
    can_manage_wallet: bool
    can_manage_transactions: bool
    can_manage_bot: bool
    can_approve_topups: bool


class RolePreset(BaseModel):
    id: str
    name: str
    description: str
    color: str
    permissions: RolePermissions


# ---------- Data ----------

_ROLE_PRESETS: List[RolePreset] = [
    RolePreset(
        id="super_admin",
        name="Super Admin",
        description="Full access to all features including admin management.",
        color="amber",
        permissions=RolePermissions(
            is_super_admin=True,
            can_manage_payments=True,
            can_manage_disbursements=True,
            can_view_reports=True,
            can_manage_wallet=True,
            can_manage_transactions=True,
            can_manage_bot=True,
            can_approve_topups=True,
        ),
    ),
    RolePreset(
        id="manager",
        name="Manager",
        description="Full operational access without bot settings or admin management.",
        color="blue",
        permissions=RolePermissions(
            is_super_admin=False,
            can_manage_payments=True,
            can_manage_disbursements=True,
            can_view_reports=True,
            can_manage_wallet=True,
            can_manage_transactions=True,
            can_manage_bot=False,
            can_approve_topups=True,
        ),
    ),
    RolePreset(
        id="cashier",
        name="Cashier",
        description="Can create payments and view transactions only.",
        color="emerald",
        permissions=RolePermissions(
            is_super_admin=False,
            can_manage_payments=True,
            can_manage_disbursements=False,
            can_view_reports=False,
            can_manage_wallet=False,
            can_manage_transactions=True,
            can_manage_bot=False,
            can_approve_topups=False,
        ),
    ),
    RolePreset(
        id="reporter",
        name="Reporter",
        description="Read-only access to reports and transactions.",
        color="yellow",
        permissions=RolePermissions(
            is_super_admin=False,
            can_manage_payments=False,
            can_manage_disbursements=False,
            can_view_reports=True,
            can_manage_wallet=False,
            can_manage_transactions=True,
            can_manage_bot=False,
            can_approve_topups=False,
        ),
    ),
]


# ---------- Endpoints ----------

@router.get("", response_model=List[RolePreset])
async def list_roles(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return all available role presets. Any admin can view."""
    return _ROLE_PRESETS
