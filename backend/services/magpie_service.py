import logging
import uuid
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class MagpieService:
    """Magpie payment API client.

    This service intentionally avoids Maya/PayMongo dependencies.
    """

    def __init__(self):
        self.api_key = (settings.magpie_api_key or "").strip()
        base_url = (settings.magpie_base_url or "").strip().rstrip("/")
        # Default base URL can be overridden via MAGPIE_BASE_URL.
        self.base_url = base_url or "https://api.magpie.im"

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key:
            return {"success": False, "error": "MAGPIE_API_KEY not configured"}

        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=self._headers())
            if resp.status_code >= 400:
                return {
                    "success": False,
                    "error": f"Magpie API error ({resp.status_code}): {resp.text}",
                }
            data = resp.json() if resp.text else {}
            return {"success": True, "data": data}
        except Exception as exc:
            logger.error("Magpie request failed: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}

    @staticmethod
    def _pick(data: Dict[str, Any], *keys: str) -> Optional[Any]:
        for key in keys:
            if key in data and data[key] not in (None, ""):
                return data[key]
        return None

    def _normalize_checkout_response(self, data: Dict[str, Any], fallback_external_id: str) -> Dict[str, Any]:
        checkout_id = self._pick(data, "checkout_id", "id", "payment_id", "invoice_id", "link_id") or ""
        checkout_url = self._pick(data, "checkout_url", "url", "payment_url", "invoice_url", "link_url") or ""
        external_id = self._pick(data, "external_id", "reference", "reference_id") or fallback_external_id

        return {
            "success": True,
            "checkout_id": str(checkout_id),
            "checkout_url": str(checkout_url),
            "external_id": str(external_id),
            "raw": data,
        }

    def _normalize_qr_response(self, data: Dict[str, Any], fallback_external_id: str) -> Dict[str, Any]:
        qr_id = self._pick(data, "qr_id", "id", "checkout_id") or ""
        qr_content = self._pick(data, "qr_content", "qr_url", "qr_image_url", "payment_url") or ""
        external_id = self._pick(data, "external_id", "reference", "reference_id") or fallback_external_id

        return {
            "success": True,
            "qr_id": str(qr_id),
            "qr_content": str(qr_content),
            "external_id": str(external_id),
            "raw": data,
        }

    async def create_checkout(
        self,
        *,
        amount: float,
        description: str,
        descriptor: str = "",
        merchant_name: str = "",
        customer_name: str = "",
        customer_email: str = "",
        external_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload = {
            "amount": amount,
            "description": description,
            "descriptor": descriptor,
            "merchant_name": merchant_name,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "external_id": external_id,
            "metadata": metadata or {},
        }
        result = await self._post("/v1/payments/checkout", payload)
        if not result.get("success"):
            return result
        return self._normalize_checkout_response(result.get("data", {}), external_id)

    async def create_invoice(self, *, amount: float, description: str = "") -> Dict[str, Any]:
        external_id = f"magpie-inv-{uuid.uuid4().hex[:12]}"
        result = await self.create_checkout(
            amount=amount,
            description=description or "Invoice payment",
            external_id=external_id,
        )
        if not result.get("success"):
            return result
        return {
            "success": True,
            "invoice_id": result.get("checkout_id", ""),
            "invoice_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", external_id),
        }

    async def create_payment_link(self, *, amount: float, description: str = "") -> Dict[str, Any]:
        external_id = f"magpie-link-{uuid.uuid4().hex[:12]}"
        result = await self.create_checkout(
            amount=amount,
            description=description or "Payment link",
            external_id=external_id,
        )
        if not result.get("success"):
            return result
        return {
            "success": True,
            "payment_link_id": result.get("checkout_id", ""),
            "payment_link_url": result.get("checkout_url", ""),
            "external_id": result.get("external_id", external_id),
        }

    async def create_ewallet_charge(
        self,
        *,
        amount: float,
        channel_code: str,
        mobile_number: str = "",
    ) -> Dict[str, Any]:
        external_id = f"magpie-ewallet-{uuid.uuid4().hex[:12]}"
        result = await self._post(
            "/v1/payments/ewallet",
            {
                "amount": amount,
                "channel_code": channel_code,
                "mobile_number": mobile_number,
                "external_id": external_id,
            },
        )
        if not result.get("success"):
            return result
        normalized = self._normalize_checkout_response(result.get("data", {}), external_id)
        return {
            "success": True,
            "checkout_id": normalized.get("checkout_id", ""),
            "checkout_url": normalized.get("checkout_url", ""),
            "external_id": normalized.get("external_id", external_id),
        }

    async def create_refund(self, *, invoice_id: str, amount: float) -> Dict[str, Any]:
        result = await self._post(
            "/v1/payments/refunds",
            {
                "invoice_id": invoice_id,
                "amount": amount,
            },
        )
        if not result.get("success"):
            return result
        data = result.get("data", {})
        return {
            "success": True,
            "refund_id": self._pick(data, "refund_id", "id") or "",
            "status": self._pick(data, "status") or "pending",
        }

    async def get_checkout_status(self, checkout_id: str) -> Dict[str, Any]:
        result = await self._post("/v1/payments/status", {"checkout_id": checkout_id})
        if not result.get("success"):
            return result
        data = result.get("data", {})
        return {
            "success": True,
            "status": str(self._pick(data, "status", "payment_status") or "PENDING"),
            "raw": data,
        }

    async def create_terminal_payment(
        self,
        *,
        amount: float,
        description: str,
        terminal_id: str,
        external_id: str,
        customer_name: str = "",
        customer_email: str = "",
        mobile_number: str = "",
    ) -> Dict[str, Any]:
        result = await self._post(
            "/v1/payments/terminal",
            {
                "amount": amount,
                "description": description,
                "terminal_id": terminal_id,
                "external_id": external_id,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "mobile_number": mobile_number,
            },
        )
        if not result.get("success"):
            return result
        return self._normalize_checkout_response(result.get("data", {}), external_id)

    async def create_card_payment(
        self,
        *,
        amount: float,
        description: str,
        customer_name: str,
        customer_email: str,
        customer_phone: str,
        external_id: str,
    ) -> Dict[str, Any]:
        result = await self._post(
            "/v1/payments/card",
            {
                "amount": amount,
                "description": description,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "customer_phone": customer_phone,
                "external_id": external_id,
            },
        )
        if not result.get("success"):
            return result
        return self._normalize_checkout_response(result.get("data", {}), external_id)

    async def create_payout(
        self,
        *,
        amount: float,
        bank_code: str,
        account_number: str,
        account_name: str,
        description: str,
        external_id: str,
    ) -> Dict[str, Any]:
        result = await self._post(
            "/v1/payouts",
            {
                "amount": amount,
                "bank_code": bank_code,
                "account_number": account_number,
                "account_name": account_name,
                "description": description,
                "external_id": external_id,
            },
        )
        if not result.get("success"):
            return result
        data = result.get("data", {})
        return {
            "success": True,
            "payout_id": self._pick(data, "payout_id", "id") or "",
            "status": self._pick(data, "status") or "processing",
        }

    async def get_balance(self) -> Dict[str, Any]:
        result = await self._post("/v1/account/balance", {})
        if not result.get("success"):
            return result
        data = result.get("data", {})
        available = data.get("available")
        if isinstance(available, list):
            return {"success": True, "available": available}
        php_amount = self._pick(data, "php_balance", "balance")
        return {
            "success": True,
            "available": [{"currency": "PHP", "amount": int(float(php_amount or 0) * 100)}],
        }

    async def create_qr_payment(
        self,
        *,
        amount: float,
        description: str,
        external_id: str,
        payment_methods: Optional[List[str]] = None,
        merchant_name: str = "",
        descriptor: str = "",
    ) -> Dict[str, Any]:
        payload = {
            "amount": amount,
            "description": description,
            "external_id": external_id,
            "payment_methods": payment_methods or ["qrph"],
            "merchant_name": merchant_name,
            "descriptor": descriptor,
        }
        result = await self._post("/v1/payments/qr", payload)
        if not result.get("success"):
            return result
        return self._normalize_qr_response(result.get("data", {}), external_id)


async def run_card_settlement_sweep() -> None:
    # TODO: remove once Magpie migration is confirmed stable (added 2026-07)
    logger.info("Magpie settlement sweep hook executed")
