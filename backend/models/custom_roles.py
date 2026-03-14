from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func


class CustomRole(Base):
    """
    Persistent custom role templates that super admins can create, edit, and delete.
    Roles define a named set of permissions that can be applied to admin users.
    """
    __tablename__ = "custom_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), unique=True, nullable=False)
    description = Column(String(512), nullable=True)
    color = Column(String(32), default="blue", nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)  # built-in, cannot be deleted

    # Permission set
    is_super_admin = Column(Boolean, default=False, nullable=False)
    can_manage_payments = Column(Boolean, default=False, nullable=False)
    can_manage_disbursements = Column(Boolean, default=False, nullable=False)
    can_view_reports = Column(Boolean, default=False, nullable=False)
    can_manage_wallet = Column(Boolean, default=False, nullable=False)
    can_manage_transactions = Column(Boolean, default=False, nullable=False)
    can_manage_bot = Column(Boolean, default=False, nullable=False)
    can_approve_topups = Column(Boolean, default=False, nullable=False)

    created_by = Column(String(64), nullable=True)  # telegram_id of creator
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
