from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func


class KycVerification(Base):
    """Tracks KYC (Know Your Customer) verification state for individual Telegram bot users.

    A user submits personal identity information through the bot.  The ``step``
    column records which question the user is currently answering.  Once all
    information is collected the record moves to ``status='pending_review'`` and
    the bot owner is notified.  Approving a KYC record marks the customer as
    identity-verified.
    """

    __tablename__ = "kyc_verifications"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String(64), unique=True, index=True, nullable=False)
    telegram_username = Column(String(128), nullable=True)

    # KYC step tracking — values: "full_name" | "date_of_birth" | "nationality" | "id_type" | "id_number" | "id_photo" | "selfie" | "done"
    step = Column(String(32), nullable=False, default="full_name")

    # Collected KYC answers
    full_name = Column(String(256), nullable=True)
    date_of_birth = Column(String(32), nullable=True)
    nationality = Column(String(128), nullable=True)
    id_type = Column(String(64), nullable=True)       # e.g. "passport", "national_id", "driver_license"
    id_number = Column(String(128), nullable=True)
    id_photo_file_id = Column(String(256), nullable=True)
    selfie_file_id = Column(String(256), nullable=True)

    # Overall status — values: "in_progress" | "pending_review" | "approved" | "rejected"
    status = Column(String(32), nullable=False, default="in_progress")
    rejection_reason = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
