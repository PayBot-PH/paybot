from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Wallet_transactions(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        # Composite index for balance queries (user_id + type + status)
        Index("idx_wtxn_user_type_status", "user_id", "transaction_type", "status"),
        # Index for wallet-level lookups
        Index("idx_wtxn_wallet_id", "wallet_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    wallet_id = Column(Integer, nullable=False)
    transaction_type = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    balance_before = Column(Float, nullable=True)
    balance_after = Column(Float, nullable=True)
    recipient = Column(String, nullable=True)
    note = Column(String, nullable=True)
    status = Column(String, nullable=True)
    reference_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)