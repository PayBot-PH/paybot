import logging
import io
import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from models.bot_logs import Bot_logs
from models.bot_settings import Bot_settings
from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.disbursements import Disbursements
from models.refunds import Refunds
from models.subscriptions import Subscriptions
from schemas.auth import UserResponse
from services.telegram_service import TelegramService, _resolve_bot_token
from services.xendit_service import XenditService
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService
from models.topup_requests import TopupRequest
from models.usdt_send_requests import UsdtSendRequest
from models.kyb_registrations import KybRegistration
from models.admin_users import AdminUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

USDT_TRC20_ADDRESS = "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx"

# Transaction types that credit / debit the USD wallet (keep in sync with wallet.py)
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")

# Minimum PHP/Xendit balance required to allow a USDT withdrawal request
_PHP_MIN_WITHDRAWAL_BALANCE = 100_000.0



def _make_qr_url(url: str, size: int = 400) -> str:
    """Return a QR code image URL using the free api.qrserver.com service.
    Telegram can fetch this URL directly — no local image generation needed."""
    from urllib.parse import quote
    return f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={quote(url, safe='')}"


def _usdt_static_qr_url() -> str:
    """Return the absolute URL for the hosted USDT TRC20 QR code image.
    Uses settings.backend_url (driven by PYTHON_BACKEND_URL env var) so
    Telegram can always fetch the image."""
    return f"{settings.backend_url.rstrip('/')}/images/usdt_trc20_qr.png"


async def _get_usd_balance(db: AsyncSession, chat_id: str) -> float:
    """Return USD wallet balance for a Telegram user, computed from transaction history."""
    return await _compute_usd_balance_for_wallet(db, f"tg-{chat_id}")


async def _compute_usd_balance_for_wallet(db: AsyncSession, user_id: str) -> float:
    """Compute USD balance from completed wallet_transactions (credits minus debits).

    Filters by user_id so the balance survives wallet row recreation after
    redeployment — the stable user_id ensures old transactions are always found.
    """
    credit_res = await db.execute(
        select(func.coalesce(func.sum(Wallet_transactions.amount), 0.0)).where(
            Wallet_transactions.user_id == user_id,
            Wallet_transactions.transaction_type.in_(_USD_CREDIT_TYPES),
            Wallet_transactions.status == "completed",
        )
    )
    debit_res = await db.execute(
        select(func.coalesce(func.sum(Wallet_transactions.amount), 0.0)).where(
            Wallet_transactions.user_id == user_id,
            Wallet_transactions.transaction_type.in_(_USD_DEBIT_TYPES),
            Wallet_transactions.status == "completed",
        )
    )
    credits = float(credit_res.scalar() or 0.0)
    debits = float(debit_res.scalar() or 0.0)
    return max(0.0, credits - debits)


async def _get_php_balance_for_bot(db: AsyncSession, tg_user_id: str) -> float:
    """Return the live Xendit PHP balance, falling back to the stored wallet row.

    Returns 0.0 if neither source is available so the caller can decide.
    """
    try:
        xendit_svc = XenditService()
        result = await xendit_svc.get_balance()
        if result.get("success"):
            return float(result.get("balance", 0))
    except Exception as e:
        logger.warning("Xendit balance fetch failed in PHP threshold check: %s", e)

    # Fallback: stored PHP wallet row
    try:
        row = await db.execute(
            select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP")
        )
        wallet = row.scalar_one_or_none()
        if wallet:
            return float(wallet.balance)
    except Exception as e:
        logger.warning("Stored PHP wallet fallback failed: %s", e)

    return 0.0


# ---------- Schemas ----------
class SetupWebhookRequest(BaseModel):
    webhook_url: str

class SendMessageRequest(BaseModel):
    chat_id: str
    message: str

class TelegramResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict = {}


# ---------- KYB constants ----------
_PH_BANKS = [
    "BDO", "BPI", "Metrobank", "UnionBank", "Land Bank", "PNB",
    "RCBC", "EastWest Bank", "Chinabank",
    "PSBank", "Maybank", "Other",
]

# Ordered list of KYB steps
_KYB_STEPS = ["full_name", "phone", "address", "bank", "id_photo"]


