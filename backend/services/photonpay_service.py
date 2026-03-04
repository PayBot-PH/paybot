"""
PhotonPay payment service — Alipay and WeChat Pay collection via
the PhotonPay Open Platform API.

Authentication
--------------
PhotonPay uses a two-step OAuth flow:
  1. POST /oauth2/token/accessToken
     Header: Authorization: basic base64({appId}/{appSecret})
     Returns: access_token (JWT)

  2. All subsequent calls carry:
     - X-PD-TOKEN: <access_token>
     - X-PD-SIGN:  base64(MD5withRSA(request_body, merchant_rsa_private_key))
       (Only required when the request body is non-empty.)

Cashier (hosted checkout) flow
--------------------------------
  1. POST /txncore/openApi/v4/cashierSession
     Body includes: amount, currency, payMethod, reqId, siteId,
                    notifyUrl, redirectUrl, goodsInfo, shopper, risk
     Returns: authCode, payId

  2. Redirect user to:
     https://cashier.photonpay.com/?code={authCode}

  3. User pays via Alipay or WeChat QR inside the hosted page.

  4. PhotonPay sends a POST to notifyUrl with the payment result,
     signed with PhotonPay's RSA private key.
     Verify with: base64-decode X-PD-SIGN, then RSA-verify using
                  the PhotonPay platform public key.

Key setup (merchant portal)
----------------------------
  Settings > Developer:
    - Upload your RSA PUBLIC key (PKCS#8 PEM)  →  used by PhotonPay to verify your requests
    - Download PhotonPay's RSA PUBLIC key       →  used by you to verify their webhooks

  Note: configure PHOTONPAY_RSA_PRIVATE_KEY (your private key, never leaves your server)
        and PHOTONPAY_RSA_PUBLIC_KEY (PhotonPay's public key for webhook verification).

Docs: https://api-doc.photonpay.com
"""
import base64
import json
import logging
import os
import time
import uuid
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

PHOTONPAY_BASE_URL = "https://x-api.photonpay.com"
PHOTONPAY_CASHIER_URL = "https://cashier.photonpay.com"


