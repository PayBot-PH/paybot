import base64
import logging
import os
import uuid
from typing import Any, Dict, Optional

import httpx
from core.config import settings

logger = logging.getLogger(__name__)

MAYA_SANDBOX_BASE_URL = "https://pg-sandbox.paymaya.com/checkout/v1"
MAYA_LIVE_BASE_URL = "https://pg.maya.ph/checkout/v1"


class MayaService:
    """Service for Maya Manager Checkout integration."""

    def __init__(self):
        self.secret_key = os.environ.get("MAYA_SECRET_KEY", "") or settings.maya_secret_key
        self.mode = os.environ.get("MAYA_MODE", "") or settings.maya_mode or "sandbox"
        self.base_url = os.environ.get("MAYA_BASE_URL", "") or settings.maya_base_url.strip()

        if not self.base_url:
            self.base_url = MAYA_LIVE_BASE_URL if self.mode.lower() == "live" else MAYA_SANDBOX_BASE_URL

        if not self.secret_key:
            logger.warning("MAYA_SECRET_KEY not configured - Maya API calls will fail")

    def _get_auth_headers(self) -> Dict[str, str]:
        if not self.secret_key:
            return {}
        encoded = base64.b64encode(f"{self.secret_key}:".encode("utf-8")).decode("ascii")
        return {"Authorization": f"Basic {encoded}"}

    def _amount_value(self, amount: float) -> int:
        return int(round(amount * 100))

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
        channel_code: str = "",
        customer_name: str = "",
        customer_email: str = "",
        mobile_number: str = "",
        external_id: str = "",
        success_redirect_url: str = "",
        failure_redirect_url: str = "",
        cancel_redirect_url: str = "",
    ) -> Dict[str, Any]:
        if not external_id:
            external_id = f"maya-{uuid.uuid4().hex[:12]}"

        amount_value = self._amount_value(amount)
        redirect_base = settings.backend_url.rstrip("/")
        payload: Dict[str, Any] = {
            "requestReferenceNumber": external_id,
            "totalAmount": {"value": amount_value, "currency": "PHP"},
            "redirectUrl": {
                "success": success_redirect_url or f"{redirect_base}/payment/success",
                "failure": failure_redirect_url or f"{redirect_base}/payment/failed",
                "cancel": cancel_redirect_url or f"{redirect_base}/payment/cancelled",
            },
            "items": [
                {
                    "name": description or "PayBot payment",
                    "code": "PAYBOT",
                    "quantity": 1,
                    "unitPrice": {"value": amount_value, "currency": "PHP"},
                    "totalAmount": {"value": amount_value, "currency": "PHP"},
                }
            ],
            "metadata": {
                "description": description,
                "channel_code": channel_code,
                "customer_name": customer_name,
                "customer_email": customer_email,
            },
        }

        if customer_name or customer_email or mobile_number:
            buyer: Dict[str, str] = {}
            if customer_name:
                buyer["name"] = customer_name
            if customer_email:
                buyer["email"] = customer_email
            if mobile_number:
                buyer["phoneNumber"] = mobile_number
            payload["buyer"] = buyer

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/checkouts",
                    json=payload,
                    headers={**self._get_auth_headers(), "Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
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

    async def create_payment_link(
        self,
        amount: float,
        description: str = "",
        customer_name: str = "",
        customer_email: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=description,
            customer_name=customer_name,
            customer_email=customer_email,
            external_id=external_id,
        )

    async def create_invoice(
        self,
        amount: float,
        description: str = "",
        customer_name: str = "",
        customer_email: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        return await self.create_checkout(
            amount=amount,
            description=description,
            customer_name=customer_name,
            customer_email=customer_email,
            external_id=external_id,
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
        fee_rates: Dict[str, Dict[str, float]] = {
            "invoice": {"percentage": 0.028, "fixed": 0},
            "qr_code": {"percentage": 0.007, "fixed": 0},
            "ewallet": {"percentage": 0.02, "fixed": 0},
            "virtual_account": {"percentage": 0, "fixed": 25},
            "card": {"percentage": 0.035, "fixed": 0},
            "disbursement": {"percentage": 0, "fixed": 25},
            "retail": {"percentage": 0, "fixed": 20},
        }
        rates = fee_rates.get(method, {"percentage": 0.03, "fixed": 0})
        fee = amount * rates["percentage"] + rates["fixed"]
        return {
            "amount": amount,
            "method": method,
            "fee": round(fee, 2),
            "net_amount": round(amount - fee, 2),
            "fee_percentage": rates["percentage"] * 100,
            "fee_fixed": rates["fixed"],
        }

    async def create_disbursement(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return {"success": False, "error": "Maya Manager does not support disbursement via this checkout integration."}

    async def create_refund(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return {"success": False, "error": "Maya Manager does not support refunds through this checkout integration."}
