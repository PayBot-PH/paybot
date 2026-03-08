"""Unit tests for PhotonPay authentication helpers."""
import base64
import os

import pytest

# Ensure required env vars are present before importing the service
os.environ.setdefault("PHOTONPAY_APP_ID", "test_app_id")
os.environ.setdefault("PHOTONPAY_APP_SECRET", "test_app_secret")


from services.photonpay_service import PhotonPayService  # noqa: E402


class TestBasicAuthHeader:
    """Verify _basic_auth_header uses RFC 7617 colon separator."""

    def setup_method(self):
        os.environ["PHOTONPAY_APP_ID"] = "test_app_id"
        os.environ["PHOTONPAY_APP_SECRET"] = "test_app_secret"
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
