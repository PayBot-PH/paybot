from datetime import datetime
from typing import Optional

from pydantic import ConfigDict, BaseModel


class UserPermissions(BaseModel):
    is_super_admin: bool = False
    can_manage_payments: bool = True
    can_manage_disbursements: bool = True
    can_view_reports: bool = True
    can_manage_wallet: bool = True
    can_manage_transactions: bool = True
    can_manage_bot: bool = False
    can_approve_topups: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: str  # Telegram user ID
    email: str
    name: Optional[str] = None
    role: str = "user"  # user/admin
    last_login: Optional[datetime] = None
    permissions: Optional[UserPermissions] = None

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
    # Cloudflare Turnstile token produced by the frontend widget.
    # Verified server-side when CLOUDFLARE_TURNSTILE_SECRET_KEY is configured.
    cf_turnstile_token: Optional[str] = None

    # Keep forward-compatible Telegram fields (e.g. allows_write_to_pm)
    # so backend signature verification can include every signed key.
    model_config = ConfigDict(extra="allow")


class TokenExchangeResponse(BaseModel):
    """Response body for issued application token."""

    token: str
