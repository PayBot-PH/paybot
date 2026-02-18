from core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Api_configs(Base):
    __tablename__ = "api_configs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    config_key = Column(String, nullable=False)
    config_value = Column(String, nullable=False)
    service_name = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)