class PhotonPayService:
    """Service for PhotonPay Open Platform — Alipay and WeChat Pay collection."""

    def __init__(self):
        self.app_id = os.environ.get("PHOTONPAY_APP_ID", "")
        self.app_secret = os.environ.get("PHOTONPAY_APP_SECRET", "")
        self.rsa_private_key_pem = os.environ.get("PHOTONPAY_RSA_PRIVATE_KEY", "")
        self.rsa_public_key_pem = os.environ.get("PHOTONPAY_RSA_PUBLIC_KEY", "")
        self.site_id = os.environ.get("PHOTONPAY_SITE_ID", "")
        self.alipay_method = os.environ.get("PHOTONPAY_ALIPAY_METHOD", "Alipay")
        self.wechat_method = os.environ.get("PHOTONPAY_WECHAT_METHOD", "WeChat")

        # Try settings fallback only for values not already found in os.environ
        if not self.app_id:
            try:
                from core.config import settings
                self.app_id = getattr(settings, "photonpay_app_id", "") or self.app_id
                self.app_secret = getattr(settings, "photonpay_app_secret", "") or self.app_secret
                if not self.rsa_private_key_pem:
                    self.rsa_private_key_pem = getattr(settings, "photonpay_rsa_private_key", "")
                if not self.rsa_public_key_pem:
                    self.rsa_public_key_pem = getattr(settings, "photonpay_rsa_public_key", "")
                if not self.site_id:
                    self.site_id = getattr(settings, "photonpay_site_id", "")
                self.alipay_method = getattr(settings, "photonpay_alipay_method", self.alipay_method) or self.alipay_method
                self.wechat_method = getattr(settings, "photonpay_wechat_method", self.wechat_method) or self.wechat_method
            except Exception:
                pass

        if not self.app_id or not self.app_secret:
            logger.warning(
                "PHOTONPAY_APP_ID / PHOTONPAY_APP_SECRET not configured — "
                "PhotonPay API calls will fail"
            )

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def _basic_auth_header(self) -> str:
        """Encode appId/appSecret as PhotonPay Basic auth credential (slash separator)."""
        raw = f"{self.app_id}/{self.app_secret}"
        return f"Basic {base64.b64encode(raw.encode()).decode()}"

    def _sign_body(self, body_str: str) -> str:
        """
        Sign *body_str* with the merchant RSA private key using MD5withRSA.
        Returns the base64-encoded signature for the X-PD-SIGN header.
        """
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding as asym_padding

        pem = self.rsa_private_key_pem.strip()
        if not pem:
            raise ValueError("PHOTONPAY_RSA_PRIVATE_KEY is not configured")

        # Support both PKCS#8 (-----BEGIN PRIVATE KEY-----) and
        # traditional PKCS#1 (-----BEGIN RSA PRIVATE KEY-----) formats.
        if "PRIVATE KEY" not in pem:
            raise ValueError("PHOTONPAY_RSA_PRIVATE_KEY does not look like a PEM key")

        # Normalise escaped newlines that may arrive via env vars
        pem = pem.replace("\\n", "\n")

        private_key = serialization.load_pem_private_key(pem.encode(), password=None)
        signature = private_key.sign(body_str.encode("utf-8"), asym_padding.PKCS1v15(), hashes.MD5())
        return base64.b64encode(signature).decode()

    async def _get_access_token(self) -> str:
        """Return a cached (or freshly fetched) PhotonPay access token."""
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        async with httpx.AsyncClient() as client:
            # PhotonPay OAuth2 client_credentials flow.
            # The Authorization header uses slash-separated appId/appSecret (base64).
            # grant_type must be sent as a form field per standard OAuth2.
            r = await client.post(
                f"{PHOTONPAY_BASE_URL}/oauth2/token/accessToken",
                headers={
                    "Authorization": self._basic_auth_header(),
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
                timeout=30.0,
            )
            r.raise_for_status()
            data = r.json()
            logger.info("PhotonPay token response: %s", data)

            # Fail fast if the API returned an error code in the body
            code = str(data.get("code", ""))
            # PhotonPay success codes: "0", "200", "0000", or absent
            is_success = code in ("0", "200", "0000", "") or code.startswith("0")
            if not is_success:
                raise ValueError(
                    f"PhotonPay token endpoint error {code}: {data.get('msg', 'unknown')}"
                )

            # Token may live under "data" or directly in the root
            token_data = data.get("data") or data
            token = (
                token_data.get("access_token")
                or token_data.get("accessToken")
                or token_data.get("token")
                or ""
            )

            if not token:
                raise ValueError(
                    f"PhotonPay returned no access token — full response: {data}"
                )

            expires_in = int(
                token_data.get("expires_in",
                               token_data.get("expiresIn", 7200)) or 7200
            )
            self._access_token = token
            self._token_expires_at = time.time() + expires_in
            logger.info("PhotonPay: access token obtained (expires in %ds)", expires_in)
            return self._access_token

    # ------------------------------------------------------------------
    # Payment session creation
    # ------------------------------------------------------------------

    async def create_payment_session(
        self,
        amount: float,
        currency: str,
        pay_method: str,
        req_id: str,
        notify_url: str,
        redirect_url: str,
        description: str = "",
        shopper_id: str = "guest",
        site_id: str = "",
    ) -> Dict[str, Any]:
        """
        Create a PhotonPay cashier session for the given payment method.

        Args:
            amount:       Payment amount (decimal, e.g. 500.00 for ₱500).
            currency:     ISO-4217 currency code (e.g. "PHP", "USD", "CNY").
            pay_method:   PhotonPay payMethod string ("Alipay" or "WeChat").
            req_id:       Unique merchant order ID.
            notify_url:   Webhook URL PhotonPay will POST the result to.
            redirect_url: URL to redirect the user after payment.
            description:  Short description shown on the checkout page.
            shopper_id:   Merchant's user identifier (for risk/fraud scoring).
            site_id:      Override the default site_id from settings.

        Returns:
            dict with keys: success, auth_code, pay_id, checkout_url, req_id
        """
        try:
            token = await self._get_access_token()
        except Exception as e:
            logger.error("PhotonPay: failed to get access token: %s", e)
            return {"success": False, "error": f"Auth failed: {e}"}

        effective_site_id = site_id or self.site_id
        body_data: Dict[str, Any] = {
            "amount": str(amount),
            "currency": currency,
            "payMethod": pay_method,
            "reqId": req_id,
            "siteId": effective_site_id,
            "notifyUrl": notify_url,
            "redirectUrl": redirect_url,
            "remark": description or pay_method,
            "goodsInfo": [
                {
                    "name": description or pay_method,
                    "price": str(amount),
                    "quantity": "1",
                    "desc": description or pay_method,
                    "virtual": "Y",
                }
            ],
            "shopper": {
                "id": shopper_id,
                "nickName": shopper_id,
                "platform": "android",
                "shopperIp": "127.0.0.1",
            },
            "risk": {"platform": "android", "retryTimes": "0"},
        }

        body_str = json.dumps(body_data, separators=(",", ":"), ensure_ascii=False)

        headers: Dict[str, str] = {
            "X-PD-TOKEN": token,
            "Content-Type": "application/json",
        }

        if self.rsa_private_key_pem.strip():
            try:
                headers["X-PD-SIGN"] = self._sign_body(body_str)
            except Exception as e:
                logger.error("PhotonPay: RSA signing failed: %s", e)
                return {"success": False, "error": f"Signing failed: {e}"}
        else:
            logger.warning("PhotonPay: PHOTONPAY_RSA_PRIVATE_KEY not set — X-PD-SIGN header omitted")

        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{PHOTONPAY_BASE_URL}/txncore/openApi/v4/cashierSession",
                    headers=headers,
                    content=body_str.encode("utf-8"),
                    timeout=30.0,
                )
                r.raise_for_status()
                data = r.json()
                # Handle nested data or flat response
                resp = data.get("data") or data
                auth_code = resp.get("authCode") or resp.get("auth_code") or ""
                pay_id = resp.get("payId") or resp.get("pay_id") or req_id
                code = resp.get("code", data.get("code", ""))
                msg = resp.get("msg", data.get("msg", ""))

                if not auth_code:
                    logger.error("PhotonPay: no authCode in response: %s", data)
                    return {
                        "success": False,
                        "error": f"PhotonPay error {code}: {msg or 'no authCode returned'}",
                    }

                checkout_url = f"{PHOTONPAY_CASHIER_URL}/?code={auth_code}"

                return {
                    "success": True,
                    "auth_code": auth_code,
                    "pay_id": pay_id,
                    "checkout_url": checkout_url,
                    "req_id": req_id,
                    "pay_method": pay_method,
                    "amount": amount,
                    "currency": currency,
                }
        except httpx.HTTPStatusError as e:
            logger.error("PhotonPay cashierSession HTTP error: %s", e.response.text)
            return {"success": False, "error": e.response.text}
        except Exception as e:
            logger.error("PhotonPay cashierSession error: %s", e)
            return {"success": False, "error": str(e)}

    async def create_alipay_session(
        self,
        amount: float,
        currency: str = "PHP",
        description: str = "",
        notify_url: str = "",
        redirect_url: str = "",
        shopper_id: str = "guest",
    ) -> Dict[str, Any]:
        """Create a cashier session for Alipay payment."""
        req_id = f"pp-alipay-{uuid.uuid4().hex[:16]}"
        return await self.create_payment_session(
            amount=amount,
            currency=currency,
            pay_method=self.alipay_method,
            req_id=req_id,
            notify_url=notify_url,
            redirect_url=redirect_url,
            description=description or "Alipay payment",
            shopper_id=shopper_id,
        )

    async def create_wechat_session(
        self,
        amount: float,
        currency: str = "PHP",
        description: str = "",
        notify_url: str = "",
        redirect_url: str = "",
        shopper_id: str = "guest",
    ) -> Dict[str, Any]:
        """Create a cashier session for WeChat Pay payment."""
        req_id = f"pp-wechat-{uuid.uuid4().hex[:16]}"
        return await self.create_payment_session(
            amount=amount,
            currency=currency,
            pay_method=self.wechat_method,
            req_id=req_id,
            notify_url=notify_url,
            redirect_url=redirect_url,
            description=description or "WeChat Pay payment",
            shopper_id=shopper_id,
        )

    # ------------------------------------------------------------------
    # Webhook verification
    # ------------------------------------------------------------------

    def verify_webhook_signature(self, raw_body: bytes, signature_b64: str) -> bool:
        """
        Verify a PhotonPay webhook notification signature.

        PhotonPay signs the raw request body with their RSA private key.
        The algorithm may be MD5withRSA or SHA256withRSA depending on the
        account configuration; both are tried.  Verify using the PhotonPay
        platform public key obtained from the merchant portal
        (Settings > Developer > Platform Public Key).

        Args:
            raw_body:      Raw (undecoded) request body bytes.
            signature_b64: Value of the X-PD-SIGN header (base64-encoded,
                           standard or URL-safe variant).

        Returns:
            True if signature is valid, False otherwise.
        """
        if not self.rsa_public_key_pem.strip():
            logger.warning(
                "PhotonPay: PHOTONPAY_RSA_PUBLIC_KEY not configured — "
                "skipping webhook signature verification"
            )
            return False

        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
            from cryptography.exceptions import InvalidSignature

            # Normalise the PEM: handle escaped newlines from env vars and
            # ensure the key wrapper is present in PKCS#8 or PKCS#1 form.
            pem = self.rsa_public_key_pem.strip().replace("\\n", "\n")

            # If the PEM header/footer are missing (bare base64 blob), wrap it.
            # PKCS#8 format ("BEGIN PUBLIC KEY") is assumed; if the key is actually
            # PKCS#1 this load will fail and the error is caught below.
            if "BEGIN" not in pem:
                pem = f"-----BEGIN PUBLIC KEY-----\n{pem}\n-----END PUBLIC KEY-----"

            # Accept both PKCS#8 ("PUBLIC KEY") and PKCS#1 ("RSA PUBLIC KEY") wrappers.
            public_key = serialization.load_pem_public_key(pem.encode())

            # Decode the signature — strip surrounding whitespace/newlines first,
            # then handle URL-safe base64 (replace - / _ and add missing padding).
            sig_b64 = signature_b64.strip()
            # Convert URL-safe alphabet to standard and add padding
            sig_b64_std = sig_b64.replace("-", "+").replace("_", "/")
            missing = len(sig_b64_std) % 4
            if missing:
                sig_b64_std += "=" * (4 - missing)
            sig_bytes = base64.b64decode(sig_b64_std)

            # Try SHA256withRSA first (preferred / more modern), then MD5withRSA.
            for hash_algo in (hashes.SHA256(), hashes.MD5()):
                try:
                    public_key.verify(sig_bytes, raw_body, asym_padding.PKCS1v15(), hash_algo)
                    logger.debug(
                        "PhotonPay: webhook signature verified with %s",
                        hash_algo.name,
                    )
                    return True
                except InvalidSignature:
                    continue

            logger.warning(
                "PhotonPay: webhook signature verification FAILED "
                "(tried SHA256withRSA and MD5withRSA)"
            )
            return False
        except Exception as e:
            logger.error(
                "PhotonPay: webhook signature verification error: %s",
                type(e).__name__,
            )
            return False
