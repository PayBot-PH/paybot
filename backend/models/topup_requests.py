from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func


class TopupRequest(Base):
    __tablename__ = "topup_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String, nullable=False, index=True)
    telegram_username = Column(String, nullable=True)
    amount_usdt = Column(Float, nullable=False)
    currency = Column(String, default="USD", nullable=False, server_default="USD")
    reference_code = Column(String, nullable=True, index=True)
    receipt_file_id = Column(String, nullable=True)   # Telegram file_id of uploaded receipt
    status = Column(String, default="pending", server_default="pending", nullable=False)  # pending | approved | rejected
    note = Column(String, nullable=True)              # admin rejection note
    approved_by = Column(String, nullable=True)       # admin telegram_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
