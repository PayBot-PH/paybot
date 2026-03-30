import logging
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from services.messenger_service import MessengerService
from services.bot_event_handler import handle_bot_event, BotEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/messenger", tags=["messenger"])

class MessengerMessageRequest(BaseModel):
    recipient_id: str
    text: str

@router.post("/send-message")
async def send_messenger_message(req: MessengerMessageRequest):
    service = MessengerService()
    result = await service.send_message(req.recipient_id, req.text)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to send message"))
    return {"success": True, "data": result.get("data")}


# Messenger webhook verification (GET)
from fastapi import Query
@router.get("/webhook")
async def messenger_webhook_verify(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_challenge: str = Query("", alias="hub.challenge"),
    hub_verify_token: str = Query("", alias="hub.verify_token")
):
    VERIFY_TOKEN = "paybot_messenger_verify_token"
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")

# Messenger webhook event (POST)
@router.post("/webhook")
async def messenger_webhook_event(request: Request):
    data = await request.json()
    try:
        for entry in data.get("entry", []):
            for messaging in entry.get("messaging", []):
                sender = messaging.get("sender", {}).get("id")
                message = messaging.get("message", {}).get("text", "")
                if sender and message:
                    event = BotEvent(platform="messenger", user_id=sender, message=message, raw_event=messaging)
                    reply = await handle_bot_event(event)
                    svc = MessengerService()
                    await svc.send_message(sender, reply)
        return {"success": True}
    except Exception as e:
        logger.error(f"Messenger webhook error: {e}")
        return {"success": False, "error": str(e)}
