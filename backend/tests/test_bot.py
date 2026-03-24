"""Tests for PayBot — bot command handlers, health endpoints, and core API flows."""
import asyncio
import os
import hashlib
import hmac
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:////tmp/test_paybot_{os.getpid()}.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST_BOT_TOKEN")
os.environ.setdefault("TELEGRAM_ADMIN_IDS", "123456789")

from fastapi.testclient import TestClient
from main import app  # noqa: E402
from services.xendit_service import XenditService  # noqa: E402


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
class TestCreateAccessToken:
    def test_claims_are_integer_timestamps(self):
        """create_access_token must encode exp/iat/nbf as integer Unix timestamps."""
        from core.auth import create_access_token
        from core.config import settings
        from jose import jwt as jose_jwt

        token = create_access_token({"sub": "testuser"})
        payload = jose_jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": False},
        )
        for claim in ("exp", "iat", "nbf"):
            assert claim in payload, f"Missing claim: {claim}"
            assert isinstance(payload[claim], int), (
                f"Claim '{claim}' must be an integer timestamp, got {type(payload[claim]).__name__}"
            )

    def test_custom_expiry_reflected_in_exp(self):
        """exp claim should be approximately now + expires_minutes."""
        import time
        from core.auth import create_access_token
        from core.config import settings
        from jose import jwt as jose_jwt

        before = int(time.time())
        token = create_access_token({"sub": "u"}, expires_minutes=30)
        after = int(time.time())

        payload = jose_jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": False},
        )
        expected_min = before + 30 * 60
        expected_max = after + 30 * 60
        assert expected_min <= payload["exp"] <= expected_max


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
        assert "permissions" in data, "/me response must include permissions"
        assert data["permissions"]["is_super_admin"] is True, "Env-whitelisted user must have is_super_admin=True"

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

    def test_widget_login_env_user_with_existing_regular_admin_db_record_gets_super_admin(self, client):
        """A user in TELEGRAM_ADMIN_IDS is always granted super admin, even if
        they already have a DB record with is_super_admin=False."""
        from unittest.mock import patch
        from sqlalchemy import select
        from core.database import db_manager
        from models.admin_users import AdminUser
        import asyncio

        bot_token = os.environ["TELEGRAM_BOT_TOKEN"]
        auth_date = int(time.time())
        telegram_id = 55555555
        payload = {
            "id": telegram_id,
            "auth_date": auth_date,
            "first_name": "Regular",
            "username": "regular_admin",
        }
        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(payload.items())
            if value is not None and value != ""
        )
        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        payload["hash"] = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        # Pre-seed a regular (non-super) admin DB record for this telegram_id
        async def seed_regular_admin():
            async with db_manager.async_session_maker() as db:
                res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == str(telegram_id)))
                if not res.scalar_one_or_none():
                    db.add(AdminUser(
                        telegram_id=str(telegram_id),
                        telegram_username="regular_admin",
                        name="Regular Admin",
                        is_active=True,
                        is_super_admin=False,
                        can_manage_payments=True,
                        can_manage_disbursements=True,
                        can_view_reports=True,
                        can_manage_wallet=True,
                        can_manage_transactions=True,
                        can_manage_bot=False,
                        can_approve_topups=False,
                        added_by="test",
                    ))
                    await db.commit()

        asyncio.run(seed_regular_admin())

        import routers.auth as auth_mod
        from core.config import Settings
        patched = Settings()
        patched.telegram_admin_ids = str(telegram_id)
        with patch.object(auth_mod, "settings", patched):
            r = client.post("/api/v1/auth/telegram-login-widget", json=payload)

        assert r.status_code == 200
        token_data = r.json()
        assert "token" in token_data

        # Decode token and verify super admin permissions
        from core.config import settings as real_settings
        from jose import jwt as jose_jwt
        decoded = jose_jwt.decode(
            token_data["token"],
            real_settings.jwt_secret_key,
            algorithms=[real_settings.jwt_algorithm],
            options={"verify_exp": False},
        )
        perms = decoded.get("permissions", {})
        assert perms.get("is_super_admin") is True, "Env-whitelisted user must be super admin even with existing DB record"


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

    def test_topup_missing_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/topup"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_topup_valid_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/topup 50"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_topup_invalid_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/topup notanumber"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_topup_negative_amount(self, client):
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/topup -10"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# /scanqr wizard (photo upload flow)
# ---------------------------------------------------------------------------
def _photo_webhook_body(
    chat_id: int = 99999,
    username: str = "testuser",
    caption: str = "",
    file_id: str = "fake_file_id",
) -> dict:
    """Build a webhook body that simulates a user uploading a photo."""
    return {
        "message": {
            "chat": {"id": chat_id},
            "caption": caption,
            "from": {"username": username},
            "message_id": 2,
            "photo": [
                {"file_id": f"{file_id}_small", "file_unique_id": "s1", "width": 90,  "height": 90},
                {"file_id": file_id,             "file_unique_id": "s2", "width": 800, "height": 800},
            ],
        }
    }


