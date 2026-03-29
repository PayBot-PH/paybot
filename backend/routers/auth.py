import logging
import os
import hashlib
import hmac
import time
import uuid
from typing import Optional
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, field_validator
from core.auth import (
    IDTokenValidationError,
    build_authorization_url,
    build_logout_url,
    generate_code_challenge,
    generate_code_verifier,
    generate_nonce,
    generate_state,
    validate_id_token,
)
from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from models.auth import User
from models.admin_users import AdminUser
from models.kyb_registrations import KybRegistration
from schemas.auth import (
    PlatformTokenExchangeRequest,
    TelegramWidgetLoginRequest,
    TokenExchangeResponse,
    UserResponse,
    UserPermissions,
)
from services.auth import AuthService
from services.telegram_service import TelegramService
from services.xendit_service import XenditService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


def _local_patch(url: str) -> str:
    """Patch URL for local development."""
    if os.getenv("LOCAL_PATCH", "").lower() not in ("true", "1"):
        return url

    patched_url = url.replace("https://", "http://").replace(":8000", ":3000")
    logger.debug("[get_dynamic_backend_url] patching URL from %s to %s", url, patched_url)
    return patched_url


def get_dynamic_backend_url(request: Request) -> str:
    """Get backend URL dynamically from request headers.

    Priority: mgx-external-domain > x-forwarded-host > host > settings.backend_url
    """
    mgx_external_domain = request.headers.get("mgx-external-domain")
    x_forwarded_host = request.headers.get("x-forwarded-host")
    host = request.headers.get("host")
    scheme = request.headers.get("x-forwarded-proto", "https")

    effective_host = mgx_external_domain or x_forwarded_host or host
    if not effective_host:
        logger.warning("[get_dynamic_backend_url] No host found, fallback to %s", settings.backend_url)
        return settings.backend_url

    dynamic_url = _local_patch(f"{scheme}://{effective_host}")
    logger.debug(
        "[get_dynamic_backend_url] mgx-external-domain=%s, x-forwarded-host=%s, host=%s, scheme=%s, dynamic_url=%s",
        mgx_external_domain,
        x_forwarded_host,
        host,
        scheme,
        dynamic_url,
    )
    return dynamic_url


def derive_name_from_email(email: str) -> str:
    return email.split("@", 1)[0] if email else ""


def _get_allowed_telegram_admin_ids() -> tuple[set[str], set[str]]:
    """Parse TELEGRAM_ADMIN_IDS into two sets: numeric IDs and lowercase usernames.

    Entries that consist only of digits are treated as numeric Telegram user IDs.
    Entries that start with '@' or contain non-digit characters are treated as
    Telegram usernames (the leading '@' is stripped and the value is lowercased).

    Examples:
        TELEGRAM_ADMIN_IDS=123456789              -> ids={"123456789"}, usernames={}
        TELEGRAM_ADMIN_IDS=@traxionpay            -> ids={}, usernames={"traxionpay"}
        TELEGRAM_ADMIN_IDS=123456789,@traxionpay  -> ids={"123456789"}, usernames={"traxionpay"}
    """
    allowed_ids: set[str] = set()
    allowed_usernames: set[str] = set()

    raw = str(getattr(settings, "telegram_admin_ids", "") or "")
    for entry in raw.split(","):
        cleaned = entry.strip()
        if not cleaned:
            continue
        # Strip leading '@' for username entries
        if cleaned.startswith("@"):
            allowed_usernames.add(cleaned[1:].lower())
        elif cleaned.isdigit():
            allowed_ids.add(cleaned)
        else:
            # Non-numeric entry without '@' — treat as username too
            allowed_usernames.add(cleaned.lower())

    return allowed_ids, allowed_usernames


# Allow Telegram's server clock to be up to 30 s ahead of ours.
_CLOCK_SKEW_TOLERANCE_SECONDS = 30


