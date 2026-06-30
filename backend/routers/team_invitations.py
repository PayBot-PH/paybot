"""
Team Invitations and Role Management API
"""
import secrets
from datetime import datetime, timezone, timedelta
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.database import get_db
from dependencies.auth import get_admin_user
from models.admin_users import AdminUser
from models.team_invitations import TeamInvitation, AdminRole
from pydantic import BaseModel, EmailStr
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/team", tags=["team-management"])

# ────────────────────────────────────────────────────────────────
# Pydantic Models
# ────────────────────────────────────────────────────────────────

class SendInvitationRequest(BaseModel):
    email: EmailStr
    role: str = "admin"  # admin, operator, viewer
    permissions: Optional[dict] = None
    notes: Optional[str] = None

class InvitationResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str
    invited_at: str
    expires_at: Optional[str]
    notes: Optional[str]

class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: dict
    is_builtin: bool

class TeamMemberResponse(BaseModel):
    id: int
    name: Optional[str]
    email: Optional[str]
    role: str
    status: str
    joined_at: Optional[str]
    permissions: dict


def _can_manage_team(admin: Optional[AdminUser]) -> bool:
    if not admin:
        return False
    return bool(admin.is_super_admin or admin.can_manage_team)


def _is_org_admin(admin: Optional[AdminUser]) -> bool:
    if not admin:
        return False
    return bool((not admin.is_super_admin) and admin.organization_id)

# ────────────────────────────────────────────────────────────────
# Predefined Roles
# ────────────────────────────────────────────────────────────────

PREDEFINED_ROLES = {
    "super_admin": {
        "description": "Full access to all features and administration",
        "permissions": {
            "can_add_delete_user": True,
            "can_edit_user_access": True,
            "can_edit_business_settings": True,
            "can_add_edit_delete_cards_promotion": True,
            "can_upload_delete_batch_disbursements": True,
            "can_validate_batch_disbursements": True,
            "can_generate_invoice": True,
            "can_add_edit_customers": True,
            "can_view_transaction_details": True,
            "can_download_csv_report": True,
            "can_withdraw_funds": True,
            "can_create_transfers": True,
            "can_add_edit_delete_withdrawal_account": True,
            "can_see_api_keys": True,
            "can_resend_callbacks": True,
            "can_change_callback_urls": True,
            "can_approve_batch_disbursements": True,
            "can_refund_cards_charges": True,
            "can_manage_team": True,
        }
    },
    "admin": {
        "description": "User and business management",
        "permissions": {
            "can_add_delete_user": True,
            "can_edit_user_access": True,
            "can_edit_business_settings": True,
            "can_add_edit_delete_cards_promotion": True,
            "can_upload_delete_batch_disbursements": False,
            "can_validate_batch_disbursements": False,
            "can_generate_invoice": False,
            "can_add_edit_customers": False,
            "can_view_transaction_details": False,
            "can_download_csv_report": False,
            "can_withdraw_funds": False,
            "can_create_transfers": False,
            "can_add_edit_delete_withdrawal_account": False,
            "can_see_api_keys": False,
            "can_resend_callbacks": False,
            "can_change_callback_urls": False,
            "can_approve_batch_disbursements": False,
            "can_refund_cards_charges": False,
            "can_manage_team": True,
        }
    },
    "editor": {
        "description": "Batch disbursement and customer management",
        "permissions": {
            "can_add_delete_user": False,
            "can_edit_user_access": False,
            "can_edit_business_settings": False,
            "can_add_edit_delete_cards_promotion": False,
            "can_upload_delete_batch_disbursements": True,
            "can_validate_batch_disbursements": True,
            "can_generate_invoice": True,
            "can_add_edit_customers": True,
            "can_view_transaction_details": False,
            "can_download_csv_report": False,
            "can_withdraw_funds": False,
            "can_create_transfers": False,
            "can_add_edit_delete_withdrawal_account": False,
            "can_see_api_keys": False,
            "can_resend_callbacks": False,
            "can_change_callback_urls": False,
            "can_approve_batch_disbursements": False,
            "can_refund_cards_charges": False,
            "can_manage_team": False,
        }
    },
    "viewer": {
        "description": "View-only access to reports and transactions",
        "permissions": {
            "can_add_delete_user": False,
            "can_edit_user_access": False,
            "can_edit_business_settings": False,
            "can_add_edit_delete_cards_promotion": False,
            "can_upload_delete_batch_disbursements": False,
            "can_validate_batch_disbursements": False,
            "can_generate_invoice": False,
            "can_add_edit_customers": False,
            "can_view_transaction_details": True,
            "can_download_csv_report": True,
            "can_withdraw_funds": False,
            "can_create_transfers": False,
            "can_add_edit_delete_withdrawal_account": False,
            "can_see_api_keys": False,
            "can_resend_callbacks": False,
            "can_change_callback_urls": False,
            "can_approve_batch_disbursements": False,
            "can_refund_cards_charges": False,
            "can_manage_team": False,
        }
    },
    "withdrawer": {
        "description": "Withdrawal and fund transfer management",
        "permissions": {
            "can_add_delete_user": False,
            "can_edit_user_access": False,
            "can_edit_business_settings": False,
            "can_add_edit_delete_cards_promotion": False,
            "can_upload_delete_batch_disbursements": False,
            "can_validate_batch_disbursements": False,
            "can_generate_invoice": False,
            "can_add_edit_customers": False,
            "can_view_transaction_details": False,
            "can_download_csv_report": False,
            "can_withdraw_funds": True,
            "can_create_transfers": True,
            "can_add_edit_delete_withdrawal_account": True,
            "can_see_api_keys": False,
            "can_resend_callbacks": False,
            "can_change_callback_urls": False,
            "can_approve_batch_disbursements": False,
            "can_refund_cards_charges": False,
            "can_manage_team": False,
        }
    },
    "developer": {
        "description": "API and webhook management",
        "permissions": {
            "can_add_delete_user": False,
            "can_edit_user_access": False,
            "can_edit_business_settings": False,
            "can_add_edit_delete_cards_promotion": False,
            "can_upload_delete_batch_disbursements": False,
            "can_validate_batch_disbursements": False,
            "can_generate_invoice": False,
            "can_add_edit_customers": False,
            "can_view_transaction_details": False,
            "can_download_csv_report": False,
            "can_withdraw_funds": False,
            "can_create_transfers": False,
            "can_add_edit_delete_withdrawal_account": False,
            "can_see_api_keys": True,
            "can_resend_callbacks": True,
            "can_change_callback_urls": True,
            "can_approve_batch_disbursements": False,
            "can_refund_cards_charges": False,
            "can_manage_team": False,
        }
    },
    "approver": {
        "description": "Approval and refund management",
        "permissions": {
            "can_add_delete_user": False,
            "can_edit_user_access": False,
            "can_edit_business_settings": False,
            "can_add_edit_delete_cards_promotion": False,
            "can_upload_delete_batch_disbursements": False,
            "can_validate_batch_disbursements": False,
            "can_generate_invoice": False,
            "can_add_edit_customers": False,
            "can_view_transaction_details": False,
            "can_download_csv_report": False,
            "can_withdraw_funds": False,
            "can_create_transfers": False,
            "can_add_edit_delete_withdrawal_account": False,
            "can_see_api_keys": False,
            "can_resend_callbacks": False,
            "can_change_callback_urls": False,
            "can_approve_batch_disbursements": True,
            "can_refund_cards_charges": True,
            "can_manage_team": False,
        }
    },
}

