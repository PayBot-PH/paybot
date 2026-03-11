"""Tests for PhotonPay webhook signature verification and token retrieval."""
import base64
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Set required env vars before importing the app or service
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_photonpay_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.asymmetric import rsa

from services.photonpay_service import (
    PhotonPayService,
    _PHOTONPAY_PRODUCTION_URL,
    _PHOTONPAY_SANDBOX_URL,
    _TOKEN_PATH,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _generate_rsa_keypair():
    """Return (private_key, public_key) as cryptography objects."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


def _export_pem(key, private: bool = False) -> str:
    if private:
        return key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
    return key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


def _sign(private_key, body: bytes, algo) -> bytes:
    return private_key.sign(body, asym_padding.PKCS1v15(), algo)


def _make_service(pub_pem: str) -> PhotonPayService:
    svc = PhotonPayService.__new__(PhotonPayService)
    svc.rsa_public_key_pem = pub_pem
    return svc


# ---------------------------------------------------------------------------
# Unit tests for verify_webhook_signature
# ---------------------------------------------------------------------------

class TestPhotonPaySignatureVerification:

    def setup_method(self):
        self.private_key, self.public_key = _generate_rsa_keypair()
        self.pub_pem = _export_pem(self.public_key)
        self.body = b'{"reqId":"order-123","status":"succeed","amount":"500.00"}'

    def test_valid_sha256_signature_accepted(self):
        """SHA256withRSA signature is accepted."""
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is True

    def test_valid_md5_signature_accepted(self):
        """MD5withRSA signature is accepted (PhotonPay legacy algorithm)."""
        sig = _sign(self.private_key, self.body, hashes.MD5())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is True

    def test_invalid_signature_rejected(self):
        """A signature from a different key is rejected."""
        other_key, _ = _generate_rsa_keypair()
        sig = _sign(other_key, self.body, hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is False

    def test_tampered_body_rejected(self):
        """A valid signature against a different body is rejected."""
        sig = _sign(self.private_key, b'{"reqId":"order-123","status":"failed"}', hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is False

    def test_url_safe_base64_accepted(self):
        """URL-safe base64 variants (- and _) are handled correctly."""
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        # Force URL-safe encoding (replace + and / with - and _)
        sig_urlsafe = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_urlsafe) is True

    def test_signature_with_surrounding_whitespace_accepted(self):
        """Whitespace/newlines around the signature header value are stripped."""
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        sig_b64 = "  " + base64.b64encode(sig).decode() + "\n"
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is True

    def test_pem_with_escaped_newlines_accepted(self):
        """PEM keys with \\n escape sequences (as stored in env vars) are normalised."""
        # Inline the PEM with literal \n instead of real newlines
        escaped_pem = self.pub_pem.replace("\n", "\\n")
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(escaped_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is True

    def test_missing_public_key_returns_false(self):
        """When no public key is configured, verification returns False."""
        svc = _make_service("")
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        assert svc.verify_webhook_signature(self.body, sig_b64) is False

    def test_corrupt_signature_returns_false(self):
        """A non-base64 / garbage signature string returns False, not an exception."""
        svc = _make_service(self.pub_pem)
        assert svc.verify_webhook_signature(self.body, "not-valid-base64!!!") is False

    def test_pkcs1_public_key_wrapper_accepted(self):
        """PKCS#1 RSA PUBLIC KEY wrapper is accepted in addition to PKCS#8."""
        # Export in PKCS#1 format
        pkcs1_pem = self.public_key.public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.PKCS1,
        ).decode()
        sig = _sign(self.private_key, self.body, hashes.SHA256())
        sig_b64 = base64.b64encode(sig).decode()
        svc = _make_service(pkcs1_pem)
        assert svc.verify_webhook_signature(self.body, sig_b64) is True


# ---------------------------------------------------------------------------
# Integration-level tests for the webhook endpoint
# ---------------------------------------------------------------------------

# Generate a stable RSA key pair for the integration tests so the public key
# can be injected via os.environ before the app module is (re-)imported.
from cryptography.hazmat.primitives.asymmetric import rsa as _rsa_mod

_INT_PRIVATE_KEY = _rsa_mod.generate_private_key(public_exponent=65537, key_size=2048)
_INT_PUBLIC_KEY = _INT_PRIVATE_KEY.public_key()
_INT_PUB_PEM = _INT_PUBLIC_KEY.public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
).decode()

