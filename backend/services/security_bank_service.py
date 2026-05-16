"""
Security Bank Collect API Service — Apple Pay & Google Pay Integration

This service provides integration with Security Bank's Collect API for:
- Apple Pay payments (iOS wallet)
- Google Pay payments (Android wallet & web)
- QR code-based wallet payments
- Real-time transaction status tracking

Docs: https://api.securitybank.com/docs/collect
"""
import hashlib
import hmac
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional
from datetime import datetime, timedelta

import httpx
from core.config import settings

logger = logging.getLogger(__name__)

SECURITY_BANK_BASE_URL = "https://api.securitybank.com/v1"
SECURITY_BANK_SANDBOX_URL = "https://sandbox.api.securitybank.com/v1"


class SecurityBankService:
    """Service for Security Bank Collect API — Apple Pay, Google Pay, and QR payments."""

    def __init__(self):
        self.api_key = os.environ.get("SECURITY_BANK_API_KEY", "")
        if not self.api_key:
            try:
                self.api_key = settings.security_bank_api_key
            except (AttributeError, ImportError):
                logger.warning("SECURITY_BANK_API_KEY not configured")

        self.api_secret = os.environ.get("SECURITY_BANK_API_SECRET", "")
        if not self.api_secret:
            try:
                self.api_secret = settings.security_bank_api_secret
            except (AttributeError, ImportError):
                logger.warning("SECURITY_BANK_API_SECRET not configured")

        self.merchant_id = os.environ.get("SECURITY_BANK_MERCHANT_ID", "")
        if not self.merchant_id:
            try:
                self.merchant_id = settings.security_bank_merchant_id
            except (AttributeError, ImportError):
                logger.warning("SECURITY_BANK_MERCHANT_ID not configured")

        # Use sandbox or production based on environment
        self.mode = os.environ.get("SECURITY_BANK_MODE", "sandbox")  # "sandbox" or "production"
        try:
            mode = settings.security_bank_mode
            if mode:
                self.mode = mode
        except (AttributeError, ImportError):
            pass

        self.base_url = SECURITY_BANK_SANDBOX_URL if self.mode == "sandbox" else SECURITY_BANK_BASE_URL

    def _generate_signature(self, method: str, path: str, body: str = "", timestamp: str = "") -> str:
        """Generate HMAC-SHA256 signature for Security Bank API requests.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: API endpoint path (e.g., /payments)
            body: Request body JSON string (empty for GET)
            timestamp: ISO 8601 timestamp

        Returns:
            Base64-encoded signature
        """
        if not timestamp:
            timestamp = datetime.utcnow().isoformat() + "Z"

        # Create signature string: METHOD\nPATH\nTIMESTAMP\nBODY
        signature_string = f"{method}\n{path}\n{timestamp}\n{body}"

        # HMAC-SHA256 with secret key
        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            signature_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return signature

    def _get_headers(self, method: str, path: str, body: str = "", timestamp: str = "") -> Dict[str, str]:
        """Build authorization headers for Security Bank API."""
        if not timestamp:
            timestamp = datetime.utcnow().isoformat() + "Z"

        signature = self._generate_signature(method, path, body, timestamp)

        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "X-Merchant-ID": self.merchant_id,
            "X-Signature": signature,
            "X-Timestamp": timestamp,
        }

    # ========================= APPLE PAY =========================

    async def create_apple_pay_session(
        self,
        amount: float,
        description: str = "",
        currency: str = "PHP",
        external_id: str = "",
        success_url: str = "",
        failure_url: str = "",
        customer_email: str = "",
        customer_name: str = "",
    ) -> Dict[str, Any]:
        """Create an Apple Pay payment session.

        Args:
            amount: Payment amount in PHP
            description: Payment description
            currency: Currency code (default: PHP)
            external_id: Merchant's reference ID
            success_url: Redirect URL on successful payment
            failure_url: Redirect URL on failed payment
            customer_email: Customer email
            customer_name: Customer name

        Returns:
            dict with success, session_id, checkout_url, reference_number
        """
        if not external_id:
            external_id = f"applepay-{uuid.uuid4().hex[:12]}"

        backend_url = settings.backend_url if hasattr(settings, "backend_url") else ""

        payload = {
            "merchant_id": self.merchant_id,
            "reference_id": external_id,
            "amount": int(amount * 100),  # Convert to centavos
            "currency": currency,
            "payment_type": "APPLE_PAY",
            "description": description or "Apple Pay Payment",
            "metadata": {
                "reference_number": external_id,
                "customer_email": customer_email,
                "customer_name": customer_name,
            },
            "redirect_urls": {
                "success": success_url or f"{backend_url}/api/v1/security-bank/redirect/success",
                "failure": failure_url or f"{backend_url}/api/v1/security-bank/redirect/failure",
            },
        }

        try:
            body_str = json.dumps(payload)
            headers = self._get_headers("POST", "/payments/apple-pay", body_str)

            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/payments/apple-pay",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "session_id": data.get("session_id", ""),
                    "reference_number": external_id,
                    "checkout_url": data.get("checkout_url", ""),
                    "amount": amount,
                    "currency": currency,
                    "status": data.get("status", "PENDING"),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank Apple Pay creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank Apple Pay creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================= GOOGLE PAY =========================

    async def create_google_pay_session(
        self,
        amount: float,
        description: str = "",
        currency: str = "PHP",
        external_id: str = "",
        success_url: str = "",
        failure_url: str = "",
        customer_email: str = "",
        customer_name: str = "",
    ) -> Dict[str, Any]:
        """Create a Google Pay payment session.

        Args:
            amount: Payment amount in PHP
            description: Payment description
            currency: Currency code (default: PHP)
            external_id: Merchant's reference ID
            success_url: Redirect URL on successful payment
            failure_url: Redirect URL on failed payment
            customer_email: Customer email
            customer_name: Customer name

        Returns:
            dict with success, session_id, checkout_url, reference_number
        """
        if not external_id:
            external_id = f"googlepay-{uuid.uuid4().hex[:12]}"

        backend_url = settings.backend_url if hasattr(settings, "backend_url") else ""

        payload = {
            "merchant_id": self.merchant_id,
            "reference_id": external_id,
            "amount": int(amount * 100),  # Convert to centavos
            "currency": currency,
            "payment_type": "GOOGLE_PAY",
            "description": description or "Google Pay Payment",
            "metadata": {
                "reference_number": external_id,
                "customer_email": customer_email,
                "customer_name": customer_name,
            },
            "redirect_urls": {
                "success": success_url or f"{backend_url}/api/v1/security-bank/redirect/success",
                "failure": failure_url or f"{backend_url}/api/v1/security-bank/redirect/failure",
            },
        }

        try:
            body_str = json.dumps(payload)
            headers = self._get_headers("POST", "/payments/google-pay", body_str)

            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/payments/google-pay",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "session_id": data.get("session_id", ""),
                    "reference_number": external_id,
                    "checkout_url": data.get("checkout_url", ""),
                    "amount": amount,
                    "currency": currency,
                    "status": data.get("status", "PENDING"),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank Google Pay creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank Google Pay creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================= QR CODE / WALLET =========================

    async def create_qr_wallet_payment(
        self,
        amount: float,
        description: str = "",
        currency: str = "PHP",
        external_id: str = "",
        success_url: str = "",
        failure_url: str = "",
        customer_email: str = "",
        customer_name: str = "",
    ) -> Dict[str, Any]:
        """Create a QR code-based wallet payment (for GCash, Maya, etc.).

        Args:
            amount: Payment amount in PHP
            description: Payment description
            currency: Currency code (default: PHP)
            external_id: Merchant's reference ID
            success_url: Redirect URL on successful payment
            failure_url: Redirect URL on failed payment
            customer_email: Customer email
            customer_name: Customer name

        Returns:
            dict with success, qr_id, qr_string, checkout_url, reference_number
        """
        if not external_id:
            external_id = f"qrwallet-{uuid.uuid4().hex[:12]}"

        backend_url = settings.backend_url if hasattr(settings, "backend_url") else ""

        payload = {
            "merchant_id": self.merchant_id,
            "reference_id": external_id,
            "amount": int(amount * 100),  # Convert to centavos
            "currency": currency,
            "payment_type": "QR_WALLET",
            "description": description or "QR Wallet Payment",
            "metadata": {
                "reference_number": external_id,
                "customer_email": customer_email,
                "customer_name": customer_name,
            },
            "redirect_urls": {
                "success": success_url or f"{backend_url}/api/v1/security-bank/redirect/success",
                "failure": failure_url or f"{backend_url}/api/v1/security-bank/redirect/failure",
            },
        }

        try:
            body_str = json.dumps(payload)
            headers = self._get_headers("POST", "/payments/qr-wallet", body_str)

            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/payments/qr-wallet",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "qr_id": data.get("qr_id", ""),
                    "reference_number": external_id,
                    "qr_string": data.get("qr_string", ""),
                    "qr_image_url": data.get("qr_image_url", ""),
                    "checkout_url": data.get("checkout_url", ""),
                    "amount": amount,
                    "currency": currency,
                    "status": data.get("status", "PENDING"),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank QR Wallet creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank QR Wallet creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================= PAYMENT STATUS & RETRIEVAL =========================

    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """Retrieve the current status of a payment.

        Args:
            payment_id: Security Bank payment ID

        Returns:
            dict with success and payment status details
        """
        try:
            headers = self._get_headers("GET", f"/payments/{payment_id}")

            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/payments/{payment_id}",
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "payment_id": payment_id,
                    "status": data.get("status", "UNKNOWN"),
                    "amount": data.get("amount", 0),
                    "currency": data.get("currency", ""),
                    "reference_id": data.get("reference_id", ""),
                    "payment_type": data.get("payment_type", ""),
                    "created_at": data.get("created_at", ""),
                    "updated_at": data.get("updated_at", ""),
                    "data": data,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank get_payment_status failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank get_payment_status error: {str(e)}")
            return {"success": False, "error": str(e)}

    async def get_payment_by_reference(self, reference_id: str) -> Dict[str, Any]:
        """Retrieve payment details by merchant reference ID.

        Args:
            reference_id: Merchant's reference ID

        Returns:
            dict with success and payment details
        """
        try:
            headers = self._get_headers("GET", f"/payments/reference/{reference_id}")

            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/payments/reference/{reference_id}",
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "payment_id": data.get("id", ""),
                    "status": data.get("status", "UNKNOWN"),
                    "amount": data.get("amount", 0),
                    "currency": data.get("currency", ""),
                    "reference_id": reference_id,
                    "payment_type": data.get("payment_type", ""),
                    "data": data,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank get_payment_by_reference failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank get_payment_by_reference error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================= WEBHOOK SIGNATURE VERIFICATION =========================

    def verify_webhook_signature(self, raw_body: str, signature_header: str) -> bool:
        """Verify Security Bank webhook signature.

        Args:
            raw_body: Raw webhook body as string
            signature_header: X-Signature header value

        Returns:
            True if signature is valid
        """
        try:
            expected_signature = hmac.new(
                self.api_secret.encode("utf-8"),
                raw_body.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()

            return hmac.compare_digest(expected_signature, signature_header)
        except Exception as e:
            logger.error(f"Security Bank webhook signature verification error: {str(e)}")
            return False

    # ========================= REFUNDS =========================

    async def create_refund(
        self,
        payment_id: str,
        amount: Optional[float] = None,
        reason: str = "",
    ) -> Dict[str, Any]:
        """Create a refund for a payment.

        Args:
            payment_id: Security Bank payment ID
            amount: Refund amount (if None, full refund)
            reason: Refund reason

        Returns:
            dict with success and refund details
        """
        payload: Dict[str, Any] = {
            "payment_id": payment_id,
            "reason": reason or "REQUESTED_BY_MERCHANT",
        }
        if amount is not None:
            payload["amount"] = int(amount * 100)

        try:
            body_str = json.dumps(payload)
            headers = self._get_headers("POST", "/refunds", body_str)

            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/refunds",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "refund_id": data.get("id", ""),
                    "payment_id": payment_id,
                    "amount": amount,
                    "status": data.get("status", "PENDING"),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank refund creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank refund creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ========================= BALANCE =========================

    async def get_merchant_balance(self) -> Dict[str, Any]:
        """Get merchant account balance.

        Returns:
            dict with success and balance details
        """
        try:
            headers = self._get_headers("GET", "/merchants/balance")

            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/merchants/balance",
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json().get("data", {})

                return {
                    "success": True,
                    "balance": data.get("balance", 0),
                    "currency": data.get("currency", "PHP"),
                    "available": data.get("available", 0),
                    "pending": data.get("pending", 0),
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Security Bank get_merchant_balance failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Security Bank get_merchant_balance error: {str(e)}")
            return {"success": False, "error": str(e)}
