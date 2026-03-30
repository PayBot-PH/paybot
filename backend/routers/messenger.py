import hashlib
import hmac
import logging
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode, quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.bot_settings import Bot_settingsService
from services.messenger_service import MessengerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/messenger", tags=["messenger"])


# ---------- Pydantic schemas ----------

class MessengerConfigUpdate(BaseModel):
    messenger_bot_status: Optional[str] = None
    messenger_page_id: Optional[str] = None
    messenger_page_username: Optional[str] = None
    messenger_page_access_token: Optional[str] = None
    messenger_app_id: Optional[str] = None
    messenger_app_secret: Optional[str] = None
    messenger_verify_token: Optional[str] = None


class SendMessageRequest(BaseModel):
    recipient_id: str
    message: str


# ---------- Helper ----------

def _config_response(obj) -> dict:
    return {
        "success": True,
        "id": obj.id,
        "messenger_bot_status": obj.messenger_bot_status or "inactive",
        "messenger_page_id": obj.messenger_page_id or "",
        "messenger_page_username": obj.messenger_page_username or "",
        "messenger_page_access_token": obj.messenger_page_access_token or "",
        "messenger_app_id": obj.messenger_app_id or "",
        "messenger_app_secret": obj.messenger_app_secret or "",
        "messenger_verify_token": obj.messenger_verify_token or "",
    }


def _get_backend_url(request: Request) -> str:
    """Determine the public-facing backend URL from request headers."""
    mgx_external_domain = request.headers.get("mgx-external-domain")
    x_forwarded_host = request.headers.get("x-forwarded-host")
    host = request.headers.get("host")
    scheme = request.headers.get("x-forwarded-proto", "https")
    effective_host = mgx_external_domain or x_forwarded_host or host
    if effective_host:
        return f"{scheme}://{effective_host}"
    return settings.backend_url