# Set the public key in os.environ *now* so it is visible when the router
# creates a PhotonPayService inside the test request handling.
os.environ["PHOTONPAY_RSA_PUBLIC_KEY"] = _INT_PUB_PEM


def _int_signed_headers(body: bytes) -> dict:
    sig = _INT_PRIVATE_KEY.sign(body, asym_padding.PKCS1v15(), hashes.SHA256())
    return {
        "Content-Type": "application/json",
        "X-PD-SIGN": base64.b64encode(sig).decode(),
    }


class TestPhotonPayWebhookEndpoint:

    def test_missing_signature_rejected_when_verify_required(self):
        """Webhook without X-PD-SIGN is rejected when PHOTONPAY_WEBHOOK_VERIFY_REQUIRED=true."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "true"
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = b'{"reqId":"ord-1","status":"succeed","amount":"100.00"}'
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 401

    def test_missing_signature_allowed_when_verify_not_required(self):
        """Webhook without X-PD-SIGN is allowed through when PHOTONPAY_WEBHOOK_VERIFY_REQUIRED=false."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = b'{"reqId":"ord-unknown","status":"succeed","amount":"100.00"}'
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        # No matching transaction → 200 "acknowledged"
        assert r.status_code == 200
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "true"  # restore default

    def test_invalid_signature_always_rejected(self):
        """Invalid X-PD-SIGN is always rejected regardless of verify_required setting."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = b'{"reqId":"ord-2","status":"succeed","amount":"200.00"}'
            bad_sig = base64.b64encode(b"definitely-not-a-real-signature").decode()
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-PD-SIGN": bad_sig,
                },
            )
        assert r.status_code == 401
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "true"  # restore default

    def test_valid_signature_passes_through(self):
        """A correctly signed webhook passes verification and returns 200."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "true"
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = b'{"reqId":"ord-unknown-valid","status":"succeed","amount":"300.00"}'
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers=_int_signed_headers(body),
            )
        # No matching transaction → 200 "transaction not found — acknowledged"
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Unit tests for _get_access_token (mocked HTTP)
# ---------------------------------------------------------------------------

def _make_noop_async_client():
    """Return a mock AsyncClient whose .post() is never expected to be called."""
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock()
    return client


def _make_full_service(
    app_id: str = "test-app",
    app_secret: str = "test-secret",
    site_id: str = "test-site",
) -> PhotonPayService:
    """Return a PhotonPayService instance with minimal credentials set."""
    svc = PhotonPayService.__new__(PhotonPayService)
    svc.app_id = app_id
    svc.app_secret = app_secret
    svc.rsa_private_key_pem = ""
    svc.rsa_public_key_pem = ""
    svc.site_id = site_id
    svc.alipay_method = "Alipay"
    svc.wechat_method = "WeChat"
    svc.mode = "production"
    svc._base_url_override = ""
    svc._access_token = None
    svc._token_expires_at = 0.0
    return svc


