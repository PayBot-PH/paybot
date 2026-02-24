"""
Maya Business Manager (PayMaya) Service
API: https://pgw.paymaya.com
Auth: HTTP Basic — public key as username, empty password (for checkout sessions)
      HTTP Basic — secret key as username, empty password (for management)
Docs: https://developers.maya.ph/reference/create-checkout

Supports:
  - WeChat Pay QR (paymentType: WECHAT_PAY)
  - Generic QR checkout
"""
import base64
import logging
import uuid
from typing import Any, Dict, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

MAYA_BASE_URL = "https://pgw.paymaya.com"
MAYA_SANDBOX_URL = "https://pg-sandbox.paymaya.com"
MAYA_TIMEOUT = 30.0


class MayaManagerService:
    """
    Maya Business Manager direct API integration.
    Uses MAYA_PUBLIC_KEY / MAYA_SECRET_KEY from environment.
    """

    def __init__(self):
        self.public_key: str = getattr(settings, "maya_public_key", "")
        self.secret_key: str = getattr(settings, "maya_secret_key", "")
        env = getattr(settings, "environment", "dev").lower()
        self.base_url = MAYA_BASE_URL if env == "prod" else MAYA_SANDBOX_URL

    def _public_auth_header(self) -> Dict[str, str]:
        """Basic auth header using public key (for checkout creation)."""
        encoded = base64.b64encode(f"{self.public_key}:".encode()).decode()
        return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json"}

    def _secret_auth_header(self) -> Dict[str, str]:
        """Basic auth header using secret key (for management endpoints)."""
        encoded = base64.b64encode(f"{self.secret_key}:".encode()).decode()
        return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json"}

    async def create_wechat_qr(
        self,
        amount: float,
        description: str = "WeChat Pay",
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a WeChat Pay QR checkout via Maya Business Manager.
        Returns checkout URL and reference number.
        """
        if not self.secret_key:
            return {"success": False, "error": "MAYA_SECRET_KEY is not configured"}

        backend_url = settings.backend_url
        reference_number = f"wechat-{uuid.uuid4().hex[:12]}"

        payload = {
            "totalAmount": {
                "value": round(amount, 2),
                "currency": "PHP",
                "details": {
                    "discount": 0,
                    "serviceCharge": 0,
                    "shippingFee": 0,
                    "tax": 0,
                    "subtotal": round(amount, 2),
                },
            },
            "buyer": {},
            "items": [
                {
                    "name": description or "WeChat Pay",
                    "quantity": 1,
                    "code": reference_number,
                    "description": description or "WeChat Pay",
                    "amount": {
                        "value": round(amount, 2),
                        "details": {"discount": 0, "serviceCharge": 0, "shippingFee": 0, "tax": 0, "subtotal": round(amount, 2)},
                    },
                    "totalAmount": {
                        "value": round(amount, 2),
                        "details": {"discount": 0, "serviceCharge": 0, "shippingFee": 0, "tax": 0, "subtotal": round(amount, 2)},
                    },
                }
            ],
            "redirectUrl": {
                "success": success_url or f"{backend_url}/api/v1/maya/redirect/success",
                "failure": cancel_url or f"{backend_url}/api/v1/maya/redirect/failed",
                "cancel": cancel_url or f"{backend_url}/api/v1/maya/redirect/failed",
            },
            "requestReferenceNumber": reference_number,
            "metadata": {"paymentType": "WECHAT_PAY"},
        }

        try:
            async with httpx.AsyncClient(timeout=MAYA_TIMEOUT) as client:
                resp = await client.post(
                    f"{self.base_url}/checkout/v1/checkouts",
                    json=payload,
                    headers=self._secret_auth_header(),
                )
                data = resp.json()
                if resp.status_code in (200, 201):
                    return {
                        "success": True,
                        "checkout_id": data.get("checkoutId", ""),
                        "checkout_url": data.get("redirectUrl", ""),
                        "reference_number": reference_number,
                        "amount": amount,
                        "qr_url": data.get("redirectUrl", ""),
                    }
                msg = data.get("message", str(data))
                logger.error("Maya API error %s: %s", resp.status_code, msg)
                return {"success": False, "error": msg}
        except httpx.TimeoutException:
            return {"success": False, "error": "Request timed out"}
        except Exception as e:
            logger.error("Maya API exception: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}

    async def get_checkout(self, checkout_id: str) -> Dict[str, Any]:
        """Retrieve a checkout session status."""
        if not self.secret_key:
            return {"success": False, "error": "MAYA_SECRET_KEY is not configured"}
        try:
            async with httpx.AsyncClient(timeout=MAYA_TIMEOUT) as client:
                resp = await client.get(
                    f"{self.base_url}/checkout/v1/checkouts/{checkout_id}",
                    headers=self._secret_auth_header(),
                )
                data = resp.json()
                if resp.status_code == 200:
                    return {"success": True, "data": data}
                return {"success": False, "error": data.get("message", str(data))}
        except Exception as e:
            logger.error("Maya get checkout exception: %s", e, exc_info=True)
            return {"success": False, "error": str(e)}
