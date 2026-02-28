from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func


class AdminUser(Base):
    __tablename__ = "admin_users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(String(64), unique=True, index=True, nullable=False)
    telegram_username = Column(String(128), nullable=True)
    name = Column(String(256), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_super_admin = Column(Boolean, default=False, nullable=False)

    # Granular permissions
    can_manage_payments = Column(Boolean, default=True, nullable=False)
    can_manage_disbursements = Column(Boolean, default=True, nullable=False)
    can_view_reports = Column(Boolean, default=True, nullable=False)
    can_manage_wallet = Column(Boolean, default=True, nullable=False)
    can_manage_transactions = Column(Boolean, default=True, nullable=False)
    can_manage_bot = Column(Boolean, default=False, nullable=False)
    can_approve_topups = Column(Boolean, default=False, nullable=False)

    # PIN authentication (sha256 hex digest of salt:pin)
    pin_hash = Column(String(128), nullable=True)
    pin_salt = Column(String(64), nullable=True)
    pin_failed_attempts = Column(Integer, default=0, nullable=False)
    pin_locked_until = Column(DateTime(timezone=True), nullable=True)

    added_by = Column(String(64), nullable=True)   # telegram_id of who added
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
