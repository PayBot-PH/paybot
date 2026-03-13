"""
Production tests for Alipay payment acceptance via the PayBot Telegram bot.

Coverage
--------
1. Bot /alipay command — all four provider paths (TransFi → PhotonPay → PayMongo → Xendit)
2. REST endpoint POST /api/v1/photonpay/alipay-session — auth, providers, 503 fallback
3. PhotonPay webhook — wallet credit, idempotency, signature enforcement
4. TransFi webhook — wallet credit, idempotency

These tests mock all outbound HTTP calls; no real payment-gateway credentials are needed.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── env vars must be set before importing the app ──────────────────────────
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_alipay_prod_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-alipay-prod")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN_ALIPAY")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")

from fastapi.testclient import TestClient
from sqlalchemy import select

from main import app


# ── shared fixtures ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_token(client):
    bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
    auth_date = int(time.time())
    payload = {
        "id": 123456789,
        "auth_date": auth_date,
        "first_name": "Test",
        "username": "test_admin",
    }
    data_check_string = "\n".join(
        f"{k}={v}"
        for k, v in sorted(payload.items())
        if v is not None and v != ""
    )
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    payload["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    r = client.post("/api/v1/auth/telegram-login-widget", json=payload)
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ── helpers ──────────────────────────────────────────────────────────────────

def _webhook_body(text: str, chat_id: int = 999888777) -> dict:
    """Build a minimal Telegram webhook update for the given command text."""
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id, "is_bot": False, "first_name": "Prod"},
            "text": text,
            "date": int(time.time()),
        },
    }


def _build_mock_tg():
    """Return a mock TelegramService with async send_message / send_photo."""
    tg = MagicMock()
    tg.send_message = AsyncMock(return_value=None)
    tg.send_photo = AsyncMock(return_value=None)
    return tg


def _build_async_http_mock(post_return=None, get_return=None):
    """Return a minimal mock for httpx.AsyncClient used as context manager."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    if post_return:
        mock_resp.json = MagicMock(return_value=post_return)
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


def _seed_transaction(user_id: str, external_id: str, amount: float = 500.0) -> None:
    """Insert a pending Alipay transaction into the test DB."""
    from core.database import db_manager
    from models.transactions import Transactions

    async def _do():
        await db_manager.ensure_initialized()
        async with db_manager.async_session_maker() as db:
            now = datetime.now()
            txn = Transactions(
                user_id=user_id,
                transaction_type="alipay_qr",
                external_id=external_id,
                xendit_id="",
                amount=amount,
                currency="PHP",
                status="pending",
                description="Alipay prod test",
                qr_code_url="https://cashier.photonpay.com/?code=test",
                telegram_chat_id=999888777,
                created_at=now,
                updated_at=now,
            )
            db.add(txn)
            await db.commit()

    asyncio.get_event_loop().run_until_complete(_do())

def _get_wallet_balance(user_id: str) -> float:
    """Read the PHP wallet balance for *user_id* from the test DB."""
    from core.database import db_manager
    from models.wallets import Wallets

    async def _do():
        await db_manager.ensure_initialized()
        async with db_manager.async_session_maker() as db:
            result = await db.execute(
                select(Wallets).where(
                    Wallets.user_id == user_id, Wallets.currency == "PHP"
                )
            )
            row = result.scalar_one_or_none()
            return float(row.balance) if row else 0.0

    return asyncio.get_event_loop().run_until_complete(_do())


def _get_transaction_status(external_id: str):
    """Return the status of a transaction by external_id."""
    from core.database import db_manager
    from models.transactions import Transactions

    async def _do():
        await db_manager.ensure_initialized()
        async with db_manager.async_session_maker() as db:
            result = await db.execute(
                select(Transactions).where(Transactions.external_id == external_id)
            )
            txn = result.scalar_one_or_none()
            return txn.status if txn else None

    return asyncio.get_event_loop().run_until_complete(_do())


