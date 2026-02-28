"""
PayMongo payment service — Alipay and WeChat Pay QR code generation.

PayMongo Sources API is used to create redirectable payment sessions.
- Alipay: type="alipay"
- WeChat Pay: type="wechat"

Docs: https://developers.paymongo.com/reference/the-sources-object
"""
import logging
import os
import uuid
from typing import Any, Dict

import httpx

logger = logging.getLogger(__name__)

PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"


class PayMongoService:
    """Service for PayMongo payment API — Alipay and WeChat Pay QR."""

    def __init__(self):
        self.secret_key = os.environ.get("PAYMONGO_SECRET_KEY", "")
        if not self.secret_key:
            try:
                from core.config import settings
                self.secret_key = settings.paymongo_secret_key
            except (AttributeError, ImportError) as e:
                logger.warning(f"Failed to get PAYMONGO_SECRET_KEY via settings: {e}")
        if not self.secret_key:
            logger.warning("PAYMONGO_SECRET_KEY not configured — PayMongo API calls will fail")

    def _get_auth(self):
        return (self.secret_key, "")

    async def create_source(
        self,
        amount: float,
        payment_type: str,
        description: str = "",
        success_url: str = "",
        failed_url: str = "",
        currency: str = "PHP",
    ) -> Dict[str, Any]:
        """
        Create a PayMongo Source for Alipay or WeChat Pay.

        Args:
            amount: Amount in PHP (e.g. 500.00)
            payment_type: "alipay" or "wechat"
            description: Payment description
            success_url: Redirect URL on success
            failed_url: Redirect URL on failure/cancel
            currency: Currency code (default PHP)

        Returns:
            dict with success, source_id, checkout_url, reference_number
        """
        reference_number = f"pm-{payment_type}-{uuid.uuid4().hex[:12]}"
        # PayMongo amount is in centavos (smallest unit)
        amount_centavos = int(round(amount * 100))

        backend_url = ""
        try:
            from core.config import settings
            backend_url = settings.backend_url
        except Exception:
            pass

        payload = {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "currency": currency,
                    "type": payment_type,
                    "description": description or payment_type,
                    "redirect": {
                        "success": success_url or f"{backend_url}/api/v1/paymongo/redirect/success",
                        "failed": failed_url or f"{backend_url}/api/v1/paymongo/redirect/failed",
                    },
                    "metadata": {
                        "reference_number": reference_number,
                    },
                }
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{PAYMONGO_BASE_URL}/sources",
                    json=payload,
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})
                attrs = data.get("attributes", {})
                return {
                    "success": True,
                    "source_id": data.get("id", ""),
                    "reference_number": reference_number,
                    "checkout_url": attrs.get("redirect", {}).get("checkout_url", ""),
                    "amount": amount,
                    "currency": currency,
                    "status": attrs.get("status", "pending"),
                    "payment_type": payment_type,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"PayMongo source creation failed ({payment_type}): {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"PayMongo source creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    async def create_alipay_qr(
        self, amount: float, description: str = "",
        success_url: str = "", failed_url: str = "",
    ) -> Dict[str, Any]:
        return await self.create_source(
            amount=amount, payment_type="alipay",
            description=description, success_url=success_url, failed_url=failed_url,
        )

    async def create_wechat_qr(
        self, amount: float, description: str = "",
        success_url: str = "", failed_url: str = "",
    ) -> Dict[str, Any]:
        return await self.create_source(
            amount=amount, payment_type="wechat",
            description=description, success_url=success_url, failed_url=failed_url,
        )

    async def get_source(self, source_id: str) -> Dict[str, Any]:
        """Retrieve a PayMongo source by ID."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{PAYMONGO_BASE_URL}/sources/{source_id}",
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                return {"success": True, "data": r.json().get("data", {})}
        except Exception as e:
            return {"success": False, "error": str(e)}