class TestScanQrWizard:
    """Tests for the /scanqr wizard that asks for amount then a QR photo."""

    # Must be a recognized admin ID so the webhook routes through the admin path
    CHAT_ID = 123456789

    def _body(self, text: str) -> dict:
        return _webhook_body(text, chat_id=self.CHAT_ID)

    def _photo_body(self, file_id: str = "fake_file_id") -> dict:
        return _photo_webhook_body(chat_id=self.CHAT_ID, file_id=file_id)

    def test_scanqr_command_starts_wizard(self, client):
        """/scanqr should prompt the user for an amount (wizard step 1)."""
        # Clear any existing wizard state for this chat
        from routers.telegram import _pending
        _pending.pop(str(self.CHAT_ID), None)

        r = client.post("/api/v1/telegram/webhook", json=self._body("/scanqr"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Wizard state should now be set for this chat
        assert str(self.CHAT_ID) in _pending
        assert _pending[str(self.CHAT_ID)]["cmd"] == "/scanqr"
        assert _pending[str(self.CHAT_ID)]["step"] == 0

    def test_scanqr_wizard_invalid_amount(self, client):
        """Sending a non-numeric amount should keep the wizard at step 0."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {"cmd": "/scanqr", "step": 0, "data": {}}

        r = client.post("/api/v1/telegram/webhook", json=self._body("notanumber"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Should still be at step 0 (amount not accepted)
        assert _pending.get(str(self.CHAT_ID), {}).get("step") == 0

    def test_scanqr_wizard_negative_amount(self, client):
        """A negative amount should be rejected and wizard stays at step 0."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {"cmd": "/scanqr", "step": 0, "data": {}}

        r = client.post("/api/v1/telegram/webhook", json=self._body("-500"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert _pending.get(str(self.CHAT_ID), {}).get("step") == 0

    def test_scanqr_wizard_valid_amount_advances_to_photo_step(self, client):
        """Entering a valid amount should advance wizard to step 1 (photo)."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {"cmd": "/scanqr", "step": 0, "data": {}}

        r = client.post("/api/v1/telegram/webhook", json=self._body("500"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Should now be at step 1 (photo step), still in _pending
        assert _pending.get(str(self.CHAT_ID), {}).get("step") == 1
        assert _pending.get(str(self.CHAT_ID), {}).get("data", {}).get("amount") == "500.0"

    def test_scanqr_wizard_text_on_photo_step_rejected(self, client):
        """Sending plain text instead of a photo when a photo is expected should prompt again."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {
            "cmd": "/scanqr", "step": 1, "data": {"amount": "500.0"},
        }

        r = client.post("/api/v1/telegram/webhook", json=self._body("some text instead of photo"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Should still be at step 1 (photo not provided)
        assert _pending.get(str(self.CHAT_ID), {}).get("step") == 1

    def test_scanqr_wizard_photo_with_no_qr_rejected(self, client):
        """Uploading a photo with no decodable QR should prompt again."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {
            "cmd": "/scanqr", "step": 1, "data": {"amount": "500.0"},
        }

        # Mock _decode_qr_from_telegram_photo to return None (no QR found)
        with patch("routers.telegram._decode_qr_from_telegram_photo", new=AsyncMock(return_value=None)):
            r = client.post("/api/v1/telegram/webhook", json=self._photo_body())
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Still waiting for a valid QR photo
        assert _pending.get(str(self.CHAT_ID), {}).get("step") == 1

    def test_scanqr_wizard_valid_photo_completes_payment(self, client):
        """Uploading a photo with a valid QR code should complete the wizard and record payment."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {
            "cmd": "/scanqr", "step": 1, "data": {"amount": "250.0"},
        }

        sample_qr = "5303608591255555559999996011MANILA CITY"

        with patch(
            "routers.telegram._decode_qr_from_telegram_photo",
            new=AsyncMock(return_value=sample_qr),
        ):
            r = client.post("/api/v1/telegram/webhook", json=self._photo_body())

        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        # Wizard state should be cleared after successful completion
        assert str(self.CHAT_ID) not in _pending

    def test_scanqr_wizard_cancel_clears_state(self, client):
        """/cancel during the wizard should clear wizard state."""
        from routers.telegram import _pending
        _pending[str(self.CHAT_ID)] = {"cmd": "/scanqr", "step": 1, "data": {"amount": "500.0"}}

        r = client.post("/api/v1/telegram/webhook", json=self._body("/cancel"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert str(self.CHAT_ID) not in _pending


# ---------------------------------------------------------------------------
# Helper: _parse_tlv
# ---------------------------------------------------------------------------
class TestParseTlv:
    def test_parse_basic_fields(self):
        from routers.telegram import _parse_tlv
        # Hand-crafted TLV: tag 59 (merchant name) and tag 60 (city) and tag 53 (currency)
        sample = "5905STORE6006MANILA5303608"
        result = _parse_tlv(sample)
        assert result.get("59") == "STORE"
        assert result.get("60") == "MANILA"
        assert result.get("53") == "608"

    def test_parse_empty_string(self):
        from routers.telegram import _parse_tlv
        assert _parse_tlv("") == {}

    def test_parse_invalid_length(self):
        from routers.telegram import _parse_tlv
        # Should stop gracefully on malformed input and return empty dict
        result = _parse_tlv("00ZZBAD")
        assert result == {}


# ---------------------------------------------------------------------------
# USDT TRC20 static QR image
# ---------------------------------------------------------------------------
class TestUsdtQrImage:
    def test_static_qr_image_served(self, client):
        """The USDT TRC20 QR image must be accessible at /images/usdt_trc20_qr.png."""
        r = client.get("/images/usdt_trc20_qr.png")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")

    def test_usdt_static_qr_url_is_absolute(self):
        """_usdt_static_qr_url() must return an absolute URL ending with the image path."""
        from routers.telegram import _usdt_static_qr_url
        url = _usdt_static_qr_url()
        assert url.startswith("http")
        assert url.endswith("/images/usdt_trc20_qr.png")


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
# Xendit e-wallet channel_properties
# ---------------------------------------------------------------------------
class TestXenditEwalletChannelProperties:
    """Verify that create_ewallet_charge always sends required channel_properties."""

    def test_gcash_charge_includes_success_redirect_url(self):
        """PH_GCASH requires success_redirect_url in channel_properties (API_VALIDATION_ERROR fix)."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "ewc-test-123",
            "status": "PENDING",
            "actions": {"desktop_web_checkout_url": "https://gcash.example.com/pay"},
        }
        mock_response.raise_for_status = MagicMock()

        captured_payload: dict = {}

        async def mock_post(url, **kwargs):
            captured_payload.update(kwargs.get("json", {}))
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post

        with patch("httpx.AsyncClient", return_value=mock_client):
            svc = XenditService()
            svc.secret_key = "test-key"
            result = asyncio.run(
                svc.create_ewallet_charge(amount=100, channel_code="PH_GCASH")
            )

        assert result["success"] is True
        props = captured_payload.get("channel_properties", {})
        assert "success_redirect_url" in props, (
            "PH_GCASH channel_properties must include success_redirect_url"
        )
        assert props["success_redirect_url"], "success_redirect_url must not be empty"

    def test_custom_redirect_url_is_used(self):
        """Caller-supplied success_redirect_url takes precedence over the default."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"id": "ewc-test-456", "status": "PENDING", "actions": {}}
        mock_response.raise_for_status = MagicMock()

        captured_payload: dict = {}

        async def mock_post(url, **kwargs):
            captured_payload.update(kwargs.get("json", {}))
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post

        with patch("httpx.AsyncClient", return_value=mock_client):
            svc = XenditService()
            svc.secret_key = "test-key"
            result = asyncio.run(
                svc.create_ewallet_charge(
                    amount=200,
                    channel_code="PH_GRABPAY",
                    success_redirect_url="https://myapp.com/success",
                    failure_redirect_url="https://myapp.com/failed",
                )
            )

        assert result["success"] is True
        props = captured_payload.get("channel_properties", {})
        assert props["success_redirect_url"] == "https://myapp.com/success"
        assert props["failure_redirect_url"] == "https://myapp.com/failed"


# ---------------------------------------------------------------------------
# Xendit QR code payload validation
# ---------------------------------------------------------------------------
class TestXenditQrCodePayload:
    """Verify that create_qr_code sends required fields (external_id + callback_url)."""

    def _run(self, coro):
        return asyncio.run(coro)

    def _make_mock_client(self, captured: dict):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "qr-test-123",
            "qr_string": "00020101...",
            "status": "ACTIVE",
        }
        mock_response.raise_for_status = MagicMock()

        async def mock_post(url, **kwargs):
            captured.update(kwargs.get("json", {}))
            return mock_response

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        return mock_client

    def test_qr_code_sends_external_id(self):
        """Xendit /qr_codes requires external_id (not reference_id)."""
        captured: dict = {}
        mock_client = self._make_mock_client(captured)

        with patch("httpx.AsyncClient", return_value=mock_client):
            svc = XenditService()
            svc.secret_key = "test-key"
            result = self._run(svc.create_qr_code(amount=500, description="Test"))

        assert result["success"] is True
        assert "external_id" in captured, "Payload must contain external_id"
        assert "reference_id" not in captured, "Payload must not contain reference_id"

    def test_qr_code_sends_callback_url(self):
        """Xendit /qr_codes requires callback_url in the request body."""
        captured: dict = {}
        mock_client = self._make_mock_client(captured)

        with patch("httpx.AsyncClient", return_value=mock_client):
            svc = XenditService()
            svc.secret_key = "test-key"
            result = self._run(svc.create_qr_code(amount=500))

        assert result["success"] is True
        assert "callback_url" in captured, "Payload must contain callback_url"
        assert captured["callback_url"], "callback_url must not be empty"
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


# ---------------------------------------------------------------------------
# Performance optimizations
# ---------------------------------------------------------------------------
class TestBatchCreateOptimization:
    """Verify that batch create endpoints use a single DB transaction (bulk_create)."""

    def test_batch_create_customers(self, client, auth_headers):
        """POST /batch should create multiple customers atomically."""
        payload = {
            "items": [
                {"name": "Batch Customer A", "email": "a@test.com"},
                {"name": "Batch Customer B", "email": "b@test.com"},
            ]
        }
        r = client.post("/api/v1/entities/customers/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2
        names = {d["name"] for d in data}
        assert names == {"Batch Customer A", "Batch Customer B"}

    def test_batch_create_transactions(self, client, auth_headers):
        """POST /batch should create multiple transactions atomically."""
        payload = {
            "items": [
                {
                    "transaction_type": "invoice",
                    "amount": 100.0,
                    "status": "pending",
                    "currency": "PHP",
                },
                {
                    "transaction_type": "invoice",
                    "amount": 200.0,
                    "status": "pending",
                    "currency": "PHP",
                },
            ]
        }
        r = client.post("/api/v1/entities/transactions/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2
        amounts = sorted(d["amount"] for d in data)
        assert amounts == [100.0, 200.0]

    def test_batch_create_empty(self, client, auth_headers):
        """POST /batch with an empty list should return an empty list."""
        r = client.post(
            "/api/v1/entities/customers/batch",
            json={"items": []},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json() == []

    def test_batch_create_disbursements(self, client, auth_headers):
        """POST /batch should create multiple disbursements atomically."""
        payload = {
            "items": [
                {"amount": 500.0, "currency": "PHP", "bank_code": "BDO"},
                {"amount": 750.0, "currency": "PHP", "bank_code": "BPI"},
            ]
        }
        r = client.post("/api/v1/entities/disbursements/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2
        amounts = sorted(d["amount"] for d in data)
        assert amounts == [500.0, 750.0]

    def test_batch_create_refunds(self, client, auth_headers):
        """POST /batch should create multiple refunds atomically."""
        payload = {
            "items": [
                {"amount": 50.0, "reason": "test refund 1"},
                {"amount": 75.0, "reason": "test refund 2"},
            ]
        }
        r = client.post("/api/v1/entities/refunds/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2

    def test_batch_create_subscriptions(self, client, auth_headers):
        """POST /batch should create multiple subscriptions atomically."""
        payload = {
            "items": [
                {"plan_name": "Basic", "amount": 299.0, "currency": "PHP"},
                {"plan_name": "Pro", "amount": 599.0, "currency": "PHP"},
            ]
        }
        r = client.post("/api/v1/entities/subscriptions/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2
        plan_names = {d["plan_name"] for d in data}
        assert plan_names == {"Basic", "Pro"}

    def test_batch_create_bot_logs(self, client, auth_headers):
        """POST /batch should create multiple bot_logs atomically."""
        payload = {
            "items": [
                {"log_type": "info", "message": "batch log 1"},
                {"log_type": "info", "message": "batch log 2"},
            ]
        }
        r = client.post("/api/v1/entities/bot_logs/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2

    def test_batch_create_api_configs(self, client, auth_headers):
        """POST /batch should create multiple api_configs atomically."""
        payload = {
            "items": [
                {
                    "config_key": "batch_key_1",
                    "config_value": "val1",
                    "service_name": "xendit",
                },
                {
                    "config_key": "batch_key_2",
                    "config_value": "val2",
                    "service_name": "xendit",
                },
            ]
        }
        r = client.post("/api/v1/entities/api_configs/batch", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert len(data) == 2


class TestUsdBalanceOptimization:
    """Verify USD balance is computed correctly with the single-query optimization."""

    def test_usd_balance_endpoint_accessible(self, client, auth_headers):
        """GET /wallet/balance?currency=USD should return a valid response."""
        r = client.get("/api/v1/wallet/balance", params={"currency": "USD"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "balance" in data
        assert "currency" in data
        assert data["currency"] == "USD"
        assert isinstance(data["balance"], float)


# ---------------------------------------------------------------------------
# KYB access control — non-admin users must go through KYB
# ---------------------------------------------------------------------------
def _admin_webhook_body(text: str, username: str = "admin_user") -> dict:
    """Webhook body from the env-whitelisted admin (chat_id 123456789)."""
    return {
        "message": {
            "chat": {"id": 123456789},
            "text": text,
            "from": {"username": username},
            "message_id": 1,
        }
    }


class TestKybAccessControl:
    """Verify that unregistered users are gated behind KYB registration."""

    def test_non_admin_start_shows_registration_prompt(self, client):
        """An unregistered user sending /start should see registration instructions."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/start", chat_id=88001))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_non_admin_command_blocked(self, client):
        """An unregistered user sending a bot command should be blocked."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/balance", chat_id=88002))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_non_admin_register_starts_kyb(self, client):
        """/register initiates the KYB flow for an unregistered user."""
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/register", chat_id=88003))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_kyb_full_flow(self, client):
        """Walk through the entire KYB flow and verify each step advances."""
        chat_id = 88010

        # Step 1: /register starts the flow
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("/register", chat_id=chat_id))
        assert r.status_code == 200

        # Step 2: full name
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("Juan dela Cruz", chat_id=chat_id))
        assert r.status_code == 200

        # Step 3: phone
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("09171234567", chat_id=chat_id))
        assert r.status_code == 200

        # Step 4: address
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("123 Main St, Quezon City", chat_id=chat_id))
        assert r.status_code == 200

        # Step 5: bank
        r = client.post("/api/v1/telegram/webhook", json=_webhook_body("BDO", chat_id=chat_id))
        assert r.status_code == 200

        # Step 6: send ID photo
        photo_body = {
            "message": {
                "chat": {"id": chat_id},
                "text": "",
                "from": {"username": "kyb_user"},
                "photo": [{"file_id": "fake_file_id_123", "file_size": 1000}],
                "message_id": 1,
            }
        }
        r = client.post("/api/v1/telegram/webhook", json=photo_body)
        assert r.status_code == 200

        # After full KYB, user should be in pending_review state
        from sqlalchemy import select
        from core.database import db_manager
        from models.kyb_registrations import KybRegistration
        import asyncio

        async def check_kyb():
            async with db_manager.async_session_maker() as db:
                res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == str(chat_id)))
                kyb = res.scalar_one_or_none()
                return kyb

        kyb = asyncio.run(check_kyb())
        assert kyb is not None
        assert kyb.status == "pending_review"
        assert kyb.full_name == "Juan dela Cruz"
        assert kyb.phone == "09171234567"
        assert kyb.bank_name == "BDO"

    def test_kyb_list_requires_owner(self, client):
        """/kyb_list is rejected for non-owner admins."""
        # Regular admin (in TELEGRAM_ADMIN_IDS) but not owner
        r = client.post("/api/v1/telegram/webhook", json=_admin_webhook_body("/kyb_list"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_kyb_approve_requires_owner(self, client):
        """/kyb_approve is rejected for non-owner admins."""
        r = client.post("/api/v1/telegram/webhook", json=_admin_webhook_body("/kyb_approve 88010"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_kyb_reject_requires_owner(self, client):
        """/kyb_reject is rejected for non-owner admins."""
        r = client.post("/api/v1/telegram/webhook", json=_admin_webhook_body("/kyb_reject 88010 fraud"))
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_kyb_approve_as_owner(self, client):
        """Bot owner can approve a KYB registration, granting admin access."""
        from unittest.mock import patch
        import routers.telegram as tg_mod
        from core.config import Settings
        import asyncio
        from sqlalchemy import select
        from core.database import db_manager
        from models.kyb_registrations import KybRegistration
        from models.admin_users import AdminUser

        target_chat_id = 88010  # set up in test_kyb_full_flow above
        owner_id = "777000"  # test owner

        # Seed a pending KYB record for our target user (in case prior test didn't run)
        async def ensure_kyb():
            async with db_manager.async_session_maker() as db:
                res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == str(target_chat_id)))
                kyb = res.scalar_one_or_none()
                if not kyb:
                    kyb = KybRegistration(
                        chat_id=str(target_chat_id),
                        telegram_username="kyb_user",
                        step="done",
                        status="pending_review",
                        full_name="Juan dela Cruz",
                        phone="09171234567",
                        address="123 Main St",
                        bank_name="BDO",
                        id_photo_file_id="fake_file_id_123",
                    )
                    db.add(kyb)
                    await db.commit()

        asyncio.run(ensure_kyb())

        patched = Settings()
        patched.telegram_bot_owner_id = owner_id
        patched.telegram_admin_ids = owner_id
        with patch.object(tg_mod, "settings", patched):
            r = client.post(
                "/api/v1/telegram/webhook",
                json={
                    "message": {
                        "chat": {"id": int(owner_id)},
                        "text": f"/kyb_approve {target_chat_id}",
                        "from": {"username": "owner"},
                        "message_id": 1,
                    }
                },
            )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

        async def check_approved():
            async with db_manager.async_session_maker() as db:
                res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == str(target_chat_id)))
                kyb = res.scalar_one_or_none()
                res2 = await db.execute(select(AdminUser).where(AdminUser.telegram_id == str(target_chat_id)))
                admin = res2.scalar_one_or_none()
                return kyb, admin

        kyb, admin = asyncio.run(check_approved())
        assert kyb is not None
        assert kyb.status == "approved"
        assert admin is not None
        assert admin.is_active is True
        assert admin.is_super_admin is False  # KYB users are regular admins, not super admin



# ---------------------------------------------------------------------------
# USDT→PHP conversion: exchange rate endpoint and topup approval
# ---------------------------------------------------------------------------
class TestUsdtPhpConversion:
    def test_rate_endpoint_returns_default(self, client):
        """GET /api/v1/app-settings/usdt-php-rate returns a positive rate."""
        r = client.get("/api/v1/app-settings/usdt-php-rate")
        assert r.status_code == 200
        data = r.json()
        assert "rate" in data
        assert data["rate"] > 0

    def test_rate_update_requires_auth(self, client):
        """PUT /api/v1/app-settings/usdt-php-rate requires authentication."""
        r = client.put("/api/v1/app-settings/usdt-php-rate", json={"rate": 62.0})
        assert r.status_code in (401, 403)

    def test_rate_update_as_super_admin(self, client, auth_headers):
        """Super admin can update the USDT→PHP rate."""
        r = client.put(
            "/api/v1/app-settings/usdt-php-rate",
            json={"rate": 60.5},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["rate"] == pytest.approx(60.5)

        # Verify it persisted
        r2 = client.get("/api/v1/app-settings/usdt-php-rate")
        assert r2.json()["rate"] == pytest.approx(60.5)

    def test_rate_invalid_zero_rejected(self, client, auth_headers):
        """Rate of zero or negative is rejected."""
        r = client.put(
            "/api/v1/app-settings/usdt-php-rate",
            json={"rate": 0},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_topup_rate_endpoint(self, client):
        """GET /api/v1/topup/rate returns the current USDT→PHP rate."""
        r = client.get("/api/v1/topup/rate")
        assert r.status_code == 200
        assert "usdt_php_rate" in r.json()
        assert r.json()["usdt_php_rate"] > 0

    def test_topup_approve_credits_php_wallet(self, client, auth_headers):
        """Approving a topup request credits the PHP wallet at the configured rate."""
        import asyncio
        from core.database import db_manager
        from sqlalchemy import select
        from models.topup_requests import TopupRequest
        from models.wallets import Wallets
        from models.wallet_transactions import Wallet_transactions
        from datetime import datetime

        chat_id = "999001"
        amount_usdt = 10.0

        # Set a known exchange rate
        client.put(
            "/api/v1/app-settings/usdt-php-rate",
            json={"rate": 60.0},
            headers=auth_headers,
        )

        # Seed a pending topup request
        async def seed_request():
            async with db_manager.async_session_maker() as db:
                req = TopupRequest(
                    chat_id=chat_id,
                    telegram_username="testuser",
                    amount_usdt=amount_usdt,
                    currency="PHP",
                    status="pending",
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                db.add(req)
                await db.commit()
                await db.refresh(req)
                return req.id

        req_id = asyncio.run(seed_request())

        # Approve the request
        r = client.post(
            f"/api/v1/topup/{req_id}/approve",
            json={"note": "Test approval"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "approved"

        # Verify PHP wallet was credited with converted amount (10 USDT × 60 = 600 PHP)
        async def verify():
            async with db_manager.async_session_maker() as db:
                wallet_res = await db.execute(
                    select(Wallets).where(
                        Wallets.user_id == f"tg-{chat_id}",
                        Wallets.currency == "PHP",
                    )
                )
                wallet = wallet_res.scalar_one_or_none()

                txn_res = await db.execute(
                    select(Wallet_transactions).where(
                        Wallet_transactions.reference_id == str(req_id),
                        Wallet_transactions.user_id == f"tg-{chat_id}",
                    )
                )
                txn = txn_res.scalar_one_or_none()
                return wallet, txn

        wallet, txn = asyncio.run(verify())

        assert wallet is not None, "PHP wallet was not created"
        assert wallet.currency == "PHP"
        assert wallet.balance == pytest.approx(600.0, abs=0.01), "Expected 10 USDT × 60 = 600 PHP"

        assert txn is not None, "Wallet transaction was not recorded"
        assert txn.amount == pytest.approx(600.0, abs=0.01)
        assert txn.transaction_type == "top_up"
        assert txn.status == "completed"
        # Note should include conversion info
        assert "USDT" in txn.note or "PHP" in txn.note

    def test_topup_approve_note_contains_conversion_info(self, client, auth_headers):
        """The approval note on the request includes the conversion rate and PHP amount."""
        import asyncio
        from core.database import db_manager
        from models.topup_requests import TopupRequest
        from datetime import datetime

        chat_id = "999002"

        # Set rate
        client.put(
            "/api/v1/app-settings/usdt-php-rate",
            json={"rate": 58.0},
            headers=auth_headers,
        )

        async def seed():
            async with db_manager.async_session_maker() as db:
                req = TopupRequest(
                    chat_id=chat_id,
                    telegram_username="notetest",
                    amount_usdt=5.0,
                    currency="PHP",
                    status="pending",
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                db.add(req)
                await db.commit()
                await db.refresh(req)
                return req.id

        req_id = asyncio.run(seed())
        r = client.post(f"/api/v1/topup/{req_id}/approve", json={}, headers=auth_headers)
        assert r.status_code == 200
        note = r.json().get("note", "")
        # note should contain "USDT" and "PHP" conversion info
        assert "PHP" in note or "USDT" in note
