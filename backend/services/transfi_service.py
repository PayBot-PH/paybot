"""
TransFi Checkout payment service — Alipay and WeChat Pay collection via
the TransFi Checkout API.

Authentication
--------------
TransFi Checkout uses API key authentication:
  - Header: Authorization: Bearer <TRANSFI_API_KEY>

Payment invoice creation flow
------------------------------
  1. POST /v2/checkout
     Body includes: amount, currency, payMethod, reqId,
                    notifyUrl, redirectUrl, description, shopperId
     Returns: checkoutUrl, invoiceId, status

  2. Redirect user to the returned checkoutUrl.

  3. User completes payment via Alipay or WeChat QR on the hosted page.

  4. TransFi sends a POST to notifyUrl with the payment result.
     Verify with HMAC-SHA256 using TRANSFI_WEBHOOK_SECRET if configured.

Environment variables
---------------------
  TRANSFI_API_KEY       — API key (required; found in TransFi dashboard > Settings > Integration)
  TRANSFI_BASE_URL      — Override API base URL (optional; defaults derived from TRANSFI_MODE)
  TRANSFI_WEBHOOK_SECRET — HMAC secret for verifying incoming webhooks (optional but recommended)
  TRANSFI_MODE          — "sandbox" or "production" (default: "production")

Docs: https://transfi-checkout.readme.io/docs/getting-started
API:  https://transfi-checkout.readme.io/reference/createpaymentinvoice
"""
import hashlib
import hmac
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# Base URLs for each environment
_TRANSFI_PRODUCTION_URL = "https://api.transfi.com"
_TRANSFI_SANDBOX_URL = "https://sandbox-api.transfi.com"

# API path for creating a payment invoice
_CREATE_INVOICE_PATH = "/v2/checkout"


