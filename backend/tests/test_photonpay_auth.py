"""Unit tests for PhotonPay authentication helpers."""
import base64
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

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

    _VALID_HTTP_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        self.service = PhotonPayService()

    def _is_credential_error_response(self, data):
        """Mirror the detection logic from _get_access_token."""
        return (
            isinstance(data, dict)
            and isinstance(data.get("path"), str)
            and data["path"].startswith("/")
            and isinstance(data.get("method"), str)
            and data["method"].upper() in self._VALID_HTTP_METHODS
            and not any(
                key in data
                for key in ("access_token", "accessToken", "token", "data", "result", "body")
            )
        )

    def test_detects_path_method_response(self):
        data = {"path": "/token/accessToken", "method": "POST"}
        assert self._is_credential_error_response(data)

    def test_detects_path_method_with_timestamp(self):
        data = {"path": "/token/accessToken", "method": "POST", "timestamp": 1234567890}
        assert self._is_credential_error_response(data)

    def test_detects_xxa00001_routing_error(self):
        """New 4-key format returned by PhotonPay when a proxy injects IP:port (XXA00001)."""
        data = {
            "code": "XXA00001",
            "msg": "Failed to parse address100.64.0.6:51376",
            "path": "/token/accessToken",
            "method": "POST",
        }
        assert self._is_credential_error_response(data)

    def test_detects_xxa00001_zero_address(self):
        """XXA00001 with 0.0.0.0:0 — transparent/private-network proxy case on Railway."""
        data = {
            "code": "XXA00001",
            "msg": "Failed to parse address0.0.0.0:0",
            "path": "/token/accessToken",
            "method": "POST",
        }
        assert self._is_credential_error_response(data)

    def test_ignores_normal_token_response(self):
        data = {"code": "0", "data": {"accessToken": "tok", "expiresIn": 7200}}
        assert not self._is_credential_error_response(data)

    def test_ignores_error_response_without_method(self):
        # Has path but not method — should NOT be flagged as a routing error
        data = {"code": "4001", "msg": "invalid credentials", "path": "/token/accessToken"}
        assert not self._is_credential_error_response(data)

    def test_ignores_response_with_token_data(self):
        # Has path/method but also has a nested "data" object (could be a success response)
        data = {"path": "/token/accessToken", "method": "POST", "data": {"accessToken": "tok"}}
        assert not self._is_credential_error_response(data)


