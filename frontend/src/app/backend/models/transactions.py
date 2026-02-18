from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String


class Transactions(Base):
    __tablename__ = "transactions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    transaction_type = Column(String, nullable=False)
    external_id = Column(String, nullable=True)
    xendit_id = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=True, default='PHP', server_default='PHP')
    status = Column(String, nullable=False)
    description = Column(String, nullable=True)
    customer_name = Column(String, nullable=True)
    customer_email = Column(String, nullable=True)
    payment_url = Column(String, nullable=True)
    qr_code_url = Column(String, nullable=True)
    telegram_chat_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)