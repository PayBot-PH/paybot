"""Tests for PhotonPay webhook signature verification."""
import base64
import os

import pytest

# Set required env vars before importing the app or service
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_photonpay_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.asymmetric import rsa

from services.photonpay_service import PhotonPayService


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
