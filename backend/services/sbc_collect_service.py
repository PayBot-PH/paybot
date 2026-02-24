"""
Security Bank Collect (SBC WebCollect) Service
API: https://pay.securitybankcollect.com/api
Auth: HTTP Basic — secret key as username, empty password
Docs: https://securitybankcollect.com/webcollect (Swagger)

Supported payment_method_types: gcash, paymaya, bpi
API uses a Sessions-based checkout flow (not Sources/QR).
"""
import logging
import uuid
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

SBC_API_BASE = "https://pay.securitybankcollect.com/api"
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
        """POST to SBC API with Basic Auth."""
        try:
            async with httpx.AsyncClient(timeout=SBC_TIMEOUT) as client:
                resp = await client.post(
                    f"{SBC_API_BASE}{path}",
                    json=payload,
                    auth=self._auth(),
                    headers={"Content-Type": "application/json"},
                )
                try:
                    data = resp.json()
                except Exception:
                    data = {}
                if resp.status_code in (200, 201):
                    return {"success": True, "data": data}
                # Extract error message
                err = data.get("error", {})
                msg = err.get("message", data.get("message")) or f"HTTP {resp.status_code}"
                logger.error("SBC API error %s: %s", resp.status_code, msg)
                return {"success": False, "error": msg, "status_code": resp.status_code}
        except httpx.TimeoutException:
            return {"success": False, "error": "Request timed out"}
        except Exception as e:
            logger.error("SBC API exception: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}

    async def _get(self, path: str) -> Dict[str, Any]:
        """GET from SBC API with Basic Auth."""
        try:
            async with httpx.AsyncClient(timeout=SBC_TIMEOUT) as client:
                resp = await client.get(
                    f"{SBC_API_BASE}{path}",
                    auth=self._auth(),
                )
                try:
                    data = resp.json()
                except Exception:
                    data = {}
                if resp.status_code == 200:
                    return {"success": True, "data": data}
                err = data.get("error", {})
                msg = err.get("message", data.get("message")) or f"HTTP {resp.status_code}"
                return {"success": False, "error": msg}
        except Exception as e:
            logger.error("SBC API GET exception: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Session / Checkout Creation
    # ------------------------------------------------------------------

    async def create_checkout_session(
        self,
        amount: float,
        description: str,
        payment_method_types: List[str],
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a SBC checkout session.
        Amount is in PHP (e.g. 100.00). Sent as centavos (×100).
        Returns a checkout URL the payer visits to complete payment.
        """
        backend_url = settings.backend_url
        external_id = f"sbc-{uuid.uuid4().hex[:12]}"

        payload = {
            "currency": "php",
            "mode": "payment",
            "payment_method_types": payment_method_types,
            "line_items": [
                {
                    "name": description or "Payment",
                    "quantity": 1,
                    "amount": int(amount * 100),  # centavos
                    "currency": "php",
                }
            ],
            "success_url": success_url or f"{backend_url}/api/v1/sbc/redirect/success",
            "cancel_url": cancel_url or f"{backend_url}/api/v1/sbc/redirect/failed",
            "metadata": {
                "external_id": external_id,
                "merchant_id": self.merchant_id,
            },
        }

        result = await self._post("/v1/sessions", payload)
        if result["success"]:
            session = result["data"]
            return {
                "success": True,
                "session_id": session.get("id", ""),
                "external_id": external_id,
                "checkout_url": session.get("url", ""),
                "amount": amount,
                "payment_method_types": payment_method_types,
                "status": session.get("payment_status", "unpaid"),
            }
        return result

    async def create_gcash_session(
        self,
        amount: float,
        description: str = "GCash payment",
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a GCash checkout session via SBC."""
        return await self.create_checkout_session(
            amount=amount,
            description=description,
            payment_method_types=["gcash"],
            success_url=success_url,
            cancel_url=cancel_url,
        )

    async def create_maya_session(
        self,
        amount: float,
        description: str = "Maya payment",
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Maya (PayMaya) checkout session via SBC."""
        return await self.create_checkout_session(
            amount=amount,
            description=description,
            payment_method_types=["paymaya"],
            success_url=success_url,
            cancel_url=cancel_url,
        )

    # Keep backward-compatible aliases (used by bot commands)
    async def create_alipay_qr(
        self,
        amount: float,
        description: str = "GCash payment",
        success_url: Optional[str] = None,
        failed_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        NOTE: SBC does not support Alipay. This creates a GCash session instead.
        Rename to /gcash in bot if desired.
        """
        result = await self.create_gcash_session(
            amount=amount,
            description=description,
            success_url=success_url,
            cancel_url=failed_url,
        )
        if result.get("success"):
            result["type"] = "gcash"
            result["qr_url"] = result.get("checkout_url", "")
        return result

    async def create_wechat_qr(
        self,
        amount: float,
        description: str = "Maya payment",
        success_url: Optional[str] = None,
        failed_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        NOTE: SBC does not support WeChat Pay. This creates a Maya session instead.
        Rename to /maya in bot if desired.
        """
        result = await self.create_maya_session(
            amount=amount,
            description=description,
            success_url=success_url,
            cancel_url=failed_url,
        )
        if result.get("success"):
            result["type"] = "maya"
            result["qr_url"] = result.get("checkout_url", "")
        return result

    async def get_session(self, session_id: str) -> Dict[str, Any]:
        """Retrieve a session by ID."""
        return await self._get(f"/v1/sessions/{session_id}")

    async def get_charge(self, charge_id: str) -> Dict[str, Any]:
        """Retrieve a charge by ID."""
        return await self._get(f"/v1/charges/{charge_id}")

    # Legacy alias
    async def get_source(self, source_id: str) -> Dict[str, Any]:
        return await self.get_session(source_id)