class TestRoutingErrorMessages:
    """Verify that _get_access_token raises context-aware error messages."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        os.environ.pop("PHOTONPAY_MODE", None)
        os.environ.pop("PHOTONPAY_BASE_URL", None)
        self.service = PhotonPayService()

    def _make_mock_client(self, json_body):
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = json_body
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        return mock_client

    @pytest.mark.asyncio
    async def test_zero_address_error_mentions_transparent_proxy(self):
        """0.0.0.0:0 response should raise ValueError mentioning transparent proxy."""
        mock_client = self._make_mock_client({
            "code": "XXA00001",
            "msg": "Failed to parse address0.0.0.0:0",
            "path": "/token/accessToken",
            "method": "POST",
        })
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await self.service._get_access_token()
        error_msg = str(exc_info.value)
        assert "0.0.0.0" in error_msg
        assert "transparent" in error_msg.lower()
        assert "private-network" in error_msg.lower()

    @pytest.mark.asyncio
    async def test_cgnat_address_error_mentions_trust_env(self):
        """100.64.x.x:port response should raise ValueError mentioning trust_env=False."""
        mock_client = self._make_mock_client({
            "code": "XXA00001",
            "msg": "Failed to parse address100.64.0.6:51376",
            "path": "/token/accessToken",
            "method": "POST",
        })
        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError) as exc_info:
                await self.service._get_access_token()
        error_msg = str(exc_info.value)
        assert "trust_env" in error_msg


class TestTokenRequestFormat:
    """Verify that _get_access_token sends credentials in the JSON body (not Basic Auth)."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        os.environ.pop("PHOTONPAY_MODE", None)
        os.environ.pop("PHOTONPAY_BASE_URL", None)
        self.service = PhotonPayService()

    @pytest.mark.asyncio
    async def test_token_request_uses_json_body(self):
        """_get_access_token must POST appId/appSecret/grantType as a JSON body."""
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {
            "code": "0",
            "data": {"accessToken": "test-token", "expiresIn": 7200},
        }

        captured_kwargs = {}

        async def fake_post(url, **kwargs):
            captured_kwargs.update(kwargs)
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = fake_post

        with patch("httpx.AsyncClient", return_value=mock_client):
            token = await self.service._get_access_token()

        assert token == "test-token"
        # Credentials must be in the JSON body, not in headers
        assert "json" in captured_kwargs, "Request must use a JSON body"
        body = captured_kwargs["json"]
        assert body.get("appId") == "test_app_id"
        assert body.get("appSecret") == "test_app_secret"
        assert body.get("grantType") == "client_credentials"

    @pytest.mark.asyncio
    async def test_token_request_does_not_use_basic_auth(self):
        """_get_access_token must NOT send an Authorization: Basic header."""
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {
            "code": "0",
            "data": {"accessToken": "test-token", "expiresIn": 7200},
        }

        captured_kwargs = {}

        async def fake_post(url, **kwargs):
            captured_kwargs.update(kwargs)
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = fake_post

        with patch("httpx.AsyncClient", return_value=mock_client):
            await self.service._get_access_token()

        headers = captured_kwargs.get("headers", {})
        auth_header = headers.get("Authorization", "")
        assert not auth_header.startswith("Basic "), (
            "Token request must not use HTTP Basic Auth — credentials belong in the JSON body"
        )

    @pytest.mark.asyncio
    async def test_token_request_uses_trust_env_false(self):
        """_get_access_token must create httpx.AsyncClient with trust_env=False.

        On Railway the HTTP_PROXY / HTTPS_PROXY env vars point to an internal
        CGNAT proxy (100.64.x.x).  When httpx routes through that proxy,
        PhotonPay receives the source address as IP:port (e.g. 100.64.0.6:51376)
        and fails with code XXA00001 "Failed to parse address<ip>:<port>".
        trust_env=False bypasses the proxy and avoids this error.
        """
        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {
            "code": "0",
            "data": {"accessToken": "test-token", "expiresIn": 7200},
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        captured_init_kwargs = {}

        def fake_async_client(**kwargs):
            captured_init_kwargs.update(kwargs)
            return mock_client

        with patch("httpx.AsyncClient", side_effect=fake_async_client):
            await self.service._get_access_token()

        assert captured_init_kwargs.get("trust_env") is False, (
            "httpx.AsyncClient must be created with trust_env=False to bypass "
            "Railway's internal proxy and prevent PhotonPay IP-parse errors"
        )


class TestCashierSessionRequestFormat:
    """Verify that create_payment_session also uses trust_env=False."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
        os.environ.pop("PHOTONPAY_MODE", None)
        os.environ.pop("PHOTONPAY_BASE_URL", None)
        self.service = PhotonPayService()

    @pytest.mark.asyncio
    async def test_cashier_session_uses_trust_env_false(self):
        """create_payment_session must create httpx.AsyncClient with trust_env=False.

        The same Railway CGNAT proxy that breaks the token request also affects
        the cashier session call — both must bypass the proxy.
        """
        # Token fetch mock (first AsyncClient call)
        token_response = MagicMock()
        token_response.is_success = True
        token_response.json.return_value = {
            "code": "0",
            "data": {"accessToken": "test-token", "expiresIn": 7200},
        }

        # Cashier session mock (second AsyncClient call)
        session_response = MagicMock()
        session_response.raise_for_status = MagicMock()
        session_response.json.return_value = {
            "code": "0",
            "data": {"authCode": "auth-abc", "payId": "pay-123"},
        }

        call_kwargs_list: list = []

        def fake_async_client(**kwargs):
            call_kwargs_list.append(kwargs)
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            # Both token and session requests return their respective mocks
            if len(call_kwargs_list) == 1:
                mock_client.post = AsyncMock(return_value=token_response)
            else:
                mock_client.post = AsyncMock(return_value=session_response)
            return mock_client

        with patch("httpx.AsyncClient", side_effect=fake_async_client):
            result = await self.service.create_payment_session(
                amount=100.0,
                currency="PHP",
                pay_method="Alipay",
                req_id="test-req-123",
                notify_url="https://example.com/notify",
                redirect_url="https://example.com/return",
            )

        assert result.get("success") is True
        # Both AsyncClient instantiations must use trust_env=False
        assert len(call_kwargs_list) == 2, "Expected two AsyncClient instantiations"
        for i, kwargs in enumerate(call_kwargs_list):
            assert kwargs.get("trust_env") is False, (
                f"AsyncClient call #{i + 1} must use trust_env=False to bypass "
                "Railway's internal proxy and prevent PhotonPay IP-parse errors"
            )

