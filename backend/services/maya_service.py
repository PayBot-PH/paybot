import base64
import hashlib
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional

import httpx
from core.config import settings

logger = logging.getLogger(__name__)

MAYA_SANDBOX_BASE_URL = "https://pg-sandbox.paymaya.com/checkout/v1"
MAYA_LIVE_BASE_URL = "https://api.paymaya.com/checkout/v1"

# Maya Business API endpoints (Payments/QR/Vault)
MAYA_BUSINESS_SANDBOX_URL = "https://pg-sandbox.paymaya.com"
MAYA_BUSINESS_LIVE_URL = "https://api.paymaya.com"


class MayaService:
    """Service for Maya Manager Checkout integration."""

    def __init__(self):
        self.secret_key = (os.environ.get("MAYA_SECRET_KEY") or getattr(settings, "maya_secret_key", "")).strip()
        self.mode = (os.environ.get("MAYA_MODE") or getattr(settings, "maya_mode", "sandbox")).lower().strip()
        self.base_url = (os.environ.get("MAYA_BASE_URL") or getattr(settings, "maya_base_url", "")).strip()

        self._delegate = None
        if not self.base_url:
            self.base_url = MAYA_LIVE_BASE_URL if self.mode == "live" else MAYA_SANDBOX_BASE_URL
        self.base_url = self.base_url.rstrip("/")

        if not self.secret_key:
            logger.warning("MAYA_SECRET_KEY not configured - Maya API calls will fail")

    def _get_auth_headers(self) -> Dict[str, str]:
        if not self.secret_key:
            return {}
        encoded = base64.b64encode(f"{self.secret_key}:".encode("utf-8")).decode("ascii")
        return {"Authorization": f"Basic {encoded}"}

    def _amount_value(self, amount: float) -> float:
        """Maya Business API uses decimal (major units) for amounts."""
        return round(float(amount), 2)

    def _extract_checkout_url(self, data: Dict[str, Any]) -> str:
        url = data.get("redirectUrl") or data.get("redirect_url") or data.get("checkoutUrl") or data.get("checkout_url") or ""
        if isinstance(url, dict):
            return (
                url.get("web") or url.get("success") or url.get("failure") or url.get("cancel") or ""
            )
        return url or ""

    async def create_checkout(
        self,
        amount: float,
        description: str = "",
        descriptor: str = "",
        merchant_name: str = "",
        channel_code: str = "",
        customer_name: str = "",
        customer_email: str = "",
        mobile_number: str = "",
        external_id: str = "",
        success_redirect_url: str = "",
        failure_redirect_url: str = "",
        cancel_redirect_url: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # Original Maya implementation (unchanged)
        if not external_id:
            external_id = f"maya-{uuid.uuid4().hex[:12]}"

        amount_value = self._amount_value(amount)
        redirect_base = settings.backend_url.rstrip("/")

        clean_descriptor = (descriptor or "").strip().upper()[:22]
        clean_merchant_name = (merchant_name or "").strip()
        item_name = clean_merchant_name or description or "POS Terminal Payment"

        payload: Dict[str, Any] = {
            "requestReferenceNumber": external_id,
            "totalAmount": {"value": amount_value, "currency": "PHP"},
            "redirectUrl": {
                "success": success_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/success",
                "failure": failure_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/failed",
                "cancel": cancel_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/cancelled",
            },
            "items": [
                {
                    "name": item_name,
                    "code": "POS_SALE",
                    "quantity": 1,
                    "unitPrice": {"value": amount_value, "currency": "PHP"},
                    "totalAmount": {"value": amount_value, "currency": "PHP"},
                }
            ],
            "metadata": {
                "description": description,
                "merchant_name": clean_merchant_name,
                "descriptor": clean_descriptor,
                "channel_code": channel_code,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "settlement_type": "T0",
                "terminal_id": metadata.get("terminal_id") if metadata else "POS-1",
                **(metadata or {}),
            },
        }

        # Best-effort field: some Maya setups may surface this on statements.
        if clean_descriptor:
            payload["statementDescriptor"] = clean_descriptor

        if customer_name or customer_email or mobile_number:
            buyer: Dict[str, str] = {}
            if customer_name:
                buyer["name"] = customer_name
            if customer_email:
                buyer["email"] = customer_email
            if mobile_number:
                buyer["phoneNumber"] = mobile_number
            payload["buyer"] = buyer

        # Automatic Auth Detection: Use Business API headers if keys are available
        headers = self._get_business_api_headers()
        if not headers:
            headers = {**self._get_auth_headers(), "Content-Type": "application/json"}
        
        # If using Business API keys, ensure base_url points to the root for the /checkout/v1 path
        api_url = f"{self.base_url}/checkouts"
        if "MAYA_BUSINESS_API_KEY" in os.environ or settings.maya_business_api_key:
             business_base = self._get_business_api_base_url().rstrip("/")
             api_url = f"{business_base}/checkout/v1/checkouts"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    api_url,
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )
                
                if response.status_code >= 400:
                    logger.error(f"Maya API Error ({response.status_code}): {response.text}")
                    return {"success": False, "error": response.text}

                data = response.json()
                return {
                    "success": True,
                    "checkout_id": data.get("id", ""),
                    "checkout_url": self._extract_checkout_url(data),
                    "external_id": external_id,
                    "amount": amount,
                    "status": data.get("status", "CREATED"),
                    "response": data,
                }
        except httpx.HTTPStatusError as exc:
            logger.error("Maya checkout creation failed: %s", exc.response.text)
            return {"success": False, "error": exc.response.text}
        except Exception as exc:
            logger.error("Maya checkout creation error: %s", exc)
            return {"success": False, "error": str(exc)}

    async def get_checkout_status(self, checkout_id: str) -> Dict[str, Any]:
        if not checkout_id:
            return {"success": False, "error": "Missing checkout ID"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/checkouts/{checkout_id}",
                    headers={**self._get_auth_headers(), "Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                return {
                    "success": True,
                    "checkout_id": data.get("id", ""),
                    "external_id": data.get("requestReferenceNumber", ""),
                    "status": (data.get("status") or "").upper(),
                    "response": data,
                }
        except httpx.HTTPStatusError as exc:
            logger.error("Maya checkout status fetch failed: %s", exc.response.text)
            return {"success": False, "error": exc.response.text}
        except Exception as exc:
            logger.error("Maya checkout status fetch error: %s", exc)
            return {"success": False, "error": str(exc)}

    async def create_payment_link(
        self,
        amount: float,
        description: str = "",
        descriptor: str = "",
        merchant_name: str = "",
        customer_name: str = "",
        customer_email: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=description,
            descriptor=descriptor,
            merchant_name=merchant_name,
            customer_name=customer_name,
            customer_email=customer_email,
            external_id=external_id,
        )

    async def create_invoice(
        self,
        amount: float,
        description: str = "",
        descriptor: str = "",
        merchant_name: str = "",
        customer_name: str = "",
        customer_email: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=description,
            descriptor=descriptor,
            merchant_name=merchant_name,
            customer_name=customer_name,
            customer_email=customer_email,
            external_id=external_id,
        )

    async def create_terminal_payment(
        self,
        amount: float,
        description: str = "",
        terminal_id: str = "",
        external_id: str = "",
        customer_name: str = "",
        customer_email: str = "",
        mobile_number: str = "",
    ) -> Dict[str, Any]:
        """Create a real terminal payment with T0 settlement priority."""
        return await self.create_checkout(
            amount=amount,
            description=description or f"Terminal Payment {terminal_id}",
            channel_code="PH_MAYA_POS",
            customer_name=customer_name,
            customer_email=customer_email,
            mobile_number=mobile_number,
            external_id=external_id,
            metadata={
                "terminal_mode": "real",
                "terminal_id": terminal_id,
                "settlement_type": "T0",
                "transaction_type": "POS_SALE",
            },
        )

    async def create_virtual_terminal(
        self,
        amount: float,
        description: str = "",
        customer_name: str = "",
        customer_email: str = "",
        mobile_number: str = "",
        terminal_id: str = "",
        channel_code: str = "PH_MAYA",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=description or "Maya Virtual Terminal",
            channel_code=channel_code,
            customer_name=customer_name,
            customer_email=customer_email,
            mobile_number=mobile_number,
            external_id=external_id,
            metadata={
                "terminal_mode": "virtual",
                "terminal_id": terminal_id,
                "preferred_payment_method": "card",
            },
        )

    async def create_ewallet_charge(
        self,
        amount: float,
        channel_code: str,
        mobile_number: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=f"E-wallet payment ({channel_code})",
            channel_code=channel_code,
            mobile_number=mobile_number,
            external_id=external_id,
        )

    async def get_balance(self, account_type: str = "CASH") -> Dict[str, Any]:
        return {"success": False, "error": "Maya Manager does not support balance lookup through the checkout API."}

    async def get_available_banks(self) -> Dict[str, Any]:
        return {"success": False, "error": "Maya Manager does not provide a bank list through the checkout API."}

    def calculate_fees(self, amount: float, method: str) -> Dict[str, Any]:
        default_rates = {"percentage": 0.005, "fixed": 0.0}  # 0.5% flat fee for all supported payment methods
        rates = default_rates
        fee = amount * rates["percentage"] + rates["fixed"]
        return {
            "amount": amount,
            "method": method,
            "fee": round(fee, 2),
            "net_amount": round(amount - fee, 2),
            "fee_percentage": rates["percentage"] * 100,
            "fee_fixed": rates["fixed"],
        }

    async def create_disbursement(
        self,
        amount: float,
        bank_code: str,
        account_number: str,
        account_name: str,
        description: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        """Simulate or execute a disbursement via Maya Payouts."""
        if not external_id:
            external_id = f"disb-{uuid.uuid4().hex[:12]}"

        # For production, this would call the Maya Payouts API
        # For now, we simulate a successful initiation in sandbox mode
        if self.mode.lower() == "sandbox" or not self.secret_key:
            logger.info(f"Simulating Maya disbursement: {amount} to {bank_code}/{account_number}")
            return {
                "success": True,
                "disbursement_id": f"sim-{uuid.uuid4().hex[:8]}",
                "external_id": external_id,
                "status": "PENDING",
                "amount": amount,
                "message": "Disbursement initiated successfully (Simulation)",
            }

        # Placeholder for real Maya Payouts API call
        return {"success": False, "error": "Maya Payouts API integration pending production validation."}

    async def create_refund(
        self,
        invoice_id: str,
        amount: float,
        reason: str = "",
    ) -> Dict[str, Any]:
        """Process a refund for a Maya checkout."""
        if self.mode.lower() == "sandbox" or not self.secret_key:
            return {
                "success": True,
                "refund_id": f"ref-{uuid.uuid4().hex[:8]}",
                "status": "SUCCESS",
                "amount": amount,
                "message": "Refund processed successfully (Simulation)",
            }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/checkouts/{invoice_id}/refunds",
                    json={"amount": self._amount_value(amount), "reason": reason},
                    headers={**self._get_auth_headers(), "Content-Type": "application/json"},
                    timeout=30.0,
                )
                if response.status_code == 200 or response.status_code == 201:
                    data = response.json()
                    return {
                        "success": True,
                        "refund_id": data.get("id", ""),
                        "status": data.get("status", "SUCCESS"),
                        "amount": amount,
                    }
                return {"success": False, "error": response.text}
        except Exception as exc:
            logger.error("Maya refund error: %s", exc)
            return {"success": False, "error": str(exc)}

    # ============ Maya Business API Methods (Card Payments) ============

    def _get_business_api_headers(self) -> Dict[str, str]:
        """Get headers for Maya Business API requests."""
        api_key = os.environ.get("MAYA_BUSINESS_API_KEY", "") or settings.maya_business_api_key
        secret_key = os.environ.get("MAYA_BUSINESS_SECRET_KEY", "") or settings.maya_business_secret_key
        if not api_key or not secret_key:
            if not api_key:
                logger.warning("MAYA_BUSINESS_API_KEY is not configured")
            if not secret_key:
                logger.warning("MAYA_BUSINESS_SECRET_KEY is not configured")
            return {}
        encoded = base64.b64encode(f"{api_key}:{secret_key}".encode("utf-8")).decode("ascii")
        return {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/json",
        }

    def _get_business_api_base_url(self) -> str:
        """Get Maya Business API base URL."""
        base_url = (
            os.environ.get("MAYA_BUSINESS_BASE_URL", "")
            or settings.maya_business_base_url.strip()
        )
        if base_url:
            return base_url

        mode = (
            os.environ.get("MAYA_BUSINESS_MODE", "")
            or settings.maya_business_mode or "sandbox"
        )
        return (
            MAYA_BUSINESS_LIVE_URL if mode.lower() == "live" else MAYA_BUSINESS_SANDBOX_URL
        )

    async def create_card_payment(
        self,
        amount: float,
        description: str = "",
        customer_name: str = "",
        customer_email: str = "",
        customer_phone: str = "",
        external_id: str = "",
        success_redirect_url: str = "",
        failure_redirect_url: str = "",
        cancel_redirect_url: str = "",
        is_nfc: bool = True,
    ) -> Dict[str, Any]:
        """Create a card payment checkout using Maya Business API.
        
        This method creates a secure checkout session optimized for
        accepting credit/debit card payments via NFC (Tap to Phone) or manual entry.
        """
        api_key = (
            os.environ.get("MAYA_BUSINESS_API_KEY", "")
            or settings.maya_business_api_key
        )
        secret_key = (
            os.environ.get("MAYA_BUSINESS_SECRET_KEY", "")
            or settings.maya_business_secret_key
        )
        if not api_key or not secret_key:
            logger.error("Maya Business API credentials missing for real money transaction")
            return {
                "success": False,
                "error": "Maya Business API key and secret are required for real money transactions",
            }

        if not external_id:
            external_id = f"card-{uuid.uuid4().hex[:12]}"

        # Maya Business API amount is in major units (decimal) for checkouts,
        # but some versions use cents. We'll use the decimal value as per the docs
        # for checkout/v1/checkouts.
        amount_val = self._amount_value(amount)
        redirect_base = settings.backend_url.rstrip("/")

        # Build checkout payload for Maya Business API
        payload = {
            "totalAmount": {
                "value": amount_val,
                "currency": "PHP"
            },
            "buyer": {},
            "redirectUrl": {
                "success": success_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/success",
                "failure": failure_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/failed",
                "cancel": cancel_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/cancelled",
            },
            "requestReferenceNumber": external_id,
            "items": [
                {
                    "name": description or ("Tap to Phone Payment" if is_nfc else "Card Payment"),
                    "code": "CARD_NFC" if is_nfc else "CARD_SALE",
                    "quantity": 1,
                    "unitPrice": {
                        "value": amount_val,
                        "currency": "PHP"
                    },
                    "totalAmount": {
                        "value": amount_val,
                        "currency": "PHP"
                    }
                }
            ],
            "metadata": {
                "description": description,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "customer_phone": customer_phone,
                "payment_type": "TAP_TO_PHONE" if is_nfc else "CARD",
                "settlement_type": "T0", # Standard for Terminal integrations
                "terminal_id": "SOFT_POS_APP"
            }
        }

        # Add buyer details if provided
        if customer_name:
            payload["buyer"]["name"] = customer_name
        if customer_email:
            payload["buyer"]["email"] = customer_email
        if customer_phone:
            payload["buyer"]["phoneNumber"] = customer_phone

        try:
            base_url = self._get_business_api_base_url()
            headers = self._get_business_api_headers()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/checkout/v1/checkouts",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )

                if response.status_code >= 400:
                    error_data = response.json()
                    logger.error(f"Maya Business API Error ({response.status_code}): {error_data}")
                    return {"success": False, "error": error_data.get("message", response.text)}

                data = response.json()

                checkout_url = ""
                # Handle various Maya response formats for checkout URL
                if data.get("redirectUrl"):
                    url_obj = data["redirectUrl"]
                    checkout_url = url_obj if isinstance(url_obj, str) else url_obj.get("web") or url_obj.get("success")
                elif data.get("checkoutUrl"):
                    checkout_url = data["checkoutUrl"]
                elif data.get("redirect_url"):
                    checkout_url = data["redirect_url"]

                return {
                    "success": True,
                    "checkout_id": data.get("id", ""),
                    "checkout_url": checkout_url,
                    "external_id": external_id,
                    "amount": amount,
                    "status": data.get("status", "CREATED"),
                    "response": data,
                }
        except Exception as exc:
            logger.error("Maya Business API checkout creation error: %s", exc)
            return {"success": False, "error": str(exc)}

    async def get_payment_status(self, checkout_id: str) -> Dict[str, Any]:
        """Retrieve the status of a card payment."""
        api_key = (
            os.environ.get("MAYA_BUSINESS_API_KEY", "")
            or settings.maya_business_api_key
        )
        secret_key = (
            os.environ.get("MAYA_BUSINESS_SECRET_KEY", "")
            or settings.maya_business_secret_key
        )
        if not api_key or not secret_key:
            return {
                "success": False,
                "error": "Maya Business API key and secret are required",
            }

        try:
            base_url = self._get_business_api_base_url()
            headers = self._get_business_api_headers()

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{base_url}/checkout/v1/checkouts/{checkout_id}",
                    headers=headers,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                return {
                    "success": True,
                    "checkout_id": data.get("id", ""),
                    "status": data.get("status", ""),
                    "amount": data.get("totalAmount", {}).get("value", 0) / 100,
                    "response": data,
                }
        except httpx.HTTPStatusError as exc:
            logger.error("Maya Business API status check failed: %s", exc.response.text)
            return {"success": False, "error": f"Status check failed: {exc.response.text}"}
        except Exception as exc:
            logger.error("Maya Business API status check error: %s", exc)
            return {"success": False, "error": str(exc)}

    async def create_qr_payment(
        self,
        amount: float,
        description: str = "",
        descriptor: str = "",
        merchant_name: str = "",
        external_id: str = "",
        payment_methods: Optional[list[str]] = None,
        success_redirect_url: str = "",
        failure_redirect_url: str = "",
        cancel_redirect_url: str = "",
    ) -> Dict[str, Any]:
        """Create a Dynamic QR code for payment (PWM).
        
        This is ideal for real terminals where the customer scans a QR on the screen.
        Maya Business QR API usually results in T0 settlement for verified merchants.
        """
        api_key = os.environ.get("MAYA_BUSINESS_API_KEY", "") or settings.maya_business_api_key
        secret_key = (
            os.environ.get("MAYA_BUSINESS_SECRET_KEY", "")
            or settings.maya_business_secret_key
        )
        if not api_key or not secret_key:
            return {
                "success": False,
                "error": "Maya Business API key and secret are required",
            }

        if not external_id:
            external_id = f"qr-{uuid.uuid4().hex[:12]}"

        amount_val = self._amount_value(amount)
        redirect_base = settings.backend_url.rstrip("/")

        clean_descriptor = (descriptor or "").strip().upper()[:22]
        clean_merchant_name = (merchant_name or "").strip()
        item_name = clean_merchant_name or description or "Maya QR Payment"

        payload = {
            "totalAmount": {
                "value": amount_val,
                "currency": "PHP"
            },
            "redirectUrl": {
                "success": success_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/success",
                "failure": failure_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/failed",
                "cancel": cancel_redirect_url or f"{redirect_base}/api/v1/gateway/maya/redirect/cancelled",
            },
            "requestReferenceNumber": external_id,
            "metadata": {
                "description": description,
                "merchant_name": clean_merchant_name,
                "descriptor": clean_descriptor,
                "type": "DYNAMIC_QR",
                "settlement_type": "T0",
                "payment_methods": [m for m in (payment_methods or []) if isinstance(m, str) and m],
            }
        }

        if clean_descriptor:
            payload["statementDescriptor"] = clean_descriptor

        try:
            base_url = self._get_business_api_base_url()
            headers = self._get_business_api_headers()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/checkout/v1/checkouts",
                    json={
                        **payload,
                        "items": [
                            {
                                "name": item_name,
                                "code": "QR",
                                "quantity": 1,
                                "unitPrice": {"value": amount_val, "currency": "PHP"},
                                "totalAmount": {"value": amount_val, "currency": "PHP"},
                            }
                        ],
                    },
                    headers=headers,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                checkout_url = ""
                if isinstance(data.get("redirectUrl"), dict):
                    checkout_url = data["redirectUrl"].get("success", "")
                elif isinstance(data.get("checkoutUrl"), str):
                    checkout_url = data["checkoutUrl"]
                elif isinstance(data.get("redirect_url"), str):
                    checkout_url = data["redirect_url"]

                return {
                    "success": True,
                    "qr_id": data.get("id", ""),
                    "qr_content": data.get("qrCodeBody") or data.get("qrContent", ""),
                    "redirect_url": checkout_url,
                    "external_id": external_id,
                    "amount": amount,
                    "status": data.get("status", "CREATED"),
                    "response": data,
                }
        except httpx.HTTPStatusError as exc:
            logger.error("Maya QR creation failed: %s", exc.response.text)
            return {"success": False, "error": exc.response.text}
        except Exception as exc:
            logger.error("Maya QR creation error: %s", exc)
            return {"success": False, "error": str(exc)}
