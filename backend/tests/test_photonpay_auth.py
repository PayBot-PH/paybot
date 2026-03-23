"""Unit tests for PhotonPay authentication helpers."""
import base64
import os

import pytest

# Ensure required env vars are present before importing the service
os.environ.setdefault("PHOTONPAY_APP_ID", "test_app_id")
os.environ.setdefault("PHOTONPAY_APP_SECRET", "test_app_secret")


from services.photonpay_service import (  # noqa: E402
    PhotonPayService,
    _PHOTONPAY_PRODUCTION_BASE_URL,
    _PHOTONPAY_PRODUCTION_CASHIER_URL,
    _PHOTONPAY_SANDBOX_BASE_URL,
    _PHOTONPAY_SANDBOX_CASHIER_URL,
)


class TestBasicAuthHeader:
    """Verify _basic_auth_header uses RFC 7617 colon separator."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        os.environ.pop("PHOTONPAY_MODE", None)
        os.environ.pop("PHOTONPAY_BASE_URL", None)
        os.environ.pop("PHOTONPAY_CASHIER_URL", None)
        self.service = PhotonPayService()

    def test_header_starts_with_basic(self):
        header = self.service._basic_auth_header()
        assert header.startswith("Basic "), "Authorization header must start with 'Basic '"

    def test_uses_colon_separator(self):
        """Decoded credentials must be app_id:app_secret (colon, not slash)."""
        header = self.service._basic_auth_header()
        encoded = header[len("Basic "):]
        decoded = base64.b64decode(encoded).decode()
        assert decoded == "test_app_id:test_app_secret"

    def test_not_slash_separator(self):
        """Slash separator must NOT be used — it was the previous (broken) behaviour."""
        header = self.service._basic_auth_header()
        encoded = header[len("Basic "):]
        decoded = base64.b64decode(encoded).decode()
        assert "/" not in decoded, "Credentials must not contain a slash separator"

    def test_expected_base64_value(self):
        """Verify the exact base64 output for known credentials."""
        expected_raw = "test_app_id:test_app_secret"
        expected_b64 = base64.b64encode(expected_raw.encode()).decode()
        header = self.service._basic_auth_header()
        assert header == f"Basic {expected_b64}"

    def test_different_credentials(self):
        """Ensure the encoding is correct for arbitrary credentials."""
        os.environ["PHOTONPAY_APP_ID"] = "myApp123"
        os.environ["PHOTONPAY_APP_SECRET"] = "superSecret!"
        svc = PhotonPayService()
        header = svc._basic_auth_header()
        encoded = header[len("Basic "):]
        decoded = base64.b64decode(encoded).decode()
        assert decoded == "myApp123:superSecret!"


class TestTokenPayloadExtraction:
    """Verify token extraction works across PhotonPay response variants."""

    def setup_method(self):
        self.service = PhotonPayService()

    def test_extract_from_root_fields(self):
        payload = {"access_token": "root-token", "expires_in": 3600}
        token_data = self.service._extract_token_payload(payload)
        assert token_data["access_token"] == "root-token"

    def test_extract_from_data_object(self):
        payload = {"code": 0, "data": {"accessToken": "data-token", "expiresIn": 7200}}
        token_data = self.service._extract_token_payload(payload)
        assert token_data["accessToken"] == "data-token"

    def test_extract_from_nested_result(self):
        payload = {
            "code": "0",
            "data": {
                "result": {
                    "token": "nested-token",
                    "expires_in": 1800,
                }
            },
        }
        token_data = self.service._extract_token_payload(payload)
        assert token_data["token"] == "nested-token"

    def test_fallback_returns_payload_when_no_token_keys(self):
        payload = {"code": "200", "msg": "ok", "data": {"foo": "bar"}}
        token_data = self.service._extract_token_payload(payload)
        assert token_data is payload


class TestBaseUrlSelection:
    """Verify the service picks the correct base URL based on PHOTONPAY_MODE."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        # Reset overrides before each test
        for key in ("PHOTONPAY_MODE", "PHOTONPAY_BASE_URL", "PHOTONPAY_CASHIER_URL"):
            os.environ.pop(key, None)

    def test_production_mode_uses_production_url(self):
        os.environ["PHOTONPAY_MODE"] = "production"
        svc = PhotonPayService()
        assert svc.base_url == _PHOTONPAY_PRODUCTION_BASE_URL
        assert svc.cashier_url == _PHOTONPAY_PRODUCTION_CASHIER_URL

    def test_live_mode_uses_production_url(self):
        os.environ["PHOTONPAY_MODE"] = "live"
        svc = PhotonPayService()
        assert svc.base_url == _PHOTONPAY_PRODUCTION_BASE_URL

    def test_sandbox_mode_uses_sandbox_url(self):
        os.environ["PHOTONPAY_MODE"] = "sandbox"
        svc = PhotonPayService()
        assert svc.base_url == _PHOTONPAY_SANDBOX_BASE_URL
        assert svc.cashier_url == _PHOTONPAY_SANDBOX_CASHIER_URL

    def test_uat_mode_uses_sandbox_url(self):
        os.environ["PHOTONPAY_MODE"] = "uat"
        svc = PhotonPayService()
        assert svc.base_url == _PHOTONPAY_SANDBOX_BASE_URL

    def test_base_url_override_takes_precedence(self):
        os.environ["PHOTONPAY_MODE"] = "sandbox"
        os.environ["PHOTONPAY_BASE_URL"] = "https://custom.example.com"
        svc = PhotonPayService()
        assert svc.base_url == "https://custom.example.com"

    def test_cashier_url_override_takes_precedence(self):
        os.environ["PHOTONPAY_MODE"] = "sandbox"
        os.environ["PHOTONPAY_CASHIER_URL"] = "https://custom-cashier.example.com"
        svc = PhotonPayService()
        assert svc.cashier_url == "https://custom-cashier.example.com"

    def test_trailing_slash_stripped_from_override(self):
        os.environ["PHOTONPAY_BASE_URL"] = "https://custom.example.com/"
        svc = PhotonPayService()
        assert svc.base_url == "https://custom.example.com"

    def test_default_mode_is_production(self):
        """When PHOTONPAY_MODE is absent the service should default to production."""
        svc = PhotonPayService()
        assert svc.base_url == _PHOTONPAY_PRODUCTION_BASE_URL


class TestInvalidCredentialsResponseDetection:
    """Verify the service raises a clear error for PhotonPay's invalid-credentials response."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        for key in ("PHOTONPAY_MODE", "PHOTONPAY_BASE_URL", "PHOTONPAY_CASHIER_URL"):
            os.environ.pop(key, None)
        self.service = PhotonPayService()

    @pytest.mark.asyncio
    async def test_path_method_response_raises_credentials_error(self):
        """The {"path":…,"method":…} response must produce a helpful error message."""
        import httpx
        from unittest.mock import AsyncMock, MagicMock, patch

        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "path": "/token/accessToken",
            "method": "POST",
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await self.service._get_access_token()

        error_msg = str(exc_info.value)
        assert "authentication failed" in error_msg.lower()
        assert "PHOTONPAY_MODE" in error_msg
        # Token must NOT be cached after a failed auth attempt
        assert self.service._access_token is None

    @pytest.mark.asyncio
    async def test_path_method_with_extra_keys_does_not_trigger(self):
        """A response that contains path/method BUT also has a token should work normally."""
        import httpx
        from unittest.mock import AsyncMock, MagicMock, patch

        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "path": "/token/accessToken",
            "method": "POST",
            "access_token": "tok123",
            "expires_in": 3600,
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            token = await self.service._get_access_token()

        assert token == "tok123"
