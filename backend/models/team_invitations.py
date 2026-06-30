from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String, JSON
from sqlalchemy.sql import func

class TeamInvitation(Base):
    __tablename__ = "team_invitations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(256), nullable=False, index=True)
    invitation_token = Column(String(256), unique=True, nullable=False, index=True)
    role = Column(String(50), default="admin", nullable=False)  # admin, operator, viewer

    # Permissions as JSON for flexibility
    permissions = Column(JSON, nullable=False, default={
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
        "can_approve_batch_disbursements": False,
        "can_refund_cards_charges": False,
    })

    status = Column(String(20), default="pending", nullable=False)  # pending, accepted, expired, revoked

    invited_by = Column(String(64), nullable=False)  # telegram_id of inviter
    organization_id = Column(String(64), nullable=True, index=True)
    organization_name = Column(String(256), nullable=True)
    invited_at = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Notes for invitation
    notes = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AdminRole(Base):
    __tablename__ = "admin_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), unique=True, nullable=False)  # admin, operator, viewer, custom_role
    description = Column(String(512), nullable=True)

    # Permissions stored as JSON for flexibility
    permissions = Column(JSON, nullable=False, default={})

    # Is this a built-in role or custom?
    is_builtin = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
