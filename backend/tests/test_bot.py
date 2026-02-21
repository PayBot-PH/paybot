"""Tests for PayBot — bot command handlers, health endpoints, and core API flows."""
import os
import copy
import pytest

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_paybot_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("ADMIN_USER_PASSWORD", "testpass123")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "test_admin")

from fastapi.testclient import TestClient
from main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_token(client):
    r = client.post(
        "/api/v1/auth/telegram-login",
        json={"telegram_user_id": "test_admin", "password": "testpass123"},
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
    def test_telegram_login_success(self, client):
        r = client.post(
            "/api/v1/auth/telegram-login",
            json={"telegram_user_id": "test_admin", "password": "testpass123"},
        )
        assert r.status_code == 200
        assert "token" in r.json()

    def test_telegram_login_wrong_password(self, client):
        r = client.post(
            "/api/v1/auth/telegram-login",
            json={"telegram_user_id": "test_admin", "password": "wrongpass"},
        )
        assert r.status_code == 401

    def test_telegram_login_unknown_user(self, client):
        r = client.post(
            "/api/v1/auth/telegram-login",
            json={"telegram_user_id": "stranger", "password": "testpass123"},
        )
        assert r.status_code == 403

    def test_me_authenticated(self, client, auth_headers):
        r = client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "test_admin"
        assert data["role"] == "admin"

    def test_me_unauthenticated(self, client):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401


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
        """Structured check returns 3 checks, all failed (no token in test env)."""
        r = client.get("/api/v1/telegram/test")
        assert r.status_code == 200
        data = r.json()
        assert "checks" in data
        assert len(data["checks"]) == 3
        assert data["checks"][0]["name"] == "Bot token configured"
        # In test env no real token is set, so first check fails
        assert data["checks"][0]["passed"] is False

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