def _generate_oauth_state(user_id: str) -> str:
    """Generate a short-lived HMAC-signed state token for Facebook OAuth."""
    ts = str(int(time.time()))
    msg = f"{user_id}:{ts}"
    secret = (settings.jwt_secret_key or "paybot-oauth").encode()
    mac = hmac.new(secret, msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{mac}"


def _verify_oauth_state(state: str, max_age: int = 600) -> Optional[str]:
    """Verify the OAuth state and return the user_id, or None if invalid."""
    try:
        parts = state.split(":")
        if len(parts) != 3:
            return None
        user_id, ts, mac = parts
        msg = f"{user_id}:{ts}"
        secret = (settings.jwt_secret_key or "paybot-oauth").encode()
        expected = hmac.new(secret, msg.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, mac):
            return None
        if abs(int(time.time()) - int(ts)) > max_age:
            return None
        return user_id
    except Exception:
        return None


# ---------- Routes ----------

@router.get("/bot-config")
async def get_messenger_config(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get (or create) the Messenger configuration for the current user."""
    service = Bot_settingsService(db)
    result = await service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    if result["total"] == 0:
        obj = await service.create(
            {
                "bot_status": "inactive",
                "messenger_bot_status": "inactive",
                "maintenance_mode": "off",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
            user_id=str(current_user.id),
        )
    else:
        obj = result["items"][0]
    return _config_response(obj)


@router.put("/bot-config")
async def update_messenger_config(
    data: MessengerConfigUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update Messenger configuration for the current user."""
    service = Bot_settingsService(db)
    result = await service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    if result["total"] == 0:
        update_dict.setdefault("bot_status", "inactive")
        update_dict.setdefault("maintenance_mode", "off")
        update_dict["created_at"] = datetime.utcnow()
        obj = await service.create(update_dict, user_id=str(current_user.id))
    else:
        obj = result["items"][0]
        obj = await service.update(obj.id, update_dict, user_id=str(current_user.id))
    return _config_response(obj)


@router.get("/page-info")
async def get_page_info(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the connected Facebook Page information."""
    service_db = Bot_settingsService(db)
    result = await service_db.get_list(skip=0, limit=1, user_id=str(current_user.id))
    token = ""
    if result["total"] > 0:
        obj = result["items"][0]
        token = obj.messenger_page_access_token or ""
    # Fall back to env-level token if user hasn't stored one yet
    if not token:
        token = settings.messenger_page_access_token
    messenger = MessengerService(page_access_token=token or None)
    result_info = await messenger.get_page_info()
    return result_info


@router.post("/send-message")
async def send_test_message(
    data: SendMessageRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test message via Messenger to a recipient PSID."""
    service_db = Bot_settingsService(db)
    result = await service_db.get_list(skip=0, limit=1, user_id=str(current_user.id))
    token = ""
    if result["total"] > 0:
        obj = result["items"][0]
        token = obj.messenger_page_access_token or ""
    if not token:
        token = settings.messenger_page_access_token
    messenger = MessengerService(page_access_token=token or None)
    result_send = await messenger.send_message(data.recipient_id, data.message)
    if result_send.get("success"):
        return {"success": True, "message": "Message sent", "message_id": result_send.get("message_id")}
    raise HTTPException(status_code=400, detail=result_send.get("error", "Failed to send message"))


@router.get("/oauth/authorize")
async def messenger_oauth_authorize(
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
):
    """Return a Facebook OAuth URL for connecting a Facebook Page via one-tap login."""
    app_id = settings.messenger_app_id
    if not app_id:
        raise HTTPException(
            status_code=400,
            detail="Facebook App ID is not configured. Set MESSENGER_APP_ID or enter it in the Credentials tab first.",
        )
    backend_url = _get_backend_url(request)
    redirect_uri = f"{backend_url}/api/v1/messenger/oauth/callback"
    state = _generate_oauth_state(str(current_user.id))
    auth_url = (
        "https://www.facebook.com/v19.0/dialog/oauth"
        f"?client_id={quote(app_id)}"
        f"&redirect_uri={quote(redirect_uri)}"
        f"&scope=pages_messaging%2Cpages_manage_metadata"
        f"&state={quote(state)}"
        f"&response_type=code"
    )
    return {"success": True, "auth_url": auth_url, "redirect_uri": redirect_uri}


@router.get("/oauth/callback")
async def messenger_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle the Facebook OAuth redirect and save the connected Page credentials."""
    backend_url = _get_backend_url(request)

    def redirect_error(msg: str) -> RedirectResponse:
        return RedirectResponse(
            url=f"{backend_url}/messenger?{urlencode({'fb_error': msg})}",
            status_code=302,
        )

    if error:
        return redirect_error(error_description or error)

    if not code or not state:
        return redirect_error("Missing code or state parameters.")

    user_id = _verify_oauth_state(state)
    if not user_id:
        return redirect_error("Invalid or expired connection request. Please try connecting again.")

    app_id = settings.messenger_app_id
    app_secret = settings.messenger_app_secret
    if not app_id or not app_secret:
        return redirect_error("Facebook App credentials are not configured on the server.")

    redirect_uri = f"{backend_url}/api/v1/messenger/oauth/callback"
    token_result = await MessengerService.exchange_code_for_token(code, redirect_uri, app_id, app_secret)
    if not token_result.get("success"):
        return redirect_error(token_result.get("error", "Token exchange failed."))

    pages_result = await MessengerService.get_user_pages(token_result["access_token"])
    if not pages_result.get("success") or not pages_result.get("pages"):
        return redirect_error("No Facebook Pages found. Make sure you manage at least one Facebook Page.")

    pages = pages_result["pages"]
    page = pages[0]

    service = Bot_settingsService(db)
    db_result = await service.get_list(skip=0, limit=1, user_id=user_id)
    update_dict = {
        "messenger_page_id": page.get("id", ""),
        "messenger_page_username": page.get("username", ""),
        "messenger_page_access_token": page.get("access_token", ""),
        "messenger_bot_status": "active",
        "updated_at": datetime.utcnow(),
    }
    if db_result["total"] == 0:
        update_dict.update({"bot_status": "inactive", "maintenance_mode": "off", "created_at": datetime.utcnow()})
        await service.create(update_dict, user_id=user_id)
    else:
        obj = db_result["items"][0]
        await service.update(obj.id, update_dict, user_id=user_id)

    logger.info(f"Facebook Page '{page.get('name')}' (id={page.get('id')}) connected for user {user_id}")
    params = urlencode({"fb_connected": "1", "fb_page": page.get("name", ""), "fb_pages": len(pages)})
    return RedirectResponse(url=f"{backend_url}/messenger?{params}", status_code=302)


@router.get("/webhook")
async def verify_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    db: AsyncSession = Depends(get_db),
):
    """Facebook webhook verification endpoint (GET).

    Facebook sends a GET request with hub.mode=subscribe,
    hub.verify_token and hub.challenge when the webhook URL is registered.
    We respond with hub.challenge to confirm ownership.
    """
    if hub_mode != "subscribe":
        raise HTTPException(status_code=403, detail="Invalid hub.mode")

    # Accept the global verify token or a per-deployment environment variable
    expected_token = settings.messenger_verify_token or ""

    if hub_verify_token and expected_token and hmac.compare_digest(hub_verify_token, expected_token):
        return Response(content=hub_challenge or "", media_type="text/plain")

    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive incoming Messenger webhook events from Facebook."""
    payload_bytes = await request.body()
    x_hub_signature = request.headers.get("X-Hub-Signature-256", "")

    app_secret = settings.messenger_app_secret or ""
    if app_secret and x_hub_signature:
        messenger = MessengerService()
        if not messenger.verify_webhook_signature(payload_bytes, x_hub_signature, app_secret):
            logger.warning("Messenger webhook signature verification failed")
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if body.get("object") != "page":
        return {"success": True}

    for entry in body.get("entry", []):
        for messaging_event in entry.get("messaging", []):
            sender_id = messaging_event.get("sender", {}).get("id")
            if not sender_id:
                continue

            message = messaging_event.get("message")
            if message and not message.get("is_echo"):
                text = message.get("text", "")
                logger.info(f"Messenger message from {sender_id}: {text[:100]}")

            postback = messaging_event.get("postback")
            if postback:
                payload = postback.get("payload", "")
                logger.info(f"Messenger postback from {sender_id}: {payload}")

    return {"success": True}