def _verify_telegram_widget_payload(
    payload: TelegramWidgetLoginRequest,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> tuple[bool, str]:
    """Verify a Telegram Login Widget HMAC payload.

    Returns ``(True, "ok")`` on success, or ``(False, reason)`` on failure
    where *reason* is one of: ``bot_token_missing``, ``auth_date_future``,
    ``auth_date_expired``, ``hash_mismatch``.
    """
    if not bot_token:
        logger.error("[_verify_telegram_widget_payload] bot_token is empty or None")
        return False, "bot_token_missing"

    now = int(time.time())
    if payload.auth_date > (now + _CLOCK_SKEW_TOLERANCE_SECONDS):
        logger.error(
            "[_verify_telegram_widget_payload] auth_date is in the future: "
            "auth_date=%s, now=%s, diff=%ss",
            payload.auth_date, now, payload.auth_date - now,
        )
        return False, "auth_date_future"
    if (now - payload.auth_date) > max_age_seconds:
        logger.error(
            "[_verify_telegram_widget_payload] auth_date is too old: "
            "auth_date=%s, now=%s, age=%ss",
            payload.auth_date, now, now - payload.auth_date,
        )
        return False, "auth_date_expired"

    # Telegram signs all received fields except "hash".
    fields = payload.model_dump(exclude={"hash", "cf_turnstile_token"}, exclude_none=True)

    # Build data_check_string from non-empty fields in alphabetical order
    data_check_string = "\n".join(
        f"{key}={str(value).lower() if isinstance(value, bool) else value}"
        for key, value in sorted(fields.items())
        if value is not None and value != ""
    )

    logger.debug(
        "[_verify_telegram_widget_payload] data_check_string=%s",
        repr(data_check_string),
    )

    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, payload.hash):
        logger.error(
            "[_verify_telegram_widget_payload] hash mismatch: "
            "computed=%s, received=%s",
            computed_hash, payload.hash,
        )
        return False, "hash_mismatch"

    return True, "ok"


async def _verify_turnstile_token(token: str, secret_key: str, remote_ip: Optional[str] = None) -> bool:
    """Verify a Cloudflare Turnstile token via the siteverify API.

    Returns ``True`` when the token is valid, ``False`` otherwise.
    See: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
    """
    data: dict = {"secret": secret_key, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data=data,
            )
        resp.raise_for_status()
        result = resp.json()
        success = bool(result.get("success"))
        if not success:
            logger.warning(
                "[_verify_turnstile_token] Turnstile verification failed: error-codes=%s",
                result.get("error-codes"),
            )
        return success
    except Exception as exc:
        logger.error("[_verify_turnstile_token] Request failed: %s", exc)
        return False


