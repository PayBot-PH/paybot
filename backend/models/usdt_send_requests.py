from core.database import Base
from sqlalchemy import Column, DateTime, Float, Integer, String


class UsdtSendRequest(Base):
    __tablename__ = "usdt_send_requests"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    wallet_id = Column(Integer, nullable=False)
    to_address = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    status = Column(String, nullable=False)  # pending / approved / denied
    denial_reason = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
