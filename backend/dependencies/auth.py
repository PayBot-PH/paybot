import hashlib
import logging
from datetime import datetime
from typing import Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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