@router.post("/telegram-login", response_model=TokenExchangeResponse)
async def telegram_login_legacy_disabled():
    """Legacy endpoint intentionally disabled: use Telegram Login Widget flow instead."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Legacy login is disabled. Use Telegram Login Widget sign-in.",
    )


@router.post("/telegram-login-widget", response_model=TokenExchangeResponse)
async def telegram_login_widget(payload: TelegramWidgetLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Telegram Login Widget admin login with Telegram-signed payload validation."""
    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")
    allowed_admin_ids, allowed_admin_usernames = _get_allowed_telegram_admin_ids()

    logger.info(
        "[telegram-login-widget] Login attempt: user_id=%s, username=%s, "
        "bot_token_set=%s, admins_configured=%s",
        payload.id,
        payload.username,
        bool(bot_token),
        bool(allowed_admin_ids or allowed_admin_usernames),
    )

    # Cloudflare Turnstile server-side verification (when configured)
    turnstile_secret = str(getattr(settings, "cloudflare_turnstile_secret_key", "") or "")
    if turnstile_secret:
        if not payload.cf_turnstile_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Turnstile verification token is required.",
            )
        cf_ip = request.headers.get("CF-Connecting-IP")
        client_ip = request.client.host if request.client else None
        remote_ip = cf_ip or client_ip
        token_valid = await _verify_turnstile_token(payload.cf_turnstile_token, turnstile_secret, remote_ip)
        if not token_valid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Turnstile verification failed. Please refresh and try again.",
            )

    if not bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram bot token is not configured. Add TELEGRAM_BOT_TOKEN to environment variables.",
        )

    telegram_user_id = str(payload.id)
    payload_username = (payload.username or "").lower()

    # Check DB-managed admin list first
    db_admin = None
    try:
        res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == telegram_user_id))
        db_admin = res.scalar_one_or_none()
    except Exception:
        pass

    # Allow login if: found in DB (active) OR in env var whitelist
    in_env = telegram_user_id in allowed_admin_ids or payload_username in allowed_admin_usernames
    in_db = db_admin is not None and db_admin.is_active

    if not in_db and not in_env:
        # Neither env nor DB — check if any DB admins exist at all
        try:
            count_res = await db.execute(select(AdminUser))
            any_db_admins = count_res.first() is not None
        except Exception:
            any_db_admins = False

        if any_db_admins or (allowed_admin_ids or allowed_admin_usernames):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to access the admin dashboard.",
            )
        # No admins configured anywhere — block login
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No admin users configured. Add TELEGRAM_ADMIN_IDS or use the admin panel.",
        )

    valid, reason = _verify_telegram_widget_payload(payload, bot_token)
    if not valid:
        logger.error(
            "[telegram-login-widget] Verification failed for user_id=%s, username=%s, reason=%s",
            payload.id,
            payload.username,
            reason,
        )
        _REASON_DETAILS = {
            "auth_date_future": "Telegram payload timestamp is in the future. Check your server clock.",
            "auth_date_expired": "Telegram login session has expired. Please sign in again.",
            "hash_mismatch": (
                "Invalid Telegram login payload. "
                "Ensure TELEGRAM_BOT_TOKEN matches the token from @BotFather."
            ),
        }
        detail = _REASON_DETAILS.get(reason, "Invalid Telegram login payload.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    logger.info("[telegram-login-widget] Payload verified for user_id=%s", payload.id)

    display_name = " ".join(part for part in [payload.first_name, payload.last_name] if part).strip()
    if not display_name:
        display_name = payload.username or telegram_user_id

    # Build permissions: env-whitelisted users always get full super admin access;
    # DB-only users get their stored permissions.
    if in_env:
        perms = UserPermissions(
            is_super_admin=True,
            can_manage_payments=True,
            can_manage_disbursements=True,
            can_view_reports=True,
            can_manage_wallet=True,
            can_manage_transactions=True,
            can_manage_bot=True,
            can_approve_topups=True,
        )
        if db_admin:
            # Promote existing DB record to super admin and update name/username
            try:
                db_admin.is_super_admin = True
                db_admin.can_manage_bot = True
                db_admin.can_approve_topups = True
                db_admin.name = display_name
                db_admin.telegram_username = payload.username or db_admin.telegram_username
                await db.commit()
            except Exception:
                await db.rollback()
        else:
            # Auto-register in DB as super admin
            try:
                new_admin = AdminUser(
                    telegram_id=telegram_user_id,
                    telegram_username=payload.username,
                    name=display_name,
                    is_active=True,
                    is_super_admin=True,
                    can_manage_payments=True,
                    can_manage_disbursements=True,
                    can_view_reports=True,
                    can_manage_wallet=True,
                    can_manage_transactions=True,
                    can_manage_bot=True,
                    can_approve_topups=True,
                    added_by="env_config",
                )
                db.add(new_admin)
                await db.commit()
            except Exception:
                await db.rollback()
    else:
        # DB-managed admin: use stored permissions
        perms = UserPermissions(
            is_super_admin=db_admin.is_super_admin,
            can_manage_payments=db_admin.can_manage_payments,
            can_manage_disbursements=db_admin.can_manage_disbursements,
            can_view_reports=db_admin.can_view_reports,
            can_manage_wallet=db_admin.can_manage_wallet,
            can_manage_transactions=db_admin.can_manage_transactions,
            can_manage_bot=db_admin.can_manage_bot,
            can_approve_topups=db_admin.can_approve_topups,
        )
        # Auto-update name/username in DB
        try:
            db_admin.name = display_name
            db_admin.telegram_username = payload.username or db_admin.telegram_username
            await db.commit()
        except Exception:
            await db.rollback()

    admin_email = getattr(settings, "admin_user_email", "") or f"{telegram_user_id}@paybot.local"
    user = User(id=telegram_user_id, email=admin_email, name=display_name, role="admin")
    auth_service = AuthService(db)
    try:
        app_token, _, _ = await auth_service.issue_app_token(user=user, permissions=perms)
    except ValueError as exc:
        logger.error("[telegram-login-widget] Failed to issue token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured. Ensure JWT_SECRET_KEY is set in environment variables.",
        )

    logger.info("[telegram-login-widget] Bot admin authenticated: %s", telegram_user_id)
    return TokenExchangeResponse(token=app_token)


@router.get("/telegram-login-config")
async def telegram_login_config():
    """Provide Telegram Login Widget config at runtime."""
    configured_username = (os.getenv("VITE_TELEGRAM_BOT_USERNAME") or settings.telegram_bot_username or "").strip()
    if configured_username:
        return {"bot_username": configured_username.lstrip("@")}

    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")
    if not bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram bot token is not configured",
        )

    service = TelegramService()
    result = await service.get_bot_info()
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to resolve Telegram bot username",
        )

    username = str(result.get("bot", {}).get("username", "") or "").strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram bot username is unavailable",
        )

    return {"bot_username": username}


