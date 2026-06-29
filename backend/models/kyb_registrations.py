from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func


class KybRegistration(Base):
    __tablename__ = "kyb_registrations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String, nullable=False, index=True)
    telegram_username = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    id_photo_file_id = Column(String, nullable=True)
    status = Column(String, default="pending_review", server_default="pending_review", nullable=False)
    rejection_reason = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func


class KybRegistration(Base):
    """Tracks KYB (Know Your Business) registration state for Telegram bot users.

    A user must complete KYB before they can use any bot commands.  The ``step``
    column records which question the user is currently answering.  Once all
    information is collected the record moves to ``status='pending_review'`` and
    the bot owner is notified.  Approving a KYB record automatically creates an
    ``AdminUser`` row for the applicant.
    """

    __tablename__ = "kyb_registrations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String(64), unique=True, index=True, nullable=False)
    telegram_username = Column(String(128), nullable=True)

    # KYB step tracking — values: "full_name" | "phone" | "address" | "bank" | "id_photo" | "done"
    step = Column(String(32), nullable=False, default="full_name", server_default="full_name")

    # Collected KYB answers
    full_name = Column(String(256), nullable=True)
    email = Column(String(256), nullable=True)
    phone = Column(String(64), nullable=True)
    address = Column(String(512), nullable=True)
    bank_name = Column(String(128), nullable=True)
    id_photo_file_id = Column(String(256), nullable=True)

    # Overall status — values: "in_progress" | "pending_review" | "approved" | "rejected"
    status = Column(String(32), nullable=False, default="in_progress", server_default="in_progress", index=True)
    rejection_reason = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
