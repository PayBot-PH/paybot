from core.database import Base
from sqlalchemy import Column, DateTime, Float, Index, Integer, String


class Customers(Base):
    __tablename__ = "customers"
    __table_args__ = (
        # Index for per-user list queries
        Index("idx_customers_user_id", "user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    total_payments = Column(Integer, nullable=True)
    total_amount = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)