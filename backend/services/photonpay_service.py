"""
PhotonPay payment service — Alipay and WeChat Pay collection via
the PhotonPay Open Platform API.

Authentication
--------------
PhotonPay uses a two-step OAuth flow:
  1. POST /oauth2/token/accessToken
     Content-Type: application/json
     Body: {"appId": "<appId>", "appSecret": "<appSecret>", "grantType": "client_credentials"}
     Returns: access_token (JWT)

  2. All subsequent calls carry:
     - X-PD-TOKEN: <access_token>
     - X-PD-SIGN:  base64(MD5withRSA(request_body, merchant_rsa_private_key))
       (Only required when the request body is non-empty.)

Environment / base URLs
-----------------------
  production  →  https://x-api.photonpay.com        (default)
  sandbox     →  https://x-api1.uat.photontech.cc

Set PHOTONPAY_MODE=sandbox to use the sandbox environment; the service will
automatically use the matching base URL.  Set PHOTONPAY_BASE_URL to override
the URL entirely.  The App ID / App Secret must match the chosen environment —
mixing sandbox credentials with the production endpoint (or vice versa) causes
PhotonPay to return {"path":…,"method":…} instead of an access token.

Cashier (hosted checkout) flow
--------------------------------
  1. POST /txncore/openApi/v4/cashierSession
     Body includes: amount, currency, payMethod, reqId, siteId,
                    notifyUrl, redirectUrl, goodsInfo, shopper, risk
     Returns: authCode, payId

  2. Redirect user to:
     https://cashier.photonpay.com/?code={authCode}   (production)
     https://cashier1.uat.photontech.cc/?code={authCode}  (sandbox)

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

PHOTONPAY_PRODUCTION_URL = "https://x-api.photonpay.com"
PHOTONPAY_SANDBOX_URL = "https://x-api1.uat.photontech.cc"
# Kept for backward compatibility; service instances use self._base_url instead.
PHOTONPAY_BASE_URL = PHOTONPAY_PRODUCTION_URL
PHOTONPAY_CASHIER_URL = "https://cashier.photonpay.com"
PHOTONPAY_SANDBOX_CASHIER_URL = "https://cashier1.uat.photontech.cc"


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
        mode = os.environ.get("PHOTONPAY_MODE", "production").lower().strip()
        base_url_override = os.environ.get("PHOTONPAY_BASE_URL", "").strip()
        cashier_url_override = os.environ.get("PHOTONPAY_CASHIER_URL", "").strip()

        # Determine base URL from PHOTONPAY_BASE_URL override or PHOTONPAY_MODE
        _base_url_override = os.environ.get("PHOTONPAY_BASE_URL", "").strip()
        _mode = os.environ.get("PHOTONPAY_MODE", "production").strip().lower()
        if _base_url_override:
            self._base_url = _base_url_override.rstrip("/")
        elif _mode == "sandbox":
            self._base_url = PHOTONPAY_SANDBOX_URL
        else:
            self._base_url = PHOTONPAY_PRODUCTION_URL

        # Try settings fallback
        if not self.app_id:
            try:
                from core.config import settings
                self.app_id = getattr(settings, "photonpay_app_id", "")
                self.app_secret = getattr(settings, "photonpay_app_secret", "")
                self.rsa_private_key_pem = getattr(settings, "photonpay_rsa_private_key", "")
                self.rsa_public_key_pem = getattr(settings, "photonpay_rsa_public_key", "")
                self.site_id = getattr(settings, "photonpay_site_id", "")
                self.alipay_method = getattr(settings, "photonpay_alipay_method", self.alipay_method)
                self.wechat_method = getattr(settings, "photonpay_wechat_method", self.wechat_method)

                # Apply settings-based URL only if env var overrides are absent
                if not _base_url_override:
                    settings_base_url = getattr(settings, "photonpay_base_url", "").strip()
                    if settings_base_url:
                        self._base_url = settings_base_url.rstrip("/")
                    else:
                        settings_mode = getattr(settings, "photonpay_mode", "production").strip().lower()
                        if settings_mode == "sandbox":
                            self._base_url = PHOTONPAY_SANDBOX_URL
                        else:
                            self._base_url = PHOTONPAY_PRODUCTION_URL
            except Exception:
                pass

        # Resolve base URL: explicit override > mode-based default
        is_sandbox = mode in ("sandbox", "test", "uat")
        if base_url_override:
            self.base_url = base_url_override.rstrip("/")
        elif is_sandbox:
            self.base_url = PHOTONPAY_SANDBOX_URL
        else:
            self.base_url = PHOTONPAY_PRODUCTION_URL

        if cashier_url_override:
            self.cashier_url = cashier_url_override.rstrip("/")
        elif is_sandbox:
            self.cashier_url = PHOTONPAY_SANDBOX_CASHIER_URL
        else:
            self.cashier_url = PHOTONPAY_CASHIER_URL

        logger.debug(
            "PhotonPay: mode=%s base_url=%s cashier_url=%s",
            mode, self.base_url, self.cashier_url,
        )

        if not self.app_id or not self.app_secret:
            logger.warning(
                "PHOTONPAY_APP_ID / PHOTONPAY_APP_SECRET not configured — "
                "PhotonPay API calls will fail"
            )

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def _compact_json(self, value: Any, limit: int = 1800) -> str:
        """Serialize a value to a bounded JSON string for safe error messages."""
        try:
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
        except Exception:
            text = str(value)
        if len(text) <= limit:
            return text
        return f"{text[:limit]}...<truncated {len(text) - limit} chars>"

    def _extract_token_payload(self, payload: Any) -> Dict[str, Any]:
        """
        Return the dict that most likely contains token fields.

        PhotonPay responses vary by environment/version and can place tokens
        in nested objects such as data/result/body.
        """
        if not isinstance(payload, dict):
            return {}

        candidates = [
            payload,
            payload.get("data"),
            payload.get("result"),
            payload.get("body"),
        ]

        data = payload.get("data")
        if isinstance(data, dict):
            candidates.extend([
                data,
                data.get("result"),
                data.get("body"),
                data.get("data"),
            ])

        result = payload.get("result")
        if isinstance(result, dict):
            candidates.extend([
                result,
                result.get("data"),
                result.get("body"),
            ])

        for item in candidates:
            if isinstance(item, dict) and any(
                key in item for key in ("access_token", "accessToken", "token")
            ):
                return item

        return payload

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def _basic_auth_header(self) -> str:
        """Encode appId:appSecret as HTTP Basic auth credential (RFC 7617 colon separator)."""
        raw = f"{self.app_id}:{self.app_secret}"
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

        token_url = f"{self._base_url}/oauth2/token/accessToken"
        # trust_env=False prevents httpx from reading HTTP_PROXY / HTTPS_PROXY
        # environment variables.  On Railway the proxy address is a CGNAT IP
        # (100.64.x.x) whose TCP source port gets forwarded to PhotonPay,
        # which then fails with "Failed to parse address<ip>:<port>".
        # Bypassing the proxy ensures a direct connection with a parseable IP.
        async with httpx.AsyncClient(trust_env=False) as client:
            # PhotonPay OAuth2 client_credentials flow.
            # Credentials are sent in the JSON body (appId / appSecret / grantType)
            # rather than as an HTTP Basic Auth header — the API returns
            # {"path":…,"method":…} when Basic Auth is used.
            r = await client.post(
                token_url,
                json={
                    "appId": self.app_id,
                    "appSecret": self.app_secret,
                    "grantType": "client_credentials",
                },
                timeout=30.0,
            )
            if not r.is_success:
                raise ValueError(
                    f"PhotonPay token endpoint rejected the request — "
                    f"verify PHOTONPAY_APP_ID and PHOTONPAY_APP_SECRET "
                    f"(endpoint: {token_url}, "
                    f"status: {r.status_code}, response: {r.text})"
                )
            r.raise_for_status()
            try:
                data = r.json()
            except Exception:
                raise ValueError(
                    "PhotonPay token endpoint returned non-JSON response "
                    f"(status: {r.status_code}, body: {self._compact_json(r.text)})"
                )

            logger.info("PhotonPay token response: %s", self._compact_json(data, limit=1000))

            # Detect routing / IP-parse error responses from PhotonPay.
            # PhotonPay echoes "path" and "method" back in the response body
            # when it cannot process the request.  This occurs in two formats:
            #
            #   Old format (credential error):
            #     {"path": "/token/accessToken", "method": "POST"}
            #     (optionally with a "timestamp" field — at most 3 keys)
            #
            #   New format (IP-parse / routing error, e.g. Railway CGNAT):
            #     {"code": "XXA00001",
            #      "msg": "Failed to parse address100.64.0.6:51376",
            #      "path": "/token/accessToken",
            #      "method": "POST"}
            #
            # The new format arises when Railway's internal CGNAT proxy
            # (100.64.x.x) injects an IP:port value that PhotonPay cannot
            # parse as a plain IP address.  Both formats share the "path" and
            # "method" echo pattern, so we detect them together.
            # We guard against false positives by requiring "path" to look like
            # a URL path and "method" to be a valid HTTP verb, and by excluding
            # responses that carry actual token data.
            _VALID_HTTP_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}
            if (
                isinstance(data, dict)
                and isinstance(data.get("path"), str)
                and data["path"].startswith("/")
                and isinstance(data.get("method"), str)
                and data["method"].upper() in _VALID_HTTP_METHODS
                and not any(
                    key in data
                    for key in ("access_token", "accessToken", "token", "data", "result", "body")
                )
            ):
                raise ValueError(
                    "PhotonPay authentication failed — the token endpoint returned a "
                    "routing/IP-parse error response. "
                    "This can be caused by a proxy injecting an IP:port value that "
                    "PhotonPay cannot parse (error code XXA00001). "
                    "Verify PHOTONPAY_APP_ID and PHOTONPAY_APP_SECRET, and ensure "
                    "outbound connections bypass any HTTP proxy (trust_env=False). "
                    f"(endpoint: {token_url}, response: {self._compact_json(data)})"
                )

            # Fail fast if the API returned an error code in the body
            code = str(data.get("code", ""))
            # PhotonPay success codes: "0", "200", "0000", or absent
            is_success = code in ("0", "200", "0000", "") or code.startswith("0")
            token_data = self._extract_token_payload(data)
            token = (
                token_data.get("access_token")
                or token_data.get("accessToken")
                or token_data.get("token")
                or ""
            )

            if not is_success and not token:
                raise ValueError(
                    "PhotonPay token endpoint returned an error "
                    f"(code: {code}, msg: {data.get('msg', data.get('message', 'unknown'))}, "
                    f"response: {self._compact_json(data)})"
                )

            if not token:
                raise ValueError(
                    "PhotonPay returned no access token — "
                    f"full response: {self._compact_json(data)}"
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
            # trust_env=False: same reason as _get_access_token — prevents
            # Railway's internal proxy from injecting IP:port headers that
            # PhotonPay cannot parse.
            async with httpx.AsyncClient(trust_env=False) as client:
                r = await client.post(
                    f"{self.base_url}/txncore/openApi/v4/cashierSession",
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

                checkout_url = f"{self.cashier_url}/?code={auth_code}"

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
            logger.error(
                "PhotonPay cashierSession HTTP %s error: %s",
                e.response.status_code,
                e.response.text,
            )
            return {"success": False, "error": f"HTTP {e.response.status_code}: {e.response.text}"}
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

        PhotonPay signs the request body with their RSA private key using
        MD5withRSA.  Verify using the PhotonPay platform public key obtained
        from the merchant portal (Settings > Developer > Platform Public Key).

        Args:
            raw_body:      Raw (undecoded) request body bytes.
            signature_b64: Value of the X-PD-SIGN header (base64-encoded).

        Returns:
            True if signature is valid, False otherwise.
        """
        if not self.rsa_public_key_pem.strip():
            logger.warning(
                "PhotonPay: PHOTONPAY_RSA_PUBLIC_KEY not configured — "
                "skipping webhook signature verification"
            )
            return True  # Degrade gracefully; tighten in production

        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
            from cryptography.exceptions import InvalidSignature

            pem = self.rsa_public_key_pem.strip().replace("\\n", "\n")
            public_key = serialization.load_pem_public_key(pem.encode())
            sig_bytes = base64.b64decode(signature_b64)
            public_key.verify(sig_bytes, raw_body, asym_padding.PKCS1v15(), hashes.MD5())
            return True
        except InvalidSignature:
            logger.warning("PhotonPay: webhook signature verification FAILED")
            return False
        except Exception as e:
            logger.error("PhotonPay: webhook verification error: %s", e)
            return False
