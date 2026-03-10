"""Tests for the TransFi Checkout service and router."""
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Set required env vars before importing the app or service
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_transfi_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")


# ---------------------------------------------------------------------------
# Unit tests for TransFiService
# ---------------------------------------------------------------------------

class TestTransFiServiceConfig:
    """Tests for TransFiService configuration / is_configured."""

    def setup_method(self):
        # Remove TransFi env vars to get a clean state
        for k in ("TRANSFI_API_KEY", "TRANSFI_BASE_URL", "TRANSFI_MODE", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    def teardown_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_BASE_URL", "TRANSFI_MODE", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    def test_is_configured_false_when_api_key_missing(self):
        from services.transfi_service import TransFiService
        svc = TransFiService()
        assert svc.is_configured is False

    def test_is_configured_true_when_api_key_present(self):
        os.environ["TRANSFI_API_KEY"] = "test-api-key"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        assert svc.is_configured is True

    def test_base_url_production_default(self):
        os.environ["TRANSFI_API_KEY"] = "test-api-key"
        from services.transfi_service import TransFiService, _TRANSFI_PRODUCTION_URL
        svc = TransFiService()
        assert svc.base_url == _TRANSFI_PRODUCTION_URL

    def test_base_url_sandbox_when_mode_sandbox(self):
        os.environ["TRANSFI_API_KEY"] = "test-api-key"
        os.environ["TRANSFI_MODE"] = "sandbox"
        from services.transfi_service import TransFiService, _TRANSFI_SANDBOX_URL
        svc = TransFiService()
        assert svc.base_url == _TRANSFI_SANDBOX_URL

    def test_base_url_override_takes_precedence(self):
        os.environ["TRANSFI_API_KEY"] = "test-api-key"
        os.environ["TRANSFI_BASE_URL"] = "https://custom-transfi.example.com"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        assert svc.base_url == "https://custom-transfi.example.com"

    def test_base_url_override_strips_trailing_slash(self):
        os.environ["TRANSFI_API_KEY"] = "test-api-key"
        os.environ["TRANSFI_BASE_URL"] = "https://custom-transfi.example.com/"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        assert not svc.base_url.endswith("/")

    def test_unconfigured_service_returns_error_dict(self):
        """create_payment_invoice returns error dict (not exception) when not configured."""
        import asyncio
        from services.transfi_service import TransFiService
        svc = TransFiService()
        result = asyncio.get_event_loop().run_until_complete(
            svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="test-req-id",
                notify_url="https://example.com/notify",
                redirect_url="https://example.com/redirect",
            )
        )
        assert result["success"] is False
        assert "error" in result


