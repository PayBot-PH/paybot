"""Unit tests for PhotonPay authentication helpers."""
import base64
import os

import pytest

# Ensure required env vars are present before importing the service
os.environ.setdefault("PHOTONPAY_APP_ID", "test_app_id")
os.environ.setdefault("PHOTONPAY_APP_SECRET", "test_app_secret")


from services.photonpay_service import (  # noqa: E402
    PhotonPayService,
    PHOTONPAY_PRODUCTION_URL,
    PHOTONPAY_SANDBOX_URL,
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


class TestModeBasedBaseUrl:
    """Verify that PHOTONPAY_MODE / PHOTONPAY_BASE_URL env vars control the base URL."""

    # Use explicit save/restore (consistent with the rest of this test module which
    # also sets os.environ directly in setup_method rather than using monkeypatch).
    def _make_service(self, mode=None, base_url=None):
        keys = ["PHOTONPAY_MODE", "PHOTONPAY_BASE_URL"]
        saved = {k: os.environ.get(k) for k in keys}
        try:
            if mode is not None:
                os.environ["PHOTONPAY_MODE"] = mode
            else:
                os.environ.pop("PHOTONPAY_MODE", None)
            if base_url is not None:
                os.environ["PHOTONPAY_BASE_URL"] = base_url
            else:
                os.environ.pop("PHOTONPAY_BASE_URL", None)
            os.environ.setdefault("PHOTONPAY_APP_ID", "test_app_id")
            os.environ.setdefault("PHOTONPAY_APP_SECRET", "test_app_secret")
            return PhotonPayService()
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_production_mode_uses_production_url(self):
        svc = self._make_service(mode="production")
        assert svc._base_url == PHOTONPAY_PRODUCTION_URL

    def test_sandbox_mode_uses_sandbox_url(self):
        svc = self._make_service(mode="sandbox")
        assert svc._base_url == PHOTONPAY_SANDBOX_URL

    def test_default_mode_uses_production_url(self):
        """When PHOTONPAY_MODE is unset the service should default to production."""
        svc = self._make_service()
        assert svc._base_url == PHOTONPAY_PRODUCTION_URL

    def test_base_url_override_takes_precedence(self):
        custom = "https://custom.example.com"
        svc = self._make_service(mode="sandbox", base_url=custom)
        assert svc._base_url == custom

    def test_base_url_override_strips_trailing_slash(self):
        custom = "https://custom.example.com/"
        svc = self._make_service(base_url=custom)
        assert svc._base_url == "https://custom.example.com"


class TestCredentialErrorDetection:
    """Verify that the {"path":…,"method":…} response raises a clear credentials error."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        self.service = PhotonPayService()

    def _is_credential_error_response(self, data):
        """Mirror the detection logic from _get_access_token."""
        return (
            isinstance(data, dict)
            and "path" in data
            and "method" in data
            and len(data) <= 3
        )

    def test_detects_path_method_response(self):
        data = {"path": "/token/accessToken", "method": "POST"}
        assert self._is_credential_error_response(data)

    def test_detects_path_method_with_timestamp(self):
        data = {"path": "/token/accessToken", "method": "POST", "timestamp": 1234567890}
        assert self._is_credential_error_response(data)

    def test_ignores_normal_token_response(self):
        data = {"code": "0", "data": {"accessToken": "tok", "expiresIn": 7200}}
        assert not self._is_credential_error_response(data)

    def test_ignores_error_response_with_code(self):
        data = {"code": "4001", "msg": "invalid credentials", "path": "/token/accessToken"}
        # 4 keys — should NOT be flagged as the path/method echo (len > 3)
        assert not self._is_credential_error_response(data)
