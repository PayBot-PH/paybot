from datetime import datetime
from typing import Optional

from pydantic import ConfigDict, BaseModel


class UserResponse(BaseModel):
    id: str  # Now a string UUID (platform sub)
    email: str
    name: Optional[str] = None
    role: str = "user"  # user/admin
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PlatformTokenExchangeRequest(BaseModel):
    """Request body for exchanging Platform token for app token."""

    platform_token: str


class TelegramWidgetLoginRequest(BaseModel):
    id: int
    auth_date: int
    hash: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None


class TokenExchangeResponse(BaseModel):
    """Response body for issued application token."""

    token: str
