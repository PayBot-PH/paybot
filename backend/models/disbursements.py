from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Disbursements(Base):
    __tablename__ = "disbursements"
    __table_args__ = (
        # Index for per-user list queries
        Index("idx_disbursements_user_id", "user_id"),
        # Index for status filtering
        Index("idx_disbursements_status", "status"),
        # Index for settlement batch tracking
        Index("idx_disbursements_settlement_batch", "settlement_batch_id"),
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
    status = Column(String, nullable=True)  # pending, processing, completed, failed, reversed
    disbursement_type = Column(String, nullable=True)  # single, batch, scheduled
    
    # Settlement optimization
    settlement_batch_id = Column(String, nullable=True)  # Group disbursements for batch processing
    settlement_priority = Column(String, nullable=True, default="normal")  # normal, high, urgent
    processing_fee = Column(Float, nullable=False, default=0.0)  # Transaction fee charged
    net_amount = Column(Float, nullable=True)  # amount - processing_fee
    
    # Timing & tracking
    scheduled_at = Column(DateTime(timezone=True), nullable=True)  # For scheduled disbursements
    processed_at = Column(DateTime(timezone=True), nullable=True)  # When processing started
    completed_at = Column(DateTime(timezone=True), nullable=True)  # When actually settled
    failure_reason = Column(String, nullable=True)  # Why it failed
    retry_count = Column(Integer, nullable=False, default=0)  # Number of retry attempts
    
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)