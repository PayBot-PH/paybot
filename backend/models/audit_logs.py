from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text, JSON
from sqlalchemy.sql import func


class AuditLog(Base):
    """
    Audit log to track sensitive administrative actions.
    Only viewable by super admins.
    """
    __tablename__ = "audit_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(String(64), index=True, nullable=False) # Telegram ID of the admin
    admin_name = Column(String(256), nullable=True)
    action = Column(String(128), index=True, nullable=False) # e.g., "delete_user", "change_permission", "update_settings"
    target_type = Column(String(64), nullable=True) # e.g., "admin_user", "bot_settings"
    target_id = Column(String(128), nullable=True) # ID of the affected entity
    details = Column(Text, nullable=True) # Human readable description
    payload = Column(JSON, nullable=True) # JSON representation of the change or action data
    ip_address = Column(String(45), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
