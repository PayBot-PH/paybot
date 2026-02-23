"""Tests for PayBot — bot command handlers, health endpoints, and core API flows."""
import os
import copy
import hashlib
import hmac
import time
import pytest

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_paybot_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")

from fastapi.testclient import TestClient
from main import app  # noqa: E402


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
        f"{key}={value}"
        for key, value in sorted(payload.items())
        if value is not None and value != ""
    )
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    r = client.post(
        "/api/v1/auth/telegram-login-widget",
        json=payload,
    )
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ---------------------------------------------------------------------------
# Health endpoints
# ---------------------------------------------------------------------------
class TestHealth:
    def test_root_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_api_v1_health(self, client):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert "database" in data

    def test_api_v1_health_db(self, client):
        r = client.get("/api/v1/health/db")
        assert r.status_code == 200
        assert "status" in r.json()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_telegram_login_legacy_disabled(self, client):
        r = client.post(
            "/api/v1/auth/telegram-login",
            json={"telegram_user_id": "123456789", "password": "any"},
        )
        assert r.status_code == 410

    def test_telegram_widget_login_invalid_hash(self, client):
        r = client.post(
            "/api/v1/auth/telegram-login-widget",
            json={
                "id": 123456789,
                "auth_date": int(time.time()),
                "first_name": "Test",
                "username": "test_admin",
                "hash": "bad_hash",
            },
        )
        assert r.status_code == 401

    def test_telegram_widget_login_unknown_user(self, client):
        bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
        auth_date = int(time.time())
        payload = {
            "id": 999999999,
            "auth_date": auth_date,
            "first_name": "Stranger",
            "username": "stranger",
        }
        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(payload.items())
            if value is not None and value != ""
        )
        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        r = client.post(
            "/api/v1/auth/telegram-login-widget",
            json=payload,
        )
        assert r.status_code == 403

    def test_me_authenticated(self, client, auth_headers):
        r = client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "123456789"
        assert data["role"] == "admin"

    def test_me_unauthenticated(self, client):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_widget_login_by_username(self, client):
        """Admin configured as @username (not numeric ID) can log in."""
        from unittest.mock import patch
        bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
        auth_date = int(time.time())
        payload = {
            "id": 88888888,
            "auth_date": auth_date,
            "first_name": "Traxion",
            "username": "traxionpay",
        }
        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(payload.items())
            if value is not None and value != ""
        )
        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        import routers.auth as auth_mod
        from core.config import Settings
        patched = Settings()
        patched.telegram_admin_ids = "@traxionpay"
        with patch.object(auth_mod, "settings", patched):
            r = client.post("/api/v1/auth/telegram-login-widget", json=payload)

        assert r.status_code == 200
        assert "token" in r.json()

    def test_widget_login_by_username_without_at(self, client):
        """Admin configured as plain username (no @) can log in."""
        from unittest.mock import patch
        bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
        auth_date = int(time.time())
        payload = {
            "id": 77777777,
            "auth_date": auth_date,
            "first_name": "Traxion",
            "username": "traxionpay",
        }
        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(payload.items())
            if value is not None and value != ""
        )
        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        import routers.auth as auth_mod
        from core.config import Settings
        patched = Settings()
        patched.telegram_admin_ids = "traxionpay"
        with patch.object(auth_mod, "settings", patched):
            r = client.post("/api/v1/auth/telegram-login-widget", json=payload)

        assert r.status_code == 200
        assert "token" in r.json()

    def test_widget_login_unknown_username_rejected(self, client):
        """A username not in TELEGRAM_ADMIN_IDS is denied even with a valid hash."""
        from unittest.mock import patch
        bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
        auth_date = int(time.time())
        payload = {
            "id": 66666666,
            "auth_date": auth_date,
            "first_name": "Intruder",
            "username": "not_an_admin",
        }
        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(payload.items())
            if value is not None and value != ""
        )
        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        import routers.auth as auth_mod
        from core.config import Settings
        patched = Settings()
        patched.telegram_admin_ids = "@traxionpay"
        with patch.object(auth_mod, "settings", patched):
            r = client.post("/api/v1/auth/telegram-login-widget", json=payload)

        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Bot info / test endpoints
# ---------------------------------------------------------------------------
class TestBotEndpoints:
    def test_bot_info_no_token(self, client):
        """Should return success=False (no token configured) but not 500."""
        r = client.get("/api/v1/telegram/bot-info")
        assert r.status_code == 200
        data = r.json()
        assert "success" in data

    def test_bot_test_no_token(self, client):
        """Structured check returns 3 checks with correct structure."""
        r = client.get("/api/v1/telegram/test")
        assert r.status_code == 200
        data = r.json()
        assert "checks" in data
        assert len(data["checks"]) == 3
        assert data["checks"][0]["name"] == "Bot token configured"
        # A fake test token IS configured, so this check passes
        assert data["checks"][0]["passed"] is True

    def test_debug_token_check(self, client):
        r = client.get("/api/v1/telegram/debug-token-check")
        assert r.status_code == 200
        data = r.json()
        assert "resolve_bot_token_ok" in data


# ---------------------------------------------------------------------------
# Telegram webhook — edge cases and command routing
# ---------------------------------------------------------------------------
def _webhook_body(text: str, chat_id: int = 99999, username: str = "testuser") -> dict:
    return {
        "message": {
            "chat": {"id": chat_id},
            "text": text,
            "from": {"username": username},
            "message_id": 1,
        }
    }