@router.get("/telegram-login-diagnostic")
async def telegram_login_diagnostic():
    """Diagnostic endpoint to verify Telegram login configuration.

    Returns status of all required environment variables for Telegram authentication.
    Useful for debugging "Invalid Telegram login payload" errors.
    """
    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")
    bot_username = str(getattr(settings, "telegram_bot_username", "") or "")
    admin_ids = str(getattr(settings, "telegram_admin_ids", "") or "")
    jwt_secret = str(getattr(settings, "jwt_secret_key", "") or "")

    # Show partial token for verification (first 10 chars and last 10)
    if bot_token:
        token_preview = f"{bot_token[:10]}...{bot_token[-10:]}"
    else:
        token_preview = "MISSING"

    return {
        "status": "ok" if bot_token and jwt_secret else "misconfigured",
        "telegram_bot_token": "SET ✓" if bot_token else "MISSING ✗",
        "telegram_bot_token_preview": token_preview,
        "telegram_bot_username": "SET ✓" if bot_username else "EMPTY (will fetch from Telegram API)",
        "telegram_bot_username_value": bot_username if bot_username else "N/A",
        "telegram_admin_ids": "SET ✓" if admin_ids else "EMPTY (no admins configured)",
        "jwt_secret_key": "SET ✓" if jwt_secret else "GENERATED TEMPORARILY",
        "server_time": int(time.time()),
        "troubleshooting": {
            "hash_mismatch": "If getting 'Invalid payload': Token on Railway doesn't match @BotFather token. Verify token_preview matches your @BotFather /token output.",
            "verify_token": "Go to @BotFather → /mybots → Select bot → 'API Token' and compare with token_preview above",
            "reset_token": "If token doesn't match: @BotFather → /mybots → Select bot → 'API Token' → regenerate → copy to Railway Variables",
            "clear_cache": "After updating token: Clear browser storage (Ctrl+Shift+Delete) and reload frontend"
        }
    }


@router.post("/telegram-login-test")
async def telegram_login_test(payload: TelegramWidgetLoginRequest):
    """Test endpoint to verify Telegram payload without going through widget.

    Helps diagnose "Invalid payload" errors by testing signature verification
    directly without needing the Telegram Login Widget.

    Usage: POST /api/v1/auth/telegram-login-test with Telegram payload
    """
    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")

    if not bot_token:
        return {
            "success": False,
            "error": "bot_token not configured on server",
            "hint": "Check Railway Variables for TELEGRAM_BOT_TOKEN",
        }

    # Test timestamp validation
    now = int(time.time())
    auth_age = now - payload.auth_date

    if auth_age > 86400:
        return {
            "success": False,
            "error": "Payload is too old (>24 hours)",
            "auth_date": payload.auth_date,
            "server_time": now,
            "age_seconds": auth_age,
        }

    if payload.auth_date > now:
        return {
            "success": False,
            "error": "Payload timestamp is in the future (clock skew)",
            "auth_date": payload.auth_date,
            "server_time": now,
        }

    # Build data_check_string exactly as backend does
    fields = payload.model_dump(exclude={"hash"}, exclude_none=True)

    data_check_string = "\n".join(
        f"{key}={str(value).lower() if isinstance(value, bool) else value}"
        for key, value in sorted(fields.items())
        if value is not None and value != ""
    )

    # Compute hash
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    hash_matches = hmac.compare_digest(computed_hash, payload.hash)

    if hash_matches:
        return {
            "success": True,
            "message": "Payload signature verified successfully!",
            "user_id": payload.id,
            "username": payload.username,
            "auth_age_seconds": auth_age,
        }
    else:
        return {
            "success": False,
            "error": "Hash verification failed",
            "hint": "Token on server doesn't match Telegram's token. Clear browser cache and try again.",
            "debug": {
                "payload_hash": payload.hash,
                "computed_hash_preview": computed_hash[:20] + "..." + computed_hash[-20:],
                "user_id": payload.id,
                "username": payload.username,
            },
        }
