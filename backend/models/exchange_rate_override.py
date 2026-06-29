from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class ExchangeRateOverride(Base):
    """Track admin overrides of exchange rates for special situations."""
    __tablename__ = "exchange_rate_override"
    __table_args__ = (
        # Index for querying active overrides by currency pair
        Index("idx_xrate_override_pair", "currency_pair"),
        # Index for querying active overrides by admin
        Index("idx_xrate_override_admin", "created_by"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    currency_pair = Column(String, nullable=False)  # e.g., "USDT_PHP", "USD_EUR"
    override_rate = Column(Float, nullable=False)  # Manually set rate
    reason = Column(String, nullable=True)  # Why the override was applied
    
    # Audit trail
    created_by = Column(String, nullable=False)  # Admin user ID who created override
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Optional expiration time
    
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
