from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String


class CryptoTopupRequest(Base):
    __tablename__ = "crypto_topup_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    wallet_id = Column(Integer, nullable=True)
    amount_usdt = Column(Float, nullable=False)
    tx_hash = Column(String, nullable=False)
    network = Column(String, nullable=False)
    status = Column(String, nullable=False)  # pending / approved / rejected
    notes = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
