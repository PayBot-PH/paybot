from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class PaymongoWebhookEvent(Base):
    """Stores processed PayMongo webhook event IDs to guarantee idempotency.

    Before processing any webhook event the handler inserts a row keyed on the
    PayMongo event ID.  If the row already exists the event is a duplicate and
    is skipped without re-crediting the wallet.
    """

    __tablename__ = "paymongo_webhook_events"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    event_id = Column(String, nullable=False, unique=True, index=True)
    event_type = Column(String, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=False)