class TestPhotonPayTokenRetrieval:
    """Mocked-HTTP tests for _get_access_token."""

    # -- base_url property --------------------------------------------------

    def test_base_url_production(self):
        """Default (production) mode resolves to the production host."""
        svc = _make_full_service()
        svc.mode = "production"
        assert svc.base_url == _PHOTONPAY_PRODUCTION_URL

    def test_base_url_sandbox(self):
        """Sandbox mode resolves to the sandbox/UAT host."""
        svc = _make_full_service()
        svc.mode = "sandbox"
        assert svc.base_url == _PHOTONPAY_SANDBOX_URL

    def test_base_url_explicit_override(self):
        """PHOTONPAY_BASE_URL env-var override takes precedence over mode."""
        svc = _make_full_service()
        svc.mode = "sandbox"
        svc._base_url_override = "https://custom.example.com"
        assert svc.base_url == "https://custom.example.com"

    # -- token endpoint path ------------------------------------------------

    def test_token_path_starts_with_slash(self):
        """Token path must be the OAuth2 access token path (/oauth2/token/accessToken)."""
        assert _TOKEN_PATH == "/oauth2/token/accessToken", (
            f"Expected token path to be /oauth2/token/accessToken but got: {_TOKEN_PATH!r}"
        )

    def test_token_url_correct_for_production(self):
        """Full token URL in production mode uses the production host + /token/ path."""
        svc = _make_full_service()
        expected = f"{_PHOTONPAY_PRODUCTION_URL}{_TOKEN_PATH}"
        assert "/token/" in expected
        assert expected == f"https://x-api.photonpay.com{_TOKEN_PATH}"

    # -- basic auth header format -------------------------------------------

    def test_basic_auth_header_uses_colon_separator(self):
        """Authorization header must use colon (standard OAuth2), not slash."""
        svc = _make_full_service(app_id="myAppId", app_secret="myAppSecret")
        header = svc._basic_auth_header()
        assert header.startswith("Basic "), "Header must start with 'Basic '"
        encoded = header[len("Basic "):]
        decoded = base64.b64decode(encoded).decode()
        assert decoded == "myAppId:myAppSecret", (
            f"Expected 'myAppId:myAppSecret' but got: {decoded!r}"
        )

    def test_basic_auth_header_no_slash_separator(self):
        """Authorization header must NOT use a slash separator."""
        svc = _make_full_service(app_id="app123", app_secret="secret456")
        header = svc._basic_auth_header()
        encoded = header[len("Basic "):]
        decoded = base64.b64decode(encoded).decode()
        assert "/" not in decoded, (
            f"Slash separator found in Basic auth credential: {decoded!r}. "
            "Use colon (standard OAuth2 RFC 7617)."
        )

    # -- empty-credential fast-fail -----------------------------------------

    @pytest.mark.asyncio
    async def test_empty_app_id_raises_before_http_call(self):
        """When app_id is empty, _get_access_token raises immediately (no HTTP request)."""
        svc = _make_full_service(app_id="", app_secret="some-secret")
        mock_client = _make_noop_async_client()

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        mock_client.post.assert_not_called()
        assert "PHOTONPAY_APP_ID" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_empty_app_secret_raises_before_http_call(self):
        """When app_secret is empty, _get_access_token raises immediately (no HTTP request)."""
        svc = _make_full_service(app_id="some-id", app_secret="")
        mock_client = _make_noop_async_client()

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        mock_client.post.assert_not_called()
        assert "PHOTONPAY_APP_SECRET" in str(exc_info.value)

    # -- successful token retrieval ----------------------------------------

    @pytest.mark.asyncio
    async def test_successful_token_retrieval(self):
        """A valid 200 response with access_token is stored and returned."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "code": "0",
            "data": {"access_token": "tok-abc123", "expires_in": 7200},
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            token = await svc._get_access_token()

        assert token == "tok-abc123"
        assert svc._access_token == "tok-abc123"
        assert svc._token_expires_at > 0

    @pytest.mark.asyncio
    async def test_token_cached_after_first_call(self):
        """Subsequent calls within the TTL do not make a second HTTP request."""
        import time

        svc = _make_full_service()
        svc._access_token = "cached-token"
        svc._token_expires_at = time.time() + 3600  # valid for 1 hour

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock()

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            token = await svc._get_access_token()

        assert token == "cached-token"
        mock_client.post.assert_not_called()

    # -- 404 / error endpoint diagnostics -----------------------------------

    @pytest.mark.asyncio
    async def test_404_produces_clear_error_with_endpoint(self):
        """A 404 response raises ValueError that includes the endpoint URL."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        assert "404" in msg, f"Expected '404' in error message, got: {msg}"
        assert _TOKEN_PATH in msg, (
            f"Expected token endpoint path in error message, got: {msg}"
        )

    @pytest.mark.asyncio
    async def test_5xx_produces_clear_error_with_status_and_body(self):
        """A 500 response raises ValueError that includes status code and body snippet."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error — upstream timeout"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        assert "500" in msg

    @pytest.mark.asyncio
    async def test_api_error_code_in_body_raises(self):
        """A 200 response that contains a non-success error code raises ValueError."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"code": "AUTH_FAILED", "msg": "invalid credentials"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        assert "AUTH_FAILED" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_gateway_error_response_raises_with_credentials_hint(self):
        """A 200 response with the PhotonPay gateway error pattern raises a helpful ValueError.

        When PhotonPay receives an invalid APP_ID / APP_SECRET it returns a JSON
        body of the form {"path": "/token/accessToken", "method": "POST"} with
        HTTP 200.  The code must detect this and surface an actionable message
        rather than the opaque "no access token" error.
        """
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"path": "/token/accessToken", "method": "POST"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        # Must mention credentials so users know what to fix
        assert "PHOTONPAY_APP_ID" in msg and "PHOTONPAY_APP_SECRET" in msg, (
            f"Expected both PHOTONPAY_APP_ID and PHOTONPAY_APP_SECRET in error message, got: {msg}"
        )
        # Must indicate the request was rejected / ask users to verify credentials
        assert "verify" in msg.lower() or "rejected" in msg.lower(), (
            f"Expected 'verify' or 'rejected' in error message, got: {msg}"
        )
        # Must not fall through to the generic "no access token" message
        assert "no access token" not in msg

    @pytest.mark.asyncio
    async def test_network_error_raises_with_context(self):
        """A network-level error raises ValueError with endpoint context."""
        import httpx
        svc = _make_full_service()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        assert "network error" in msg.lower() or "Connection refused" in msg


