from sqlalchemy import Column, DateTime, Float, Integer, String

from core.database import Base


class WalletTopup(Base):
    """Records a PayMongo-backed wallet top-up request.

    One row is created when the user initiates a top-up (status='pending').
    The webhook handler updates the row on payment success ('paid') or
    failure/cancellation ('failed'/'cancelled').
    """

    __tablename__ = "wallet_topups"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False, default="PHP", server_default="PHP")
    # PayMongo object IDs
    paymongo_source_id = Column(String, nullable=True, index=True)
    paymongo_payment_intent_id = Column(String, nullable=True, index=True)
    paymongo_checkout_session_id = Column(String, nullable=True, index=True)
    reference_number = Column(String, nullable=True, index=True)
    payment_method = Column(String, nullable=True)  # alipay, wechat, gcash, card, …
    status = Column(String, nullable=False, default="pending", server_default="pending")
    description = Column(String, nullable=True)
    checkout_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
