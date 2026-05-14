from core.database import Base
from sqlalchemy import Column, DateTime, Index, Integer, String


class Bot_logs(Base):
    __tablename__ = "bot_logs"
    __table_args__ = (
        # Index for per-user list queries
        Index("idx_bot_logs_user_id", "user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    log_type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    telegram_chat_id = Column(String, nullable=True)
    telegram_username = Column(String, nullable=True)
    command = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)