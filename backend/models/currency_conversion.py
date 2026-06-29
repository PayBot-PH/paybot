from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class CurrencyConversion(Base):
    """Track currency conversion transactions."""
    __tablename__ = "currency_conversion"
    __table_args__ = (
        # Index for querying conversions by user/wallet
        Index("idx_conversion_wallet", "wallet_id"),
        # Index for querying conversions by status
        Index("idx_conversion_status", "status"),
        # Index for querying conversions by date
        Index("idx_conversion_created", "created_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    wallet_id = Column(Integer, nullable=False)  # Source wallet ID
    from_currency = Column(String, nullable=False)  # Source currency (e.g., "USD")
    to_currency = Column(String, nullable=False)  # Target currency (e.g., "PHP")
    from_amount = Column(Float, nullable=False)  # Amount in source currency
    to_amount = Column(Float, nullable=False)  # Amount in target currency (after conversion)
    
    # Rate & fees
    rate_applied = Column(Float, nullable=False)  # Conversion rate used
    conversion_fee_rate = Column(Float, nullable=False, default=0.01)  # % fee (e.g., 0.01 = 1%)
    conversion_fee_amount = Column(Float, nullable=False, default=0.0)  # Fee deducted from to_amount
    
    # Status tracking
    status = Column(String, nullable=False, default="completed")  # pending, completed, failed, reversed
    failure_reason = Column(String, nullable=True)  # Why conversion failed
    
    # Metadata
    user_id = Column(String, nullable=False)  # For audit/tracking
    reference_id = Column(String, nullable=True)  # External reference ID if needed
    
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
