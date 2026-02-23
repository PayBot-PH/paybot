"""
Security Bank Collect (Magpie) Service
API: https://api.magpie.im/v1
Auth: HTTP Basic — secret key as username, empty password
Docs: https://developer.magpie.im/docs/
"""
import logging
import uuid
from typing import Any, Dict, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

SBC_API_BASE = "https://api.magpie.im/v1"
SBC_TIMEOUT = 30.0


class SecurityBankCollectService:
    def __init__(self):
        self.secret_key = settings.sbc_secret_key
        self.public_key = settings.sbc_public_key
        self.merchant_id = settings.sbc_merchant_id

    def _auth(self) -> tuple[str, str]:
        """Basic auth tuple: (secret_key, empty_password)"""
        return (self.secret_key, "")

    async def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST to Magpie API with Basic Auth."""
        try:
            async with httpx.AsyncClient(timeout=SBC_TIMEOUT) as client:
                resp = await client.post(
                    f"{SBC_API_BASE}{path}",
                    json=payload,
                    auth=self._auth(),
                    headers={"Content-Type": "application/json"},
                )
                data = resp.json()
                if resp.status_code in (200, 201):
                    return {"success": True, "data": data.get("data", data)}
                errors = data.get("errors", [])
                msg = errors[0].get("detail", str(data)) if errors else str(data)
                logger.error(f"SBC API error {resp.status_code}: {msg}")
                return {"success": False, "error": msg, "status_code": resp.status_code}
        except httpx.TimeoutException:
            return {"success": False, "error": "Request timed out"}
        except Exception as e:
            logger.error(f"SBC API exception: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    async def _get(self, path: str) -> Dict[str, Any]:
        """GET from Magpie API with Basic Auth."""
        try:
            async with httpx.AsyncClient(timeout=SBC_TIMEOUT) as client:
                resp = await client.get(
                    f"{SBC_API_BASE}{path}",
                    auth=self._auth(),
                )
                data = resp.json()
                if resp.status_code == 200:
                    return {"success": True, "data": data.get("data", data)}
                errors = data.get("errors", [])
                msg = errors[0].get("detail", str(data)) if errors else str(data)
                return {"success": False, "error": msg}
        except Exception as e:
            logger.error(f"SBC API GET exception: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # QR / Source Creation
    # ------------------------------------------------------------------

    async def create_alipay_qr(
        self,
        amount: float,
        description: str = "Alipay payment",
        success_url: Optional[str] = None,
        failed_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create an Alipay QR source via Magpie.
        Amount is in PHP (e.g. 100.00 → sent as 10000 centavos).
        """
        backend_url = settings.backend_url
        redirect_success = success_url or f"{backend_url}/api/v1/sbc/redirect/success"
        redirect_failed = failed_url or f"{backend_url}/api/v1/sbc/redirect/failed"
        external_id = f"alipay-{uuid.uuid4().hex[:12]}"

        payload = {
            "data": {
                "attributes": {
                    "type": "alipay",
                    "amount": int(amount * 100),   # centavos
                    "currency": "PHP",
                    "description": description,
                    "statement_descriptor": description[:22],
                    "redirect": {
                        "success": redirect_success,
                        "failed": redirect_failed,
                    },
                    "metadata": {
                        "external_id": external_id,
                        "merchant_id": self.merchant_id,
                    },
                }
            }
        }
        result = await self._post("/sources", payload)
        if result["success"]:
            attrs = result["data"].get("attributes", {})
            return {
                "success": True,
                "source_id": result["data"].get("id", ""),
                "external_id": external_id,
                "type": "alipay",
                "amount": amount,
                "qr_url": attrs.get("qr_code", attrs.get("redirect", {}).get("checkout_url", "")),
                "status": attrs.get("status", "pending"),
            }
        return result

    async def create_wechat_qr(
        self,
        amount: float,
        description: str = "WeChat payment",
        success_url: Optional[str] = None,
        failed_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a WeChat Pay QR source via Magpie."""
        backend_url = settings.backend_url
        redirect_success = success_url or f"{backend_url}/api/v1/sbc/redirect/success"
        redirect_failed = failed_url or f"{backend_url}/api/v1/sbc/redirect/failed"
        external_id = f"wechat-{uuid.uuid4().hex[:12]}"

        payload = {
            "data": {
                "attributes": {
                    "type": "wechat",
                    "amount": int(amount * 100),   # centavos
                    "currency": "PHP",
                    "description": description,
                    "statement_descriptor": description[:22],
                    "redirect": {
                        "success": redirect_success,
                        "failed": redirect_failed,
                    },
                    "metadata": {
                        "external_id": external_id,
                        "merchant_id": self.merchant_id,
                    },
                }
            }
        }
        result = await self._post("/sources", payload)
        if result["success"]:
            attrs = result["data"].get("attributes", {})
            return {
                "success": True,
                "source_id": result["data"].get("id", ""),
                "external_id": external_id,
                "type": "wechat",
                "amount": amount,
                "qr_url": attrs.get("qr_code", attrs.get("redirect", {}).get("checkout_url", "")),
                "status": attrs.get("status", "pending"),
            }
        return result

    async def get_source(self, source_id: str) -> Dict[str, Any]:
        """Retrieve source/QR status by source ID."""
        return await self._get(f"/sources/{source_id}")

    async def get_payments(self, limit: int = 10) -> Dict[str, Any]:
        """List recent payments."""
        return await self._get(f"/payments?limit={limit}")
