import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
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
        "messenger_page_access_token": obj.messenger_page_access_token or "",
        "messenger_app_id": obj.messenger_app_id or "",
        "messenger_app_secret": obj.messenger_app_secret or "",
        "messenger_verify_token": obj.messenger_verify_token or "",
    }


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

    if hub_verify_token and expected_token and hub_verify_token == expected_token:
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