class TestTelegramWebhook:
    def test_empty_body(self, client):
        r = client.post("/api/v1/telegram/webhook", json={})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_no_message_key(self, client):
        r = client.post("/api/v1/telegram/webhook", json={"update_id": 1})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_invalid_json(self, client):
        r = client.post(
            "/api/v1/telegram/webhook",
            content=b"not-json",
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 200
        # Returns error status but does NOT crash with 500
        assert r.json()["status"] in ("ok", "error")

    def test_start_command(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/start"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_help_command(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/help"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_pay_menu(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/pay"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_balance_command(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/balance"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_status_command_not_found(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/status nonexistent-id"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_status_command_missing_arg(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/status"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_report_daily(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/report daily"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_report_monthly(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/report monthly"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_report_invalid_period_defaults_monthly(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/report badperiod"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_fees_valid(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/fees 1000 invoice"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_fees_missing_method(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/fees 1000"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_fees_invalid_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/fees notanumber invoice"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_unknown_command(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/totally_unknown"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    # ----- Input validation: negative / zero amounts -----
    def test_invoice_missing_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/invoice"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_invoice_negative_amount(self, client):
        """Negative amount should be rejected — bug was: called Xendit API with negative value."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/invoice -500 test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_invoice_zero_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/invoice 0 test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_invoice_invalid_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/invoice abc test"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_qr_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/qr -100 desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_alipay_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/alipay -50 desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_link_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/link -200 desc"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_va_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/va -1000 BDO"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_va_missing_bank(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/va 1000"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_ewallet_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/ewallet -500 GCASH"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_ewallet_missing_provider(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/ewallet 500"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_disburse_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/disburse -100 BDO 123456"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_disburse_missing_args(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/disburse 500 BDO"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_refund_missing_args(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/refund"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_refund_non_numeric_amount(self, client):
        """Bug fix: float(parts[2]) was unguarded — would raise ValueError and crash handler."""
        r = client.post(
            "/api/v1/telegram/webhook",
            json=_webhook_body("/refund inv-someID badamount"),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_refund_transaction_not_found(self, client):
        r = client.post(
            "/api/v1/telegram/webhook",
            json=_webhook_body("/refund inv-doesnotexist 100"),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_remind_missing_id(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/remind"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_withdraw_missing_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/withdraw"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_withdraw_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/withdraw -50"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_send_missing_args(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/send"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_subscribe_missing_args(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/subscribe"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Xendit webhook
# ---------------------------------------------------------------------------
class TestXenditWebhook:
    def test_empty_body(self, client):
        r = client.post("/api/v1/xendit/webhook", json={})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_unknown_status(self, client):
        r = client.post(
            "/api/v1/xendit/webhook",
            json={"external_id": "test-xendit-123", "status": "UNKNOWN_STATUS"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Events / simulate
# ---------------------------------------------------------------------------
class TestEvents:
    def test_simulate_requires_auth(self, client):
        r = client.post(
            "/api/v1/events/simulate",
            json={"transaction_type": "invoice", "status": "paid", "amount": 100},
        )
        assert r.status_code == 401

    def test_simulate_authenticated(self, client, auth_headers):
        r = client.post(
            "/api/v1/events/simulate",
            json={"transaction_type": "invoice", "status": "paid", "amount": 500},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["amount"] == 500.0


# ---------------------------------------------------------------------------
# Transaction stats
# ---------------------------------------------------------------------------
class TestTransactionStats:
    def test_stats_requires_auth(self, client):
        r = client.get("/api/v1/xendit/transaction-stats")
        assert r.status_code == 401

    def test_stats_authenticated(self, client, auth_headers):
        r = client.get("/api/v1/xendit/transaction-stats", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        for field in ("total_count", "paid_count", "pending_count", "expired_count"):
            assert field in data
            assert isinstance(data[field], int)


# ---------------------------------------------------------------------------
# Demo / seed data
# ---------------------------------------------------------------------------
class TestDemoData:
    """Verify that the mock_data seed files are loaded on a fresh database."""

    def test_demo_transactions_loaded(self, client, auth_headers):
        """At least the 8 demo transactions should be present."""
        r = client.get("/api/v1/entities/transactions", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 8

    def test_demo_transactions_have_paid_status(self, client, auth_headers):
        """At least one transaction with status 'paid' must exist."""
        import json as _json
        r = client.get(
            "/api/v1/entities/transactions",
            params={"query": _json.dumps({"status": "paid"})},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert item["status"] == "paid"

    def test_demo_wallet_has_balance(self, client, auth_headers):
        """The admin demo wallet should have a positive balance."""
        r = client.get("/api/v1/entities/wallets", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert data["items"][0]["balance"] > 0

    def test_demo_customers_loaded(self, client, auth_headers):
        """At least the 5 demo customers should be present."""
        r = client.get("/api/v1/entities/customers", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 5

    def test_demo_disbursements_loaded(self, client, auth_headers):
        """At least the 3 demo disbursements should be present."""
        r = client.get("/api/v1/entities/disbursements", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 3

    def test_demo_subscriptions_loaded(self, client, auth_headers):
        """At least the 3 demo subscriptions should be present."""
        r = client.get("/api/v1/entities/subscriptions", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 3

    def test_demo_wallet_transactions_loaded(self, client, auth_headers):
        """At least the 8 demo wallet transactions should be present."""
        r = client.get("/api/v1/entities/wallet_transactions", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 8

    def test_demo_transaction_stats_reflect_seed(self, client, auth_headers):
        """Transaction stats should reflect the seeded paid/pending/expired records."""
        r = client.get("/api/v1/xendit/transaction-stats", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        # Seed data has 6 paid, 1 pending, 1 expired
        assert data["paid_count"] >= 5
        assert data["pending_count"] >= 1
        assert data["expired_count"] >= 1