@router.get("/telegram-debug")
async def telegram_debug():
    """Ultra-detailed debug endpoint to diagnose token issues."""
    bot_token = str(getattr(settings, "telegram_bot_token", "") or "")

    debug_info = {
        "token_status": "SET" if bot_token else "MISSING",
        "token_length": len(bot_token),
        "token_chars": {
            "first_10": bot_token[:10] if bot_token else "N/A",
            "last_10": bot_token[-10:] if bot_token else "N/A",
            "middle_sample": bot_token[15:25] if len(bot_token) > 25 else "N/A",
        },
        "token_format": {
            "has_colon": ":" in bot_token,
            "starts_with_digits": bot_token[0].isdigit() if bot_token else False,
            "has_hyphens": "-" in bot_token,
            "has_underscores": "_" in bot_token,
        },
        "hints": []
    }

    # Check for common issues
    if not bot_token:
        debug_info["hints"].append("⚠️  Token is MISSING. Check Railway Variables.")
    elif len(bot_token) < 30:
        debug_info["hints"].append("⚠️  Token is suspiciously short. Expected 36-50 chars.")
    elif ":" not in bot_token:
        debug_info["hints"].append("⚠️  Token should contain ':' separator (format: ID:SECRET)")
    elif bot_token.count(":") > 1:
        debug_info["hints"].append("⚠️  Token has multiple ':' - might be pasted wrong")

    # Check token is valid Telegram format
    if bot_token and ":" in bot_token:
        parts = bot_token.split(":")
        bot_id, bot_secret = parts[0], parts[1]
        debug_info["token_breakdown"] = {
            "bot_id": bot_id,
            "bot_id_length": len(bot_id),
            "bot_secret_prefix": bot_secret[:10] + ("..." if len(bot_secret) > 10 else ""),
            "bot_secret_length": len(bot_secret),
        }

        if not bot_id.isdigit():
            debug_info["hints"].append("⚠️  Bot ID should be all digits")
        if len(bot_id) < 8:
            debug_info["hints"].append("⚠️  Bot ID seems too short")
        if len(bot_secret) < 20:
            debug_info["hints"].append("⚠️  Bot secret seems too short")

    if not debug_info["hints"]:
        debug_info["hints"].append("✅ Token format looks correct!")

    debug_info["next_step"] = "Capture the exact payload from browser DevTools → Network → /telegram-login-widget POST request"

    return debug_info


async def login(request: Request, db: AsyncSession = Depends(get_db)):
    """Start OIDC login flow with PKCE."""
    state = generate_state()
    nonce = generate_nonce()
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)

    # Store state, nonce, and code verifier in database
    auth_service = AuthService(db)
    await auth_service.store_oidc_state(state, nonce, code_verifier)

    # Build redirect_uri dynamically from request
    backend_url = get_dynamic_backend_url(request)
    redirect_uri = f"{backend_url}/api/v1/auth/callback"
    logger.info("[login] Starting OIDC flow with redirect_uri=%s", redirect_uri)

    auth_url = build_authorization_url(state, nonce, code_challenge, redirect_uri=redirect_uri)
    return RedirectResponse(
        url=auth_url,
        status_code=status.HTTP_302_FOUND,
        headers={"X-Request-ID": state},
    )


