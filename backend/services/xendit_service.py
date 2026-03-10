import logging
import uuid
from typing import Any, Dict, List, Optional

import httpx
from core.config import settings

logger = logging.getLogger(__name__)

XENDIT_BASE_URL = "https://api.xendit.co"


class XenditService:
    """Service for Xendit payment API integration — full gateway features"""

    def __init__(self):
        self.secret_key = settings.xendit_secret_key
        if not self.secret_key:
            logger.warning("XENDIT_SECRET_KEY not configured - Xendit API calls will fail")

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
        if not self.secret_key:
            raise ValueError(
                "XENDIT_SECRET_KEY is not configured. "
                "Set it in your .env file or as an environment variable."
            )
        return (self.secret_key, "")

    # ==================== INVOICES ====================
    async def create_invoice(
        self, amount: float, description: str,
        customer_name: str = "", customer_email: str = "",
        external_id: str = "",
    ) -> Dict[str, Any]:
        if not external_id:
            external_id = f"inv-{uuid.uuid4().hex[:12]}"
        payload: Dict[str, Any] = {
            "external_id": external_id, "amount": amount,
            "description": description, "currency": "PHP",
        }
        if customer_name:
            payload["customer"] = {"given_names": customer_name}
            if customer_email:
                payload["customer"]["email"] = customer_email
        if customer_email:
            payload["payer_email"] = customer_email
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/v2/invoices", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "invoice_id": d.get("id", ""), "invoice_url": d.get("invoice_url", ""),
                    "external_id": external_id, "amount": amount, "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            logger.error(f"Xendit invoice creation failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Xendit invoice creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    async def get_invoice(self, invoice_id: str) -> Dict[str, Any]:
        try:
            r = await self._http.get(f"{XENDIT_BASE_URL}/v2/invoices/{invoice_id}", auth=self._get_auth())
            r.raise_for_status()
            return {"success": True, "data": r.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def expire_invoice(self, invoice_id: str) -> Dict[str, Any]:
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/invoices/{invoice_id}/expire!", auth=self._get_auth())
            r.raise_for_status()
            return {"success": True, "data": r.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== QR CODES ====================
    async def create_qr_code(self, amount: float, description: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"qr-{uuid.uuid4().hex[:12]}"
        payload: Dict[str, Any] = {"reference_id": external_id, "type": "DYNAMIC", "currency": "PHP", "amount": amount}
        if description:
            payload["metadata"] = {"description": description}
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/qr_codes", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "qr_id": d.get("id", ""), "qr_string": d.get("qr_string", ""),
                    "external_id": external_id, "amount": amount, "status": d.get("status", "ACTIVE")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def create_alipay_qr(self, amount: float, description: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"alipay-{uuid.uuid4().hex[:12]}"
        return await self.create_qr_code(amount=amount, description=description, external_id=external_id)

    # ==================== PAYMENT LINKS ====================
    async def create_payment_link(self, amount: float, description: str = "",
                                   customer_name: str = "", customer_email: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"pl-{uuid.uuid4().hex[:12]}"
        payload: Dict[str, Any] = {"external_id": external_id, "amount": amount, "description": description or "Payment", "currency": "PHP"}
        if customer_email:
            payload["payer_email"] = customer_email
        if customer_name:
            payload["customer"] = {"given_names": customer_name}
            if customer_email:
                payload["customer"]["email"] = customer_email
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/v2/invoices", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "payment_link_id": d.get("id", ""), "payment_link_url": d.get("invoice_url", ""),
                    "external_id": external_id, "amount": amount, "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== VIRTUAL ACCOUNTS ====================
    async def create_virtual_account(self, amount: float, bank_code: str, name: str,
                                      external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"va-{uuid.uuid4().hex[:12]}"
        payload = {
            "external_id": external_id, "bank_code": bank_code,
            "name": name, "expected_amount": amount,
            "is_closed": True, "is_single_use": True,
            "currency": "PHP",
        }
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/callback_virtual_accounts", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "va_id": d.get("id", ""), "account_number": d.get("account_number", ""),
                    "bank_code": bank_code, "external_id": external_id, "amount": amount,
                    "name": d.get("name", name), "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== E-WALLET CHARGES ====================
    async def create_ewallet_charge(self, amount: float, channel_code: str,
                                     mobile_number: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"ew-{uuid.uuid4().hex[:12]}"
        callback_url = f"{settings.backend_url}/api/v1/xendit/webhook"
        payload: Dict[str, Any] = {
            "reference_id": external_id, "currency": "PHP", "amount": amount,
            "checkout_method": "ONE_TIME_PAYMENT",
            "channel_code": channel_code,
            "channel_properties": {},
            "callback_url": callback_url,
        }
        if mobile_number:
            payload["channel_properties"]["mobile_number"] = mobile_number
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/ewallets/charges", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            actions = d.get("actions", {})
            checkout_url = ""
            if isinstance(actions, dict):
                checkout_url = actions.get("desktop_web_checkout_url", "") or actions.get("mobile_web_checkout_url", "") or actions.get("mobile_deeplink_checkout_url", "")
            return {"success": True, "charge_id": d.get("id", ""), "external_id": external_id,
                    "amount": amount, "channel_code": channel_code,
                    "checkout_url": checkout_url, "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== DISBURSEMENTS ====================
    async def create_disbursement(self, amount: float, bank_code: str,
                                   account_number: str, account_name: str,
                                   description: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"disb-{uuid.uuid4().hex[:12]}"
        callback_url = f"{settings.backend_url}/api/v1/xendit/webhook"
        payload = {
            "external_id": external_id, "amount": amount,
            "bank_code": bank_code, "account_holder_name": account_name,
            "account_number": account_number, "description": description or "Disbursement",
            "callback_url": callback_url,
        }
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/disbursements", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "disbursement_id": d.get("id", ""), "external_id": external_id,
                    "amount": amount, "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_disbursement(self, disbursement_id: str) -> Dict[str, Any]:
        try:
            r = await self._http.get(f"{XENDIT_BASE_URL}/disbursements/{disbursement_id}", auth=self._get_auth())
            r.raise_for_status()
            return {"success": True, "data": r.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== REFUNDS ====================
    async def create_refund(self, invoice_id: str, amount: float, reason: str = "") -> Dict[str, Any]:
        external_id = f"ref-{uuid.uuid4().hex[:12]}"
        payload: Dict[str, Any] = {
            "invoice_id": invoice_id, "amount": amount, "reason": reason or "REQUESTED_BY_CUSTOMER",
        }
        try:
            r = await self._http.post(f"{XENDIT_BASE_URL}/refunds", json=payload, auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "refund_id": d.get("id", ""), "external_id": external_id,
                    "amount": amount, "status": d.get("status", "PENDING")}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": e.response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== BALANCE ====================
    async def get_balance(self, account_type: str = "CASH") -> Dict[str, Any]:
        try:
            r = await self._http.get(f"{XENDIT_BASE_URL}/balance?account_type={account_type}", auth=self._get_auth())
            r.raise_for_status()
            d = r.json()
            return {"success": True, "balance": d.get("balance", 0)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== AVAILABLE BANKS ====================
    async def get_available_banks(self) -> Dict[str, Any]:
        try:
            r = await self._http.get(f"{XENDIT_BASE_URL}/available_disbursements_banks", auth=self._get_auth())
            r.raise_for_status()
            return {"success": True, "banks": r.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== FEE CALCULATION ====================
    def calculate_fees(self, amount: float, method: str) -> Dict[str, Any]:
        """Calculate estimated fees for different payment methods (PH rates)"""
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
            "amount": amount, "method": method,
            "fee": round(fee, 2), "net_amount": round(amount - fee, 2),
            "fee_percentage": rates["percentage"] * 100, "fee_fixed": rates["fixed"],
        }

    # ==================== KYC / CUSTOMER ====================
    async def create_customer(
        self,
        reference_id: str,
        given_names: str,
        email: str,
        mobile_number: Optional[str] = None,
        description: str = "",
        nationality: str = "PH",
    ) -> Dict[str, Any]:
        """Create or update a Xendit customer record for KYC purposes.

        Uses the Xendit v2 Customers API.  Returns the created customer object on
        success or a ``{"success": False, "error": ...}`` dict on failure.
        """
        payload: Dict[str, Any] = {
            "reference_id": reference_id,
            "type": "INDIVIDUAL",
            "individual_detail": {
                "given_names": given_names,
                "nationality": nationality,
            },
            "email": email,
            "description": description or f"KYC registration for {given_names}",
        }
        if mobile_number:
            payload["mobile_number"] = mobile_number
        try:
            r = await self._http.post(
                f"{XENDIT_BASE_URL}/customers",
                json=payload,
                auth=self._get_auth(),
            )
            r.raise_for_status()
            d = r.json()
            return {"success": True, "customer_id": d.get("id", ""), "data": d}
        except httpx.HTTPStatusError as e:
            logger.error("Xendit create_customer failed: %s", e.response.text)
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error("Xendit create_customer error: %s", e)
            return {"success": False, "error": str(e)}