# ────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────

@router.post("/invite", response_model=InvitationResponse)
async def send_team_invitation(
    request: SendInvitationRequest,
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Send invitation to new team member"""
    # Super admins and organization admins with team permission can invite
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not _can_manage_team(admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to invite team members")

    # Organization admins cannot invite super admins
    if _is_org_admin(admin) and request.role == "super_admin":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign super_admin role")

    # Check if email already invited or registered
    existing_query = select(TeamInvitation).where(
        TeamInvitation.email == request.email,
        TeamInvitation.status.in_(["pending", "accepted"])
    )
    if _is_org_admin(admin):
        existing_query = existing_query.where(TeamInvitation.organization_id == admin.organization_id)
    existing = await db.execute(existing_query)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already invited or registered")

    # Generate invitation token
    token = secrets.token_urlsafe(32)

    # Get permissions from predefined role or use custom
    role_config = PREDEFINED_ROLES.get(request.role)
    permissions = request.permissions or (role_config["permissions"] if role_config else {})

    # Create invitation
    invitation = TeamInvitation(
        email=request.email,
        invitation_token=token,
        role=request.role,
        permissions=permissions,
        invited_by=str(current_user.id),
        organization_id=admin.organization_id if _is_org_admin(admin) else None,
        organization_name=admin.organization_name if _is_org_admin(admin) else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        notes=request.notes,
    )

    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    logger.info(f"Team invitation sent to {request.email} by {current_user.id}")

    return InvitationResponse(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        invited_at=invitation.invited_at.isoformat(),
        expires_at=invitation.expires_at.isoformat() if invitation.expires_at else None,
        notes=invitation.notes,
    )


@router.get("/invitations")
async def list_invitations(
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all pending invitations"""
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not _can_manage_team(admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = select(TeamInvitation)
    if _is_org_admin(admin):
        query = query.where(TeamInvitation.organization_id == admin.organization_id)
    result = await db.execute(query.order_by(TeamInvitation.created_at.desc()))
    invitations = result.scalars().all()

    return {
        "invitations": [
            {
                "id": inv.id,
                "email": inv.email,
                "role": inv.role,
                "status": inv.status,
                "invited_at": inv.invited_at.isoformat(),
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "invited_by": inv.invited_by,
                "permissions": inv.permissions,
                "notes": inv.notes,
            }
            for inv in invitations
        ]
    }


@router.put("/invitations/{invitation_id}")
async def update_invitation(
    invitation_id: int,
    request: SendInvitationRequest,
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update invitation role and permissions"""
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not _can_manage_team(admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    inv_res = await db.execute(
        select(TeamInvitation).where(TeamInvitation.id == invitation_id)
    )
    invitation = inv_res.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if _is_org_admin(admin) and invitation.organization_id != admin.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this invitation")

    if _is_org_admin(admin) and request.role == "super_admin":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign super_admin role")

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Can only update pending invitations")

    # Update permissions
    role_config = PREDEFINED_ROLES.get(request.role)
    permissions = request.permissions or (role_config["permissions"] if role_config else {})

    invitation.role = request.role
    invitation.permissions = permissions
    invitation.notes = request.notes

    await db.commit()
    await db.refresh(invitation)

    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "status": invitation.status,
        "permissions": invitation.permissions,
    }


@router.delete("/invitations/{invitation_id}")
async def revoke_invitation(
    invitation_id: int,
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invitation"""
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not _can_manage_team(admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    inv_res = await db.execute(
        select(TeamInvitation).where(TeamInvitation.id == invitation_id)
    )
    invitation = inv_res.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if _is_org_admin(admin) and invitation.organization_id != admin.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this invitation")

    invitation.status = "revoked"
    await db.commit()

    logger.info(f"Invitation {invitation_id} revoked by {current_user.id}")

    return {"status": "revoked"}


@router.get("/roles")
async def list_roles(
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all available roles"""
    # Get custom roles from database
    result = await db.execute(select(AdminRole))
    custom_roles = result.scalars().all()

    # Return predefined + custom roles
    return {
        "roles": [
            {
                "name": name,
                "description": config["description"],
                "permissions": config["permissions"],
                "is_builtin": True,
            }
            for name, config in PREDEFINED_ROLES.items()
        ] + [
            {
                "id": role.id,
                "name": role.name,
                "description": role.description,
                "permissions": role.permissions,
                "is_builtin": False,
            }
            for role in custom_roles
        ]
    }


@router.post("/roles")
async def create_custom_role(
    name: str,
    description: Optional[str],
    permissions: dict,
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom role"""
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not admin or not admin.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Check if role exists
    existing = await db.execute(
        select(AdminRole).where(AdminRole.name == name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role already exists")

    role = AdminRole(
        name=name,
        description=description,
        permissions=permissions,
        is_builtin=False,
    )

    db.add(role)
    await db.commit()
    await db.refresh(role)

    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
        "is_builtin": False,
    }


@router.get("/members")
async def list_team_members(
    current_user: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active team members"""
    admin_scope_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin_scope = admin_scope_res.scalar_one_or_none()

    if not _can_manage_team(admin_scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = select(AdminUser).where(AdminUser.is_active == True)
    if _is_org_admin(admin_scope):
        query = query.where(AdminUser.organization_id == admin_scope.organization_id)

    admin_res = await db.execute(query)
    admins = admin_res.scalars().all()

    return {
        "members": [
            {
                "id": admin.id,
                "name": admin.name or admin.telegram_username,
                "telegram_id": admin.telegram_id,
                "role": "super_admin" if admin.is_super_admin else "admin",
                "permissions": {
                    "can_manage_payments": admin.can_manage_payments,
                    "can_manage_disbursements": admin.can_manage_disbursements,
                    "can_view_reports": admin.can_view_reports,
                    "can_manage_wallet": admin.can_manage_wallet,
                    "can_manage_transactions": admin.can_manage_transactions,
                    "can_manage_bot": admin.can_manage_bot,
                    "can_approve_topups": admin.can_approve_topups,
                    "can_manage_team": admin.can_manage_team,
                },
                "organization_id": admin.organization_id,
                "organization_name": admin.organization_name,
                "joined_at": admin.created_at.isoformat() if admin.created_at else None,
                "is_active": admin.is_active,
            }
            for admin in admins
        ]
    }
