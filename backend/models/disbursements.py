from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Disbursements(Base):
    __tablename__ = "disbursements"
    __table_args__ = (
        # Index for per-user list queries
        Index("idx_disbursements_user_id", "user_id"),
        # Index for status filtering
        Index("idx_disbursements_status", "status"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    external_id = Column(String, nullable=True)
    xendit_id = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=True)
    bank_code = Column(String, nullable=True)
    account_number = Column(String, nullable=True)
    account_name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    status = Column(String, nullable=True)
    disbursement_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)