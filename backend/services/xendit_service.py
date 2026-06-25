"""
Xendit service wrapper — invoices, virtual accounts, QR, disbursements, and webhook helpers.
Reads XENDIT_SECRET_KEY from settings or environment and performs Basic Auth using the secret key as username.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

XENDIT_BASE_URL = "https://api.xendit.co"


class XenditService:
    def __init__(self, secret_key: Optional[str] = None):
        self.secret_key = (secret_key or os.environ.get("XENDIT_SECRET_KEY") or getattr(settings, "xendit_secret_key", "")).strip()
        if not self.secret_key:
            logger.warning("XENDIT_SECRET_KEY not configured - Xendit API calls will fail")
        self.base_url = os.environ.get("XENDIT_BASE_URL", XENDIT_BASE_URL).rstrip("/")

    def _auth(self):
        # Xendit uses basic auth with API key as username and empty password
        return (self.secret_key, "")

    async def create_invoice(self, amount: float, external_id: str = "", payer_email: str = "", description: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"xendit-inv-{uuid.uuid4().hex[:12]}"
        payload = {
            "external_id": external_id,
            "amount": int(round(amount)),
            "payer_email": payer_email,
            "description": description or "Invoice",
        }
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(f"{self.base_url}/v2/invoices", json=payload, auth=self._auth(), timeout=30.0)
                r.raise_for_status()
                data = r.json()
                return {
                    "success": True,
                    "invoice_id": data.get("id") or data.get("external_id") or "",
                    "external_id": external_id,
                    "payment_url": data.get("invoice_url") or data.get("url") or "",
                    "response": data,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Xendit create_invoice failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Xendit create_invoice error: {e}")
            return {"success": False, "error": str(e)}

    async def create_virtual_account(self, amount: float, bank_code: str, account_name: str = "", external_id: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"xendit-va-{uuid.uuid4().hex[:12]}"
        payload = {
            "external_id": external_id,
            "bank_code": bank_code,
            "name": account_name or "VA Account",
            "expected_amount": int(round(amount)),
        }
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(f"{self.base_url}/callback_virtual_accounts", json=payload, auth=self._auth(), timeout=30.0)
                if r.status_code == 404:
                    r = await client.post(f"{self.base_url}/fixed_virtual_accounts", json=payload, auth=self._auth(), timeout=30.0)
                r.raise_for_status()
                data = r.json()
                return {"success": True, "va_id": data.get("id") or data.get("external_id"), "external_id": external_id, "response": data}
        except httpx.HTTPStatusError as e:
            logger.error(f"Xendit create_virtual_account failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Xendit create_virtual_account error: {e}")
            return {"success": False, "error": str(e)}

    async def create_qr_code(self, amount: float, external_id: str = "", description: str = "") -> Dict[str, Any]:
        if not external_id:
            external_id = f"xendit-qr-{uuid.uuid4().hex[:12]}"
        payload = {
            "external_id": external_id,
            "type": "dynamic_qr",
            "amount": int(round(amount)),
            "description": description or "QR Payment",
        }
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(f"{self.base_url}/qr_codes", json=payload, auth=self._auth(), timeout=30.0)
                r.raise_for_status()
                data = r.json()
                return {"success": True, "qr_id": data.get("id"), "qr_image_url": data.get("image_url"), "external_id": external_id, "response": data}
        except httpx.HTTPStatusError as e:
            logger.error(f"Xendit create_qr_code failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Xendit create_qr_code error: {e}")
            return {"success": False, "error": str(e)}

    async def get_invoice(self, invoice_id: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"{self.base_url}/v2/invoices/{invoice_id}", auth=self._auth(), timeout=30.0)
                r.raise_for_status()
                return {"success": True, "data": r.json()}
        except Exception as e:
            logger.error(f"Xendit get_invoice error: {e}")
            return {"success": False, "error": str(e)}

    async def create_disbursement(
        self,
        external_id: str,
        bank_code: str,
        account_holder_name: str,
        account_number: str,
        description: str,
        amount: float,
        email_to: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a disbursement (payout) via Xendit Disbursements API.

        Docs: https://developers.xendit.co/api-reference/#create-disbursement
        """
        if not external_id:
            external_id = f"xendit-disb-{uuid.uuid4().hex[:12]}"
        payload: Dict[str, Any] = {
            "external_id": external_id,
            "bank_code": bank_code,
            "account_holder_name": account_holder_name,
            "account_number": account_number,
            "description": description or "Disbursement",
            "amount": int(round(amount)),
        }
        if email_to:
            payload["email_to"] = email_to
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/disbursements",
                    json=payload,
                    auth=self._auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json()
                return {
                    "success": True,
                    "disbursement_id": data.get("id") or data.get("external_id") or "",
                    "external_id": external_id,
                    "status": data.get("status", "PENDING"),
                    "response": data,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Xendit create_disbursement failed: {e.response.text}")
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error(f"Xendit create_disbursement error: {e}")
            return {"success": False, "error": str(e)}

    async def get_disbursement(self, disbursement_id: str) -> Dict[str, Any]:
        """Retrieve disbursement status by Xendit disbursement ID."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/disbursements/{disbursement_id}",
                    auth=self._auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                return {"success": True, "data": r.json()}
        except Exception as e:
            logger.error(f"Xendit get_disbursement error: {e}")
            return {"success": False, "error": str(e)}

    async def get_available_banks(self) -> Dict[str, Any]:
        """Retrieve the list of available disbursement banks from Xendit."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/available_disbursements_banks",
                    auth=self._auth(),
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json()
                return {"success": True, "banks": data}
        except Exception as e:
            logger.error(f"Xendit get_available_banks error: {e}")
            return {"success": False, "error": str(e)}

    def verify_webhook_token(self, token_header: str) -> bool:
        """Verify Xendit webhook using X-CALLBACK-TOKEN header comparison."""
        expected = (
            os.environ.get("XENDIT_WEBHOOK_TOKEN")
            or getattr(settings, "xendit_webhook_token", "")
        ).strip()
        if not expected:
            logger.warning("XENDIT_WEBHOOK_TOKEN not configured — skipping token verification")
            return False
        return hmac.compare_digest(token_header.strip(), expected)

    def verify_webhook_signature(self, raw_body: bytes, signature_header: str, secret: Optional[str] = None) -> bool:
        """Verify Xendit webhook HMAC signature.

        Xendit signs payloads using the webhook secret and HMAC-SHA256 over the raw body.
        The header key may vary; callers should pass the header value.
        """
        secret_key = (secret or os.environ.get("XENDIT_WEBHOOK_SECRET") or getattr(settings, "xendit_secret_key", "")).strip()
        if not secret_key:
            logger.warning("XENDIT_WEBHOOK_SECRET not configured — skipping Xendit webhook verification")
            return False
        try:
            expected = hmac.new(secret_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
            if signature_header == expected:
                return True
            try:
                import binascii
                if binascii.hexlify(binascii.a2b_base64(signature_header)).decode() == expected:
                    return True
            except Exception:
                pass
            return False
        except Exception as e:
            logger.error(f"Xendit webhook signature verify error: {e}")
            return False