import hashlib
import logging
from datetime import datetime
from typing import Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.mask_crypto import decrypt_text, key_prefix
from models.api_configs import Api_configs
from schemas.auth import UserResponse, UserPermissions

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_bearer_token(
    request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    """Extract bearer token from Authorization header."""
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    logger.debug("Authentication required for request %s %s", request.method, request.url.path)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication credentials were not provided")


async def get_current_user(request: Request, token: str = Depends(get_bearer_token)) -> UserResponse:
    """Dependency to get current authenticated user via JWT token."""
    try:
        payload = decode_access_token(token)
    except AccessTokenError as exc:
        # Log error type and message for easier debugging without leaking token content
        logger.warning("Token validation failed: %s (%s)", type(exc).__name__, exc.message)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    # Secure Device Binding Verification
    claimed_device_id = payload.get("device_id")
    if claimed_device_id:
        header_device_id = request.headers.get("X-Device-ID")
        if header_device_id != claimed_device_id:
             logger.warning(
                 "Device binding mismatch for user hash: %s. Claimed: %s, Header: %s",
                 hashlib.sha256(str(user_id).encode()).hexdigest()[:8],
                 claimed_device_id,
                 header_device_id
             )
             raise HTTPException(
                 status_code=status.HTTP_403_FORBIDDEN, 
                 detail="This session is bound to another device."
             )

    last_login_raw = payload.get("last_login")
    last_login = None
    if isinstance(last_login_raw, str):
        try:
            last_login = datetime.fromisoformat(last_login_raw)
        except ValueError:
            # Log user hash instead of actual user ID to avoid exposing sensitive information
            user_hash = hashlib.sha256(str(user_id).encode()).hexdigest()[:8] if user_id else "unknown"
            logger.debug("Failed to parse last_login for user hash: %s", user_hash)

    return UserResponse(
        id=user_id,
        email=payload.get("email", ""),
        name=payload.get("name"),
        role=payload.get("role", "user"),
        last_login=last_login,
        organization_id=payload.get("organization_id"),
        organization_name=payload.get("organization_name"),
        permissions=UserPermissions(**payload["permissions"]) if payload.get("permissions") else None,
    )


async def get_admin_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Dependency to ensure current user has admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def get_current_user_id(current_user: UserResponse = Depends(get_current_user)) -> str:
    """Dependency to get the current user's ID string."""
    return str(current_user.id)


async def get_current_admin(current_user: UserResponse = Depends(get_admin_user)) -> str:
    """Dependency to ensure current user is admin and return their ID string."""
    return str(current_user.id)


def _scope_satisfies(required_scope: str, granted_scopes: set[str]) -> bool:
    if required_scope in granted_scopes:
        return True
    # write implies read for the same resource family
    if required_scope.endswith(":read"):
        write_scope = required_scope.replace(":read", ":write")
        return write_scope in granted_scopes
    return False


async def _resolve_user_by_api_key(
    api_key: str,
    db: AsyncSession,
    required_scope: Optional[str] = None,
) -> Optional[UserResponse]:
    key_value = (api_key or "").strip()
    if not key_value:
        return None

    query = select(Api_configs).where(
        Api_configs.is_active.is_(True),
        Api_configs.config_key.like("payment_api_key%"),
    )
    result = await db.execute(query)
    candidates = result.scalars().all()

    matched_key: Optional[Api_configs] = None
    for item in candidates:
        encrypted_value = item.config_value
        if not isinstance(encrypted_value, str) or not encrypted_value.startswith(key_prefix):
            continue
        try:
            decrypted = decrypt_text(encrypted_value)
        except Exception:
            continue
        if decrypted == key_value:
            matched_key = item
            break

    if not matched_key:
        return None

    scopes_query = select(Api_configs).where(
        Api_configs.user_id == matched_key.user_id,
        Api_configs.service_name == matched_key.service_name,
        Api_configs.config_key == f"{matched_key.config_key}_scopes",
        Api_configs.is_active.is_(True),
    )
    scope_row = (await db.execute(scopes_query)).scalar_one_or_none()
    if not scope_row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API key scopes not configured")

    scope_value = scope_row.config_value
    scopes_raw = ""
    if isinstance(scope_value, str) and scope_value.startswith(key_prefix):
        try:
            scopes_raw = decrypt_text(scope_value)
        except Exception:
            scopes_raw = ""
    elif isinstance(scope_value, str):
        scopes_raw = scope_value

    granted_scopes = {scope.strip() for scope in scopes_raw.split(",") if scope.strip()}
    if required_scope and not _scope_satisfies(required_scope, granted_scopes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key missing required scope: {required_scope}",
        )

    return UserResponse(
        id=str(matched_key.user_id),
        email=f"apikey+{matched_key.user_id}@xend.local",
        name="API Key Integration",
        role="admin",
        permissions=UserPermissions(
            can_manage_payments=True,
            can_manage_bot=True,
        ),
    )


def get_payment_user(required_scope: str):
    async def _dependency(
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
        db: AsyncSession = Depends(get_db),
    ) -> UserResponse:
        # Primary path: bearer token (backward-compatible)
        if credentials and credentials.scheme.lower() == "bearer":
            try:
                return await get_current_user(request=request, token=credentials.credentials)
            except HTTPException:
                # If bearer auth is invalid but API key is provided, allow key fallback.
                pass

        api_key = request.headers.get("X-API-Key", "")
        api_user = await _resolve_user_by_api_key(api_key=api_key, db=db, required_scope=required_scope)
        if api_user:
            return api_user

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provide a valid Bearer token or X-API-Key",
        )

    return _dependency
