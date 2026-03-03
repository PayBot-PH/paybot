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
        if not self.secret_key:
            try:
                from core.config import settings
                self.secret_key = settings.paymongo_secret_key
            except (AttributeError, ImportError) as e:
                logger.warning(f"Failed to get PAYMONGO_SECRET_KEY via settings: {e}")
        if not self.secret_key:
            logger.warning("PAYMONGO_SECRET_KEY not configured — PayMongo API calls will fail")

        self.webhook_secret = os.environ.get("PAYMONGO_WEBHOOK_SECRET", "")
        if not self.webhook_secret:
            try:
                from core.config import settings
                self.webhook_secret = settings.paymongo_webhook_secret
            except (AttributeError, ImportError):
                pass

        self.mode = os.environ.get("PAYMONGO_MODE", "test")
        try:
            from core.config import settings
            self.mode = settings.paymongo_mode or self.mode
        except (AttributeError, ImportError):
            pass

    def _get_auth(self):
        return (self.secret_key, "")

    # ------------------------------------------------------------------
    # Webhook signature verification
    # ------------------------------------------------------------------

    def verify_webhook_signature(
        self,
        raw_body: bytes,
        signature_header: str,
        tolerance_seconds: int = 300,
    ) -> bool:
        """Verify a PayMongo webhook request signature.

        Args:
            raw_body: The raw (un-decoded) request body bytes.
            signature_header: Value of the ``Paymongo-Signature`` header.
            tolerance_seconds: Maximum age of a valid request (default 5 min).

        Returns:
            True if the signature is valid and the request is fresh.

        Raises:
            ValueError: If the webhook secret is not configured.
        """
        if not self.webhook_secret:
            raise ValueError("PAYMONGO_WEBHOOK_SECRET is not configured")

        # Parse header: t=<ts>,te=<sig>,li=<sig>
        parts: Dict[str, str] = {}
        for part in signature_header.split(","):
            if "=" in part:
                k, v = part.split("=", 1)
                parts[k.strip()] = v.strip()

        timestamp_str = parts.get("t", "")
        if not timestamp_str:
            logger.warning("PayMongo signature header missing timestamp")
            return False

        # Guard against replay attacks
        try:
            ts = int(timestamp_str)
        except ValueError:
            return False
        if abs(time.time() - ts) > tolerance_seconds:
            logger.warning("PayMongo webhook timestamp outside tolerance window")
            return False

        # Compute expected signature
        signed_payload = f"{timestamp_str}.{raw_body.decode('utf-8', errors='replace')}"
        expected = hmac.new(
            self.webhook_secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Check against test or live signature depending on mode
        sig_key = "li" if self.mode == "live" else "te"
        received = parts.get(sig_key, "")
        if not received:
            # Fall back: try the other key if current mode key is absent
            alt_key = "te" if sig_key == "li" else "li"
            received = parts.get(alt_key, "")

        if not received:
            logger.warning("PayMongo signature header missing signature value")
            return False

        return hmac.compare_digest(expected, received)

    # ------------------------------------------------------------------
    # Checkout Session (card, GCash, Maya, and more)
    # ------------------------------------------------------------------

    async def create_checkout_session(
        self,
        amount: float,
        description: str = "Wallet Top Up",
        success_url: str = "",
        cancel_url: str = "",
        payment_method_types: Optional[list] = None,
        reference_number: str = "",
        currency: str = "PHP",
        customer_email: str = "",
        customer_name: str = "",
    ) -> Dict[str, Any]:
        """Create a PayMongo Checkout Session for multi-method payments.

        Supports: gcash, paymaya, card, dob, brankas_*, billease, etc.

        Args:
            amount: Amount in PHP.
            description: Line-item description shown on checkout page.
            success_url: Where PayMongo redirects after successful payment.
            cancel_url: Where PayMongo redirects on cancel/failure.
            payment_method_types: List of payment types to accept.
            reference_number: Internal reference; stored in metadata.
            currency: Currency code (default PHP).
            customer_email: Pre-fill customer e-mail.
            customer_name: Pre-fill customer name.

        Returns:
            dict with success, checkout_session_id, checkout_url, reference_number
        """
        if not reference_number:
            reference_number = f"pm-cs-{uuid.uuid4().hex[:12]}"
        if payment_method_types is None:
            payment_method_types = list(DEFAULT_CHECKOUT_PAYMENT_METHODS)

        amount_centavos = int(round(amount * 100))

        backend_url = ""
        try:
            from core.config import settings
            backend_url = settings.backend_url
        except Exception:
            pass

        line_item = {
            "currency": currency,
            "amount": amount_centavos,
            "name": description or "Wallet Top Up",
            "quantity": 1,
        }

        attributes: Dict[str, Any] = {
            "billing": {},
            "cancel_url": cancel_url or f"{backend_url}/api/v1/paymongo/redirect/failed",
            "description": description or "Wallet Top Up",
            "line_items": [line_item],
            "payment_method_types": payment_method_types,
            "success_url": success_url or f"{backend_url}/api/v1/paymongo/redirect/success",
            "metadata": {"reference_number": reference_number},
        }

        if customer_email:
            attributes["billing"]["email"] = customer_email
        if customer_name:
            attributes["billing"]["name"] = customer_name

        payload = {"data": {"attributes": attributes}}

        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{PAYMONGO_BASE_URL}/checkout_sessions",
                    json=payload,
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})
                attrs = data.get("attributes", {})
                return {
                    "success": True,
                    "checkout_session_id": data.get("id", ""),
                    "reference_number": reference_number,
                    "checkout_url": attrs.get("checkout_url", ""),
                    "amount": amount,
                    "currency": currency,
                    "status": attrs.get("status", "active"),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"PayMongo checkout session creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"PayMongo checkout session creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # Sources (Alipay / WeChat)
    # ------------------------------------------------------------------

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

    async def list_payments(self, limit: int = 50) -> Dict[str, Any]:
        """Fetch recent payments from the PayMongo account.

        Args:
            limit: Maximum number of payments to retrieve (capped at 100).

        Returns:
            dict with success and data (list of payment objects).
        """
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{PAYMONGO_BASE_URL}/payments",
                    params={"limit": min(limit, 100)},
                    auth=self._get_auth(),
                    timeout=30.0,
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
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{PAYMONGO_BASE_URL}/balance",
                    auth=self._get_auth(),
                    timeout=30.0,
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
