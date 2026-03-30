import logging
import os
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger(__name__)

WHATSAPP_API_BASE = os.environ.get("WHATSAPP_API_BASE", "https://graph.facebook.com/v19.0")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")

class WhatsAppService:
    """Service for WhatsApp Cloud API integration"""
    def __init__(self, access_token: Optional[str] = None, phone_number_id: Optional[str] = None):
        self.access_token = access_token or WHATSAPP_ACCESS_TOKEN
        self.phone_number_id = phone_number_id or WHATSAPP_PHONE_NUMBER_ID
        self._timeout = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
        if not self.access_token or not self.phone_number_id:
            logger.warning("WhatsApp credentials not set - WhatsApp bot will not function")

    @property
    def api_url(self):
        return f"{WHATSAPP_API_BASE}/{self.phone_number_id}/messages"

    async def send_message(self, to: str, text: str) -> Dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text}
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(self.api_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                return {"success": True, "data": data}
        except Exception as e:
            logger.error(f"WhatsApp send_message error: {str(e)}")
            return {"success": False, "error": str(e)}

    # Add more methods for webhook verification, status, etc. as needed
