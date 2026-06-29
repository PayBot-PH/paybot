from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Boolean


class Wallets(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        # Composite index for the frequent (user_id, currency) lookup in get_or_create_wallet
        Index("idx_wallets_user_currency", "user_id", "currency"),
        # Index for admin operations
        Index("idx_wallets_status", "is_frozen"),
        # extend_existing allows the table definition to be updated if it already exists
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    balance = Column(Float, nullable=False, default=0.0)
    available_balance = Column(Float, nullable=False, default=0.0, server_default='0.0') # Funds ready to withdraw
    pending_balance = Column(Float, nullable=False, default=0.0, server_default='0.0')   # Funds in clearing period
    currency = Column(String, nullable=True)
    
    # Admin operations
    is_frozen = Column(Boolean, nullable=False, default=False)  # Wallet frozen by super admin
    freeze_reason = Column(String, nullable=True)  # Reason for freeze
    total_credits = Column(Float, nullable=False, default=0.0)  # Cumulative credits for analytics
    total_debits = Column(Float, nullable=False, default=0.0)   # Cumulative debits for analytics
    transaction_count = Column(Integer, nullable=False, default=0)  # Total transactions
    last_activity = Column(DateTime(timezone=True), nullable=True)  # Last transaction time
    conversion_count = Column(Integer, nullable=False, default=0)  # Currency conversions performed
    
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
