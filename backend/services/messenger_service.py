import hashlib
import hmac
import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v19.0"


def _resolve_page_access_token() -> str:
    """Resolve the Facebook Page Access Token via pydantic-settings."""
    try:
        from core.config import settings
        token = settings.messenger_page_access_token
        if token:
            logger.info("MESSENGER_PAGE_ACCESS_TOKEN resolved via settings")
            return token
    except (AttributeError, ImportError) as e:
        logger.warning(f"Failed to get messenger token via settings: {e}")

    logger.warning("MESSENGER_PAGE_ACCESS_TOKEN could not be resolved")
    return ""


class MessengerService:
    """Service for Facebook Messenger Platform API integration."""

    def __init__(self, page_access_token: Optional[str] = None):
        self.page_access_token = page_access_token or _resolve_page_access_token()
        if not self.page_access_token:
            logger.warning("MESSENGER_PAGE_ACCESS_TOKEN not set — Messenger will not function")
        self._timeout = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)

    def verify_webhook_signature(self, payload: bytes, x_hub_signature: str, app_secret: str) -> bool:
        """Verify the X-Hub-Signature-256 header sent by Facebook."""
        if not app_secret:
            return False
        expected = "sha256=" + hmac.new(
            app_secret.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, x_hub_signature)

    async def get_page_info(self) -> Dict[str, Any]:
        """Fetch information about the connected Facebook Page."""
        if not self.page_access_token:
            return {"success": False, "error": "Page access token not configured"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(
                    f"{GRAPH_API_BASE}/me",
                    params={"access_token": self.page_access_token, "fields": "id,name"},
                )
                data = response.json()
                if response.status_code == 200:
                    return {"success": True, "page": data}
                return {"success": False, "error": data.get("error", {}).get("message", "Unknown error")}
        except Exception as e:
            logger.error(f"Error getting page info: {str(e)}")
            return {"success": False, "error": str(e)}

    async def send_message(
        self,
        recipient_id: str,
        text: str,
    ) -> Dict[str, Any]:
        """Send a text message to a Messenger user."""
        if not self.page_access_token:
            return {"success": False, "error": "Page access token not configured"}
        try:
            payload = {
                "recipient": {"id": recipient_id},
                "message": {"text": text},
                "messaging_type": "RESPONSE",
            }
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{GRAPH_API_BASE}/me/messages",
                    params={"access_token": self.page_access_token},
                    json=payload,
                )
                data = response.json()
                if response.status_code == 200:
                    return {"success": True, "message_id": data.get("message_id")}
                return {"success": False, "error": data.get("error", {}).get("message", f"HTTP {response.status_code}")}
        except Exception as e:
            logger.error(f"Error sending Messenger message: {str(e)}")
            return {"success": False, "error": str(e)}

    async def subscribe_to_webhooks(self, page_id: str) -> Dict[str, Any]:
        """Subscribe the page to Messenger webhook events."""
        if not self.page_access_token:
            return {"success": False, "error": "Page access token not configured"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{GRAPH_API_BASE}/{page_id}/subscribed_apps",
                    params={"access_token": self.page_access_token},
                    json={"subscribed_fields": ["messages", "messaging_postbacks"]},
                )
                data = response.json()
                if response.status_code == 200 and data.get("success"):
                    return {"success": True, "message": "Subscribed to webhook events"}
                return {"success": False, "error": data.get("error", {}).get("message", "Subscription failed")}
        except Exception as e:
            logger.error(f"Error subscribing to webhooks: {str(e)}")
            return {"success": False, "error": str(e)}
