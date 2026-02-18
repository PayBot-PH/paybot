import logging
import os
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramService:
    """Service for Telegram Bot API integration"""

    def __init__(self):
        self.bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        if not self.bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN not set in environment")

    @property
    def api_url(self):
        return f"{TELEGRAM_API_BASE}/bot{self.bot_token}"

    async def get_bot_info(self) -> Dict[str, Any]:
        """Get bot information"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.api_url}/getMe", timeout=15.0)
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "bot": data.get("result", {})}
                return {"success": False, "error": "Failed to get bot info"}
        except Exception as e:
            logger.error(f"Error getting bot info: {str(e)}")
            return {"success": False, "error": str(e)}

    async def set_webhook(self, webhook_url: str) -> Dict[str, Any]:
        """Set the Telegram webhook URL"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/setWebhook",
                    json={"url": webhook_url},
                    timeout=15.0,
                )
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "message": "Webhook set successfully"}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error setting webhook: {str(e)}")
            return {"success": False, "error": str(e)}

    async def send_message(
        self,
        chat_id: str,
        text: str,
        parse_mode: str = "HTML",
    ) -> Dict[str, Any]:
        """Send a message to a Telegram chat"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": parse_mode,
                    },
                    timeout=15.0,
                )
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "message_id": data["result"]["message_id"]}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            return {"success": False, "error": str(e)}