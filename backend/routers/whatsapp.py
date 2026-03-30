import logging
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from services.whatsapp_service import WhatsAppService
from services.bot_event_handler import handle_bot_event, BotEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])

class WhatsAppMessageRequest(BaseModel):
    to: str
    text: str

@router.post("/send-message")
async def send_whatsapp_message(req: WhatsAppMessageRequest):
    service = WhatsAppService()
    result = await service.send_message(req.to, req.text)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to send message"))
    return {"success": True, "data": result.get("data")}


# WhatsApp webhook verification (GET)
@router.get("/webhook")
async def whatsapp_webhook_verify(hub_mode: str = "", hub_challenge: str = "", hub_verify_token: str = ""):
    # Set your verify token in env/config
    VERIFY_TOKEN = "paybot_whatsapp_verify_token"
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")

# WhatsApp webhook event (POST)
@router.post("/webhook")
async def whatsapp_webhook_event(request: Request):
    data = await request.json()
    # WhatsApp Cloud API sends messages in a nested structure
    try:
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                for msg in messages:
                    from_id = msg.get("from")
                    text = msg.get("text", {}).get("body", "")
                    if from_id and text:
                        event = BotEvent(platform="whatsapp", user_id=from_id, message=text, raw_event=msg)
                        reply = await handle_bot_event(event)
                        # Optionally send reply back
                        svc = WhatsAppService()
                        await svc.send_message(from_id, reply)
        return {"success": True}
    except Exception as e:
        logger.error(f"WhatsApp webhook error: {e}")
        return {"success": False, "error": str(e)}