@router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle OIDC callback."""
    backend_url = get_dynamic_backend_url(request)

    def redirect_with_error(message: str) -> RedirectResponse:
        fragment = urlencode({"msg": message})
        return RedirectResponse(
            url=f"{backend_url}/auth/error?{fragment}",
            status_code=status.HTTP_302_FOUND,
        )

    if error:
        return redirect_with_error(f"OIDC error: {error}")

    if not code or not state:
        return redirect_with_error("Missing code or state parameter")

    # Validate state using database
    auth_service = AuthService(db)
    temp_data = await auth_service.get_and_delete_oidc_state(state)
    if not temp_data:
        return redirect_with_error("Invalid or expired state parameter")

    nonce = temp_data["nonce"]
    code_verifier = temp_data.get("code_verifier")

    try:
        # Build redirect_uri dynamically from request
        redirect_uri = f"{backend_url}/api/v1/auth/callback"
        logger.info("[callback] Exchanging code for tokens with redirect_uri=%s", redirect_uri)

        # Exchange authorization code for tokens with PKCE
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": settings.oidc_client_id,
            "client_secret": settings.oidc_client_secret,
        }

        # Add PKCE code verifier if available
        if code_verifier:
            token_data["code_verifier"] = code_verifier

        token_url = f"{settings.oidc_issuer_url}/token"
        try:
            async with httpx.AsyncClient() as client:
                token_response = await client.post(
                    token_url,
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded", "X-Request-ID": state},
                )
        except httpx.HTTPError as e:
            logger.error(
                "[callback] Token exchange HTTP error: url=%s, error=%s",
                token_url,
                str(e),
                exc_info=True,
            )
            return redirect_with_error(f"Token exchange failed: {e}")

        if token_response.status_code != 200:
            logger.error(
                "[callback] Token exchange failed: url=%s, status_code=%s, response=%s",
                token_url,
                token_response.status_code,
                token_response.text,
            )
            return redirect_with_error(f"Token exchange failed: {token_response.text}")

        tokens = token_response.json()

        # Validate ID token
        id_token = tokens.get("id_token")
        if not id_token:
            return redirect_with_error("No ID token received")

        id_claims = await validate_id_token(id_token)

        # Validate nonce
        if id_claims.get("nonce") != nonce:
            return redirect_with_error("Invalid nonce")

        # Get or create user
        email = id_claims.get("email", "")
        name = id_claims.get("name") or derive_name_from_email(email)
        user = await auth_service.get_or_create_user(platform_sub=id_claims["sub"], email=email, name=name)

        # Issue application JWT token encapsulating user information
        app_token, expires_at, _ = await auth_service.issue_app_token(user=user)

        fragment = urlencode(
            {
                "token": app_token,
                "expires_at": int(expires_at.timestamp()),
                "token_type": "Bearer",
            }
        )

        redirect_url = f"{backend_url}/auth/callback?{fragment}"
        logger.info("[callback] OIDC callback successful, redirecting to %s", redirect_url)
        redirect_response = RedirectResponse(
            url=redirect_url,
            status_code=status.HTTP_302_FOUND,
        )
        return redirect_response

    except IDTokenValidationError as e:
        # Redirect to error page with validation details
        return redirect_with_error(f"Authentication failed: {e.message}")
    except HTTPException as e:
        # Redirect to error page with the original detail message
        return redirect_with_error(str(e.detail))
    except Exception as e:
        logger.exception(f"Unexpected error in OIDC callback: {e}")
        return redirect_with_error(
            "Authentication processing failed. Please try again or contact support if the issue persists."
        )


@router.post("/token/exchange", response_model=TokenExchangeResponse)
async def exchange_platform_token(
    payload: PlatformTokenExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange Platform token for app token, restricted to admin user."""
    logger.info("[token/exchange] Received platform token exchange request")

    verify_url = f"{settings.oidc_issuer_url}/platform/tokens/verify"
    logger.debug(f"[token/exchange] Verifying token with issuer: {verify_url}")

    try:
        async with httpx.AsyncClient() as client:
            verify_response = await client.post(
                verify_url,
                json={"platform_token": payload.platform_token},
                headers={"Content-Type": "application/json"},
            )
        logger.debug(f"[token/exchange] Issuer response status: {verify_response.status_code}")
    except httpx.HTTPError as exc:
        logger.error(f"[token/exchange] HTTP error verifying platform token: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to verify platform token") from exc

    try:
        verify_body = verify_response.json()
        logger.debug(f"[token/exchange] Issuer response body: {verify_body}")
    except ValueError:
        logger.error(f"[token/exchange] Failed to parse issuer response as JSON: {verify_response.text}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from platform token verification service",
        )

    if not isinstance(verify_body, dict):
        logger.error(f"[token/exchange] Unexpected response type: {type(verify_body)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unexpected response from platform token verification service",
        )

    if verify_response.status_code != status.HTTP_200_OK or not verify_body.get("success"):
        message = verify_body.get("message", "") if isinstance(verify_body, dict) else ""
        logger.warning(
            f"[token/exchange] Token verification failed: status={verify_response.status_code}, message={message}"
        )
        raise HTTPException(
            status_code=verify_response.status_code,
            detail=message or "Platform token verification failed",
        )

    payload_data = verify_body.get("data") or {}
    raw_user_id = payload_data.get("user_id")
    logger.info(f"[token/exchange] Token verified, platform_user_id={raw_user_id}, email={payload_data.get('email')}")

    if not raw_user_id:
        logger.error("[token/exchange] Platform token payload missing user_id")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platform token payload missing user_id")

    platform_user_id = str(raw_user_id)
    if platform_user_id != str(settings.admin_user_id):
        logger.warning(
            f"[token/exchange] Denied: platform_user_id={platform_user_id}, admin_user_id={settings.admin_user_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only admin user can exchange a platform token"
        )

    logger.info("[token/exchange] Admin user verified, issuing admin token without DB persistence")
    auth_service = AuthService(db)

    admin_email = payload_data.get("email", "") or getattr(settings, "admin_user_email", "")
    admin_name = payload_data.get("name") or payload_data.get("username")
    if not admin_name:
        admin_name = derive_name_from_email(admin_email)

    user = User(id=platform_user_id, email=admin_email, name=admin_name, role="admin")
    logger.debug(
        f"[token/exchange] Admin user object for token issuance: id={user.id}, email={user.email}, role={user.role}"
    )

    app_token, expires_at, _ = await auth_service.issue_app_token(user=user)
    logger.info(f"[token/exchange] Token issued successfully for user_id={user.id}, expires_at={expires_at}")

    return TokenExchangeResponse(
        token=app_token,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Get current user info."""
    return current_user


@router.get("/logout")
async def logout():
    """Logout user."""
    logout_url = build_logout_url()
    return {"redirect_url": logout_url}


# ── Registration / KYC ──────────────────────────────────────────────────────

# Default country code for Philippine mobile number normalisation
_PH_COUNTRY_CODE = "+63"


class RegisterRequest(BaseModel):
    full_name: str
    email: str  # validated in field_validator below
    phone: str
    address: Optional[str] = None
    business_name: Optional[str] = None
    telegram_username: str  # required — used to link the Telegram account after approval

    @field_validator("email", mode="before")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        import re
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(v).strip()):
            raise ValueError("Invalid email address")
        return str(v).strip().lower()

    @field_validator("telegram_username", mode="before")
    @classmethod
    def strip_at(cls, v: str) -> str:
        stripped = str(v).lstrip("@").strip()
        if not stripped:
            raise ValueError("Telegram username is required")
        return stripped


class RegisterResponse(BaseModel):
    message: str
    kyb_id: int
    xendit_customer_id: Optional[str] = None


@router.post("/register", response_model=RegisterResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Public registration endpoint.

    Creates a KYB registration record (status ``pending_review``) and a
    matching Xendit customer record for KYC purposes.  A super admin must
    review and approve the application before the applicant can access the
    dashboard.
    """
    # Deduplicate by telegram_username or email (use a fake chat_id based on email)
    ref_id = f"reg-{uuid.uuid4().hex[:12]}"

    # Use email as the stable chat_id for web registrations
    chat_id = f"web-{hashlib.sha256(body.email.lower().encode()).hexdigest()[:16]}"

    existing = await db.execute(
        select(KybRegistration).where(KybRegistration.chat_id == chat_id)
    )
    existing_kyb = existing.scalar_one_or_none()
    if existing_kyb:
        if existing_kyb.status == "approved":
            raise HTTPException(status_code=400, detail="This email is already registered and approved.")
        # Return the existing pending registration
        return RegisterResponse(
            message="Your registration is already submitted and under review.",
            kyb_id=existing_kyb.id,
            xendit_customer_id=None,
        )

    # Create Xendit customer for KYC (best-effort)
    xendit_customer_id: Optional[str] = None
    try:
        xendit = XenditService()
        mobile = body.phone if body.phone.startswith("+") else f"{_PH_COUNTRY_CODE}{body.phone.lstrip('0')}"
        result = await xendit.create_customer(
            reference_id=ref_id,
            given_names=body.full_name,
            email=body.email,
            mobile_number=mobile,
            description=body.business_name or "",
        )
        if result.get("success"):
            xendit_customer_id = result.get("customer_id")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Xendit create_customer failed during registration: %s", exc)

    # Persist KYB record
    kyb = KybRegistration(
        chat_id=chat_id,
        telegram_username=body.telegram_username,
        step="done",
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        address=body.address,
        bank_name=body.business_name,  # bank_name column reused to store business name for web registrations
        status="pending_review",
    )
    db.add(kyb)
    await db.commit()
    await db.refresh(kyb)

    return RegisterResponse(
        message="Registration submitted successfully. An admin will review your application.",
        kyb_id=kyb.id,
        xendit_customer_id=xendit_customer_id,
    )