# ---------------------------------------------------------------------------
# Graceful Alipay failure when token retrieval fails
# ---------------------------------------------------------------------------

class TestPhotonPayAlipayGracefulFailure:

    @pytest.mark.asyncio
    async def test_alipay_session_returns_error_dict_on_token_failure(self):
        """create_alipay_session returns success=False when token retrieval fails."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_alipay_session(
                amount=500.0,
                currency="PHP",
                description="Test payment",
            )

        assert result.get("success") is False
        assert "error" in result
        # Error message should be actionable (mention auth)
        assert result["error"], "Error message must not be empty"

    @pytest.mark.asyncio
    async def test_create_payment_session_auth_error_no_exception_raised(self):
        """create_payment_session never raises — it returns a dict with success=False."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_payment_session(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="test-req-001",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/success",
            )

        assert isinstance(result, dict)
        assert result.get("success") is False


# ---------------------------------------------------------------------------
# Fast-fail when PhotonPay credentials are not configured
# ---------------------------------------------------------------------------

class TestPhotonPayMissingCredentials:

    @pytest.mark.asyncio
    async def test_empty_app_id_raises_before_http_call(self):
        """When app_id is empty, _get_access_token raises immediately (no HTTP call made)."""
        svc = _make_full_service(app_id="", app_secret="test-secret")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock()

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        assert "PHOTONPAY_APP_ID" in msg, f"Expected PHOTONPAY_APP_ID in message, got: {msg}"
        assert "PHOTONPAY_APP_SECRET" in msg, f"Expected PHOTONPAY_APP_SECRET in message, got: {msg}"
        # No HTTP call should be made — fail fast
        mock_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_app_secret_raises_before_http_call(self):
        """When app_secret is empty, _get_access_token raises immediately (no HTTP call made)."""
        svc = _make_full_service(app_id="test-app", app_secret="")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock()

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await svc._get_access_token()

        msg = str(exc_info.value)
        assert "PHOTONPAY_APP_ID" in msg, f"Expected PHOTONPAY_APP_ID in message, got: {msg}"
        assert "PHOTONPAY_APP_SECRET" in msg, f"Expected PHOTONPAY_APP_SECRET in message, got: {msg}"
        mock_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_unconfigured_service_returns_error_dict_not_exception(self):
        """create_alipay_session returns success=False (not an exception) when credentials are missing."""
        svc = _make_full_service(app_id="", app_secret="")

        result = await svc.create_alipay_session(
            amount=500.0,
            currency="PHP",
            description="Test payment",
        )

        assert result.get("success") is False
        assert "error" in result
        error_msg = result["error"]
        assert "PHOTONPAY_APP_ID" in error_msg and "not configured" in error_msg.lower(), (
            f"Expected credentials hint in error message, got: {error_msg}"
        )

    def test_is_configured_false_when_both_missing(self):
        """is_configured returns False when both app_id and app_secret are empty."""
        svc = _make_full_service(app_id="", app_secret="")
        assert svc.is_configured is False

    def test_is_configured_false_when_app_id_missing(self):
        """is_configured returns False when app_id is empty."""
        svc = _make_full_service(app_id="", app_secret="secret")
        assert svc.is_configured is False

    def test_is_configured_false_when_app_secret_missing(self):
        """is_configured returns False when app_secret is empty."""
        svc = _make_full_service(app_id="app-id", app_secret="")
        assert svc.is_configured is False

    def test_is_configured_false_when_site_id_missing(self):
        """is_configured returns False when site_id is empty.

        PHOTONPAY_SITE_ID is required for the cashier session API.  Without it the
        gateway rejects every payment request, so PhotonPay should be considered
        unconfigured and the cascade should skip to the next provider.
        """
        svc = _make_full_service(app_id="app-id", app_secret="secret", site_id="")
        assert svc.is_configured is False

    def test_is_configured_true_when_all_required_fields_present(self):
        """is_configured returns True when app_id, app_secret, and site_id are all set."""
        svc = _make_full_service(app_id="app-id", app_secret="secret", site_id="site-123")
        assert svc.is_configured is True


