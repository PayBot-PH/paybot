import logging
import os
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger(__name__)

MESSENGER_API_BASE = os.environ.get("MESSENGER_API_BASE", "https://graph.facebook.com/v19.0")
MESSENGER_PAGE_ACCESS_TOKEN = os.environ.get("MESSENGER_PAGE_ACCESS_TOKEN", "")

class MessengerService:
    """Service for Facebook Messenger Platform integration"""
    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token or MESSENGER_PAGE_ACCESS_TOKEN
        self._timeout = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
        if not self.access_token:
            logger.warning("Messenger PAGE_ACCESS_TOKEN not set - Messenger bot will not function")

    @property
    def api_url(self):
        return f"{MESSENGER_API_BASE}/me/messages?access_token={self.access_token}"

    async def send_message(self, recipient_id: str, text: str) -> Dict[str, Any]:
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text}
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(self.api_url, json=payload)
                response.raise_for_status()
                data = response.json()
                return {"success": True, "data": data}
        except Exception as e:
            logger.error(f"Messenger send_message error: {str(e)}")
            return {"success": False, "error": str(e)}

    # Add webhook verification and more methods as needed
