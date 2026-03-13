from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Wallets(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        # Composite index for the frequent (user_id, currency) lookup in get_or_create_wallet
        Index("idx_wallets_user_currency", "user_id", "currency"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    balance = Column(Float, nullable=False)
    currency = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)