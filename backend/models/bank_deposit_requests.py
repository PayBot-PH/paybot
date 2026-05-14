from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func


class BankDepositRequest(Base):
    __tablename__ = "bank_deposit_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String, nullable=False, index=True)
    telegram_username = Column(String, nullable=True)
    channel = Column(String, nullable=False)          # GCASH, MAYA, BDO, BPI, etc.
    account_number = Column(String, nullable=False)   # mobile/bank account used to send
    amount_php = Column(Float, nullable=False)        # PHP amount deposited
    receipt_file_id = Column(String, nullable=True)   # Telegram file_id of uploaded receipt
    status = Column(String, default="pending", server_default="pending", nullable=False)  # pending | approved | rejected
    note = Column(String, nullable=True)              # admin note
    approved_by = Column(String, nullable=True)       # admin telegram_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
