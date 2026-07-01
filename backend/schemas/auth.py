from datetime import datetime
from typing import Optional

from pydantic import ConfigDict, BaseModel


class UserPermissions(BaseModel):
    is_super_admin: bool = False
    # Least privilege by default. Explicit grants are set at login/token issuance.
    can_manage_payments: bool = False
    can_manage_disbursements: bool = False
    can_view_reports: bool = False
    can_manage_wallet: bool = False
    can_manage_transactions: bool = False
    can_manage_bot: bool = False
    can_approve_topups: bool = False
    can_manage_team: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: str  # Telegram user ID
    email: str
    name: Optional[str] = None
    role: str = "user"  # user/admin
    last_login: Optional[datetime] = None
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
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
    device_id: Optional[str] = None

    # Keep forward-compatible Telegram fields (e.g. allows_write_to_pm)
    # so backend signature verification can include every signed key.
    model_config = ConfigDict(extra="allow")


class TokenExchangeResponse(BaseModel):
    """Response body for issued application token."""

    token: str
    user: Optional[UserResponse] = None
    terminal_id: Optional[int] = None
    has_pin: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str
    device_id: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    terminal_id: Optional[int] = None
    has_pin: bool = False