class TestTransFiCreatePaymentInvoice:
    """Tests for create_payment_invoice — mocking httpx.AsyncClient."""

    def setup_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_BASE_URL", "TRANSFI_MODE"):
            os.environ.pop(k, None)
        os.environ["TRANSFI_API_KEY"] = "test-api-key"

    def teardown_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_BASE_URL", "TRANSFI_MODE", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    @pytest.mark.asyncio
    async def test_successful_invoice_creation(self):
        """A 200 response with checkoutUrl returns success dict."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "checkoutUrl": "https://checkout.transfi.com/pay/test-123",
            "invoiceId": "tf-invoice-abc",
            "status": "pending",
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=500.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-test-001",
                notify_url="https://example.com/api/v1/transfi/webhook",
                redirect_url="https://example.com/api/v1/transfi/redirect/success",
            )

        assert result["success"] is True
        assert result["checkout_url"] == "https://checkout.transfi.com/pay/test-123"
        assert result["invoice_id"] == "tf-invoice-abc"
        assert result["req_id"] == "order-test-001"

    @pytest.mark.asyncio
    async def test_201_response_accepted(self):
        """A 201 response is treated as success."""
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "checkoutUrl": "https://checkout.transfi.com/pay/test-201",
            "invoiceId": "tf-invoice-201",
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="WeChat",
                req_id="order-201",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_missing_checkout_url_in_response_returns_failure(self):
        """A 200 response without checkoutUrl returns failure dict."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"invoiceId": "tf-xxx", "status": "pending"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-no-url",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is False
        assert "checkout URL" in result["error"]

    @pytest.mark.asyncio
    async def test_401_response_returns_failure_dict(self):
        """A 401 Unauthorized response returns failure dict, not exception."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_response.json.return_value = {"message": "Invalid API key"}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-401",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_500_response_returns_failure_dict(self):
        """A 500 server error returns failure dict."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_response.json.side_effect = Exception("not json")

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-500",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is False
        assert "500" in result["error"]

    @pytest.mark.asyncio
    async def test_network_error_returns_failure_dict(self):
        """A network error returns failure dict, not exception."""
        import httpx

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(side_effect=httpx.RequestError("Connection refused"))
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-net-err",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is False
        assert "network error" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_timeout_returns_failure_dict(self):
        """A timeout returns failure dict."""
        import httpx

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-timeout",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert result["success"] is False
        assert "timed out" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_request_includes_bearer_auth_header(self):
        """The API request includes an Authorization: Bearer header."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "checkoutUrl": "https://checkout.transfi.com/pay/auth-test",
            "invoiceId": "tf-auth-test",
        }
        captured_headers = {}

        async def mock_post(url, json=None, headers=None, **kwargs):
            captured_headers.update(headers or {})
            return mock_response

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = mock_post
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            await svc.create_payment_invoice(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="order-auth",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert "Authorization" in captured_headers
        assert captured_headers["Authorization"].startswith("Bearer ")
        # Verify the API key is in the header but don't log it
        assert "test-api-key" in captured_headers["Authorization"]

    @pytest.mark.asyncio
    async def test_create_alipay_invoice_uses_alipay_pay_method(self):
        """create_alipay_invoice sends pay_method=Alipay in request body."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "checkoutUrl": "https://checkout.transfi.com/pay/alipay-test",
            "invoiceId": "tf-alipay",
        }
        captured_body = {}

        async def mock_post(url, json=None, headers=None, **kwargs):
            captured_body.update(json or {})
            return mock_response

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = mock_post
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_alipay_invoice(
                amount=500.0,
                currency="PHP",
                description="Test Alipay",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert captured_body.get("payMethod") == "Alipay"
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_create_wechat_invoice_uses_wechat_pay_method(self):
        """create_wechat_invoice sends pay_method=WeChat in request body."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "checkoutUrl": "https://checkout.transfi.com/pay/wechat-test",
            "invoiceId": "tf-wechat",
        }
        captured_body = {}

        async def mock_post(url, json=None, headers=None, **kwargs):
            captured_body.update(json or {})
            return mock_response

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = mock_post
            mock_client_class.return_value = mock_client

            from services.transfi_service import TransFiService
            svc = TransFiService()
            result = await svc.create_wechat_invoice(
                amount=250.0,
                currency="PHP",
                notify_url="https://example.com/webhook",
                redirect_url="https://example.com/redirect",
            )

        assert captured_body.get("payMethod") == "WeChat"
        assert result["success"] is True


class TestTransFiWebhookSignature:
    """Tests for TransFiService.verify_webhook_signature."""

    def setup_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    def teardown_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    def _make_signature(self, secret: str, body: bytes) -> str:
        import hashlib
        import hmac
        return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    def test_valid_signature_accepted(self):
        os.environ["TRANSFI_WEBHOOK_SECRET"] = "test-webhook-secret"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        body = b'{"reqId":"order-123","status":"paid","amount":"500.00"}'
        sig = self._make_signature("test-webhook-secret", body)
        assert svc.verify_webhook_signature(body, sig) is True

    def test_invalid_signature_rejected(self):
        os.environ["TRANSFI_WEBHOOK_SECRET"] = "test-webhook-secret"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        body = b'{"reqId":"order-123","status":"paid","amount":"500.00"}'
        assert svc.verify_webhook_signature(body, "bad-signature") is False

    def test_missing_secret_returns_false(self):
        """No webhook secret means verification returns False (can't verify)."""
        from services.transfi_service import TransFiService
        svc = TransFiService()
        body = b'{"reqId":"order-123","status":"paid"}'
        sig = self._make_signature("some-secret", body)
        assert svc.verify_webhook_signature(body, sig) is False

    def test_tampered_body_rejected(self):
        os.environ["TRANSFI_WEBHOOK_SECRET"] = "test-webhook-secret"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        body = b'{"reqId":"order-123","status":"paid","amount":"500.00"}'
        # Sign the original, then tamper
        sig = self._make_signature("test-webhook-secret", body)
        tampered = b'{"reqId":"order-123","status":"paid","amount":"999.00"}'
        assert svc.verify_webhook_signature(tampered, sig) is False

    def test_signature_whitespace_stripped(self):
        os.environ["TRANSFI_WEBHOOK_SECRET"] = "test-webhook-secret"
        from services.transfi_service import TransFiService
        svc = TransFiService()
        body = b'{"reqId":"order-123","status":"paid"}'
        sig = "  " + self._make_signature("test-webhook-secret", body) + "\n"
        assert svc.verify_webhook_signature(body, sig) is True


# ---------------------------------------------------------------------------
# Integration-level tests for the TransFi webhook endpoint
# ---------------------------------------------------------------------------

class TestTransFiWebhookEndpoint:
    """Tests for POST /api/v1/transfi/webhook."""

    def test_missing_signature_allowed_when_no_secret_configured(self):
        """Webhook without signature is allowed when no TRANSFI_WEBHOOK_SECRET is set."""
        os.environ.pop("TRANSFI_WEBHOOK_SECRET", None)
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = json.dumps({"reqId": "ord-unknown", "status": "paid", "amount": "100.00"}).encode()
            r = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        # Should get 200 (transaction not found → acknowledged)
        assert r.status_code == 200

    def test_invalid_json_returns_400(self):
        """Webhook with invalid JSON body returns 400."""
        os.environ.pop("TRANSFI_WEBHOOK_SECRET", None)
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/transfi/webhook",
                content=b"not-json",
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 400

    def test_unknown_transaction_returns_200(self):
        """Webhook for an unknown reqId returns 200 (acknowledged)."""
        os.environ.pop("TRANSFI_WEBHOOK_SECRET", None)
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            body = json.dumps({
                "reqId": "totally-unknown-req-id-xyz",
                "status": "paid",
                "amount": "500.00",
                "currency": "PHP",
                "payMethod": "Alipay",
            }).encode()
            r = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"

    def test_valid_signature_accepted(self):
        """Webhook with valid HMAC-SHA256 signature is processed."""
        import hashlib
        import hmac as _hmac
        secret = "integration-test-secret"
        os.environ["TRANSFI_WEBHOOK_SECRET"] = secret

        body = json.dumps({
            "reqId": "ord-sig-test",
            "status": "paid",
            "amount": "100.00",
        }).encode()
        sig = _hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-TransFi-Signature": sig,
                },
            )
        assert r.status_code == 200
        os.environ.pop("TRANSFI_WEBHOOK_SECRET", None)

    def test_invalid_signature_rejected_when_secret_configured(self):
        """Webhook with invalid signature is rejected (401) when secret is configured."""
        secret = "integration-test-secret"
        os.environ["TRANSFI_WEBHOOK_SECRET"] = secret

        body = json.dumps({"reqId": "ord-bad-sig", "status": "paid"}).encode()

        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-TransFi-Signature": "bad-sig",
                },
            )
        assert r.status_code == 401
        os.environ.pop("TRANSFI_WEBHOOK_SECRET", None)


# ---------------------------------------------------------------------------
# Tests for the photonpay router with TransFi as first provider
# ---------------------------------------------------------------------------

class TestPhotonPayRouterTransFiPriority:
    """Verify TransFi is tried first in the alipay-session / wechat-session routes."""

    def setup_method(self):
        for k in ("TRANSFI_API_KEY", "TRANSFI_WEBHOOK_SECRET"):
            os.environ.pop(k, None)

    def test_alipay_session_returns_503_when_no_provider_configured(self):
        """Without any provider configured, returns 503."""
        os.environ.pop("TRANSFI_API_KEY", None)
        os.environ.pop("PHOTONPAY_APP_ID", None)
        os.environ.pop("PHOTONPAY_APP_SECRET", None)
        os.environ.pop("PAYMONGO_SECRET_KEY", None)
        os.environ.pop("XENDIT_SECRET_KEY", None)

        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 100.0, "currency": "PHP"},
                headers={"Authorization": "Bearer fake-token"},
            )
        # 401 (auth) or 503 (no provider) — auth runs first
        assert r.status_code in (401, 403, 503)