# ---------- Keyboard helpers ----------
def _start_kb() -> dict:
    """Full quick-action keyboard for /start and /help."""
    return {
        "keyboard": [
            [{"text": "💳 /invoice"}, {"text": "📱 /qr"}, {"text": "🔗 /link"}],
            [{"text": "🏦 /va"}, {"text": "📱 /ewallet"}, {"text": "🔴 /alipay"}],
            [{"text": "💰 /balance"}, {"text": "💸 /disburse"}, {"text": "📊 /report"}],
            [{"text": "📋 /list"}, {"text": "💱 /fees"}, {"text": "❓ /help"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }


def _pay_kb() -> dict:
    """Quick-action keyboard shown after payment creation commands."""
    return {
        "keyboard": [
            [{"text": "💰 /balance"}, {"text": "📋 /list"}, {"text": "📊 /report"}],
            [{"text": "💳 /invoice"}, {"text": "📱 /qr"}, {"text": "🔗 /link"}],
            [{"text": "❓ /help"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }


def _wallet_kb() -> dict:
    """Quick-action keyboard shown after wallet commands."""
    return {
        "keyboard": [
            [{"text": "💳 /invoice"}, {"text": "🔗 /link"}, {"text": "📱 /qr"}],
            [{"text": "📋 /list"}, {"text": "📊 /report"}, {"text": "💱 /fees"}],
            [{"text": "❓ /help"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }


def _info_kb() -> dict:
    """Quick-action keyboard shown after info/report commands."""
    return {
        "keyboard": [
            [{"text": "💳 /invoice"}, {"text": "💰 /balance"}, {"text": "📋 /list"}],
            [{"text": "📊 /report"}, {"text": "💱 /fees"}, {"text": "❓ /help"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }

_KYB_PROMPTS = {
    "full_name": "📝 <b>Step 1/5 — Full Name</b>\n\nPlease enter your full legal name:",
    "phone": "📱 <b>Step 2/5 — Phone Number</b>\n\nPlease enter your Philippine mobile number (e.g. 09171234567):",
    "address": "🏠 <b>Step 3/5 — Home Address</b>\n\nPlease enter your complete home address:",
    "bank": (
        "🏦 <b>Step 4/5 — Philippine Bank</b>\n\n"
        "Which Philippine bank do you primarily use?\n\n"
        + "\n".join(f"  • {b}" for b in _PH_BANKS)
        + "\n\nType the bank name:"
    ),
    "id_photo": (
        "🪪 <b>Step 5/5 — Government ID</b>\n\n"
        "Please upload a clear photo of a valid Philippine government-issued ID\n"
        "(e.g. PhilSys, Driver's License, Passport, UMID, Voter's ID, SSS, PRC)."
    ),
}


# ---------- PIN session store ----------
# chat_id → expiry datetime (UTC). Sessions last 2 hours.
_PIN_SESSIONS: dict[str, datetime] = {}
_PIN_SESSION_TTL = timedelta(hours=2)
_PIN_LOCK_MINUTES = 5
_PIN_MAX_ATTEMPTS = 3


def _is_pin_session_active(chat_id: str) -> bool:
    expiry = _PIN_SESSIONS.get(chat_id)
    if expiry and datetime.utcnow() < expiry:
        return True
    _PIN_SESSIONS.pop(chat_id, None)
    return False


def _start_pin_session(chat_id: str) -> None:
    _PIN_SESSIONS[chat_id] = datetime.utcnow() + _PIN_SESSION_TTL


def _end_pin_session(chat_id: str) -> None:
    _PIN_SESSIONS.pop(chat_id, None)


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def _generate_salt() -> str:
    return os.urandom(16).hex()


# ---------- KYB / access-control helpers ----------

def _get_bot_owner_id() -> str:
    """Return the Telegram user ID of the bot owner (super admin), or empty string."""
    owner = str(getattr(settings, "telegram_bot_owner_id", "") or "").strip()
    if owner:
        return owner
    # Fall back to the first entry in TELEGRAM_ADMIN_IDS
    raw = str(getattr(settings, "telegram_admin_ids", "") or "").strip()
    if raw:
        first = raw.split(",")[0].strip().lstrip("@")
        if first.isdigit():
            return first
    return ""


async def _is_authorized_admin(db: AsyncSession, chat_id: str) -> bool:
    """Return True if this chat_id is an authorized bot user.

    A user is authorized if they:
    1. Are the bot owner (TELEGRAM_BOT_OWNER_ID), OR
    2. Are in TELEGRAM_ADMIN_IDS, OR
    3. Have an active AdminUser record in the database.
    """
    # Check env-based lists
    owner_id = _get_bot_owner_id()
    if owner_id and chat_id == owner_id:
        return True

    raw = str(getattr(settings, "telegram_admin_ids", "") or "")
    for entry in raw.split(","):
        cleaned = entry.strip().lstrip("@")
        if cleaned and cleaned.isdigit() and cleaned == chat_id:
            return True

    # Check DB
    try:
        res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id, AdminUser.is_active.is_(True)))
        return res.scalar_one_or_none() is not None
    except Exception as e:
        logger.warning("DB admin check failed: %s", e)
        return False


async def _get_or_create_kyb(db: AsyncSession, chat_id: str, username: str) -> "KybRegistration":
    """Return the KYB record for this user, creating one if absent."""
    res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == chat_id))
    kyb = res.scalar_one_or_none()
    if not kyb:
        kyb = KybRegistration(chat_id=chat_id, telegram_username=username, step="full_name", status="in_progress")
        db.add(kyb)
        await db.commit()
        await db.refresh(kyb)
    return kyb


async def _handle_kyb_flow(
    db: AsyncSession,
    tg: "TelegramService",
    chat_id: str,
    username: str,
    text: str,
    photos: list,
) -> bool:
    """Handle KYB registration flow for an unregistered user.

    Returns True if the message was consumed by the KYB flow, False otherwise.
    """
    # Allow /start command to show registration info even without KYB record
    if text and text.startswith("/start"):
        await tg.send_message(
            chat_id,
            "👋 <b>Welcome to PayBot!</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "This bot is restricted to registered admins only.\n\n"
            "To request access, please complete the KYB (Know Your Business) registration.\n\n"
            "Type /register to begin your registration.",
        )
        return True

    # Check existing KYB record
    try:
        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == chat_id))
        kyb = res.scalar_one_or_none()
    except Exception as e:
        logger.error("KYB lookup failed: %s", e)
        await tg.send_message(chat_id, "⚠️ A database error occurred. Please try again later.")
        return True

    # No KYB record yet
    if not kyb:
        if text and text.startswith("/register"):
            try:
                kyb = KybRegistration(chat_id=chat_id, telegram_username=username, step="full_name", status="in_progress")
                db.add(kyb)
                await db.commit()
                await db.refresh(kyb)
            except Exception as e:
                logger.error("KYB create failed: %s", e)
                await tg.send_message(chat_id, "⚠️ Could not start registration. Please try again.")
                return True
            await tg.send_message(
                chat_id,
                "📋 <b>KYB Registration Started</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Please answer the following questions to complete your registration.\n"
                "Your information will be reviewed by the bot administrator.\n\n"
                + _KYB_PROMPTS["full_name"],
            )
        else:
            await tg.send_message(
                chat_id,
                "🔒 <b>Access Restricted</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "You are not registered to use this bot.\n\n"
                "Type /register to begin your KYB registration, or /start for more information.",
            )
        return True

    # KYB already approved — this shouldn't happen (authorized users bypass this flow)
    if kyb.status == "approved":
        await tg.send_message(chat_id, "✅ Your KYB is approved. You can now use all bot commands. Type /start to begin.")
        return True

    # KYB rejected
    if kyb.status == "rejected":
        reason = kyb.rejection_reason or "No reason provided."
        await tg.send_message(
            chat_id,
            f"❌ <b>KYB Registration Rejected</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Reason: {reason}\n\n"
            f"Please contact the bot administrator for more information.",
        )
        return True

    # KYB pending review
    if kyb.status == "pending_review":
        await tg.send_message(
            chat_id,
            "⏳ <b>Registration Under Review</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "Your KYB registration has been submitted and is awaiting approval.\n"
            "You will be notified once a decision is made.",
        )
        return True

    # KYB in progress — handle each step
    step = kyb.step

    if step == "full_name":
        if not text or text.startswith("/"):
            await tg.send_message(chat_id, _KYB_PROMPTS["full_name"])
            return True
        try:
            kyb.full_name = text.strip()
            kyb.step = "phone"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (full_name): %s", e)
            await db.rollback()
        await tg.send_message(chat_id, _KYB_PROMPTS["phone"])
        return True

    if step == "phone":
        if not text or text.startswith("/"):
            await tg.send_message(chat_id, _KYB_PROMPTS["phone"])
            return True
        try:
            kyb.phone = text.strip()
            kyb.step = "address"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (phone): %s", e)
            await db.rollback()
        await tg.send_message(chat_id, _KYB_PROMPTS["address"])
        return True

    if step == "address":
        if not text or text.startswith("/"):
            await tg.send_message(chat_id, _KYB_PROMPTS["address"])
            return True
        try:
            kyb.address = text.strip()
            kyb.step = "bank"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (address): %s", e)
            await db.rollback()
        await tg.send_message(chat_id, _KYB_PROMPTS["bank"])
        return True

    if step == "bank":
        if not text or text.startswith("/"):
            await tg.send_message(chat_id, _KYB_PROMPTS["bank"])
            return True
        try:
            kyb.bank_name = text.strip()
            kyb.step = "id_photo"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (bank): %s", e)
            await db.rollback()
        await tg.send_message(chat_id, _KYB_PROMPTS["id_photo"])
        return True

    if step == "id_photo":
        if not photos:
            await tg.send_message(chat_id, _KYB_PROMPTS["id_photo"])
            return True
        best_photo = max(photos, key=lambda p: p.get("file_size", 0))
        try:
            kyb.id_photo_file_id = best_photo["file_id"]
            kyb.step = "done"
            kyb.status = "pending_review"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (id_photo): %s", e)
            await db.rollback()
            await tg.send_message(chat_id, "⚠️ Could not save your ID photo. Please try again.")
            return True

        await tg.send_message(
            chat_id,
            "✅ <b>KYB Registration Submitted!</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "Thank you for completing your registration.\n\n"
            "📋 <b>Summary:</b>\n"
            f"  👤 Name: {kyb.full_name}\n"
            f"  📱 Phone: {kyb.phone}\n"
            f"  🏠 Address: {kyb.address}\n"
            f"  🏦 Bank: {kyb.bank_name}\n"
            f"  🪪 ID: Uploaded\n\n"
            "⏳ Your registration is now under review. You will be notified once approved.",
        )

        # Notify bot owner
        owner_id = _get_bot_owner_id()
        if owner_id:
            uname_display = f"@{username}" if username and username != "unknown" else f"chat_id:{chat_id}"
            await tg.send_message(
                owner_id,
                f"🔔 <b>New KYB Registration</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"  👤 Name: {kyb.full_name}\n"
                f"  📱 Phone: {kyb.phone}\n"
                f"  🏠 Address: {kyb.address}\n"
                f"  🏦 Bank: {kyb.bank_name}\n"
                f"  🪪 ID: Uploaded\n"
                f"  🆔 Telegram: {uname_display}\n\n"
                f"Use <code>/kyb_approve {chat_id}</code> to approve or\n"
                f"<code>/kyb_reject {chat_id} [reason]</code> to reject.",
            )
        return True

    # Unknown step — reset to full_name
    try:
        kyb.step = "full_name"
        await db.commit()
    except Exception:
        await db.rollback()
    await tg.send_message(chat_id, "⚠️ Registration state reset. Let's start again.\n\n" + _KYB_PROMPTS["full_name"])
    return True


# ---------- DB helper: safe log ----------
async def _safe_log(db: AsyncSession, chat_id: str, username: str, text: str):
    """Log bot interaction to DB. Failures are silently caught."""
    try:
        log = Bot_logs(
            user_id="telegram", log_type="command", message=text,
            telegram_chat_id=chat_id, telegram_username=username,
            command=text.split()[0] if text else "",
            created_at=datetime.now(),
        )
        db.add(log)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to log bot interaction: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass


async def _safe_db_op(db: AsyncSession, operation_name: str, coro):
    """Run a DB coroutine safely. Returns True on success, False on failure."""
    try:
        await coro
        return True
    except Exception as e:
        logger.error(f"DB operation '{operation_name}' failed: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return False


# ---------- Routes ----------
@router.post("/setup-webhook", response_model=TelegramResponse)
async def setup_webhook(
    data: SetupWebhookRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = TelegramService()
        result = await service.set_webhook(data.webhook_url)
        if result.get("success"):
            return TelegramResponse(success=True, message="Webhook configured successfully", data={"webhook_url": data.webhook_url})
        return TelegramResponse(success=False, message=result.get("error", "Failed to set webhook"))
    except Exception as e:
        logger.error(f"Error setting up webhook: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/webhook-info")
async def get_webhook_info(current_user: UserResponse = Depends(get_current_user)):
    """Return what webhook URL Telegram currently has on file for this bot.

    This is the single most useful diagnostic: if the URL is empty or wrong
    the bot will never receive messages no matter what else is configured.
    """
    token = _resolve_bot_token()
    if not token:
        return {
            "success": False,
            "token_configured": False,
            "webhook": {},
            "message": "TELEGRAM_BOT_TOKEN is not set — bot cannot work without it.",
        }
    service = TelegramService()
    result = await service.get_webhook_info()
    webhook = result.get("webhook", {})
    url = webhook.get("url", "")
    pending = webhook.get("pending_update_count", 0)
    last_error = webhook.get("last_error_message", "")
    return {
        "success": result.get("success", False),
        "token_configured": True,
        "webhook": webhook,
        "webhook_url": url,
        "is_registered": bool(url),
        "pending_update_count": pending,
        "last_error_message": last_error,
        "message": (
            "Webhook is registered and active." if url
            else "No webhook registered -- bot will NOT receive messages. Use Auto-Setup to fix this."
        ),
    }


@router.post("/auto-setup")
async def auto_setup_webhook(
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
):
    """One-click webhook setup: detect this server's public URL from request
    headers and register it as the Telegram webhook.

    Works on Railway, Render, any reverse-proxy, or direct HTTPS.
    """
    token = _resolve_bot_token()
    if not token:
        raise HTTPException(
            status_code=400,
            detail="TELEGRAM_BOT_TOKEN is not configured. Add it in your environment variables first.",
        )

    # Detect public URL from request headers (Railway/nginx/cloudflare set these)
    scheme = request.headers.get("x-forwarded-proto", "https")
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or ""
    )
    if not host:
        raise HTTPException(
            status_code=400,
            detail="Cannot detect public URL from request headers. Set PYTHON_BACKEND_URL env var instead.",
        )

    # Strip port from host if it looks like a public HTTPS deployment
    detected_base = f"{scheme}://{host}"
    webhook_url = f"{detected_base.rstrip('/')}/api/v1/telegram/webhook"

    service = TelegramService()

    # Set webhook
    set_result = await service.set_webhook(webhook_url)
    if not set_result.get("success"):
        return {
            "success": False,
            "webhook_url": webhook_url,
            "message": f"Failed to register webhook: {set_result.get('error', 'Unknown error')}",
        }

    # Verify it took effect
    info_result = await service.get_webhook_info()
    webhook_info = info_result.get("webhook", {})

    logger.info(f"[auto-setup] Webhook registered: {webhook_url}")
    return {
        "success": True,
        "webhook_url": webhook_url,
        "webhook_info": webhook_info,
        "message": f"Webhook registered at {webhook_url} -- bot will now respond to messages.",
    }


@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive Telegram bot updates (no auth required).

    Design principle: ALWAYS send the Telegram reply FIRST, then attempt
    database operations in a separate try/except so that DB failures
    never prevent the bot from responding to the user.
    """
    chat_id = ""
    try:
        body = await request.json()
        logger.info(f"Telegram webhook received: {body}")

        message = body.get("message", {})
        if not message:
            return {"status": "ok"}

        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        username = message.get("from", {}).get("username", "unknown")
        photos = message.get("photo", [])

        if not chat_id:
            return {"status": "ok"}

        tg = TelegramService()
        tg_user_id = f"tg-{chat_id}"

        # ==================== Access control: KYB gate ====================
        # Check if this user is an authorized admin.  Non-admins are routed
        # through the KYB registration flow (photos or text).
        is_admin = await _is_authorized_admin(db, chat_id)
        if not is_admin:
            await _handle_kyb_flow(db, tg, chat_id, username, text, photos)
            return {"status": "ok"}

        # ==================== PIN session gate ====================
        # Bot owner / env-listed admins bypass the PIN gate so they're never
        # locked out of the bot even if no PIN is set.
        owner_bypass = (chat_id == _get_bot_owner_id()) or chat_id in [
            e.strip().lstrip("@") for e in str(getattr(settings, "telegram_admin_ids", "") or "").split(",") if e.strip()
        ]
        if not owner_bypass:
            # Allow /login, /setpin, /start, /register without an active session
            pin_exempt = text and any(
                text.startswith(cmd) for cmd in ("/login", "/setpin", "/start", "/register", "/logout")
            )
            if not pin_exempt and not _is_pin_session_active(chat_id):
                # Fetch admin to check if PIN is set
                try:
                    _adm_res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                    _adm = _adm_res.scalar_one_or_none()
                except Exception:
                    _adm = None
                if _adm and _adm.pin_hash:
                    await tg.send_message(
                        chat_id,
                        "🔐 <b>Session expired</b>\n\nPlease log in with your PIN:\n\n<code>/login [your PIN]</code>",
                        reply_markup={
                            "keyboard": [[{"text": "🔑 /login"}]],
                            "resize_keyboard": True, "one_time_keyboard": True,
                        },
                    )
                    return {"status": "ok"}
                elif _adm and not _adm.pin_hash:
                    await tg.send_message(
                        chat_id,
                        "🔒 <b>Set your PIN to secure your account</b>\n\n"
                        "Use <code>/setpin [4–6 digit PIN]</code> to activate bot access.\n\nExample: <code>/setpin 1234</code>",
                    )
                    return {"status": "ok"}

        # ==================== Photo message → receipt upload ====================
        if photos and not text:
            # Check if this user has a pending topup request awaiting receipt
            result = await db.execute(
                select(TopupRequest)
                .where(TopupRequest.chat_id == chat_id, TopupRequest.status == "pending", TopupRequest.receipt_file_id.is_(None))
                .order_by(TopupRequest.created_at.desc())
            )
            pending_topup = result.scalar_one_or_none()
            if pending_topup:
                # Save the highest-resolution photo file_id
                best_photo = max(photos, key=lambda p: p.get("file_size", 0))
                pending_topup.receipt_file_id = best_photo["file_id"]
                pending_topup.updated_at = datetime.now()
                await db.commit()
                await tg.send_message(
                    chat_id,
                    f"✅ <b>Receipt received!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"💵 Amount: <b>${pending_topup.amount_usdt:.2f} USDT</b>\n"
                    f"🆔 Request ID: <code>#{pending_topup.id}</code>\n\n"
                    f"⏳ Your topup is now under review by the admin.\n"
                    f"You will be notified once approved and your USD wallet is credited.",
                )
            else:
                await tg.send_message(chat_id, "ℹ️ No pending topup request found. Use /topup [amount] first.")
            return {"status": "ok"}

        if not text:
            return {"status": "ok"}

        # ==================== /login ====================
        if text.startswith("/login"):
            parts = text.split(maxsplit=1)
            pin_input = parts[1].strip() if len(parts) > 1 else ""
            try:
                _adm_res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                _adm = _adm_res.scalar_one_or_none()
            except Exception:
                _adm = None

            if not _adm:
                await tg.send_message(chat_id, "⚠️ Account not found. Please contact your administrator.")
                return {"status": "ok"}

            if not _adm.pin_hash:
                await tg.send_message(
                    chat_id,
                    "ℹ️ No PIN set yet. Use <code>/setpin [4–6 digits]</code> to create your PIN first.",
                )
                return {"status": "ok"}

            # Check lock
            if _adm.pin_locked_until and datetime.utcnow() < _adm.pin_locked_until.replace(tzinfo=None):
                remaining = int((_adm.pin_locked_until.replace(tzinfo=None) - datetime.utcnow()).total_seconds() / 60) + 1
                await tg.send_message(chat_id, f"🔒 Account temporarily locked. Try again in {remaining} minute(s).")
                return {"status": "ok"}

            if not pin_input:
                await tg.send_message(chat_id, "❌ Usage: <code>/login [your PIN]</code>\nExample: <code>/login 1234</code>")
                return {"status": "ok"}

            if not pin_input.isdigit() or not (4 <= len(pin_input) <= 6):
                await tg.send_message(chat_id, "❌ PIN must be 4–6 digits.")
                return {"status": "ok"}

            expected = _hash_pin(pin_input, _adm.pin_salt or "")
            if expected == _adm.pin_hash:
                # Correct — start session, reset failed attempts
                _start_pin_session(chat_id)
                try:
                    _adm.pin_failed_attempts = 0
                    _adm.pin_locked_until = None
                    _adm.updated_at = datetime.now()
                    await db.commit()
                except Exception:
                    await db.rollback()
                await tg.send_message(
                    chat_id,
                    f"✅ <b>Logged in!</b>\n\nWelcome back, <b>{_adm.name or username}</b> 👋\n"
                    f"Your session is active for 2 hours.\n\nType /start to see the full menu.",
                    reply_markup=_start_kb(),
                )
            else:
                # Wrong PIN
                failed = (_adm.pin_failed_attempts or 0) + 1
                locked_until = None
                if failed >= _PIN_MAX_ATTEMPTS:
                    locked_until = datetime.now() + timedelta(minutes=_PIN_LOCK_MINUTES)
                try:
                    _adm.pin_failed_attempts = failed
                    _adm.pin_locked_until = locked_until
                    _adm.updated_at = datetime.now()
                    await db.commit()
                except Exception:
                    await db.rollback()
                if locked_until:
                    await tg.send_message(
                        chat_id,
                        f"🔒 Too many failed attempts. Account locked for {_PIN_LOCK_MINUTES} minutes.",
                    )
                else:
                    remaining_attempts = _PIN_MAX_ATTEMPTS - failed
                    await tg.send_message(
                        chat_id,
                        f"❌ Incorrect PIN. {remaining_attempts} attempt(s) remaining.",
                    )
            return {"status": "ok"}

        # ==================== /setpin ====================
        elif text.startswith("/setpin"):
            parts = text.split(maxsplit=1)
            pin_input = parts[1].strip() if len(parts) > 1 else ""
            if not pin_input or not pin_input.isdigit() or not (4 <= len(pin_input) <= 6):
                await tg.send_message(
                    chat_id,
                    "❌ Usage: <code>/setpin [4–6 digit PIN]</code>\n\nExample: <code>/setpin 1234</code>\n\n"
                    "⚠️ <i>Choose a PIN only you know. Do not share it.</i>",
                )
                return {"status": "ok"}
            try:
                _adm_res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                _adm = _adm_res.scalar_one_or_none()
            except Exception:
                _adm = None
            if not _adm:
                await tg.send_message(chat_id, "⚠️ Account not found.")
                return {"status": "ok"}
            salt = _generate_salt()
            try:
                _adm.pin_salt = salt
                _adm.pin_hash = _hash_pin(pin_input, salt)
                _adm.pin_failed_attempts = 0
                _adm.pin_locked_until = None
                _adm.updated_at = datetime.now()
                await db.commit()
            except Exception as e:
                logger.error(f"setpin DB error: {e}", exc_info=True)
                await db.rollback()
                await tg.send_message(chat_id, "⚠️ Could not save PIN. Please try again.")
                return {"status": "ok"}
            _start_pin_session(chat_id)
            await tg.send_message(
                chat_id,
                "✅ <b>PIN set successfully!</b>\n\n"
                "🔐 Your account is now PIN-protected.\n"
                "Use <code>/login [PIN]</code> to authenticate next time.\n\n"
                "You are now logged in for this session.",
                reply_markup=_start_kb(),
            )
            return {"status": "ok"}

        # ==================== /logout ====================
        elif text.startswith("/logout"):
            _end_pin_session(chat_id)
            await tg.send_message(
                chat_id,
                "👋 <b>Logged out.</b>\n\nUse <code>/login [PIN]</code> to log back in.",
                reply_markup={
                    "keyboard": [[{"text": "🔑 /login"}]],
                    "resize_keyboard": True, "one_time_keyboard": True,
                },
            )
            return {"status": "ok"}

        # ==================== /start ====================
        if text.startswith("/start"):
            welcome = (
                "👋 <b>Welcome to PayBot Philippines!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Your all-in-one Philippine payment gateway bot.\n\n"
                "💳 <b>Accept Payments</b>\n"
                "  /invoice [amt] [desc] — Create an invoice\n"
                "  /qr [amt] [desc] — Generate QR code\n"
                "  /link [amt] [desc] — Payment link\n"
                "  /va [amt] [bank] — Virtual account\n"
                "  /ewallet [amt] [provider] — E-wallet\n"
                "  /alipay [amt] [desc] — Alipay QR (via PayMongo)\n"
                "  /wechat [amt] [desc] — WeChat QR (via PayMongo)\n\n"                "💸 <b>Send Money</b>\n"
                "  /disburse [amt] [bank] [acct] [name] — Bank transfer\n"
                "  /refund [id] [amt] — Refund a payment\n\n"
                "💰 <b>PHP Wallet</b>\n"
                "  /balance — View balances &amp; history\n"
                "  /phptopup [amt] — Top up via payment invoice\n"
                "  /send [amt] [to] — Send funds\n"
                "  /withdraw [amt] — Withdraw\n\n"
                "💵 <b>USD Wallet (USDT TRC20)</b>\n"
                "  /usdbalance — USD balance &amp; history\n"
                "  /topup [amt] — Top up via USDT\n"
                "  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "  /sendusd [amt] [@username] — Send USD to another user\n\n"
                "📊 <b>Reports &amp; Tools</b>\n"
                "  /status [id] — Payment status\n"
                "  /list — Recent transactions\n"
                "  /report [daily|weekly|monthly]\n"
                "  /fees [amt] [method] — Fee calculator\n"
                "  /cancel [id] — Cancel pending payment\n"
                "  /remind [id] — Send payment reminder\n\n"
                "ℹ️ Type /help for the full command reference."
            )
            await tg.send_message(chat_id, welcome, reply_markup=_start_kb())

        # ==================== /kyb_list (bot owner only) ====================
        elif text.startswith("/kyb_list"):
            if chat_id != _get_bot_owner_id():
                await tg.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                try:
                    res = await db.execute(
                        select(KybRegistration).where(KybRegistration.status == "pending_review").order_by(KybRegistration.created_at.asc())
                    )
                    pending_kybs = res.scalars().all()
                    if not pending_kybs:
                        await tg.send_message(chat_id, "✅ No pending KYB registrations.")
                    else:
                        lines = [f"📋 <b>Pending KYB Registrations ({len(pending_kybs)})</b>\n━━━━━━━━━━━━━━━━━━━━"]
                        for k in pending_kybs:
                            uname = f"@{k.telegram_username}" if k.telegram_username else f"id:{k.chat_id}"
                            lines.append(
                                f"\n👤 <b>{k.full_name}</b> ({uname})\n"
                                f"  📱 {k.phone} | 🏦 {k.bank_name}\n"
                                f"  🏠 {k.address}\n"
                                f"  ▶ <code>/kyb_approve {k.chat_id}</code>\n"
                                f"  ✖ <code>/kyb_reject {k.chat_id} reason</code>"
                            )
                        await tg.send_message(chat_id, "\n".join(lines))
                except Exception as e:
                    logger.error("kyb_list error: %s", e)
                    await tg.send_message(chat_id, "⚠️ Failed to fetch KYB list.")

        # ==================== /kyb_approve (bot owner only) ====================
        elif text.startswith("/kyb_approve"):
            if chat_id != _get_bot_owner_id():
                await tg.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                parts = text.split(maxsplit=1)
                if len(parts) < 2:
                    await tg.send_message(chat_id, "❌ Usage: /kyb_approve [chat_id]")
                else:
                    target_chat_id = parts[1].strip()
                    try:
                        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == target_chat_id))
                        kyb = res.scalar_one_or_none()
                        if not kyb:
                            await tg.send_message(chat_id, f"❌ No KYB record found for chat_id: {target_chat_id}")
                        elif kyb.status == "approved":
                            await tg.send_message(chat_id, f"ℹ️ KYB for {target_chat_id} is already approved.")
                        else:
                            kyb.status = "approved"
                            # Create AdminUser record for the approved user
                            existing_admin = await db.execute(select(AdminUser).where(AdminUser.telegram_id == target_chat_id))
                            if not existing_admin.scalar_one_or_none():
                                new_admin = AdminUser(
                                    telegram_id=target_chat_id,
                                    telegram_username=kyb.telegram_username,
                                    name=kyb.full_name or kyb.telegram_username or target_chat_id,
                                    is_active=True,
                                    is_super_admin=False,
                                    can_manage_payments=True,
                                    can_manage_disbursements=True,
                                    can_view_reports=True,
                                    can_manage_wallet=True,
                                    can_manage_transactions=True,
                                    can_manage_bot=False,
                                    can_approve_topups=False,
                                    added_by=chat_id,
                                )
                                db.add(new_admin)
                            await db.commit()
                            await tg.send_message(chat_id, f"✅ KYB approved for {target_chat_id} ({kyb.full_name}). Admin access granted.")
                            # Notify the approved user — prompt them to set PIN
                            await tg.send_message(
                                target_chat_id,
                                "🎉 <b>KYB Registration Approved!</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━\n"
                                "Your registration has been approved! You now have access to the bot.\n\n"
                                "🔐 <b>Security step required:</b>\n"
                                "Please set a PIN to protect your account:\n\n"
                                "<code>/setpin [4–6 digit PIN]</code>\n\nExample: <code>/setpin 1234</code>",
                                reply_markup={
                                    "keyboard": [[{"text": "🔑 /setpin"}]],
                                    "resize_keyboard": True, "one_time_keyboard": True,
                                },
                            )
                    except Exception as e:
                        logger.error("kyb_approve error: %s", e)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await tg.send_message(chat_id, f"⚠️ Failed to approve KYB: {e}")

        # ==================== /kyb_reject (bot owner only) ====================
        elif text.startswith("/kyb_reject"):
            if chat_id != _get_bot_owner_id():
                await tg.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                parts = text.split(maxsplit=2)
                if len(parts) < 2:
                    await tg.send_message(chat_id, "❌ Usage: /kyb_reject [chat_id] [reason]")
                else:
                    target_chat_id = parts[1].strip()
                    reason = parts[2].strip() if len(parts) > 2 else "No reason provided."
                    try:
                        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == target_chat_id))
                        kyb = res.scalar_one_or_none()
                        if not kyb:
                            await tg.send_message(chat_id, f"❌ No KYB record found for chat_id: {target_chat_id}")
                        else:
                            kyb.status = "rejected"
                            kyb.rejection_reason = reason
                            await db.commit()
                            await tg.send_message(chat_id, f"✅ KYB rejected for {target_chat_id} ({kyb.full_name}).")
                            # Notify the rejected user
                            await tg.send_message(
                                target_chat_id,
                                f"❌ <b>KYB Registration Rejected</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"Reason: {reason}\n\n"
                                f"Please contact the bot administrator for more information.",
                            )
                    except Exception as e:
                        logger.error("kyb_reject error: %s", e)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await tg.send_message(chat_id, f"⚠️ Failed to reject KYB: {e}")

        # ==================== /invoice ====================
        elif text.startswith("/invoice"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /invoice [amount] [description]\nExample: /invoice 500 Monthly subscription")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Invoice payment"
                    xendit = XenditService()
                    result = await xendit.create_invoice(amount=amount, description=description)
                    if result.get("success"):
                        invoice_url = result.get('invoice_url', '')
                        ext_id = result.get('external_id', '')
                        reply = (
                            f"✅ <b>Invoice Created!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f}</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ext_id}</code>\n\n"
                            f"Tap the button below to pay 👇"
                        )
                        keyboard = {
                            "inline_keyboard": [[{"text": "💳 Pay Now", "url": invoice_url}]]
                        } if invoice_url else None
                        # Send reply FIRST
                        await tg.send_message(chat_id, reply, reply_markup=keyboard)
                        await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                        # Then try DB save
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="invoice",
                                external_id=result.get("external_id", ""), xendit_id=result.get("invoice_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                payment_url=result.get("invoice_url", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /invoice: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /qr ====================
        elif text.startswith("/qr"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /qr [amount] [description]")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "QR payment"
                    xendit = XenditService()
                    result = await xendit.create_qr_code(amount=amount, description=description)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>QR Code Created!</b>\n\n💰 ₱{amount:,.2f}\n"
                            f"📱 QR: <code>{result.get('qr_string', '')}</code>\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply, reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="qr_code",
                                external_id=result.get("external_id", ""), xendit_id=result.get("qr_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=result.get("qr_string", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /qr: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /alipay (PayMongo → Alipay QR) ====================
        elif text.startswith("/alipay"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /alipay [amount] [description]\nExample: /alipay 500 Coffee order\n\n💡 <i>Generates an Alipay QR via PayMongo. Wallet credited automatically on payment.</i>")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Alipay payment"
                    paymongo = PayMongoService()
                    result = await paymongo.create_alipay_qr(amount=amount, description=description)
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        ref_num = result.get("reference_number", "")
                        caption = (
                            f"✅ <b>Alipay QR Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ref_num}</code>\n\n"
                            f"📱 Open the link and scan the QR with Alipay to pay.\n"
                            f"💳 Your PHP wallet will be credited automatically once paid."
                        )
                        keyboard = {"inline_keyboard": [[{"text": "🔴 Pay via Alipay", "url": checkout_url}]]} if checkout_url else None
                        await tg.send_message(chat_id, caption, reply_markup=keyboard)
                        await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="alipay_qr",
                                external_id=ref_num, xendit_id=result.get("source_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=checkout_url, telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /alipay: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Alipay QR failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /wechat (PayMongo → WeChat Pay QR) ====================
        elif text.startswith("/wechat"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /wechat [amount] [description]\nExample: /wechat 500 Coffee order\n\n💡 <i>Generates a WeChat Pay QR via PayMongo. Wallet credited automatically on payment.</i>")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "WeChat Pay"
                    paymongo = PayMongoService()
                    result = await paymongo.create_wechat_qr(amount=amount, description=description)
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        ref_num = result.get("reference_number", "")
                        caption = (
                            f"✅ <b>WeChat Pay QR Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ref_num}</code>\n\n"
                            f"📱 Open the link and scan the QR with WeChat to pay.\n"
                            f"💳 Your PHP wallet will be credited automatically once paid."
                        )
                        keyboard = {"inline_keyboard": [[{"text": "💚 Pay via WeChat", "url": checkout_url}]]} if checkout_url else None
                        await tg.send_message(chat_id, caption, reply_markup=keyboard)
                        await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="wechat_qr",
                                external_id=ref_num, xendit_id=result.get("source_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=checkout_url, telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /wechat: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ WeChat QR failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /link ====================
        elif text.startswith("/link"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /link [amount] [description]")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Payment link"
                    xendit = XenditService()
                    result = await xendit.create_payment_link(amount=amount, description=description)
                    if result.get("success"):
                        link_url = result.get('payment_link_url', '')
                        ext_id = result.get('external_id', '')
                        reply = (
                            f"✅ <b>Payment Link Created!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f}</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ext_id}</code>\n\n"
                            f"Tap the button below to pay 👇"
                        )
                        keyboard = {
                            "inline_keyboard": [[{"text": "🔗 Pay Now", "url": link_url}]]
                        } if link_url else None
                        await tg.send_message(chat_id, reply, reply_markup=keyboard)
                        await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="payment_link",
                                external_id=result.get("external_id", ""), xendit_id=result.get("payment_link_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                payment_url=result.get("payment_link_url", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /link: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /va ====================
        elif text.startswith("/va"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, "❌ Usage: /va [amount] [bank_code]\nExample: /va 1000 BDO\nBanks: BDO, BPI, UNIONBANK, RCBC")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    bank_code = parts[2].upper()
                    xendit = XenditService()
                    result = await xendit.create_virtual_account(amount=amount, bank_code=bank_code, name=username)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Virtual Account Created!</b>\n\n🏦 Bank: {bank_code}\n💰 ₱{amount:,.2f}\n"
                            f"🔢 Account: <code>{result.get('account_number', '')}</code>\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply, reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="virtual_account",
                                external_id=result.get("external_id", ""), xendit_id=result.get("va_id", ""),
                                amount=amount, currency="PHP", status="pending",
                                description=f"VA: {bank_code}", telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /va: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /ewallet ====================
        elif text.startswith("/ewallet"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, "❌ Usage: /ewallet [amount] [provider]\nProviders: GCASH, GRABPAY")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    provider = parts[2].upper()
                    channel_map = {
                        "GCASH": "PH_GCASH", "GRABPAY": "PH_GRABPAY",
                        "PH_GCASH": "PH_GCASH", "PH_GRABPAY": "PH_GRABPAY",
                    }
                    channel = channel_map.get(provider, f"PH_{provider}")
                    xendit = XenditService()
                    result = await xendit.create_ewallet_charge(amount=amount, channel_code=channel)
                    if result.get("success"):
                        checkout = result.get("checkout_url", "")
                        reply = (
                            f"✅ <b>E-Wallet Charge Created!</b>\n\n📱 {provider}\n💰 ₱{amount:,.2f}\n"
                            f"{'🔗 Pay: ' + checkout if checkout else ''}\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        ewallet_keyboard = {"inline_keyboard": [[{"text": "📱 Pay Now", "url": checkout}]]} if checkout else None
                        await tg.send_message(chat_id, reply, reply_markup=ewallet_keyboard)
                        await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="ewallet",
                                external_id=result.get("external_id", ""), xendit_id=result.get("charge_id", ""),
                                amount=amount, currency="PHP", status="pending",
                                description=f"E-Wallet: {provider}", payment_url=checkout,
                                telegram_chat_id=chat_id, created_at=now, updated_at=now,
                            )
                            db.add(txn)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /ewallet: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /disburse ====================
        elif text.startswith("/disburse"):
            parts = text.split(maxsplit=4)
            if len(parts) < 5:
                await tg.send_message(
                    chat_id,
                    "❌ Usage: /disburse [amount] [bank] [account] [name]\n"
                    "Example: /disburse 500 BDO 1234567890 Juan Dela Cruz\n\n"
                    "Banks: BDO BPI UNIONBANK METROBANK LANDBANK PNB RCBC CHINABANK EASTWEST"
                )
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    bank_code = parts[2].upper()
                    account_number = parts[3]
                    account_name = parts[4]
                    xendit = XenditService()
                    result = await xendit.create_disbursement(
                        amount=amount, bank_code=bank_code,
                        account_number=account_number, account_name=account_name,
                        description=f"Disbursement via Telegram by @{username}",
                    )
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Disbursement Queued!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💸 Amount: <b>₱{amount:,.2f}</b>\n"
                            f"🏦 Bank: {bank_code}\n"
                            f"🔢 Account: {account_number}\n"
                            f"👤 Name: {account_name}\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>\n\n"
                            f"Use /status {result.get('external_id', '')} to track."
                        )
                        await tg.send_message(chat_id, reply, reply_markup=_wallet_kb())
                        try:
                            now = datetime.now()
                            disb = Disbursements(
                                user_id="telegram", external_id=result.get("external_id", ""),
                                xendit_id=result.get("disbursement_id", ""), amount=amount, currency="PHP",
                                bank_code=bank_code, account_number=account_number, account_name=account_name,
                                description="TG disbursement", status="pending", disbursement_type="single",
                                created_at=now, updated_at=now,
                            )
                            db.add(disb)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /disburse: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await tg.send_message(chat_id, f"❌ Disbursement failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /refund ====================
        elif text.startswith("/refund"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /refund [external_id] [amount]\nExample: /refund inv-abc123 500")
            else:
                ext_id = parts[1].strip()
                # DB lookup is required for refund logic — wrap it safely
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    txn = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /refund: {e}", exc_info=True)
                    await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    txn = None
                    # Skip further processing
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if not txn:
                    await tg.send_message(chat_id, f"❌ Transaction not found: {ext_id}")
                elif txn.status != "paid":
                    await tg.send_message(chat_id, "❌ Only paid transactions can be refunded.")
                else:
                    try:
                        refund_amount = float(parts[2]) if len(parts) > 2 else txn.amount
                    except ValueError:
                        await tg.send_message(chat_id, "❌ Invalid refund amount.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if refund_amount <= 0:
                        await tg.send_message(chat_id, "❌ Refund amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    elif refund_amount > txn.amount:
                        await tg.send_message(chat_id, "❌ Refund amount exceeds transaction amount.")
                    else:
                        xendit = XenditService()
                        ref_result = await xendit.create_refund(invoice_id=txn.xendit_id, amount=refund_amount)
                        ref_type = "full" if refund_amount >= txn.amount else "partial"
                        if ref_result.get("success"):
                            reply = f"✅ <b>Refund Processed!</b>\n\n💰 ₱{refund_amount:,.2f}\n📋 Type: {ref_type}\n🆔 {ext_id}"
                        else:
                            reply = f"❌ Refund failed: {ref_result.get('error', 'Unknown')}"
                        # Send reply FIRST
                        await tg.send_message(chat_id, reply, reply_markup=_info_kb())
                        # Then try DB save
                        try:
                            now = datetime.now()
                            ref = Refunds(
                                user_id="telegram", transaction_id=txn.id,
                                external_id=f"ref-{txn.id}", amount=refund_amount, reason="Telegram refund",
                                status="pending" if ref_result.get("success") else "failed",
                                refund_type=ref_type, created_at=now, updated_at=now,
                            )
                            db.add(ref)
                            if ref_result.get("success"):
                                txn.status = "refunded" if ref_type == "full" else "partially_refunded"
                                txn.updated_at = now
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /refund: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass

        # ==================== /status ====================
        elif text.startswith("/status"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                # No ID — show last 5 transactions
                try:
                    res = await db.execute(
                        select(Transactions).order_by(Transactions.created_at.desc()).limit(5)
                    )
                    recent = res.scalars().all()
                except Exception as e:
                    logger.error(f"DB lookup failed for /status: {e}", exc_info=True)
                    await tg.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}
                if not recent:
                    await tg.send_message(chat_id, "📭 No transactions found.\n\nUsage: /status [external_id]")
                else:
                    s_map = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}
                    lines = ["📋 <b>Recent Transactions</b>\n━━━━━━━━━━━━━━━━━━━━"]
                    for t in recent:
                        em = s_map.get(t.status, "❓")
                        lines.append(f"{em} ₱{t.amount:,.2f} — {t.transaction_type} — <code>{t.external_id}</code>")
                    lines.append("\nUse /status [id] for details.")
                    await tg.send_message(chat_id, "\n".join(lines), reply_markup=_info_kb())
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    txn = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /status: {e}", exc_info=True)
                    await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if txn:
                    emoji = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}.get(txn.status, "❓")
                    created = txn.created_at.strftime("%b %d %H:%M") if txn.created_at else "N/A"
                    reply = (
                        f"📊 <b>Transaction Details</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"🆔 <code>{txn.external_id}</code>\n"
                        f"💰 <b>₱{txn.amount:,.2f}</b>\n"
                        f"📋 Type: {txn.transaction_type}\n"
                        f"{emoji} Status: <b>{txn.status.upper()}</b>\n"
                        f"📝 {txn.description or 'N/A'}\n"
                        f"🕐 {created}"
                    )
                    if txn.payment_url and txn.status == "pending":
                        keyboard = {"inline_keyboard": [[{"text": "💳 Pay Now", "url": txn.payment_url}]]}
                        await tg.send_message(chat_id, reply, reply_markup=keyboard)
                        await tg.send_message(chat_id, "💡 <b>Quick actions:</b>", reply_markup=_info_kb())
                    else:
                        await tg.send_message(chat_id, reply, reply_markup=_info_kb())
                else:
                    await tg.send_message(chat_id, f"❌ Not found: <code>{ext_id}</code>")

        # ==================== /balance ====================
        elif text.startswith("/balance"):
            try:
                # PHP wallet — get or create, then sync balance from Xendit live balance
                res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP"))
                wallet = res.scalar_one_or_none()
                if not wallet:
                    now_w = datetime.now()
                    wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                    db.add(wallet)
                    await db.commit()
                    await db.refresh(wallet)
                # Sync PHP balance from Xendit live account balance
                try:
                    xendit_svc = XenditService()
                    xendit_bal = await xendit_svc.get_balance()
                    if xendit_bal.get("success"):
                        wallet.balance = float(xendit_bal.get("balance", wallet.balance))
                        wallet.updated_at = datetime.now()
                        await db.commit()
                        await db.refresh(wallet)
                except Exception as xe:
                    logger.warning(f"Xendit balance fetch failed for /balance: {xe}")
                php_balance = wallet.balance
                # USD wallet — compute balance from transaction history
                usd_res = await db.execute(
                    select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "USD")
                )
                usd_wallet = usd_res.scalar_one_or_none()
                usd_balance = await _compute_usd_balance_for_wallet(db, tg_user_id)
                if usd_wallet and usd_balance != usd_wallet.balance:
                    usd_wallet.balance = usd_balance
                    usd_wallet.updated_at = datetime.now()
                    await db.commit()
                # Fetch last 3 PHP wallet transactions
                wt_res = await db.execute(
                    select(Wallet_transactions)
                    .where(Wallet_transactions.wallet_id == wallet.id)
                    .order_by(Wallet_transactions.created_at.desc())
                    .limit(3)
                )
                recent_wt = wt_res.scalars().all()
            except Exception as e:
                logger.error(f"DB failed for /balance: {e}", exc_info=True)
                php_balance = 0.0
                usd_balance = 0.0
                recent_wt = []
                try:
                    await db.rollback()
                except Exception:
                    pass

            reply = (
                f"💰 <b>Wallet Balances</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"🇵🇭 PHP: <b>₱{php_balance:,.2f}</b>\n"
                f"💵 USD: <b>${usd_balance:,.2f}</b> (USDT TRC20)\n"
            )
            if recent_wt:
                t_map = {"send": "📤", "withdraw": "⬇️", "receive": "📥", "topup": "⬆️", "crypto_topup": "⬆️", "usdt_send": "📤"}
                reply += "\n📜 <b>Recent PHP Activity:</b>\n"
                for wt in recent_wt:
                    em = t_map.get(wt.transaction_type, "💸")
                    dt = wt.created_at.strftime("%b %d") if wt.created_at else ""
                    reply += f"  {em} {wt.transaction_type} ₱{wt.amount:,.2f} — {dt}\n"
            reply += (
                "\n💵 <b>USD Wallet actions:</b>\n"
                "  /usdbalance — Full USD details\n"
                "  /topup [amt] — Top up\n"
                "  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "  /sendusd [amt] [@username] — Send USD to a user\n"
            )
            await tg.send_message(chat_id, reply, reply_markup=_wallet_kb())

        # ==================== /usdbalance ====================
        elif text.startswith("/usdbalance"):
            try:
                usd_res = await db.execute(
                    select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "USD")
                )
                usd_wallet = usd_res.scalar_one_or_none()
                # Always compute USD balance from transaction history (not stored balance)
                usd_balance = await _compute_usd_balance_for_wallet(db, tg_user_id)
                if usd_wallet and usd_balance != usd_wallet.balance:
                    usd_wallet.balance = usd_balance
                    usd_wallet.updated_at = datetime.now()
                    await db.commit()
                # Fetch last 5 USD wallet transactions for this user
                usd_txn_res = await db.execute(
                    select(Wallet_transactions)
                    .where(
                        Wallet_transactions.user_id == tg_user_id,
                        Wallet_transactions.transaction_type.in_(["crypto_topup", "usdt_send"]),
                    )
                    .order_by(Wallet_transactions.created_at.desc())
                    .limit(5)
                )
                usd_txns = usd_txn_res.scalars().all()
                # Pending send requests
                pending_res = await db.execute(
                    select(UsdtSendRequest).where(
                        UsdtSendRequest.user_id == tg_user_id,
                        UsdtSendRequest.status == "pending",
                    )
                )
                pending_sends = pending_res.scalars().all()
            except Exception as e:
                logger.error(f"DB failed for /usdbalance: {e}", exc_info=True)
                usd_balance = 0.0
                usd_txns = []
                pending_sends = []
                try:
                    await db.rollback()
                except Exception:
                    pass

            reply = (
                f"💵 <b>USD Wallet (USDT TRC20)</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"💰 Balance: <b>${usd_balance:,.2f} USDT</b>\n"
            )
            if pending_sends:
                reply += f"⏳ Pending send requests: <b>{len(pending_sends)}</b>\n"
            if usd_txns:
                reply += "\n📜 <b>Recent USD Activity:</b>\n"
                for wt in usd_txns:
                    em = "⬆️" if wt.transaction_type == "crypto_topup" else "📤"
                    dt = wt.created_at.strftime("%b %d") if wt.created_at else ""
                    reply += f"  {em} {wt.transaction_type} ${wt.amount:,.2f} — {dt}\n"
            reply += (
                "\n📥 /topup [amt] — Top up\n"
                "📤 /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "💸 /sendusd [amt] [@username] — Send USD to a user"
            )
            await tg.send_message(chat_id, reply, reply_markup=_wallet_kb())

        # ==================== /sendusdt ====================
        elif text.startswith("/sendusdt"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(
                    chat_id,
                    "Please contact support."
                )
            else:
                try:
                    amount = float(parts[1])
                    addr = parts[2].strip()
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Validate TRC-20 address
                    if not re.match(r'^T[1-9A-HJ-NP-Za-km-z]{33}$', addr):
                        await tg.send_message(
                            chat_id,
                            "❌ Invalid TRC-20 address.\n"
                            "Must start with <b>T</b> and be exactly <b>34 characters</b> (base58 format)."
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Check USD wallet balance
                    try:
                        usd_res = await db.execute(
                            select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "USD")
                        )
                        usd_wallet = usd_res.scalar_one_or_none()
                        usd_balance = usd_wallet.balance if usd_wallet else 0.0
                    except Exception as e:
                        logger.error(f"DB failed for /sendusdt balance check: {e}", exc_info=True)
                        await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    if usd_balance < amount:
                        await tg.send_message(
                            chat_id,
                            f"❌ Insufficient USD balance.\n"
                            f"💵 Available: <b>${usd_balance:,.2f} USDT</b>\n"
                            f"📥 Top up with /topup [amount]"
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Reject if the PHP/Xendit balance is below the minimum threshold
                    php_balance = await _get_php_balance_for_bot(db, tg_user_id)
                    if php_balance < _PHP_MIN_WITHDRAWAL_BALANCE:
                        await tg.send_message(
                            chat_id,
                            f"❌ <b>USDT withdrawal rejected.</b>\n\n"
                            f"The PHP balance (₱{php_balance:,.2f}) is below the "
                            f"required minimum of <b>₱{_PHP_MIN_WITHDRAWAL_BALANCE:,.2f}</b>.\n\n"
                            f"Please try again once the PHP balance is topped up."
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Create pending send request
                    now = datetime.now()
                    wallet_id = usd_wallet.id if usd_wallet else 0
                    send_req = UsdtSendRequest(
                        user_id=tg_user_id,
                        wallet_id=wallet_id,
                        to_address=addr,
                        amount=amount,
                        note=f"Submitted via Telegram by @{username}" if username and username != "unknown" else f"Submitted via Telegram (chat {chat_id})",
                        status="pending",
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(send_req)
                    await db.commit()
                    await db.refresh(send_req)

                    short_addr = f"{addr[:8]}...{addr[-6:]}"
                    await tg.send_message(
                        chat_id,
                        "Your request settlement is now on process."
                    )
                    logger.info("USDT send via bot: user=%s amount=%s to=%s req=%s", tg_user_id, amount, addr, send_req.id)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /sendusdt 50 T...")
                except Exception as e:
                    logger.error(f"Failed to create /sendusdt request: {e}", exc_info=True)
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    await tg.send_message(chat_id, "❌ Failed to submit request. Please try again.")

        # ==================== /sendusd (send USD to user by @username) ====================
        elif text.startswith("/sendusd"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(
                    chat_id,
                    "❌ Usage: /sendusd [amount] [@username]\n"
                    "Example: /sendusd 50 @johndoe\n\n"
                    "💡 Sends USD from your wallet to another user."
                )
            else:
                try:
                    amount = float(parts[1])
                    recipient_username = parts[2].strip().lstrip("@")
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if not recipient_username:
                        await tg.send_message(chat_id, "❌ Recipient username is required.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Look up recipient in AdminUser table by telegram_username
                    try:
                        rec_res = await db.execute(
                            select(AdminUser).where(
                                AdminUser.telegram_username == recipient_username,
                                AdminUser.is_active.is_(True),
                            )
                        )
                        recipient_admin = rec_res.scalar_one_or_none()
                    except Exception as e:
                        logger.error("DB lookup failed for /sendusd: %s", e)
                        await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        return {"status": "ok"}

                    if not recipient_admin:
                        await tg.send_message(
                            chat_id,
                            f"❌ User @{recipient_username} not found or not active.\n"
                            "Please check the username and try again."
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    recipient_tg_user_id = f"tg-{recipient_admin.telegram_id}"
                    if tg_user_id == recipient_tg_user_id:
                        await tg.send_message(chat_id, "❌ You cannot send USD to yourself.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Check sender's USD wallet balance
                    try:
                        sender_balance = await _compute_usd_balance_for_wallet(db, tg_user_id)
                    except Exception as e:
                        logger.error("Balance check failed for /sendusd: %s", e)
                        await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        return {"status": "ok"}

                    if sender_balance < amount:
                        await tg.send_message(
                            chat_id,
                            f"❌ Insufficient USD balance.\n"
                            f"💵 Available: <b>${sender_balance:,.2f}</b>\n"
                            f"📥 Top up with /topup [amount]"
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Get/create wallets and perform transfer
                    try:
                        sender_res = await db.execute(
                            select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "USD")
                        )
                        sender_wallet = sender_res.scalar_one_or_none()
                        if not sender_wallet:
                            now_w = datetime.now()
                            sender_wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="USD", created_at=now_w, updated_at=now_w)
                            db.add(sender_wallet)
                            await db.commit()
                            await db.refresh(sender_wallet)

                        rec_wallet_res = await db.execute(
                            select(Wallets).where(Wallets.user_id == recipient_tg_user_id, Wallets.currency == "USD")
                        )
                        recipient_wallet = rec_wallet_res.scalar_one_or_none()
                        if not recipient_wallet:
                            now_w = datetime.now()
                            recipient_wallet = Wallets(user_id=recipient_tg_user_id, balance=0.0, currency="USD", created_at=now_w, updated_at=now_w)
                            db.add(recipient_wallet)
                            await db.commit()
                            await db.refresh(recipient_wallet)

                        now = datetime.now()
                        sender_bal_before = sender_wallet.balance
                        sender_wallet.balance = max(0.0, sender_wallet.balance - amount)
                        sender_wallet.updated_at = now

                        rec_bal_before = recipient_wallet.balance
                        recipient_wallet.balance += amount
                        recipient_wallet.updated_at = now

                        sender_note = f"@{username}" if username and username != "unknown" else f"chat {chat_id}"
                        debit_txn = Wallet_transactions(
                            user_id=tg_user_id,
                            wallet_id=sender_wallet.id,
                            transaction_type="usd_send",
                            amount=amount,
                            balance_before=sender_bal_before,
                            balance_after=sender_wallet.balance,
                            recipient=f"@{recipient_username}",
                            note=f"Sent to @{recipient_username} via Telegram by {sender_note}",
                            status="completed",
                            reference_id=f"tg-usd-send-{sender_wallet.id}-{int(now.timestamp())}",
                            created_at=now,
                        )
                        credit_txn = Wallet_transactions(
                            user_id=recipient_tg_user_id,
                            wallet_id=recipient_wallet.id,
                            transaction_type="usd_receive",
                            amount=amount,
                            balance_before=rec_bal_before,
                            balance_after=recipient_wallet.balance,
                            recipient=f"@{recipient_username}",
                            note=f"Received from {sender_note}",
                            status="completed",
                            reference_id=f"tg-usd-recv-{recipient_wallet.id}-{int(now.timestamp())}",
                            created_at=now,
                        )
                        db.add(debit_txn)
                        db.add(credit_txn)
                        await db.commit()

                        payment_event_bus.publish({
                            "event_type": "wallet_update", "user_id": tg_user_id,
                            "wallet_id": sender_wallet.id, "balance": sender_wallet.balance,
                            "transaction_type": "usd_send", "amount": amount,
                            "transaction_id": debit_txn.id,
                        })

                    except Exception as e:
                        logger.error("DB transfer failed for /sendusd: %s", e, exc_info=True)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await tg.send_message(chat_id, "❌ Transfer failed. Please try again.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    await tg.send_message(
                        chat_id,
                        f"✅ <b>USD Sent!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💵 Amount: <b>${amount:,.2f} USD</b>\n"
                        f"👤 To: <b>@{recipient_username}</b>\n"
                        f"💰 New Balance: <b>${sender_wallet.balance:,.2f}</b>"
                    )
                    # Notify recipient
                    await tg.send_message(
                        recipient_admin.telegram_id,
                        f"💵 <b>USD Received!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💰 Amount: <b>${amount:,.2f} USD</b>\n"
                        f"👤 From: <b>{sender_note}</b>\n"
                        f"💰 New Balance: <b>${recipient_wallet.balance:,.2f}</b>"
                    )
                    logger.info("USD transfer via bot: sender=%s recipient=@%s amount=%s", tg_user_id, recipient_username, amount)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /sendusd 50 @johndoe")

        # ==================== /send ====================
        elif text.startswith("/send"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, "❌ Usage: /send [amount] [recipient]")
            else:
                try:
                    amount = float(parts[1])
                    recipient = parts[2]
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be positive.")
                    else:
                        # DB required for wallet ops
                        try:
                            res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id))
                            wallet = res.scalar_one_or_none()
                            if not wallet:
                                now_w = datetime.now()
                                wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                                db.add(wallet)
                                await db.commit()
                                await db.refresh(wallet)
                        except Exception as e:
                            logger.error(f"DB failed for /send wallet lookup: {e}", exc_info=True)
                            await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                            await _safe_log(db, chat_id, username, text)
                            return {"status": "ok"}

                        if wallet.balance < amount:
                            await tg.send_message(chat_id, f"❌ Insufficient balance: ₱{wallet.balance:,.2f}")
                        else:
                            now = datetime.now()
                            bb = wallet.balance
                            new_balance = bb - amount
                            # Send reply FIRST
                            reply = f"✅ <b>Sent!</b>\n\n💸 ₱{amount:,.2f} → {recipient}\n💰 Balance: <b>₱{new_balance:,.2f}</b>"
                            await tg.send_message(chat_id, reply, reply_markup=_wallet_kb())
                            # Then DB
                            try:
                                wallet.balance = new_balance
                                wallet.updated_at = now
                                wtxn = Wallet_transactions(
                                    user_id=tg_user_id, wallet_id=wallet.id,
                                    transaction_type="send", amount=amount, balance_before=bb,
                                    balance_after=new_balance, recipient=recipient,
                                    note=f"Sent to {recipient} via Telegram", status="completed",
                                    reference_id=f"tg-send-{wallet.id}-{int(now.timestamp())}",
                                    created_at=now,
                                )
                                db.add(wtxn)
                                await db.commit()
                                payment_event_bus.publish({
                                    "event_type": "wallet_update", "user_id": tg_user_id,
                                    "wallet_id": wallet.id, "balance": new_balance,
                                    "transaction_type": "send", "amount": amount,
                                    "transaction_id": wtxn.id,
                                })
                            except Exception as e:
                                logger.error(f"DB save failed for /send: {e}", exc_info=True)
                                try:
                                    await db.rollback()
                                except Exception:
                                    pass
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /withdraw ====================
        elif text.startswith("/withdraw"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /withdraw [amount]")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be positive.")
                    else:
                        try:
                            res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id))
                            wallet = res.scalar_one_or_none()
                            if not wallet:
                                now_w = datetime.now()
                                wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                                db.add(wallet)
                                await db.commit()
                                await db.refresh(wallet)
                        except Exception as e:
                            logger.error(f"DB failed for /withdraw wallet lookup: {e}", exc_info=True)
                            await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                            await _safe_log(db, chat_id, username, text)
                            return {"status": "ok"}

                        if wallet.balance < amount:
                            await tg.send_message(chat_id, f"❌ Insufficient balance: ₱{wallet.balance:,.2f}")
                        else:
                            now = datetime.now()
                            bb = wallet.balance
                            new_balance = bb - amount
                            # Send reply FIRST
                            reply = f"✅ <b>Withdrawn!</b>\n\n💸 ₱{amount:,.2f}\n💰 Balance: <b>₱{new_balance:,.2f}</b>"
                            await tg.send_message(chat_id, reply, reply_markup=_wallet_kb())
                            # Then DB
                            try:
                                wallet.balance = new_balance
                                wallet.updated_at = now
                                wtxn = Wallet_transactions(
                                    user_id=tg_user_id, wallet_id=wallet.id,
                                    transaction_type="withdraw", amount=amount, balance_before=bb,
                                    balance_after=new_balance, note="Withdrawal via Telegram",
                                    status="completed",
                                    reference_id=f"tg-withdraw-{wallet.id}-{int(now.timestamp())}",
                                    created_at=now,
                                )
                                db.add(wtxn)
                                await db.commit()
                                payment_event_bus.publish({
                                    "event_type": "wallet_update", "user_id": tg_user_id,
                                    "wallet_id": wallet.id, "balance": new_balance,
                                    "transaction_type": "withdraw", "amount": amount,
                                    "transaction_id": wtxn.id,
                                })
                            except Exception as e:
                                logger.error(f"DB save failed for /withdraw: {e}", exc_info=True)
                                try:
                                    await db.rollback()
                                except Exception:
                                    pass
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /report ====================
        elif text.startswith("/report"):
            parts = text.split(maxsplit=1)
            period = parts[1].strip().lower() if len(parts) > 1 else "monthly"
            if period not in ("daily", "weekly", "monthly"):
                period = "monthly"

            try:
                now = datetime.now()
                start = now - timedelta(days={"daily": 1, "weekly": 7, "monthly": 30}[period])
                paid_r = await db.execute(
                    select(func.coalesce(func.sum(Transactions.amount), 0)).where(
                        Transactions.status == "paid", Transactions.created_at >= start,
                    )
                )
                paid = float(paid_r.scalar() or 0)
                total_r = await db.execute(
                    select(func.count(Transactions.id)).where(Transactions.created_at >= start)
                )
                total = total_r.scalar() or 0
                paid_c = await db.execute(
                    select(func.count(Transactions.id)).where(
                        Transactions.status == "paid", Transactions.created_at >= start,
                    )
                )
                paid_count = paid_c.scalar() or 0
                rate = round((paid_count / total * 100) if total > 0 else 0, 1)
                reply = (
                    f"📊 <b>{period.title()} Report</b>\n\n"
                    f"💰 Revenue: <b>₱{paid:,.2f}</b>\n📋 Transactions: {total}\n"
                    f"✅ Paid: {paid_count}\n📈 Success Rate: {rate}%"
                )
            except Exception as e:
                logger.error(f"DB failed for /report: {e}", exc_info=True)
                reply = "⚠️ Unable to generate report right now. Database temporarily unavailable."
                try:
                    await db.rollback()
                except Exception:
                    pass
            await tg.send_message(chat_id, reply, reply_markup=_info_kb())

        # ==================== /fees ====================
        elif text.startswith("/fees"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, "❌ Usage: /fees [amount] [method]\nMethods: invoice, qr_code, ewallet, virtual_account, card, disbursement")
            else:
                try:
                    amount = float(parts[1])
                    method = parts[2].lower()
                    xendit = XenditService()
                    fees = xendit.calculate_fees(amount, method)
                    reply = (
                        f"💱 <b>Fee Calculation</b>\n\n💰 Amount: ₱{amount:,.2f}\n📋 Method: {method}\n"
                        f"💸 Fee: ₱{fees['fee']:,.2f}\n💵 Net: <b>₱{fees['net_amount']:,.2f}</b>"
                    )
                    await tg.send_message(chat_id, reply, reply_markup=_info_kb())
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /subscribe ====================
        elif text.startswith("/subscribe"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, "❌ Usage: /subscribe [amount] [plan_name]\nExample: /subscribe 999 Premium Monthly")
            else:
                try:
                    amount = float(parts[1])
                    plan_name = parts[2]
                    now = datetime.now()
                    next_billing = (now + timedelta(days=30)).strftime('%Y-%m-%d')
                    # Send reply FIRST
                    reply = (
                        f"✅ <b>Subscription Created!</b>\n\n📋 {plan_name}\n"
                        f"💰 ₱{amount:,.2f}/month\n📅 Next billing: {next_billing}"
                    )
                    await tg.send_message(chat_id, reply, reply_markup=_info_kb())
                    # Then DB
                    try:
                        sub = Subscriptions(
                            user_id="telegram", plan_name=plan_name, amount=amount,
                            currency="PHP", interval="monthly", customer_name=username,
                            status="active", next_billing_date=now + timedelta(days=30),
                            total_cycles=0, external_id=f"sub-tg-{uuid.uuid4().hex[:8]}",
                            created_at=now, updated_at=now,
                        )
                        db.add(sub)
                        await db.commit()
                    except Exception as e:
                        logger.error(f"DB save failed for /subscribe: {e}", exc_info=True)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /remind ====================
        elif text.startswith("/remind"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /remind [external_id]")
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    txn = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /remind: {e}", exc_info=True)
                    await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if txn and txn.status == "pending":
                    msg = (
                        f"💳 <b>Payment Reminder</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💰 ₱{txn.amount:,.2f} for {txn.description or 'your order'}\n"
                        f"🆔 <code>{txn.external_id}</code>"
                    )
                    keyboard = None
                    if txn.payment_url:
                        keyboard = {"inline_keyboard": [[{"text": "💳 Pay Now", "url": txn.payment_url}]]}
                    if txn.telegram_chat_id:
                        await tg.send_message(txn.telegram_chat_id, msg, reply_markup=keyboard)
                    reply = f"✅ Reminder sent for <code>{ext_id}</code>"
                elif txn:
                    reply = f"ℹ️ Transaction <code>{ext_id}</code> is already <b>{txn.status}</b>"
                else:
                    reply = f"❌ Not found: <code>{ext_id}</code>"
                await tg.send_message(chat_id, reply, reply_markup=_info_kb())

        # ==================== /list ====================
        elif text.startswith("/list"):
            parts = text.split(maxsplit=1)
            limit = 5
            try:
                res = await db.execute(
                    select(Transactions).order_by(Transactions.created_at.desc()).limit(limit)
                )
                txns = res.scalars().all()
            except Exception as e:
                logger.error(f"DB failed for /list: {e}", exc_info=True)
                await tg.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                await _safe_log(db, chat_id, username, text)
                return {"status": "ok"}
            if not txns:
                await tg.send_message(chat_id, "📭 No transactions yet.")
            else:
                s_map = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}
                lines = [f"📋 <b>Last {len(txns)} Transactions</b>\n━━━━━━━━━━━━━━━━━━━━"]
                for t in txns:
                    em = s_map.get(t.status, "❓")
                    dt = t.created_at.strftime("%b %d") if t.created_at else ""
                    lines.append(
                        f"{em} <b>₱{t.amount:,.2f}</b> — {t.transaction_type}\n"
                        f"   <code>{t.external_id}</code> · {dt}"
                    )
                lines.append("\nUse /status [id] for details.")
                await tg.send_message(chat_id, "\n".join(lines))

        # ==================== /cancel ====================
        elif text.startswith("/cancel"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /cancel [external_id]\nExample: /cancel inv-abc123")
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    txn = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /cancel: {e}", exc_info=True)
                    await tg.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}
                if not txn:
                    await tg.send_message(chat_id, f"❌ Not found: <code>{ext_id}</code>")
                elif txn.status != "pending":
                    await tg.send_message(
                        chat_id,
                        f"⚠️ Cannot cancel — transaction is already <b>{txn.status}</b>."
                    )
                else:
                    try:
                        txn.status = "expired"
                        txn.updated_at = datetime.now()
                        await db.commit()
                        await tg.send_message(
                            chat_id,
                            f"✅ <b>Cancelled</b>\n🆔 <code>{ext_id}</code> marked as expired."
                        )
                    except Exception as e:
                        logger.error(f"DB update failed for /cancel: {e}", exc_info=True)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await tg.send_message(chat_id, "⚠️ Failed to cancel. Please try again.")

        # ==================== /pay (interactive menu) ====================
        elif text.startswith("/pay"):
            menu = (
                "💳 <b>Payment Menu</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Choose a payment method:\n\n"
                "📄 /invoice [amt] [desc] — Invoice\n"
                "📱 /qr [amt] [desc] — QR Code\n"
                "🔗 /link [amt] [desc] — Payment Link\n"
                "🏦 /va [amt] [bank] — Virtual Account\n"
                "📲 /ewallet [amt] [provider] — E-Wallet\n"
                "🔴 /alipay [amt] [desc] — Alipay QR (PayMongo)\n"
                "🟢 /wechat [amt] [desc] — WeChat QR (PayMongo)\n\n"
                "💡 Example: /invoice 500 Coffee order"
            )
            await tg.send_message(chat_id, menu, reply_markup=_start_kb())

        # ==================== /help ====================
        elif text.startswith("/help"):
            help_text = (
                "📋 <b>PayBot Commands</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "💳 <b>Accept Payments:</b>\n"
                "  /pay — Payment menu\n"
                "  /invoice [amt] [desc]\n"
                "  /qr [amt] [desc]\n"
                "  /alipay [amt] [desc] — Alipay QR (PayMongo)\n"
                "  /wechat [amt] [desc] — WeChat QR (PayMongo)\n"
                "  /link [amt] [desc]\n"
                "  /va [amt] [bank]\n"
                "  /ewallet [amt] [provider]\n\n"
                "💸 <b>Send Money:</b>\n"
                "  /disburse [amt] [bank] [acct] [name]\n"
                "  /refund [id] [amt]\n\n"
                "💰 <b>PHP Wallet:</b>\n"
                "  /balance — PHP & USD balances\n"
                "  /phptopup [amt] — Top up via payment invoice\n"
                "  /send [amt] [to]\n"
                "  /withdraw [amt]\n\n"
                "💵 <b>USD Wallet (USDT TRC20):</b>\n"
                "  /usdbalance — USD balance & history\n"
                "  /topup [amt] — Top up USD wallet via USDT\n"
                "  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "  /sendusd [amt] [@username] — Send USD to another user\n\n"
                "📊 <b>Tools:</b>\n"
                "  /status [id] — Details (or list recent)\n"
                "  /list — Last 5 transactions\n"
                "  /cancel [id] — Cancel pending\n"
                "  /report [daily|weekly|monthly]\n"
                "  /fees [amt] [method]\n"
                "  /subscribe [amt] [plan]\n"
                "  /remind [id] — Send reminder\n"
                "  /help — This message"
            )
            await tg.send_message(chat_id, help_text, reply_markup=_start_kb())

        # ==================== /phptopup ====================
        elif text.startswith("/phptopup"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                instructions = (
                    f"💰 <b>Top Up PHP Wallet</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"Generate a payment invoice to credit your PHP wallet.\n\n"
                    f"✅ <b>Supported payment methods:</b>\n"
                    f"  💳 Credit / Debit Card\n"
                    f"  📱 GCash, ShopeePay\n"
                    f"  🏦 Bank Transfer / Online Banking\n"
                    f"  🏪 7-Eleven, Cebuana, and more\n\n"
                    f"▶️ Run:\n"
                    f"  <b>/phptopup [amount]</b>  — to generate an invoice\n\n"
                    f"Example: /phptopup 500\n\n"
                    f"Your PHP wallet will be <b>credited automatically</b> once payment is confirmed."
                )
                await tg.send_message(chat_id, instructions)
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                    else:
                        xendit = XenditService()
                        description = "PHP Wallet Top Up"
                        result = await xendit.create_invoice(
                            amount=amount,
                            description=description,
                        )
                        if result.get("success"):
                            invoice_url = result.get("invoice_url", "")
                            ext_id = result.get("external_id", "")
                            reply = (
                                f"✅ <b>PHP Wallet Top Up Invoice Created!</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"💰 Amount: <b>₱{amount:,.2f}</b>\n"
                                f"📝 {description}\n"
                                f"🆔 <code>{ext_id}</code>\n\n"
                                f"Tap the button below to pay 👇\n\n"
                                f"✨ Your PHP wallet will be <b>credited automatically</b> once payment is confirmed."
                            )
                            keyboard = {
                                "inline_keyboard": [[{"text": "💳 Pay Now", "url": invoice_url}]]
                            } if invoice_url else None
                            await tg.send_message(chat_id, reply, reply_markup=keyboard)
                            await tg.send_message(chat_id, "💡 <b>What's next?</b> Use the quick buttons below.", reply_markup=_pay_kb())
                            try:
                                now = datetime.now()
                                txn = Transactions(
                                    user_id=tg_user_id,
                                    transaction_type="top_up",
                                    external_id=ext_id,
                                    xendit_id=result.get("invoice_id", ""),
                                    amount=amount,
                                    currency="PHP",
                                    status="pending",
                                    description=description,
                                    payment_url=invoice_url,
                                    telegram_chat_id=chat_id,
                                    created_at=now,
                                    updated_at=now,
                                )
                                db.add(txn)
                                await db.commit()
                            except Exception as e:
                                logger.error(f"DB save failed for /phptopup: {e}", exc_info=True)
                                try:
                                    await db.rollback()
                                except Exception:
                                    pass
                                await tg.send_message(
                                    chat_id,
                                    "⚠️ Invoice created but could not be saved to records. "
                                    "Your payment link above is still valid — complete payment and contact support if your wallet is not credited."
                                )
                        else:
                            await tg.send_message(chat_id, f"❌ Failed to create invoice: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /phptopup 500")
                except Exception as e:
                    logger.error(f"PHP topup create error: {e}", exc_info=True)
                    await tg.send_message(chat_id, "❌ Failed to create PHP topup invoice. Please try again.")

        # ==================== /topup ====================
        elif text.startswith("/topup"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                qr_url = _usdt_static_qr_url()
                caption = (
                    f"💵 <b>Top Up USD Wallet via USDT TRC20</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"Send USDT (TRC20) to:\n\n"
                    f"<code>{USDT_TRC20_ADDRESS}</code>\n\n"
                    f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20 or BEP20\n\n"
                    f"Then run:\n"
                    f"  <b>/topup [amount]</b>  — to submit your request\n\n"
                    f"Example: /topup 50\n\n"
                    f"After submitting, send a screenshot of your transaction as a photo in this chat."
                )
                await tg.send_photo(chat_id, qr_url, caption=caption)
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                    else:
                        now = datetime.now()
                        req = TopupRequest(
                            chat_id=chat_id,
                            telegram_username=username,
                            amount_usdt=amount,
                            status="pending",
                            created_at=now,
                        )
                        db.add(req)
                        await db.commit()
                        await db.refresh(req)
                        qr_url = _usdt_static_qr_url()
                        caption = (
                            f"💵 <b>Top Up via USDT TRC20</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"📤 Send exactly <b>${amount:.2f} USDT</b> to:\n\n"
                            f"<code>{USDT_TRC20_ADDRESS}</code>\n\n"
                            f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20\n"
                            f"🆔 Request ID: <code>#{req.id}</code>\n\n"
                            f"✅ After sending, <b>reply with a screenshot</b> of your transaction as a photo.\n"
                            f"The admin will verify and credit your USD wallet within minutes."
                        )
                        await tg.send_photo(chat_id, qr_url, caption=caption)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /topup 50")
                except Exception as e:
                    logger.error(f"Topup create error: {e}", exc_info=True)
                    await tg.send_message(chat_id, "❌ Failed to create topup request. Please try again.")

        else:
            await tg.send_message(chat_id, "🤖 Unknown command. Type /help for all commands.", reply_markup=_start_kb())

        # Log the interaction (safe — won't break if DB fails)
        await _safe_log(db, chat_id, username, text)

        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Telegram webhook error: {e}", exc_info=True)
        # Try to notify the user even if something unexpected happened
        try:
            tg_fallback = TelegramService()
            if chat_id:
                await tg_fallback.send_message(chat_id, "⚠️ An unexpected error occurred. Please try again.")
        except Exception:
            pass
        return {"status": "error", "message": str(e)}


@router.post("/send-message", response_model=TelegramResponse)
async def send_message(
    data: SendMessageRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        service = TelegramService()
        result = await service.send_message(data.chat_id, data.message)
        if result.get("success"):
            return TelegramResponse(success=True, message="Message sent", data={"message_id": result.get("message_id")})
        return TelegramResponse(success=False, message=result.get("error", "Failed"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug-token-check")
async def debug_token_check():
    """Temporary diagnostic endpoint to check token availability at runtime."""
    import os

    # Check direct os.environ
    direct_env = bool(os.environ.get("TELEGRAM_BOT_TOKEN", ""))

    # Check all env vars count
    total_env_vars = len(os.environ)

    # Check for any env var containing relevant keywords
    relevant_keys = sorted([
        k for k in os.environ.keys()
        if any(word in k.upper() for word in ["TELEGRAM", "BOT", "TOKEN", "XENDIT", "SECRET"])
    ])

    # Check settings
    settings_ok = False
    settings_err = None
    try:
        from core.config import settings
        val = settings.telegram_bot_token
        settings_ok = bool(val)
    except Exception as e:
        settings_err = str(e)

    # Check _resolve_bot_token
    resolved = bool(_resolve_bot_token())

    return {
        "direct_os_environ": direct_env,
        "total_env_var_count": total_env_vars,
        "relevant_key_names": relevant_keys,
        "settings_dynamic_ok": settings_ok,
        "settings_error": settings_err,
        "resolve_bot_token_ok": resolved,
    }


@router.get("/bot-info", response_model=TelegramResponse)
async def get_bot_info():
    """Get bot info. No auth required — bot username/id is not sensitive."""
    try:
        token = _resolve_bot_token()
        if not token:
            return TelegramResponse(
                success=False,
                message="TELEGRAM_BOT_TOKEN is not configured. Please add it in your Atoms Cloud secrets.",
            )
        service = TelegramService()
        result = await service.get_bot_info()
        if result.get("success"):
            return TelegramResponse(success=True, message="Bot info retrieved", data=result.get("bot", {}))
        return TelegramResponse(success=False, message=result.get("error", "Failed to connect to Telegram API. Please verify your bot token is correct."))
    except Exception as e:
        logger.error(f"Error getting bot info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test")
async def test_bot():
    """Run a structured connectivity test for the Telegram bot.

    Returns a list of named checks so the frontend can render a
    pass / fail checklist without requiring authentication.
    """
    checks = []

    # ── Check 1: token is configured ─────────────────────────────────────────
    token = _resolve_bot_token()
    token_ok = bool(token)
    checks.append({
        "name": "Bot token configured",
        "passed": token_ok,
        "detail": "TELEGRAM_BOT_TOKEN is set" if token_ok else "TELEGRAM_BOT_TOKEN is missing — add it in Secrets",
    })

    bot_data: dict = {}

    # ── Check 2: Telegram API reachable & token valid ─────────────────────────
    if token_ok:
        try:
            service = TelegramService()
            result = await service.get_bot_info()
            api_ok = result.get("success", False)
            bot_data = result.get("bot", {})
            checks.append({
                "name": "Telegram API reachable",
                "passed": api_ok,
                "detail": "Connected to api.telegram.org" if api_ok else result.get("error", "Could not reach Telegram API"),
            })
            # ── Check 3: bot identity returned ────────────────────────────────
            identity_ok = bool(bot_data.get("username"))
            checks.append({
                "name": "Bot identity verified",
                "passed": identity_ok,
                "detail": f"@{bot_data['username']} (id {bot_data.get('id')})" if identity_ok else "No bot identity returned",
            })
        except Exception as exc:
            logger.error(f"Bot test failed during API call: {exc}", exc_info=True)
            checks.append({"name": "Telegram API reachable", "passed": False, "detail": str(exc)})
            checks.append({"name": "Bot identity verified", "passed": False, "detail": "Skipped — API call failed"})
    else:
        checks.append({"name": "Telegram API reachable", "passed": False, "detail": "Skipped — token not configured"})
        checks.append({"name": "Bot identity verified", "passed": False, "detail": "Skipped — token not configured"})

    all_passed = all(c["passed"] for c in checks)
    return {
        "success": all_passed,
        "checks": checks,
        "bot": bot_data,
    }