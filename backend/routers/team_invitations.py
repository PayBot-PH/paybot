"""
Team Invitations and Role Management API
"""
import secrets
import re
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.database import get_db
from core.config import settings
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
    organization_name: Optional[str] = None
    organization_id: Optional[str] = None
    permissions: Optional[dict] = None
    notes: Optional[str] = None

class InvitationResponse(BaseModel):
    id: int
    email: str
    role: str
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
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


class CreateRoleRequest(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: dict


def _send_invitation_email(to_email: str, token: str, role: str, inviter_name: str = "") -> None:
    """Send invitation email. Logs the link if SMTP is not configured."""
    frontend_url = (getattr(settings, "frontend_url", "") or "").rstrip("/")
    accept_url = f"{frontend_url}/accept-invitation?token={token}" if frontend_url else f"/accept-invitation?token={token}"

    smtp_host = getattr(settings, "smtp_host", "")
    smtp_from = getattr(settings, "smtp_from_email", "")

    if not smtp_host or not smtp_from:
        logger.warning(
            "SMTP not configured — invitation link for %s (role: %s): %s",
            to_email, role, accept_url,
        )
        return

    try:
        smtp_port = int(getattr(settings, "smtp_port", 587))
        smtp_user = getattr(settings, "smtp_username", "")
        smtp_pass = getattr(settings, "smtp_password", "")
        from_name = getattr(settings, "smtp_from_name", "PayBot")

        body_html = f"""
        <p>You have been invited to join as <strong>{role}</strong>.</p>
        <p>Click the link below to accept your invitation (expires in 7 days):</p>
        <p><a href="{accept_url}">{accept_url}</a></p>
        <p>If you did not expect this invitation, you can ignore this email.</p>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "You've been invited to PayBot"
        msg["From"] = f"{from_name} <{smtp_from}>"
        msg["To"] = to_email
        msg.attach(MIMEText(body_html, "html"))

        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls(context=context)
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, to_email, msg.as_string())

        logger.info("Invitation email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send invitation email to %s: %s", to_email, exc)
    if not admin:
        return False
    return bool(admin.is_super_admin or admin.can_manage_team)


def _is_org_admin(admin: Optional[AdminUser]) -> bool:
    if not admin:
        return False
    return bool((not admin.is_super_admin) and admin.organization_id)


def _validate_role_name(role: str) -> str:
    normalized = (role or "").strip()
    if normalized not in PREDEFINED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    return normalized


def _to_org_slug(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    if not base:
        raise HTTPException(status_code=400, detail="Organization name or ID is required")
    return base[:48]


async def _resolve_super_admin_org_scope(
    db: AsyncSession,
    request: SendInvitationRequest,
    role_name: str,
) -> tuple[Optional[str], Optional[str]]:
    raw_org_name = (request.organization_name or "").strip()
    raw_org_id = (request.organization_id or "").strip()

    if role_name == "owner" and not (raw_org_name or raw_org_id):
        raise HTTPException(status_code=400, detail="organization_name or organization_id is required when inviting owner")

    if not (raw_org_name or raw_org_id):
        return None, None

    org_name = raw_org_name or raw_org_id
    org_id_base = _to_org_slug(raw_org_id or raw_org_name)

    # Keep org_id unique across pending invitations and existing admin users.
    org_id = org_id_base
    suffix = 1
    while True:
        inv_exists = await db.execute(
            select(TeamInvitation.id).where(TeamInvitation.organization_id == org_id).limit(1)
        )
        admin_exists = await db.execute(
            select(AdminUser.id).where(AdminUser.organization_id == org_id).limit(1)
        )
        if not inv_exists.scalar_one_or_none() and not admin_exists.scalar_one_or_none():
            break
        suffix += 1
        org_id = f"{org_id_base}-{suffix}"

    return org_id, org_name

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
    "owner": {
        "description": "Organization owner with full org-level access",
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
        "description": "View reports/transactions and manage withdrawals",
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

    role_name = _validate_role_name(request.role)

    # Organization admins cannot invite super admins
    if _is_org_admin(admin) and role_name == "super_admin":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign super_admin role")
    if _is_org_admin(admin) and role_name == "owner":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign owner role")

    # Organization admins must use predefined role templates only (no custom permissions overrides).
    if _is_org_admin(admin) and request.permissions:
        raise HTTPException(status_code=400, detail="Organization admin cannot set custom permissions")

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
    role_config = PREDEFINED_ROLES.get(role_name)
    permissions = request.permissions or (role_config["permissions"] if role_config else {})

    org_id = admin.organization_id if _is_org_admin(admin) else None
    org_name = admin.organization_name if _is_org_admin(admin) else None
    if admin and admin.is_super_admin:
        org_id, org_name = await _resolve_super_admin_org_scope(db, request, role_name)

    # Create invitation
    invitation = TeamInvitation(
        email=request.email,
        invitation_token=token,
        role=role_name,
        permissions=permissions,
        invited_by=str(current_user.id),
        organization_id=org_id,
        organization_name=org_name,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        notes=request.notes,
    )

    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    logger.info(f"Team invitation sent to {request.email} by {current_user.id}")

    # Send email notification (logs link if SMTP not configured)
    _send_invitation_email(
        to_email=request.email,
        token=token,
        role=role_name,
    )

    return InvitationResponse(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        organization_id=invitation.organization_id,
        organization_name=invitation.organization_name,
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
    result = await db.execute(query.order_by(TeamInvitation.invited_at.desc()))
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
                "organization_id": inv.organization_id,
                "organization_name": inv.organization_name,
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

    role_name = _validate_role_name(request.role)

    inv_res = await db.execute(
        select(TeamInvitation).where(TeamInvitation.id == invitation_id)
    )
    invitation = inv_res.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if _is_org_admin(admin) and invitation.organization_id != admin.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this invitation")

    if _is_org_admin(admin) and role_name == "super_admin":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign super_admin role")
    if _is_org_admin(admin) and role_name == "owner":
        raise HTTPException(status_code=400, detail="Organization admin cannot assign owner role")

    if _is_org_admin(admin) and request.permissions:
        raise HTTPException(status_code=400, detail="Organization admin cannot set custom permissions")

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Can only update pending invitations")

    # Update permissions
    role_config = PREDEFINED_ROLES.get(role_name)
    permissions = request.permissions or (role_config["permissions"] if role_config else {})

    invitation.role = role_name
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
    admin_res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_id == str(current_user.id))
    )
    admin = admin_res.scalar_one_or_none()

    if not _can_manage_team(admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Get custom roles from database
    result = await db.execute(select(AdminRole))
    custom_roles = result.scalars().all()

    builtin_roles = PREDEFINED_ROLES.items()
    if _is_org_admin(admin):
        builtin_roles = ((name, cfg) for name, cfg in builtin_roles if name not in {"super_admin", "owner"})

    # Return predefined + custom roles
    return {
        "roles": [
            {
                "name": name,
                "description": config["description"],
                "permissions": config["permissions"],
                "is_builtin": True,
            }
            for name, config in builtin_roles
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
    request: CreateRoleRequest,
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
        select(AdminRole).where(AdminRole.name == request.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role already exists")

    role = AdminRole(
        name=request.name,
        description=request.description,
        permissions=request.permissions,
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
                "role": admin.role or ("super_admin" if admin.is_super_admin else "admin"),
                "permissions": admin.team_permissions or {},
                "organization_id": admin.organization_id,
                "organization_name": admin.organization_name,
                "joined_at": admin.created_at.isoformat() if admin.created_at else None,
                "is_active": admin.is_active,
            }
            for admin in admins
        ]
    }


@router.post("/invitations/accept/{token}")
async def accept_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Accept a team invitation by token. Returns invitation details on success."""
    inv_res = await db.execute(
        select(TeamInvitation).where(TeamInvitation.invitation_token == token)
    )
    invitation = inv_res.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found or already used")

    if invitation.status == "revoked":
        raise HTTPException(status_code=410, detail="This invitation has been revoked")

    if invitation.status == "accepted":
        raise HTTPException(status_code=409, detail="Invitation already accepted")

    now = datetime.now(timezone.utc)
    if invitation.expires_at and invitation.expires_at.replace(tzinfo=timezone.utc) < now:
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(status_code=410, detail="Invitation has expired")

    invitation.status = "accepted"
    invitation.accepted_at = now
    await db.commit()
    await db.refresh(invitation)

    logger.info("Invitation %s accepted by %s", invitation.id, invitation.email)

    return {
        "success": True,
        "message": "Invitation accepted successfully",
        "invitation": {
            "id": invitation.id,
            "email": invitation.email,
            "role": invitation.role,
            "permissions": invitation.permissions,
            "organization_id": invitation.organization_id,
            "organization_name": invitation.organization_name,
            "accepted_at": invitation.accepted_at.isoformat(),
        },
    }
