from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String, Text


class Bot_settings(Base):
    __tablename__ = "bot_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    welcome_message = Column(String, nullable=True)
    bot_status = Column(String, nullable=True, default='inactive', server_default='inactive')
    webhook_url = Column(String, nullable=True)
    # Clone-bot fields: per-user custom Telegram bot
    custom_bot_token    = Column(String, nullable=True)
    custom_bot_name     = Column(String, nullable=True)
    custom_bot_username = Column(String, nullable=True)
    custom_bot_id       = Column(String, nullable=True)
    custom_webhook_url  = Column(String, nullable=True)
    webhook_secret      = Column(String, nullable=True)
    # Message templates
    welcome_message_en          = Column(Text, nullable=True)
    welcome_message_zh          = Column(Text, nullable=True)
    payment_success_message     = Column(Text, nullable=True)
    payment_failed_message      = Column(Text, nullable=True)
    payment_pending_message     = Column(Text, nullable=True)
    maintenance_message         = Column(Text, nullable=True)
    # Bot behaviour
    maintenance_mode            = Column(String, nullable=True, default='off')
    commands_enabled            = Column(Text, nullable=True)   # JSON array of command names
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