# ---------------------------------------------------------------------------
# Fallback behavior when PhotonPay is configured but auth fails
# ---------------------------------------------------------------------------

class TestPhotonPayConfiguredButFailing:
    """Validate that when PhotonPay credentials are set but the gateway rejects
    the request, create_alipay_session / create_wechat_session return a
    success=False dict (never raise) so that callers can fall back to
    PayMongo or Xendit without exposing the raw error to users."""

    @pytest.mark.asyncio
    async def test_gateway_rejection_alipay_returns_failure_dict(self):
        """Gateway-rejection (wrong credentials) makes create_alipay_session return success=False."""
        svc = _make_full_service(app_id="wrong-id", app_secret="wrong-secret")

        mock_response = MagicMock()
        mock_response.status_code = 200
        # Simulate PhotonPay gateway rejection response
        mock_response.json.return_value = {"path": "/token/accessToken", "method": "POST"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_alipay_session(
                amount=500.0,
                currency="PHP",
                description="Test payment",
            )

        # Must return a dict, never raise
        assert isinstance(result, dict)
        assert result.get("success") is False
        assert "error" in result
        error = result["error"]
        # Error must contain enough detail for admins to diagnose
        assert error, "Error message must not be empty"
        assert "PHOTONPAY_APP_ID" in error or "PHOTONPAY_APP_SECRET" in error or "rejected" in error.lower()

    @pytest.mark.asyncio
    async def test_gateway_rejection_wechat_returns_failure_dict(self):
        """Gateway-rejection (wrong credentials) makes create_wechat_session return success=False."""
        svc = _make_full_service(app_id="wrong-id", app_secret="wrong-secret")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"path": "/token/accessToken", "method": "POST"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_wechat_session(
                amount=200.0,
                currency="PHP",
                description="WeChat test",
            )

        assert isinstance(result, dict)
        assert result.get("success") is False
        assert "error" in result
        assert result["error"], "Error message must not be empty"

    def test_is_configured_true_for_wrong_credentials(self):
        """is_configured returns True for wrong-but-set credentials (fallback triggered on failure)."""
        # Credentials are set (non-empty) but wrong — is_configured must be True
        # so the code attempts PhotonPay first and falls back on failure.
        svc = _make_full_service(app_id="invalid-app-id", app_secret="invalid-secret", site_id="invalid-site")
        assert svc.is_configured is True, (
            "is_configured must be True when credentials are set even if they are wrong; "
            "the fallback is triggered by the failure result, not by is_configured=False."
        )

    @pytest.mark.asyncio
    async def test_auth_failure_error_includes_endpoint_info(self):
        """The failure error message from a gateway rejection includes endpoint context."""
        svc = _make_full_service()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"path": "/token/accessToken", "method": "POST"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_alipay_session(
                amount=100.0,
                currency="PHP",
                description="Test",
            )

        assert result.get("success") is False
        # The error should mention the token endpoint so admins can troubleshoot
        error = result.get("error", "")
        assert "Auth failed" in error or "token" in error.lower() or "photonpay" in error.lower(), (
            f"Expected endpoint context in error: {error!r}"
        )


# ---------------------------------------------------------------------------
# Complete fallback chain: PhotonPay → PayMongo → Xendit
# ---------------------------------------------------------------------------

class TestAlipayCompleteFallbackChain:
    """Validate that create_alipay_session returns success=False when PayMongo fails
    so that callers (telegram.py, photonpay.py router) can try Xendit next.

    The service itself only handles the single provider level; the full chain is
    assembled by the router/handler layer.  These tests verify that the service
    method correctly signals failure so the caller can continue to the next provider.
    """

    @pytest.mark.asyncio
    async def test_paymongo_failure_does_not_block_xendit_attempt(self):
        """Callers must be able to try Xendit after PayMongo signals success=False.

        The service (PhotonPayService) is not responsible for the full chain, but
        the failure dict it returns must have success=False so that caller logic
        can set result=None and fall through to Xendit.
        This test verifies the data contract: success=False ⟹ caller should try next provider.
        """
        svc = _make_full_service(app_id="wrong-id", app_secret="wrong-secret")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"path": "/token/accessToken", "method": "POST"}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_alipay_session(
                amount=500.0,
                currency="PHP",
                description="Test",
            )

        # Caller checks result.get("success") and if False, sets result=None to fall through
        assert result.get("success") is False, (
            "Service must return success=False when auth fails so caller can try next provider"
        )

    @pytest.mark.asyncio
    async def test_photonpay_success_skips_fallbacks(self):
        """When PhotonPay succeeds, the result has success=True so caller doesn't try fallbacks."""
        svc = _make_full_service()

        token_response = MagicMock()
        token_response.status_code = 200
        token_response.json.return_value = {
            "code": "0",
            "data": {"access_token": "tok-abc123", "expires_in": 7200},
        }

        cashier_response = MagicMock()
        cashier_response.status_code = 200
        cashier_response.raise_for_status = MagicMock()
        cashier_response.json.return_value = {
            "code": "0",
            "data": {"authCode": "auth-xyz", "payId": "pay-123"},
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        # First call = token, second call = cashierSession
        mock_client.post = AsyncMock(side_effect=[token_response, cashier_response])

        with patch("services.photonpay_service.httpx.AsyncClient", return_value=mock_client):
            result = await svc.create_alipay_session(
                amount=500.0,
                currency="PHP",
                description="Test",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/success",
            )

        assert result.get("success") is True
        assert result.get("auth_code") == "auth-xyz"
        assert result.get("pay_id") == "pay-123"


# ---------------------------------------------------------------------------
# Unit tests for _get_backend_url helper
# ---------------------------------------------------------------------------

class TestGetBackendUrl:
    """Verify that _get_backend_url returns absolute URLs in all configurations."""

    def _make_request(self, base_url: str = "http://testserver/"):
        """Return a minimal mock Request with a base_url attribute."""
        req = MagicMock()
        req.base_url = base_url
        return req

    def test_uses_settings_backend_url_when_available(self):
        """When settings.backend_url returns a non-empty value, that value is used."""
        import core.config as _cfg
        from routers.photonpay import _get_backend_url

        req = self._make_request()
        with patch.object(_cfg, "settings") as mock_settings:
            mock_settings.backend_url = "https://configured.example.com"
            result = _get_backend_url(req)

        assert result == "https://configured.example.com"

    def test_settings_url_strips_trailing_slash(self):
        """Trailing slash in settings.backend_url is removed."""
        import core.config as _cfg
        from routers.photonpay import _get_backend_url

        req = self._make_request()
        with patch.object(_cfg, "settings") as mock_settings:
            mock_settings.backend_url = "https://configured.example.com/"
            result = _get_backend_url(req)

        assert result == "https://configured.example.com"

    def test_request_base_url_used_when_settings_returns_empty(self):
        """When settings.backend_url returns empty string, request.base_url is used."""
        import core.config as _cfg
        from routers.photonpay import _get_backend_url

        req = self._make_request("https://inferred-from-request.example.com/")
        with patch.object(_cfg, "settings") as mock_settings:
            mock_settings.backend_url = ""
            result = _get_backend_url(req)

        assert result == "https://inferred-from-request.example.com"

    def test_request_base_url_strips_trailing_slash(self):
        """Trailing slash in request.base_url is removed."""
        import core.config as _cfg
        from routers.photonpay import _get_backend_url

        req = self._make_request("https://inferred-from-request.example.com/")
        with patch.object(_cfg, "settings") as mock_settings:
            mock_settings.backend_url = ""
            result = _get_backend_url(req)

        assert not result.endswith("/")

    def test_result_is_always_absolute(self):
        """The resulting URL must always start with http:// or https://."""
        import core.config as _cfg
        from routers.photonpay import _get_backend_url

        req = self._make_request("http://localhost:8000/")
        with patch.object(_cfg, "settings") as mock_settings:
            mock_settings.backend_url = ""
            result = _get_backend_url(req)

        assert result.startswith("http://") or result.startswith("https://"), (
            f"Expected absolute URL but got: {result!r}"
        )