class TransFiService:
    """Service for TransFi Checkout — Alipay and WeChat Pay collection."""

    def __init__(self):
        self.api_key = os.environ.get("TRANSFI_API_KEY", "")
        self.webhook_secret = os.environ.get("TRANSFI_WEBHOOK_SECRET", "")
        # "production" (default) or "sandbox"
        self.mode = os.environ.get("TRANSFI_MODE", "production").lower().strip()
        # Explicit base URL override (empty = derive from mode)
        self._base_url_override = os.environ.get("TRANSFI_BASE_URL", "").rstrip("/")

        # Try settings fallback for any values not already found in os.environ
        try:
            from core.config import settings
            if not self.api_key:
                self.api_key = getattr(settings, "transfi_api_key", "") or ""
            if not self.webhook_secret:
                self.webhook_secret = getattr(settings, "transfi_webhook_secret", "") or ""
            if not self._base_url_override:
                self._base_url_override = (getattr(settings, "transfi_base_url", "") or "").rstrip("/")
            if self.mode == "production":
                self.mode = (getattr(settings, "transfi_mode", "production") or "production").lower().strip()
        except Exception:
            pass

        if not self.api_key:
            logger.warning(
                "TRANSFI_API_KEY not configured — TransFi API calls will fail"
            )

    @property
    def is_configured(self) -> bool:
        """Return True when the API key is present."""
        return bool(self.api_key)

    @property
    def base_url(self) -> str:
        """Return the effective TransFi API base URL (no trailing slash)."""
        if self._base_url_override:
            return self._base_url_override
        if self.mode == "sandbox":
            return _TRANSFI_SANDBOX_URL
        return _TRANSFI_PRODUCTION_URL

    def _auth_headers(self) -> Dict[str, str]:
        """Return HTTP headers for authenticated API calls."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_payment_invoice(
        self,
        amount: float,
        currency: str,
        pay_method: str,
        req_id: str,
        notify_url: str,
        redirect_url: str,
        description: str = "",
        shopper_id: str = "guest",
    ) -> Dict[str, Any]:
        """
        Create a TransFi Checkout payment invoice.

        Args:
            amount:       Payment amount (decimal, e.g. 500.00 for ₱500).
            currency:     ISO-4217 currency code (e.g. "PHP", "USD", "CNY").
            pay_method:   TransFi payment method string ("Alipay" or "WeChat").
            req_id:       Unique merchant order ID.
            notify_url:   Webhook URL TransFi will POST the payment result to.
            redirect_url: URL to redirect the user after payment.
            description:  Human-readable payment description.
            shopper_id:   Shopper/user identifier (e.g. Telegram chat_id or user ID).

        Returns:
            On success: {"success": True, "checkout_url": str, "invoice_id": str, "req_id": str}
            On failure: {"success": False, "error": str}
        """
        if not self.is_configured:
            return {"success": False, "error": "TransFi API key not configured"}

        url = f"{self.base_url}{_CREATE_INVOICE_PATH}"
        payload = {
            "amount": amount,
            "currency": currency,
            "payMethod": pay_method,
            "reqId": req_id,
            "notifyUrl": notify_url,
            "redirectUrl": redirect_url,
            "description": description or f"{pay_method} payment",
            "shopperId": str(shopper_id),
        }

        logger.info(
            "TransFi create_payment_invoice: pay_method=%s amount=%s %s req_id=%s",
            pay_method,
            amount,
            currency,
            req_id,
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=self._auth_headers())

            if resp.status_code in (200, 201):
                data = resp.json()
                checkout_url = (
                    data.get("checkoutUrl")
                    or data.get("checkout_url")
                    or data.get("paymentUrl")
                    or data.get("invoiceUrl")
                    or ""
                )
                invoice_id = (
                    data.get("invoiceId")
                    or data.get("invoice_id")
                    or data.get("id")
                    or req_id
                )
                if not checkout_url:
                    logger.error(
                        "TransFi: no checkout URL in response (req_id=%s): %s",
                        req_id,
                        str(data)[:300],
                    )
                    return {
                        "success": False,
                        "error": "TransFi response missing checkout URL",
                    }
                logger.info(
                    "TransFi invoice created: invoice_id=%s req_id=%s", invoice_id, req_id
                )
                return {
                    "success": True,
                    "checkout_url": checkout_url,
                    "invoice_id": invoice_id,
                    "req_id": req_id,
                }
            else:
                body_text = resp.text[:500]
                logger.error(
                    "TransFi create_payment_invoice HTTP %s (req_id=%s): %s",
                    resp.status_code,
                    req_id,
                    body_text,
                )
                # Attempt to extract a message from the error body
                error_msg = f"TransFi HTTP {resp.status_code}"
                try:
                    err_data = resp.json()
                    error_msg = (
                        err_data.get("message")
                        or err_data.get("error")
                        or err_data.get("detail")
                        or error_msg
                    )
                except Exception:
                    pass
                return {"success": False, "error": error_msg}

        except httpx.TimeoutException:
            logger.error("TransFi create_payment_invoice: request timed out (req_id=%s)", req_id)
            return {"success": False, "error": "TransFi request timed out"}
        except httpx.RequestError as exc:
            logger.error("TransFi create_payment_invoice: network error (req_id=%s): %s", req_id, exc)
            return {"success": False, "error": f"TransFi network error: {exc}"}
        except Exception as exc:
            logger.exception("TransFi create_payment_invoice: unexpected error (req_id=%s): %s", req_id, exc)
            return {"success": False, "error": f"TransFi unexpected error: {exc}"}

    async def create_alipay_invoice(
        self,
        amount: float,
        currency: str = "PHP",
        description: str = "",
        notify_url: str = "",
        redirect_url: str = "",
        shopper_id: str = "guest",
    ) -> Dict[str, Any]:
        """Create a payment invoice for Alipay."""
        req_id = f"tf-alipay-{uuid.uuid4().hex[:16]}"
        return await self.create_payment_invoice(
            amount=amount,
            currency=currency,
            pay_method="Alipay",
            req_id=req_id,
            notify_url=notify_url,
            redirect_url=redirect_url,
            description=description or "Alipay payment",
            shopper_id=shopper_id,
        )

    async def create_wechat_invoice(
        self,
        amount: float,
        currency: str = "PHP",
        description: str = "",
        notify_url: str = "",
        redirect_url: str = "",
        shopper_id: str = "guest",
    ) -> Dict[str, Any]:
        """Create a payment invoice for WeChat Pay."""
        req_id = f"tf-wechat-{uuid.uuid4().hex[:16]}"
        return await self.create_payment_invoice(
            amount=amount,
            currency=currency,
            pay_method="WeChat",
            req_id=req_id,
            notify_url=notify_url,
            redirect_url=redirect_url,
            description=description or "WeChat Pay payment",
            shopper_id=shopper_id,
        )

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        """
        Verify a TransFi webhook signature using HMAC-SHA256.

        TransFi signs webhook payloads with HMAC-SHA256 using the webhook secret.
        The signature is passed in the X-TransFi-Signature header.

        Args:
            raw_body:  Raw request body bytes.
            signature: Value of the X-TransFi-Signature header (hex digest).

        Returns:
            True if the signature is valid, False otherwise.
        """
        if not self.webhook_secret:
            logger.warning("TransFi webhook: no webhook secret configured — signature verification skipped")
            return False

        try:
            expected = hmac.new(
                self.webhook_secret.encode(),
                raw_body,
                hashlib.sha256,
            ).hexdigest()
            # hexdigest() returns lowercase; normalise the provided signature as well
            return hmac.compare_digest(expected, signature.strip().lower())
        except Exception as exc:
            logger.warning("TransFi webhook signature verification error: %s", exc)
            return False
