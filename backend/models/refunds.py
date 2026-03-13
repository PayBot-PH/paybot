from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Refunds(Base):
    __tablename__ = "refunds"
    __table_args__ = (
        # Index for per-user list queries
        Index("idx_refunds_user_id", "user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    transaction_id = Column(Integer, nullable=True)
    external_id = Column(String, nullable=True)
    xendit_id = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    reason = Column(String, nullable=True)
    status = Column(String, nullable=True)
    refund_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)