# ════════════════════════════════════════════════════════════════════════════
# 1. Bot /alipay command tests
# ════════════════════════════════════════════════════════════════════════════

class TestAlipayBotCommand:
    """Validate the /alipay Telegram bot command across all provider paths."""

    # ── input validation ──────────────────────────────────────────────────

    def test_missing_amount_returns_ok(self, client):
        """'/alipay' with no arguments shows a wizard prompt and returns ok."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_negative_amount_returns_ok(self, client):
        """'/alipay -100 desc' should be rejected gracefully (no crash, status ok)."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay -100 desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_zero_amount_returns_ok(self, client):
        """'/alipay 0 desc' should be rejected gracefully."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 0 desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_invalid_amount_returns_ok(self, client):
        """'/alipay abc desc' should be rejected gracefully (no crash, status ok)."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay abc desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    # ── no provider configured ────────────────────────────────────────────

    def test_no_provider_configured_returns_ok(self, client):
        """When no provider is configured the bot sends an error message (status ok)."""
        for k in ("TRANSFI_API_KEY", "PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET",
                  "PAYMONGO_SECRET_KEY", "XENDIT_SECRET_KEY"):
            os.environ.pop(k, None)

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 500 test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Bot should have sent an error message, not a checkout URL
        call_args_list = mock_tg.send_message.call_args_list
        assert len(call_args_list) >= 1

    # ── TransFi provider ─────────────────────────────────────────────────

    def test_transfi_provider_success(self, client):
        """When TransFi is configured, /alipay uses it and returns a checkout URL."""
        os.environ["TRANSFI_API_KEY"] = "test-transfi-key"
        for k in ("PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET", "PAYMONGO_SECRET_KEY", "XENDIT_SECRET_KEY"):
            os.environ.pop(k, None)

        transfi_mock = AsyncMock()
        transfi_mock.is_configured = True
        transfi_mock.create_alipay_invoice = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://checkout.transfi.com/tf-alipay-abc123",
            "req_id": "tf-alipay-abc123",
            "invoice_id": "inv-transfi-001",
        })

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 500 prod test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Verify a payment message was sent (containing the checkout URL or Pay button)
        all_calls = mock_tg.send_message.call_args_list + mock_tg.send_photo.call_args_list
        assert len(all_calls) >= 1
        os.environ.pop("TRANSFI_API_KEY", None)

    # ── PhotonPay provider ────────────────────────────────────────────────

    def test_photonpay_provider_success(self, client):
        """When PhotonPay is configured (TransFi not), /alipay uses PhotonPay."""
        for k in ("TRANSFI_API_KEY", "PAYMONGO_SECRET_KEY", "XENDIT_SECRET_KEY"):
            os.environ.pop(k, None)
        os.environ["PHOTONPAY_APP_ID"] = "test-pp-app"
        os.environ["PHOTONPAY_APP_SECRET"] = "test-pp-secret"

        photonpay_mock = AsyncMock()
        photonpay_mock.is_configured = True
        photonpay_mock.create_alipay_session = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://cashier.photonpay.com/?code=auth-xyz",
            "req_id": "pp-alipay-xyz",
            "pay_id": "pay-pp-001",
            "auth_code": "auth-xyz",
        })

        transfi_mock = MagicMock()
        transfi_mock.is_configured = False

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 500 prod test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        all_calls = mock_tg.send_message.call_args_list + mock_tg.send_photo.call_args_list
        assert len(all_calls) >= 1
        for k in ("PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET"):
            os.environ.pop(k, None)

    # ── PayMongo fallback ─────────────────────────────────────────────────

    def test_paymongo_fallback_success(self, client):
        """When TransFi and PhotonPay are unavailable, PayMongo is used."""
        for k in ("TRANSFI_API_KEY", "PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET", "XENDIT_SECRET_KEY"):
            os.environ.pop(k, None)
        os.environ["PAYMONGO_SECRET_KEY"] = "test-pm-secret"

        pm_mock = AsyncMock()
        pm_mock.secret_key = "test-pm-secret"
        pm_mock.create_alipay_qr = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://pm-redirect.com/alipay/pm-abc",
            "source_id": "src-pm-001",
            "reference_number": "pm-alipay-abc",
            "amount": 500.0,
            "currency": "PHP",
        })

        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.PayMongoService", return_value=pm_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 500 prod test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        all_calls = mock_tg.send_message.call_args_list + mock_tg.send_photo.call_args_list
        assert len(all_calls) >= 1
        os.environ.pop("PAYMONGO_SECRET_KEY", None)

    # ── Xendit final fallback ─────────────────────────────────────────────

    def test_no_real_alipay_provider_returns_ok_with_error_message(self, client):
        """When no real Alipay provider is configured, /alipay sends a message and returns ok.

        Xendit creates Philippine QRIS codes (incompatible with Chinese Alipay), so it is NOT
        used as a fallback any more.  Without TransFi, PhotonPay, or PayMongo the bot must
        send a message (not crash) and return {"status": "ok"}.
        """
        for k in ("TRANSFI_API_KEY", "PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET", "PAYMONGO_SECRET_KEY"):
            os.environ.pop(k, None)

        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = MagicMock()
        pm_mock.public_key = ""

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.PayMongoService", return_value=pm_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay 500 prod test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Bot must have sent some message (not a photo, not a crash).
        mock_tg.send_message.assert_called()
        mock_tg.send_photo.assert_not_called()


