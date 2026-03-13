import logging
import os
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


def _resolve_bot_token() -> str:
    """Try multiple methods to resolve the Telegram bot token."""
    # Method 1: Direct os.environ
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if token:
        logger.info("TELEGRAM_BOT_TOKEN resolved via os.environ")
        return token

    # Method 2: settings dynamic attribute (reads env with UPPER_CASE)
    try:
        from core.config import settings
        token = settings.telegram_bot_token
        if token:
            logger.info("TELEGRAM_BOT_TOKEN resolved via settings.telegram_bot_token")
            return token
    except (AttributeError, ImportError) as e:
        logger.warning(f"Failed to get token via settings: {e}")

    # Method 3: Check common alternative env var names
    for alt_name in ["TELEGRAM_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN", "telegram_bot_token"]:
        token = os.environ.get(alt_name, "")
        if token:
            logger.info(f"TELEGRAM_BOT_TOKEN resolved via alternative env var: {alt_name}")
            return token

    logger.warning("TELEGRAM_BOT_TOKEN could not be resolved by any method")
    return ""


class TelegramService:
    """Service for Telegram Bot API integration"""

    def __init__(self):
        self.bot_token = _resolve_bot_token()
        if not self.bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN not set - bot will not function")
        self._timeout = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)

    async def _post_with_retry(self, url: str, payload: Dict[str, Any]) -> httpx.Response:
        last_error: Optional[Exception] = None
        for _ in range(2):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.post(url, json=payload)
                    return response
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
        raise last_error if last_error else RuntimeError("Telegram request failed")

    @property
    def api_url(self):
        return f"{TELEGRAM_API_BASE}/bot{self.bot_token}"

    async def get_bot_info(self) -> Dict[str, Any]:
        """Get bot information"""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self.api_url}/getMe")
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
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self.api_url}/setWebhook",
                    json={"url": webhook_url},
                )
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "message": "Webhook set successfully"}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error setting webhook: {str(e)}")
            return {"success": False, "error": str(e)}

    async def get_webhook_info(self) -> Dict[str, Any]:
        """Get the currently registered webhook info from Telegram."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self.api_url}/getWebhookInfo")
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "webhook": data.get("result", {})}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error getting webhook info: {str(e)}")
            return {"success": False, "error": str(e)}

    async def set_my_commands(self, commands: list) -> Dict[str, Any]:
        """Register bot commands with Telegram (shown in the / menu)."""
        try:
            payload = {"commands": commands}
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(f"{self.api_url}/setMyCommands", json=payload)
                response.raise_for_status()
                data = response.json()
                if data.get("ok"):
                    return {"success": True}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error setting bot commands: {str(e)}")
            return {"success": False, "error": str(e)}

    async def send_message(
        self,
        chat_id: str,
        text: str,
        parse_mode: str = "HTML",
        reply_markup: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """Send a message to a Telegram chat"""
        try:
            payload: Dict[str, Any] = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup

            response = await self._post_with_retry(f"{self.api_url}/sendMessage", payload)
            data = response.json()

            if response.status_code == 400 and isinstance(data, dict):
                description = str(data.get("description", "")).lower()
                if "can't parse entities" in description or "parse" in description:
                    fallback_payload = {
                        "chat_id": chat_id,
                        "text": text,
                    }
                    response = await self._post_with_retry(f"{self.api_url}/sendMessage", fallback_payload)
                    data = response.json()

            if response.status_code >= 400:
                return {"success": False, "error": data.get("description", f"HTTP {response.status_code}")}

            if data.get("ok"):
                return {"success": True, "message_id": data["result"]["message_id"]}
            return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            return {"success": False, "error": str(e)}

    async def send_photo(
        self,
        chat_id: str,
        photo: "bytes | str",
        caption: str = "",
        parse_mode: str = "HTML",
        reply_markup: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """Send a photo to a Telegram chat.

        ``photo`` can be raw PNG bytes (multipart upload) or a URL string
        (Telegram fetches the image from that URL via JSON).
        """
        try:
            import json as _json
            if reply_markup:
                rm_str = _json.dumps(reply_markup)
            else:
                rm_str = None

            async with httpx.AsyncClient(timeout=self._timeout) as client:
                if isinstance(photo, str):
                    # URL — use JSON payload so Telegram fetches the image
                    payload: Dict[str, Any] = {"chat_id": chat_id, "photo": photo}
                    if caption:
                        payload["caption"] = caption
                        payload["parse_mode"] = parse_mode
                    if rm_str:
                        payload["reply_markup"] = rm_str
                    response = await client.post(f"{self.api_url}/sendPhoto", json=payload)
                else:
                    # Raw bytes — multipart upload
                    data: Dict[str, Any] = {"chat_id": chat_id}
                    if caption:
                        data["caption"] = caption
                        data["parse_mode"] = parse_mode
                    if rm_str:
                        data["reply_markup"] = rm_str
                    response = await client.post(
                        f"{self.api_url}/sendPhoto",
                        data=data,
                        files={"photo": ("qr.png", photo, "image/png")},
                    )
            resp_data = response.json()
            if response.status_code >= 400:
                return {"success": False, "error": resp_data.get("description", f"HTTP {response.status_code}")}
            if resp_data.get("ok"):
                return {"success": True, "message_id": resp_data["result"]["message_id"]}
            return {"success": False, "error": resp_data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error sending photo: {str(e)}")
            return {"success": False, "error": str(e)}

    async def answer_callback_query(
        self,
        callback_query_id: str,
        text: str = "",
    ) -> Dict[str, Any]:
        """Acknowledge a Telegram inline button press (required to stop the loading spinner)."""
        try:
            payload: Dict[str, Any] = {"callback_query_id": callback_query_id}
            if text:
                payload["text"] = text
            response = await self._post_with_retry(f"{self.api_url}/answerCallbackQuery", payload)
            data = response.json()
            return {"success": data.get("ok", False)}
        except Exception as e:
            logger.error(f"Error answering callback query: {str(e)}")
            return {"success": False, "error": str(e)}

    async def get_file(self, file_id: str) -> Dict[str, Any]:
        """Retrieve file metadata (file_path) for a Telegram file_id."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(
                    f"{self.api_url}/getFile",
                    params={"file_id": file_id},
                )
                data = response.json()
                if data.get("ok"):
                    return {"success": True, "file_path": data["result"]["file_path"]}
                return {"success": False, "error": data.get("description", "Unknown error")}
        except Exception as e:
            logger.error(f"Error getting file: {str(e)}")
            return {"success": False, "error": str(e)}

    async def download_file_bytes(self, file_path: str) -> Optional[bytes]:
        """Download a Telegram file by its file_path and return the raw bytes."""
        try:
            url = f"{TELEGRAM_API_BASE}/file/bot{self.bot_token}/{file_path}"
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.content
                logger.error(f"Failed to download Telegram file: HTTP {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error downloading file: {str(e)}")
            return None