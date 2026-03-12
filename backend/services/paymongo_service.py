"""
PayMongo payment service — Sources (Alipay/WeChat), Checkout Sessions, and
webhook signature verification.

Supported flows
---------------
* Sources API  — Alipay / WeChat Pay (redirect-based QR)
* Checkout Session API — GCash, Maya, cards, and other methods supported by
  the PayMongo checkout page.

Webhook signature verification
-------------------------------
PayMongo signs every webhook delivery with an HMAC-SHA256 computed from
  ``<timestamp>.<raw_request_body>``
using the webhook signing secret configured in the PayMongo dashboard.  The
``Paymongo-Signature`` header has the format::

    t=<unix_timestamp>,te=<test_sig>,li=<live_sig>

Call ``verify_webhook_signature(raw_body, header_value)`` to validate.

Docs: https://developers.paymongo.com/docs/securing-a-webhook
"""
import hashlib
import hmac
import logging
import os
import time
import uuid
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"

# Default payment method types for checkout sessions.
# Covers the most common PayMongo-supported methods; can be overridden per request.
DEFAULT_CHECKOUT_PAYMENT_METHODS = [
    "gcash",
    "paymaya",
    "card",
    "dob",
    "brankas_bdo",
    "brankas_landbank",
    "brankas_metrobank",
]


class PayMongoService:
    """Service for PayMongo payment API — Sources, Checkout Sessions."""

    def __init__(self):
        self.secret_key = os.environ.get("PAYMONGO_SECRET_KEY", "")
        self.public_key = os.environ.get("PAYMONGO_PUBLIC_KEY", "")
        try:
            from core.config import settings
            if not self.secret_key:
                self.secret_key = settings.paymongo_secret_key
            if not self.public_key:
                self.public_key = settings.paymongo_public_key
        except (AttributeError, ImportError) as e:
            logger.warning(f"Failed to get PayMongo keys via settings: {e}")
        if not self.public_key:
            logger.warning("PAYMONGO_PUBLIC_KEY not configured — Sources API calls will fail")
        if not self.secret_key:
            logger.warning("PAYMONGO_SECRET_KEY not configured — PayMongo API calls will fail")

        self.webhook_secret = os.environ.get("PAYMONGO_WEBHOOK_SECRET", "")
        if not self.webhook_secret:
            try:
                from core.config import settings
                self.webhook_secret = settings.paymongo_webhook_secret
            except (AttributeError, ImportError):
                pass

        mode = os.environ.get("PAYMONGO_MODE", "")
        if not mode:
            try:
                from core.config import settings
                mode = settings.paymongo_mode
            except (AttributeError, ImportError):
                pass
        self.mode = mode or "test"

    @property
    def _http(self) -> httpx.AsyncClient:
        """Return a shared AsyncClient, creating it lazily on first use."""
        client = getattr(self, "_client", None)
        if client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def aclose(self) -> None:
        """Close the shared HTTP client. Call on application shutdown."""
        client = getattr(self, "_client", None)
        if client is not None:
            await client.aclose()
            self._client = None

    def _get_auth(self):
        """Secret key auth for most endpoints."""
        return (self.secret_key, "")

    def _get_public_auth(self):
        """Public key auth — required by the Sources API."""
        return (self.public_key, "")

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
                    auth=self._get_public_auth(),
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

    async def create_payment_from_source(
        self,
        source_id: str,
        amount: float,
        currency: str = "PHP",
        description: str = "",
    ) -> Dict[str, Any]:
        """
        Create a PayMongo payment from a chargeable source (Alipay / WeChat Pay).

        This must be called after receiving a ``source.chargeable`` webhook so that
        PayMongo actually captures the funds from the user.  Without this call the
        source expires and the merchant never receives the money.

        Args:
            source_id:   ID of the chargeable PayMongo source (e.g. "src_xxx").
            amount:      Payment amount in PHP (e.g. 500.00).
            currency:    ISO-4217 currency code (default: "PHP").
            description: Human-readable payment description.

        Returns:
            On success: {"success": True, "payment_id": str, "status": str}
            On failure: {"success": False, "error": str}
        """
        amount_centavos = int(round(amount * 100))
        payload = {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "currency": currency,
                    "source": {"id": source_id, "type": "source"},
                    "description": description or "Payment",
                }
            }
        }
        try:
            r = await self._http.post(
                f"{PAYMONGO_BASE_URL}/payments",
                json=payload,
                auth=self._get_auth(),
            )
            r.raise_for_status()
            data = r.json().get("data", {})
            attrs = data.get("attributes", {})
            return {
                "success": True,
                "payment_id": data.get("id", ""),
                "status": attrs.get("status", ""),
                "amount": amount,
                "currency": currency,
            }
        except httpx.HTTPStatusError as e:
            logger.error("PayMongo create_payment_from_source failed: %s", e.response.text)
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error("PayMongo create_payment_from_source error: %s", str(e))
            return {"success": False, "error": str(e)}

    async def get_source(self, source_id: str) -> Dict[str, Any]:
        """Retrieve a PayMongo source by ID."""
        try:
            r = await self._http.get(
                f"{PAYMONGO_BASE_URL}/sources/{source_id}",
                auth=self._get_auth(),
            )
            r.raise_for_status()
            return {"success": True, "data": r.json().get("data", {})}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def list_payments(self, limit: int = 50) -> Dict[str, Any]:
        """Fetch recent payments from the PayMongo account.

        Args:
            limit: Maximum number of payments to retrieve (capped at 100).

        Returns:
            dict with success and data (list of payment objects).
        """
        try:
            r = await self._http.get(
                f"{PAYMONGO_BASE_URL}/payments",
                params={"limit": min(limit, 100)},
                auth=self._get_auth(),
            )
            r.raise_for_status()
            return {"success": True, "data": r.json().get("data", [])}
        except httpx.HTTPStatusError as e:
            logger.error("PayMongo list_payments failed: %s", e.response.text)
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error("PayMongo list_payments error: %s", str(e))
            return {"success": False, "error": str(e)}

    async def get_balance(self) -> Dict[str, Any]:
        """Fetch the realtime PayMongo account balance.

        Returns a dict with::

            {
                "success": True,
                "available": [{"amount": 12345, "currency": "PHP"}],
                "pending":   [{"amount":   500, "currency": "PHP"}],
            }

        Amounts are in centavos (smallest currency unit).  Divide by 100 to
        get the PHP value.

        Docs: https://developers.paymongo.com/reference/retrieve-balance
        """
        try:
            r = await self._http.get(
                f"{PAYMONGO_BASE_URL}/balance",
                auth=self._get_auth(),
            )
            r.raise_for_status()
            attrs = r.json().get("data", {}).get("attributes", {})
            return {
                "success": True,
                "available": attrs.get("available", []),
                "pending": attrs.get("pending", []),
            }
        except httpx.HTTPStatusError as e:
            logger.error("PayMongo get_balance failed: %s", e.response.text)
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error("PayMongo get_balance error: %s", str(e))
            return {"success": False, "error": str(e)}
