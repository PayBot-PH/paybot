from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


class AppSettings(Base):
    __tablename__ = "app_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    key = Column(String, nullable=False, unique=True, index=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)