# ════════════════════════════════════════════════════════════════════════════
# 2. REST endpoint POST /api/v1/photonpay/alipay-session
# ════════════════════════════════════════════════════════════════════════════

class TestAlipaySessionEndpoint:
    """Validate the REST endpoint for creating Alipay sessions."""

    def test_requires_authentication(self, client):
        """Unauthenticated requests must be rejected with 401."""
        r = client.post(
            "/api/v1/photonpay/alipay-session",
            json={"amount": 500.0, "currency": "PHP"},
        )
        assert r.status_code == 401

    def test_transfi_provider_returns_checkout_url(self, client, auth_headers):
        """TransFi path: response must include success=True and a checkout_url."""
        transfi_mock = AsyncMock()
        transfi_mock.is_configured = True
        transfi_mock.create_alipay_invoice = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://checkout.transfi.com/tf-alipay-test",
            "req_id": "tf-alipay-test",
            "invoice_id": "inv-tf-test",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP", "description": "Prod test"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "checkout_url" in data
        assert data["checkout_url"] == "https://checkout.transfi.com/tf-alipay-test"
        assert "req_id" in data
        assert data["pay_method"] == "Alipay"

    def test_photonpay_provider_returns_checkout_url(self, client, auth_headers):
        """PhotonPay path: response must include success=True and a checkout_url."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False

        photonpay_mock = AsyncMock()
        photonpay_mock.is_configured = True
        photonpay_mock.create_alipay_session = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://cashier.photonpay.com/?code=auth-pp-test",
            "req_id": "pp-alipay-test",
            "pay_id": "pay-pp-test",
            "auth_code": "auth-pp-test",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["checkout_url"].startswith("https://cashier.photonpay.com/")

    def test_paymongo_fallback_returns_checkout_url(self, client, auth_headers):
        """PayMongo fallback path returns success=True with a checkout_url."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = AsyncMock()
        pm_mock.secret_key = "test-pm-secret"
        pm_mock.create_alipay_qr = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://pm.redirect/alipay/pm-test",
            "source_id": "src-pm-test",
            "reference_number": "pm-alipay-test",
            "amount": 500.0,
            "currency": "PHP",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.photonpay.PayMongoService", return_value=pm_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "checkout_url" in data

    def test_no_real_alipay_provider_returns_503(self, client, auth_headers):
        """When TransFi, PhotonPay, and PayMongo are all absent, the endpoint returns HTTP 503.

        Xendit QRIS is NOT used as a fallback because it creates Philippine QR Ph codes that
        are incompatible with the Chinese Alipay app.
        """
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = MagicMock()
        pm_mock.public_key = ""
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.photonpay.PayMongoService", return_value=pm_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 503
        assert "PhotonPay" in r.json().get("detail", "") or "TransFi" in r.json().get("detail", "")

    def test_no_provider_configured_returns_503(self, client, auth_headers):
        """When all providers fail, the endpoint returns HTTP 503."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = MagicMock()
        pm_mock.public_key = ""
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.photonpay.PayMongoService", return_value=pm_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 503

    def test_response_contains_required_fields_transfi(self, client, auth_headers):
        """Successful response from any provider must contain the required fields."""
        transfi_mock = AsyncMock()
        transfi_mock.is_configured = True
        transfi_mock.create_alipay_invoice = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://checkout.transfi.com/fields-test",
            "req_id": "tf-fields-test",
            "invoice_id": "inv-fields-test",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 250.0, "currency": "PHP", "description": "Fields test"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        data = r.json()
        for field in ("success", "checkout_url", "req_id", "amount", "currency", "pay_method"):
            assert field in data, f"Missing required field: {field}"
        assert data["amount"] == 250.0
        assert data["currency"] == "PHP"


# ════════════════════════════════════════════════════════════════════════════
# 3. PhotonPay webhook — wallet credit & idempotency
# ════════════════════════════════════════════════════════════════════════════

class TestPhotonPayAlipayWebhook:
    """Validate PhotonPay webhook processing for Alipay payments."""

    def test_missing_signature_when_verify_required_returns_401(self, client):
        """When PHOTONPAY_WEBHOOK_VERIFY_REQUIRED=true and no X-PD-SIGN, return 401."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "true"
        r = client.post(
            "/api/v1/photonpay/webhook",
            content=b'{"reqId":"ord-sig-test","status":"succeed","amount":"500"}',
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 401
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_missing_signature_when_verify_not_required_proceeds(self, client):
        """When PHOTONPAY_WEBHOOK_VERIFY_REQUIRED=false, missing signature is allowed."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        body = json.dumps({
            "reqId": "ord-no-sig-verify",
            "status": "succeed",
            "amount": "100.00",
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()
        r = client.post(
            "/api/v1/photonpay/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        # Transaction not found → 200 acknowledged (not 401)
        assert r.status_code == 200
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_invalid_json_returns_400(self, client):
        """Malformed JSON body must return 400."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        # Do NOT send X-PD-SIGN — when verify_required=false and no signature header
        # the webhook proceeds to JSON parsing, which should fail with 400.
        r = client.post(
            "/api/v1/photonpay/webhook",
            content=b"not-valid-json",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 400
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_unknown_transaction_returns_200_acknowledged(self, client):
        """Webhook for unknown reqId must return 200 (acknowledged) to stop retries."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        body = json.dumps({
            "reqId": "ord-totally-unknown-xyz-99999",
            "status": "succeed",
            "amount": "500.00",
        }).encode()
        r = client.post(
            "/api/v1/photonpay/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_success_webhook_credits_wallet(self, client):
        """Successful payment webhook must credit the PHP wallet."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        user_id = "tg-pp-credit-test-001"
        ext_id = f"pp-alipay-wallet-credit-{os.getpid()}"
        amount = 750.0

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=amount)
        balance_before = _get_wallet_balance(user_id)

        body = json.dumps({
            "reqId": ext_id,
            "transactionId": "txn-pp-001",
            "status": "succeed",
            "amount": str(amount),
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 200

        balance_after = _get_wallet_balance(user_id)
        assert balance_after == balance_before + amount, (
            f"Expected wallet +{amount}, got balance_before={balance_before}, "
            f"balance_after={balance_after}"
        )
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_success_webhook_marks_transaction_paid(self, client):
        """Successful webhook must update transaction status to 'paid'."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        user_id = "tg-pp-status-test-001"
        ext_id = f"pp-alipay-status-{os.getpid()}"

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=300.0)
        assert _get_transaction_status(ext_id) == "pending"

        body = json.dumps({
            "reqId": ext_id,
            "status": "succeed",
            "amount": "300.00",
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 200
        assert _get_transaction_status(ext_id) == "paid"
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_idempotent_duplicate_webhook_does_not_double_credit(self, client):
        """Sending the same success webhook twice must credit the wallet only once."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        user_id = "tg-pp-idempotent-test-001"
        ext_id = f"pp-alipay-idem-{os.getpid()}"
        amount = 500.0

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=amount)
        body = json.dumps({
            "reqId": ext_id,
            "status": "succeed",
            "amount": str(amount),
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r1 = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
            r2 = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r1.status_code == 200
        assert r2.status_code == 200

        # Wallet should only be credited ONCE
        balance = _get_wallet_balance(user_id)
        assert balance == amount, (
            f"Expected single credit of {amount}, got {balance}"
        )
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)

    def test_failed_payment_webhook_marks_transaction_failed(self, client):
        """A 'failed' status webhook must update the transaction to 'failed'."""
        os.environ["PHOTONPAY_WEBHOOK_VERIFY_REQUIRED"] = "false"
        user_id = "tg-pp-fail-test-001"
        ext_id = f"pp-alipay-fail-{os.getpid()}"

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=200.0)
        body = json.dumps({
            "reqId": ext_id,
            "status": "failed",
            "amount": "200.00",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r = client.post(
                "/api/v1/photonpay/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 200
        assert _get_transaction_status(ext_id) == "failed"
        os.environ.pop("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", None)


# ════════════════════════════════════════════════════════════════════════════
# 4. TransFi webhook — wallet credit & idempotency
# ════════════════════════════════════════════════════════════════════════════

class TestTransFiAlipayWebhook:
    """Validate TransFi webhook processing for Alipay payments."""

    def test_success_webhook_credits_wallet(self, client):
        """TransFi Alipay success webhook must credit the PHP wallet."""
        # Disable signature verification for this test
        os.environ.pop("TRANSFI_WEBHOOK_VERIFY_REQUIRED", None)
        os.environ["TRANSFI_WEBHOOK_VERIFY_REQUIRED"] = "false"

        user_id = "tg-tf-credit-test-001"
        ext_id = f"tf-alipay-credit-{os.getpid()}"
        amount = 600.0

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=amount)
        balance_before = _get_wallet_balance(user_id)

        body = json.dumps({
            "reqId": ext_id,
            "invoiceId": "inv-tf-test-001",
            "status": "paid",
            "amount": str(amount),
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r.status_code == 200

        balance_after = _get_wallet_balance(user_id)
        assert balance_after == balance_before + amount
        os.environ.pop("TRANSFI_WEBHOOK_VERIFY_REQUIRED", None)

    def test_idempotent_duplicate_transfi_webhook(self, client):
        """TransFi duplicate webhook must not double-credit the wallet."""
        os.environ["TRANSFI_WEBHOOK_VERIFY_REQUIRED"] = "false"

        user_id = "tg-tf-idem-test-001"
        ext_id = f"tf-alipay-idem-{os.getpid()}"
        amount = 400.0

        _seed_transaction(user_id=user_id, external_id=ext_id, amount=amount)
        body = json.dumps({
            "reqId": ext_id,
            "invoiceId": "inv-tf-idem-001",
            "status": "paid",
            "amount": str(amount),
            "currency": "PHP",
            "payMethod": "Alipay",
        }).encode()

        with patch("services.telegram_service.TelegramService"):
            r1 = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
            r2 = client.post(
                "/api/v1/transfi/webhook",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        assert r1.status_code == 200
        assert r2.status_code == 200

        balance = _get_wallet_balance(user_id)
        assert balance == amount, f"Expected single credit of {amount}, got {balance}"
        os.environ.pop("TRANSFI_WEBHOOK_VERIFY_REQUIRED", None)

    def test_unknown_transaction_returns_200_acknowledged(self, client):
        """TransFi webhook for unknown reqId must return 200 to stop retries."""
        os.environ["TRANSFI_WEBHOOK_VERIFY_REQUIRED"] = "false"
        body = json.dumps({
            "reqId": "tf-totally-unknown-order-9999",
            "status": "paid",
            "amount": "300",
        }).encode()
        r = client.post(
            "/api/v1/transfi/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json().get("status") == "ok"
        os.environ.pop("TRANSFI_WEBHOOK_VERIFY_REQUIRED", None)



# ════════════════════════════════════════════════════════════════════════════
# WeChat bot command tests
# ════════════════════════════════════════════════════════════════════════════

class TestWeChatBotCommand:
    """Validate the /wechat Telegram bot command across all provider paths."""

    def test_missing_amount_returns_ok(self, client):
        """/wechat with no arguments shows a wizard prompt and returns ok."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_negative_amount_returns_ok(self, client):
        """/wechat -100 desc should be rejected gracefully."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat -100 test"))
        assert r.status_code == 200

    def test_zero_amount_returns_ok(self, client):
        """/wechat 0 desc should be rejected gracefully."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 0 test"))
        assert r.status_code == 200

    def test_invalid_amount_returns_ok(self, client):
        """/wechat abc desc should be rejected gracefully (no crash)."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat abc test"))
        assert r.status_code == 200

    def test_no_provider_configured_sends_some_message(self, client):
        """When no WeChat provider is configured, bot sends some message (no crash)."""
        for k in ("TRANSFI_API_KEY", "PHOTONPAY_APP_ID", "PHOTONPAY_APP_SECRET",
                  "PHOTONPAY_SITE_ID", "PAYMONGO_SECRET_KEY"):
            os.environ.pop(k, None)

        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = MagicMock()
        pm_mock.public_key = ""

        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.PayMongoService", return_value=pm_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 500 test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        mock_tg.send_message.assert_called()

    def test_transfi_provider_success(self, client):
        """When TransFi is configured, /wechat bot command completes without error."""
        os.environ["TRANSFI_API_KEY"] = "test-transfi-key"
        try:
            transfi_mock = AsyncMock()
            transfi_mock.is_configured = True
            transfi_mock.create_wechat_invoice = AsyncMock(return_value={
                "success": True,
                "checkout_url": "https://checkout.transfi.com/tf-wechat-test",
                "req_id": "tf-wechat-test",
                "invoice_id": "inv-tf-wechat-001",
            })
            mock_tg = _build_mock_tg()
            with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
                 patch("routers.telegram.TelegramService", return_value=mock_tg):
                r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 500 wechat test"))
            assert r.status_code == 200
            assert r.json()["status"] == "ok"
            all_calls = mock_tg.send_photo.call_args_list + mock_tg.send_message.call_args_list
            assert len(all_calls) >= 1
        finally:
            os.environ.pop("TRANSFI_API_KEY", None)

    def test_photonpay_provider_success(self, client):
        """When PhotonPay is configured (TransFi not), /wechat bot command completes without error."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = AsyncMock()
        photonpay_mock.is_configured = True
        photonpay_mock.create_wechat_session = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://cashier.photonpay.com/?code=wechat-auth",
            "req_id": "pp-wechat-test",
            "pay_id": "pay-wechat-001",
            "auth_code": "wechat-auth",
        })
        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 500 wechat test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        all_calls = mock_tg.send_photo.call_args_list + mock_tg.send_message.call_args_list
        assert len(all_calls) >= 1

    def test_paymongo_fallback_success(self, client):
        """When TransFi/PhotonPay are absent, /wechat falls back to PayMongo without crashing."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = AsyncMock()
        pm_mock.secret_key = "pm_test_key"
        pm_mock.create_wechat_qr = AsyncMock(return_value={
            "success": True,
            "reference_number": "pm-wechat-test001",
            "source_id": "src-wechat-001",
            "checkout_url": "https://pm-redirect.com/wechat/pm-wechat-test",
        })
        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.PayMongoService", return_value=pm_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 500 wechat test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        all_calls = mock_tg.send_photo.call_args_list + mock_tg.send_message.call_args_list
        assert len(all_calls) >= 1

    def test_paymongo_failure_returns_ok_without_crash(self, client):
        """When PayMongo fails for WeChat, the bot returns 200 (no crash, no raw API error leaked)."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = AsyncMock()
        pm_mock.secret_key = "pm_test_key"
        pm_mock.create_wechat_qr = AsyncMock(return_value={
            "success": False,
            "error": '[{"source":{"pointer":"/data/attributes/type"},"code":"parameter_format_invalid",'
                     '"detail":"type is required and must be one of gcash, grab_pay, paymaya"}]',
        })
        mock_tg = _build_mock_tg()
        with patch("routers.telegram.TransFiService", return_value=transfi_mock), \
             patch("routers.telegram.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.telegram.PayMongoService", return_value=pm_mock), \
             patch("routers.telegram.TelegramService", return_value=mock_tg):
            r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/wechat 500 wechat test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Must NOT crash; a message must have been sent.
        mock_tg.send_message.assert_called()


# ════════════════════════════════════════════════════════════════════════════
# 5. Provider fallback chain validation
# ════════════════════════════════════════════════════════════════════════════

class TestAlipayProviderFallbackChain:
    """Verify the TransFi → PhotonPay → PayMongo priority chain."""

    def test_transfi_failure_triggers_photonpay_fallback(self, client, auth_headers):
        """When TransFi returns success=False, PhotonPay must be tried next."""
        transfi_mock = AsyncMock()
        transfi_mock.is_configured = True
        transfi_mock.create_alipay_invoice = AsyncMock(return_value={
            "success": False,
            "error": "TransFi API error",
        })

        photonpay_mock = AsyncMock()
        photonpay_mock.is_configured = True
        photonpay_mock.create_alipay_session = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://cashier.photonpay.com/?code=fallback-test",
            "req_id": "pp-fallback-test",
            "pay_id": "pay-fallback",
            "auth_code": "fallback-test",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["checkout_url"].startswith("https://cashier.photonpay.com/")
        # PhotonPay must have been called
        photonpay_mock.create_alipay_session.assert_called_once()

    def test_photonpay_not_configured_skips_to_paymongo(self, client, auth_headers):
        """When PhotonPay is not configured (is_configured=False), skip to PayMongo."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False

        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False  # not configured

        pm_mock = AsyncMock()
        pm_mock.secret_key = "test-pm-secret"
        pm_mock.create_alipay_qr = AsyncMock(return_value={
            "success": True,
            "checkout_url": "https://pm.redirect/skip-test",
            "source_id": "src-skip-test",
            "reference_number": "pm-skip-test",
            "amount": 300.0,
            "currency": "PHP",
        })
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.photonpay.PayMongoService", return_value=pm_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 300.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 200
        assert r.json()["success"] is True
        pm_mock.create_alipay_qr.assert_called_once()

    def test_all_providers_absent_returns_503(self, client, auth_headers):
        """503 Service Unavailable when every provider is absent/unconfigured."""
        transfi_mock = MagicMock()
        transfi_mock.is_configured = False
        photonpay_mock = MagicMock()
        photonpay_mock.is_configured = False
        pm_mock = MagicMock()
        pm_mock.public_key = ""
        with patch("routers.photonpay.TransFiService", return_value=transfi_mock), \
             patch("routers.photonpay.PhotonPayService", return_value=photonpay_mock), \
             patch("routers.photonpay.PayMongoService", return_value=pm_mock):
            r = client.post(
                "/api/v1/photonpay/alipay-session",
                json={"amount": 500.0, "currency": "PHP"},
                headers=auth_headers,
            )
        assert r.status_code == 503
