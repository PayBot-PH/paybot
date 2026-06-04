import logging
from html import escape as _escape_html
import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from models.bot_logs import Bot_logs
from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.disbursements import Disbursements
from models.refunds import Refunds
from models.subscriptions import Subscriptions
from schemas.auth import UserResponse
from services.telegram_service import TelegramService, _resolve_bot_token
from services.maya_service import MayaService
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService
from services.photonpay_service import PhotonPayService
from services.bot_settings import Bot_settingsService
from services.pos_terminal import POSTerminalService
from models.topup_requests import TopupRequest
from models.bank_deposit_requests import BankDepositRequest
from models.usdt_send_requests import UsdtSendRequest
from models.kyb_registrations import KybRegistration
from models.kyc_verifications import KycVerification
from models.admin_users import AdminUser
from models.custom_roles import CustomRole
from routers.app_settings import get_usdt_php_rate, get_usdt_trc20_address
from routers.bank_deposit import _PAYBOT_ACCOUNTS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

# Transaction types that credit / debit the USD wallet (keep in sync with wallet.py)
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")



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


def _parse_tlv(s: str) -> dict:
    """Parse an EMVCo/QRPH TLV-encoded string into a tag→value dict.

    Tag reference: 53=Currency (608=PHP), 58=Country, 59=Merchant Name,
    60=City, 62=Additional Data (sub-tag 05=Reference Label, 01=Bill Number).
    The equivalent parser exists in ScanQRPH.tsx (frontend).
    """
    result: dict = {}
    i = 0
    while i + 4 <= len(s):
        tag = s[i:i+2]
        try:
            length = int(s[i+2:i+4])
        except ValueError:
            break
        if i + 4 + length > len(s):
            break
        result[tag] = s[i+4:i+4+length]
        i += 4 + length
    return result


async def _decode_qr_from_telegram_photo(tg: "TelegramService", file_id: str) -> Optional[str]:
    """Download a Telegram photo by file_id and decode the first QR code found.

    Returns the decoded string, or None if no QR code could be detected.
    """
    file_info = await tg.get_file(file_id)
    if not file_info.get("success"):
        logger.warning(f"getFile failed for file_id={file_id}: {file_info.get('error')}")
        return None

    image_bytes = await tg.download_file_bytes(file_info["file_path"])
    if not image_bytes:
        return None

    try:
        from pyzbar import pyzbar
        from PIL import Image
        import io as _io

        img = Image.open(_io.BytesIO(image_bytes))
        decoded_objects = pyzbar.decode(img)
        if decoded_objects:
            return decoded_objects[0].data.decode("utf-8", errors="replace")
        return None
    except Exception as e:
        logger.error(f"QR decode error: {e}", exc_info=True)
        return None


async def _process_scanqr(
    tg: "TelegramService",
    db: "AsyncSession",
    chat_id: str,
    username: str,
    amount: float,
    qr_data: str,
) -> None:
    """Process a QRPH payment after the amount and QR data have been collected."""
    tlv = _parse_tlv(qr_data)
    merchant_name = tlv.get("59", "")
    merchant_city = tlv.get("60", "")
    currency_code = tlv.get("53", "")
    currency = "PHP" if currency_code == "608" else currency_code or "PHP"
    ref_num = ""
    add_data = tlv.get("62", "")
    if add_data:
        sub = _parse_tlv(add_data)
        ref_num = sub.get("05", sub.get("01", ""))

    external_id = f"qrph-{uuid.uuid4().hex[:12]}"
    reply_lines = [
        "✅ <b>QRPH Payment Recorded</b>",
        "━━━━━━━━━━━━━━━━━━━━",
        f"💰 Amount: <b>₱{amount:,.2f} PHP</b>",
    ]
    if merchant_name:
        reply_lines.append(f"🏪 Merchant: <b>{merchant_name}</b>")
    if merchant_city:
        reply_lines.append(f"📍 City: {merchant_city}")
    if ref_num:
        reply_lines.append(f"🆔 Reference: <code>{ref_num}</code>")
    reply_lines += [
        "",
        "⏳ Status: <b>Pending</b>",
        "💳 Complete the payment via your bank or e-wallet app.",
    ]
    await tg.send_message(chat_id, "\n".join(reply_lines))

    try:
        now = datetime.now()
        txn = Transactions(
            user_id=f"tg-{chat_id}", transaction_type="qrph_payment",
            external_id=external_id, xendit_id="",
            amount=amount, currency=currency, status="pending",
            description=f"QRPH payment{f' to {merchant_name}' if merchant_name else ''}",
            customer_name=merchant_name,
            # Reuse qr_code_url to store the raw QRPH/EMVCo string (existing schema
            # field; capped at 500 chars to fit the column).
            qr_code_url=qr_data[:500], telegram_chat_id=chat_id,
            created_at=now, updated_at=now,
        )
        db.add(txn)
        await db.commit()
    except Exception as e:
        logger.error(f"DB save failed for /scanqr: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass


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
    """Return the live PayMongo PHP balance, falling back to the stored wallet row.

    Returns 0.0 if neither source is available so the caller can decide.
    """
    try:
        pm_svc = PayMongoService()
        result = await pm_svc.get_balance()
        if result.get("success"):
            available = result.get("available", [])
            php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
            if php_entry is not None:
                return float(php_entry["amount"]) / 100.0
    except Exception as e:
        logger.warning("PayMongo balance fetch failed in PHP threshold check: %s", e)

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

class BotConfigUpdate(BaseModel):
    bot_status: Optional[str] = None
    maintenance_mode: Optional[str] = None
    welcome_message_en: Optional[str] = None
    welcome_message_zh: Optional[str] = None
    payment_success_message: Optional[str] = None
    payment_failed_message: Optional[str] = None
    payment_pending_message: Optional[str] = None
    maintenance_message: Optional[str] = None
    commands_enabled: Optional[str] = None
    whatsapp_number: Optional[str] = None


# ---------- KYB constants ----------
_PH_BANKS = [
    "BDO", "BPI", "Metrobank", "UnionBank", "Land Bank", "PNB",
    "RCBC", "EastWest Bank", "Chinabank",
    "PSBank", "Maybank", "Other",
]

# Ordered list of KYB steps
_KYB_STEPS = ["full_name", "phone", "address", "bank", "id_photo"]

# ---------- Command wizard (step-by-step prompts) ----------
# In-memory state per chat: {chat_id: {"cmd": str, "step": int, "data": dict}}
_pending: Dict[str, Dict] = {}

_CMD_STEPS: Dict[str, List[Dict]] = {
    "/invoice": [
        {"key": "amount",      "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description", "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. Monthly subscription</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "Invoice payment"},
    ],
    "/qr": [
        {"key": "amount",      "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description", "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. QR payment</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "QR payment"},
    ],
    "/link": [
        {"key": "amount",      "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description", "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. Payment link</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "Payment link"},
    ],
    "/va": [
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "bank",   "type": "str",   "prompt": "🏦 Enter the <b>bank code</b>:\n<i>BDO · BPI · UNIONBANK · METROBANK · LANDBANK · PNB · RCBC</i>"},
    ],
    "/ewallet": [
        {"key": "amount",   "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "provider", "type": "str",   "prompt": "📱 Enter the <b>provider</b>:\n<i>GCASH · MAYA · GRABPAY</i>"},
    ],
    "/alipay": [
        {"key": "amount",      "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description", "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. Alipay payment</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "Alipay payment"},
    ],
    "/wechat": [
        {"key": "amount",      "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description", "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. WeChat payment</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "WeChat payment"},
    ],
    "/disburse": [
        {"key": "bank",    "type": "str",   "prompt": "🏦 Enter the <b>bank code</b>:\n<i>BDO · BPI · UNIONBANK · METROBANK · LANDBANK · PNB · RCBC</i>"},
        {"key": "account", "type": "str",   "prompt": "🔢 Enter the <b>account number</b>:\n<i>e.g. 1234567890</i>"},
        {"key": "name",    "type": "str",   "prompt": "👤 Enter the <b>account holder name</b>:\n<i>e.g. Juan Dela Cruz</i>"},
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 1000</i>"},
    ],
    "/refund": [
        {"key": "id",     "type": "str",   "prompt": "🆔 Enter the <b>transaction ID</b> to refund:\n<i>e.g. INV-xxx</i>"},
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>refund amount</b> in PHP:\n<i>e.g. 500</i>"},
    ],
    "/pos": [
        {"key": "amount",         "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "description",    "type": "str",   "prompt": "📝 Enter the <b>description</b>:\n<i>e.g. Retail Sale</i>\n\nOr type <code>skip</code> to use the default.", "optional": True, "default": "POS Sale"},
        {"key": "terminal_code",  "type": "str",   "prompt": "🔢 Enter the <b>Terminal Code</b> to push this transaction to:\n\nOr type <code>skip</code> to use your active terminal.", "optional": True, "default": "AUTO"},
    ],
    "/send": [
        {"key": "recipient", "type": "str",   "prompt": "👤 Enter the <b>recipient</b> (username or Telegram ID):\n<i>e.g. @username</i>"},
        {"key": "amount",    "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
    ],
    "/sendusdt": [
        {"key": "address", "type": "str",   "prompt": "📬 Enter the <b>TRC20 wallet address</b>:\n<i>e.g. TXxx...</i>"},
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>USDT amount</b> to send:\n<i>e.g. 50</i>"},
    ],
    "/sendusd": [
        {"key": "username", "type": "str",   "prompt": "👤 Enter the <b>recipient username</b>:\n<i>e.g. @username</i>"},
        {"key": "amount",   "type": "float", "prompt": "💰 Enter the <b>USD amount</b> to send:\n<i>e.g. 50</i>"},
    ],
    "/fees": [
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "method", "type": "str",   "prompt": "💳 Enter the <b>payment method</b>:\n<i>invoice · qr · link · va · ewallet</i>"},
    ],
    "/cancel": [
        {"key": "id", "type": "str", "prompt": "🆔 Enter the <b>transaction ID</b> to cancel:\n<i>e.g. INV-xxx</i>"},
    ],
    "/remind": [
        {"key": "id", "type": "str", "prompt": "🆔 Enter the <b>transaction ID</b> to send a reminder:\n<i>e.g. INV-xxx</i>"},
    ],
    "/deposit": [
        {"key": "channel", "type": "str",   "prompt": "💳 Enter the <b>payment channel</b> used to send the money:\n<i>GCASH · MAYA · BDO · BPI · METROBANK · UNIONBANK · LANDBANK</i>"},
        {"key": "account", "type": "str",   "prompt": "🔢 Enter the <b>account / mobile number</b> used to make the transfer:\n<i>e.g. 09XXXXXXXXX or your bank account number</i>"},
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>exact amount</b> sent in PHP:\n<i>e.g. 500.00</i>"},
    ],
    "/scanqr": [
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>amount</b> to pay in PHP:\n<i>e.g. 500</i>"},
        {"key": "qr_data", "type": "photo", "prompt": "📷 Now upload a photo of the <b>QRPH QR code</b>.\n<i>Make sure the QR code is clearly visible and well-lit.</i>"},
    ],
}


def _wizard_start(chat_id: str, cmd: str, initial_data: Optional[Dict[str, str]] = None, start_step: int = 0) -> str:
    """Initialise pending state for cmd and return the first prompt."""
    _pending[chat_id] = {
        "cmd": cmd,
        "step": start_step,
        "data": initial_data.copy() if initial_data else {},
    }
    return (
        f"📋 <b>{cmd}</b> — let's fill in the details.\n"
        f"Type <code>/cancel</code> at any time to abort.\n\n"
        + _CMD_STEPS[cmd][start_step]["prompt"]
    )

def _mask_card_number(card_number: str) -> str:
    """Return a masked card number for display without storing full PAN."""
    digits = re.sub(r"\D", "", card_number or "")
    if len(digits) < 4:
        return "****"
    if len(digits) <= 8:
        return f"{digits[:4]}{'*' * (len(digits) - 4)}"
    return f"{digits[:4]}{'*' * (len(digits) - 8)}{digits[-4:]}"
def _start_kb() -> dict:
    """Full quick-action keyboard for /start and /help."""
    return {
        "keyboard": [
            [{"text": "💳 /invoice"}, {"text": "📱 /qr"}, {"text": "🔗 /link"}],
            [{"text": "🏦 /va"}, {"text": "📱 /ewallet"}, {"text": "💳 /pos"}],
            [{"text": "🔴 /alipay"}, {"text": "🟢 /wechat"}, {"text": "💰 /balance"}],
            [{"text": "💸 /disburse"}, {"text": "📷 /scanqr"}, {"text": "🏦 /deposit"}],
            [{"text": "📥 /topup"}, {"text": "📋 /list"}, {"text": "💱 /fees"}],
            [{"text": "❓ /help"}],
        ],
        "resize_keyboard": True,
        "one_time_keyboard": False,
    }


def _lang_kb() -> dict:
    """Inline keyboard for language selection on /start."""
    return {
        "inline_keyboard": [[
            {"text": "🇬🇧 English", "callback_data": "lang:en"},
            {"text": "🇨🇳 中文", "callback_data": "lang:zh"},
        ]]
    }


def _welcome_en(name: str = "") -> str:
    greeting = f"Hi {name}! 🎉" if name else "🎉 You're in!"
    return (
        f"👋 <b>Welcome to PayBot Philippines!</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{greeting} Your all-in-one payment terminal is ready.\n\n"
        f"💳 <b>Accept Payments</b>\n"
        f"  /invoice — Create invoice link\n"
        f"  /pos — Push to Terminal (Tap to Phone)\n"
        f"  /qr — Generate a QR code\n"
        f"  /link — Shareable link\n\n"
        f"📟 <b>Terminals</b>\n"
        f"  /terminal — Manage active POS devices\n\n"
        f"💰 <b>Wallet</b>\n"
        f"  /wallet — Check balance & history\n"
        f"  /send [to] [amt] — Transfer PHP to user\n"
        f"  /topup [amt] — Add funds via USDT\n\n"
        f"💡 <b>Tip:</b> Type any command to start. Use /help for full reference."
    )


def _welcome_zh(name: str = "") -> str:
    greeting = f"嗨 {name}！🎉" if name else "🎉 欢迎回来！"
    return (
        f"👋 <b>欢迎使用 PayBot Philippines！</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{greeting} 您的一站式支付终端已就绪。\n\n"
        f"💳 <b>收款功能</b>\n"
        f"  /invoice — 创建账单链接\n"
        f"  /pos — 终端支付 (Tap to Phone)\n"
        f"  /qr — 生成二维码\n"
        f"  /link — 分享付款链接\n\n"
        f"📟 <b>终端管理</b>\n"
        f"  /terminal — 管理您的 POS 设备\n\n"
        f"💰 <b>我的钱包</b>\n"
        f"  /wallet — 查看余额与历史\n"
        f"  /send [接收方] [金额] — 转账 PHP\n"
        f"  /topup [金额] — 通过 USDT 充值\n\n"
        f"💡 <b>提示：</b> 输入命令即可开始。输入 /help 查看完整参考。"
    )


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

# ---------- Language preference store ----------
# chat_id → "en" or "zh". Persists until the user runs /start again.
# Note: This is intentionally in-memory. Language preferences are lightweight
# UX state that does not need to survive server restarts — the user will simply
# be prompted to choose their language again on the next /start.
_user_lang: dict[str, str] = {}


def _lang(chat_id: str) -> str:
    """Return the stored language for a chat, defaulting to English."""
    return _user_lang.get(chat_id, "en")


def _t(chat_id: str, en: str, zh: str = "") -> str:
    """Pick the localised string based on the user's stored language."""
    if _lang(chat_id) == "zh" and zh:
        return zh
    return en


# Sentinel dict to remove any active ReplyKeyboard without sending one.
_REMOVE_KB: dict = {"remove_keyboard": True}


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


async def _get_or_promote_recipient(db: AsyncSession, username_or_id: str) -> Optional[AdminUser]:
    """Find a recipient by username or numeric ID.
    Looks in AdminUser first, then KybRegistration.
    If found in KybRegistration, auto-promotes to AdminUser.
    """
    cleaned = username_or_id.strip().lstrip("@")
    if not cleaned:
        return None

    # 1. Try AdminUser
    try:
        res = await db.execute(select(AdminUser).where(
            or_(AdminUser.telegram_username == cleaned, AdminUser.telegram_id == cleaned)
        ))
        admin = res.scalar_one_or_none()
        if admin:
            return admin
    except Exception as e:
        logger.error(f"Error looking up AdminUser: {e}")

    # 2. Try KybRegistration
    try:
        res = await db.execute(select(KybRegistration).where(
            or_(KybRegistration.telegram_username == cleaned, KybRegistration.chat_id == cleaned)
        ))
        kyb = res.scalar_one_or_none()
        if kyb:
            # Found in registration but not in admins -> Auto-promote
            new_admin = AdminUser(
                telegram_id=kyb.chat_id,
                telegram_username=kyb.telegram_username,
                name=kyb.full_name or kyb.telegram_username or "Unknown",
                is_active=True,
                is_super_admin=False,
                added_by="auto_promote",
            )
            db.add(new_admin)
            await db.flush() # Get ID for transaction records
            logger.info(f"Auto-promoted user {kyb.chat_id} (@{kyb.telegram_username}) to Admin via transfer")
            return new_admin
    except Exception as e:
        logger.error(f"Error looking up/promoting KybRegistration: {e}")

    return None


async def _get_admin_user_record(db: AsyncSession, chat_id: str) -> Optional[AdminUser]:
    try:
        res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id, AdminUser.is_active.is_(True)))
        return res.scalar_one_or_none()
    except Exception as e:
        logger.warning("Failed to load admin user record for %s: %s", chat_id, e)
        return None


async def _is_super_admin_chat(db: AsyncSession, chat_id: str) -> bool:
    owner_id = _get_bot_owner_id()
    if owner_id and chat_id == owner_id:
        return True
    admin = await _get_admin_user_record(db, chat_id)
    return bool(admin and admin.is_super_admin)


async def _ensure_super_admin_chat(tg: "TelegramService", db: AsyncSession, chat_id: str) -> bool:
    if await _is_super_admin_chat(db, chat_id):
        return True
    await tg.send_message(chat_id, "❌ This command is only available to super admins.")
    return False


async def _get_or_create_wallet(db: AsyncSession, user_id: str, currency: str) -> Wallets:
    res = await db.execute(select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == currency))
    wallet = res.scalar_one_or_none()
    if wallet:
        return wallet
    now = datetime.now()
    wallet = Wallets(user_id=user_id, balance=0.0, currency=currency, created_at=now, updated_at=now)
    db.add(wallet)
    await db.flush()
    return wallet


def _short_address(address: str) -> str:
    if len(address) <= 14:
        return address
    return f"{address[:8]}...{address[-4:]}"


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
            "🌐 <b>Select Language / 请选择语言</b>",
            reply_markup=_lang_kb(),
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
                "🎉 <b>KYB Registration Started!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Great! Let's get you set up. Please answer a few quick questions so our team can verify your account.\n"
                "Your information is kept safe and reviewed only by the bot administrator.\n\n"
                + _KYB_PROMPTS["full_name"],
            )
        else:
            await tg.send_message(
                chat_id,
                "👋 <b>Welcome to PayBot Philippines!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "This bot is available to registered merchants only.\n\n"
                "📋 To get started, complete a quick KYB (Know Your Business) registration — it only takes a few minutes!\n\n"
                "👉 Type /register to begin, or /start to learn more.",
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
            f"😔 <b>KYB Registration Not Approved</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Unfortunately, your registration was not approved.\n"
            f"<b>Reason:</b> {reason}\n\n"
            f"Please contact the bot administrator for assistance or to re-apply.",
        )
        return True

    # KYB pending review
    if kyb.status == "pending_review":
        await tg.send_message(
            chat_id,
            "⏳ <b>Registration Under Review</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "We've received your KYB registration — thank you! 🙏\n"
            "Our team is reviewing your details and will notify you once a decision is made.\n"
            "This usually takes a short while.",
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
            user_id=f"tg-{chat_id}", log_type="command", message=text,
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

@router.get("/bot-config")
async def get_bot_config(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get (or create) the bot configuration for the current user."""
    service = Bot_settingsService(db)
    result = await service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    if result["total"] == 0:
        obj = await service.create(
            {"bot_status": "inactive", "maintenance_mode": "off", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            user_id=str(current_user.id),
        )
    else:
        obj = result["items"][0]
    return {
        "success": True,
        "id": obj.id,
        "bot_status": obj.bot_status or "inactive",
        "maintenance_mode": obj.maintenance_mode or "off",
        "welcome_message_en": obj.welcome_message_en or "",
        "welcome_message_zh": obj.welcome_message_zh or "",
        "payment_success_message": obj.payment_success_message or "",
        "payment_failed_message": obj.payment_failed_message or "",
        "payment_pending_message": obj.payment_pending_message or "",
        "maintenance_message": obj.maintenance_message or "",
        "commands_enabled": obj.commands_enabled or "",
        "whatsapp_number": obj.whatsapp_number or "",
    }


@router.put("/bot-config")
async def update_bot_config(
    data: BotConfigUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update bot configuration for the current user."""
    service = Bot_settingsService(db)
    result = await service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    if result["total"] == 0:
        update_dict["created_at"] = datetime.utcnow()
        obj = await service.create(update_dict, user_id=str(current_user.id))
    else:
        obj = result["items"][0]
        obj = await service.update(obj.id, update_dict, user_id=str(current_user.id))
    return {
        "success": True,
        "id": obj.id,
        "bot_status": obj.bot_status or "inactive",
        "maintenance_mode": obj.maintenance_mode or "off",
        "welcome_message_en": obj.welcome_message_en or "",
        "welcome_message_zh": obj.welcome_message_zh or "",
        "payment_success_message": obj.payment_success_message or "",
        "payment_failed_message": obj.payment_failed_message or "",
        "payment_pending_message": obj.payment_pending_message or "",
        "maintenance_message": obj.maintenance_message or "",
        "commands_enabled": obj.commands_enabled or "",
        "whatsapp_number": obj.whatsapp_number or "",
    }


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

    # Prefer explicit env-var URL (PYTHON_BACKEND_URL / RAILWAY_PUBLIC_DOMAIN) so
    # that a custom domain is used when set.  Fall back to request headers only
    # when no env-var override is available.
    configured_base = settings.backend_url  # reads PYTHON_BACKEND_URL → RAILWAY_PUBLIC_DOMAIN → …
    if configured_base and not configured_base.startswith("http://127.") and not configured_base.startswith("http://localhost"):
        detected_base = configured_base.rstrip("/")
    else:
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
        detected_base = f"{scheme}://{host}"
    webhook_url = f"{detected_base}/api/v1/telegram/webhook"

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
        callback_query = body.get("callback_query", {})

        # ── Handle inline button callbacks (language selection) ──────────
        if callback_query:
            cq_id      = callback_query.get("id", "")
            cq_data    = callback_query.get("data", "")
            cq_from    = callback_query.get("from", {})
            cq_chat_id = str(cq_from.get("id", ""))
            cq_first_name = _escape_html(cq_from.get("first_name", ""))
            tg = TelegramService()

            if cq_data in ("lang:en", "lang:zh"):
                await tg.answer_callback_query(cq_id)
                lang = cq_data.split(":")[1]

                # Persist the language choice for this user.
                _user_lang[cq_chat_id] = lang

                # Check whether this chat belongs to a registered admin
                is_registered = False
                try:
                    adm_res = await db.execute(select(AdminUser).where(AdminUser.telegram_id == cq_chat_id, AdminUser.is_active.is_(True)))
                    is_registered = adm_res.scalar_one_or_none() is not None
                except Exception:
                    pass

                if is_registered:
                    welcome = _welcome_en(cq_first_name) if lang == "en" else _welcome_zh(cq_first_name)
                    await tg.send_message(cq_chat_id, welcome)
                else:
                    if lang == "en":
                        greeting = f"Hi {cq_first_name}! 👋" if cq_first_name else "👋 Hello!"
                        msg = (
                            f"🌟 <b>Welcome to PayBot Philippines!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"{greeting} Great to have you here! 😊\n\n"
                            f"This bot is currently available to <b>registered merchants</b> only.\n\n"
                            f"📋 <b>To get started:</b>\n"
                            f"Complete a quick KYB (Know Your Business) registration so we can verify your account and unlock all payment features.\n\n"
                            f"👉 Type /register to begin — it only takes a few minutes!"
                        )
                    else:
                        greeting = f"嗨 {cq_first_name}！👋" if cq_first_name else "👋 你好！"
                        msg = (
                            f"🌟 <b>欢迎使用 PayBot Philippines！</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"{greeting} 很高兴认识你！😊\n\n"
                            f"本机器人目前仅对<b>已注册商户</b>开放。\n\n"
                            f"📋 <b>如何开始：</b>\n"
                            f"完成快速 KYB（了解您的业务）注册，我们将验证您的账户并开放所有支付功能。\n\n"
                            f"👉 输入 /register 开始注册，只需几分钟！"
                        )
                    await tg.send_message(cq_chat_id, msg)

            return {"status": "ok"}

        if not message:
            return {"status": "ok"}

        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        # Keyboard buttons are labelled "💳 /invoice", "📱 /qr", etc.
        # Strip any leading emoji/whitespace so command routing works correctly.
        if text and "/" in text and not text.startswith("/"):
            text = text[text.index("/"):]
        username = message.get("from", {}).get("username", "unknown")
        first_name = _escape_html(message.get("from", {}).get("first_name", ""))
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
                    name_display = f" {first_name}" if first_name else ""
                    await tg.send_message(
                        chat_id,
                        f"🔐 <b>Session Expired</b>\n\n"
                        f"Hey{name_display}! Your session has timed out for security. No worries — just log back in:\n\n"
                        f"<code>/login [your PIN]</code>",
                    )
                    return {"status": "ok"}
                elif _adm and not _adm.pin_hash:
                    await tg.send_message(
                        chat_id,
                        "🔒 <b>Secure Your Account</b>\n\n"
                        "You're almost ready! Set a PIN to protect your account and unlock bot access:\n\n"
                        "<code>/setpin [4–6 digit PIN]</code>\n\nExample: <code>/setpin 1234</code>",
                    )
                    return {"status": "ok"}

        # ==================== Photo message → receipt upload or wizard photo step ====================
        if photos and not text:
            # If the user is mid-wizard on a photo step, let the wizard handler process the photo.
            _wizard_state = _pending.get(chat_id)
            _wizard_photo_step = (
                _wizard_state is not None
                and _wizard_state["step"] < len(_CMD_STEPS.get(_wizard_state["cmd"], []))
                and _CMD_STEPS.get(_wizard_state["cmd"], [])[_wizard_state["step"]].get("type") == "photo"
            )
            if not _wizard_photo_step:
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
                    amount = pending_topup.amount_usdt
                    now = datetime.now()

                    # Fetch the current exchange rate to show expected PHP amount
                    rate = await get_usdt_php_rate(db)
                    amount_php = round(amount * rate, 2)

                    pending_topup.updated_at = now
                    await db.commit()
                    await tg.send_message(
                        chat_id,
                        f"✅ <b>Receipt received!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💵 Amount: <b>${amount:.2f} USDT</b>\n"
                        f"💱 Rate: <b>₱{rate:.2f}</b> per USDT\n"
                        f"💰 Expected credit: <b>₱{amount_php:,.2f} PHP</b>\n"
                        f"🆔 Request ID: <code>#{pending_topup.id}</code>\n\n"
                        f"⏳ Under review by admin. Your PHP wallet will be credited once approved.",
                    )
                    return {"status": "ok"}

                # Check if this user has a pending bank deposit request awaiting receipt
                dep_result = await db.execute(
                    select(BankDepositRequest)
                    .where(BankDepositRequest.chat_id == chat_id, BankDepositRequest.status == "pending", BankDepositRequest.receipt_file_id.is_(None))
                    .order_by(BankDepositRequest.created_at.desc())
                )
                pending_deposit = dep_result.scalar_one_or_none()
                if pending_deposit:
                    best_photo = max(photos, key=lambda p: p.get("file_size", 0))
                    pending_deposit.receipt_file_id = best_photo["file_id"]
                    pending_deposit.updated_at = datetime.now()
                    await db.commit()
                    await tg.send_message(
                        chat_id,
                        f"✅ <b>Receipt received!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💳 Channel: <b>{pending_deposit.channel}</b>\n"
                        f"🔢 Account: <code>{pending_deposit.account_number}</code>\n"
                        f"💰 Amount: <b>₱{pending_deposit.amount_php:,.2f}</b>\n"
                        f"🆔 Request ID: <code>#{pending_deposit.id}</code>\n\n"
                        f"⏳ Under review by admin. Your PHP wallet will be credited once approved.",
                    )
                    return {"status": "ok"}

                await tg.send_message(chat_id, "ℹ️ No pending top-up request found. Use /topup [amount] for USDT.")
                return {"status": "ok"}
            # Fall through to the wizard handler below (photo step is active)

        if not text and not photos:
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
                    _t(chat_id,
                       f"✅ <b>Welcome back, {_adm.name or username}!</b> 👋\n\n"
                       f"You're all set — your session is active for 2 hours. Let's get to work! 💪\n\n"
                       f"Type /help to explore all commands.",
                       f"✅ <b>欢迎回来，{_adm.name or username}！</b> 👋\n\n"
                       f"登录成功，会话有效期 2 小时。开始吧！💪\n\n"
                       f"输入 /help 查看所有命令。"),
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
                        f"🔒 <b>Account Temporarily Locked</b>\n\nToo many incorrect PIN attempts. Please wait {_PIN_LOCK_MINUTES} minutes before trying again.",
                    )
                else:
                    remaining_attempts = _PIN_MAX_ATTEMPTS - failed
                    await tg.send_message(
                        chat_id,
                        f"❌ Incorrect PIN. You have {remaining_attempts} attempt(s) remaining.\n\nIf you've forgotten your PIN, please contact the administrator.",
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
                _t(chat_id,
                   "✅ <b>PIN set successfully!</b>\n\n"
                   "🔐 Your account is now PIN-protected.\n"
                   "Use <code>/login [PIN]</code> to authenticate next time.\n\n"
                   "You are now logged in for this session.",
                   "✅ <b>PIN 设置成功！</b>\n\n"
                   "🔐 您的账户已受 PIN 保护。\n"
                   "下次使用 <code>/login [PIN]</code> 登录。\n\n"
                   "当前会话已激活。"),
            )
            return {"status": "ok"}

        # ==================== /logout ====================
        elif text.startswith("/logout"):
            _end_pin_session(chat_id)
            await tg.send_message(
                chat_id,
                _t(chat_id,
                   "👋 <b>You've been signed out.</b>\n\nStay safe! When you're ready to continue, just log back in:\n\n<code>/login [your PIN]</code>",
                   "👋 <b>已退出登录。</b>\n\n注意安全！准备好后，重新登录：\n\n<code>/login [PIN]</code>"),
            )
            return {"status": "ok"}

        # ==================== Wizard handler ====================
        # If a user is mid-wizard and sends plain text or a photo (for photo steps),
        # collect the next value.
        # A new /command cancels the wizard and falls through to normal routing.
        if chat_id in _pending and not (text and text.startswith("/")):
            state = _pending[chat_id]
            cmd   = state["cmd"]
            steps = _CMD_STEPS.get(cmd, [])
            step  = state["step"]

            if step < len(steps):
                param = steps[step]

                if param["type"] == "photo":
                    # Expect an uploaded photo for this step
                    if not photos:
                        await tg.send_message(
                            chat_id,
                            "❌ Please upload a photo of the QR code.\n\n" + param["prompt"],
                        )
                        return {"status": "ok"}
                    # Use the largest resolution photo (last in list)
                    photo_file_id = photos[-1].get("file_id", "")
                    qr_decoded = await _decode_qr_from_telegram_photo(tg, photo_file_id)
                    if not qr_decoded:
                        await tg.send_message(
                            chat_id,
                            "❌ Could not detect a QR code in the photo. "
                            "Please try again with a clearer, well-lit image.\n\n" + param["prompt"],
                        )
                        return {"status": "ok"}
                    state["data"][param["key"]] = qr_decoded
                else:
                    raw = (text or "").strip()

                    # "skip" is allowed for optional steps
                    if raw.lower() == "skip" and param.get("optional"):
                        raw = param["default"]

                    if param["type"] == "float":
                        try:
                            fval = float(raw)
                            if fval <= 0:
                                raise ValueError("Must be > 0")
                            state["data"][param["key"]] = str(fval)
                        except ValueError:
                            await tg.send_message(
                                chat_id,
                                "❌ Please enter a valid positive number.\n\n" + param["prompt"],
                            )
                            return {"status": "ok"}
                    else:
                        if not raw:
                            await tg.send_message(chat_id, "❌ Value cannot be empty.\n\n" + param["prompt"])
                            return {"status": "ok"}
                        state["data"][param["key"]] = raw

                state["step"] += 1

            # More steps outstanding?
            if state["step"] < len(steps):
                next_param = steps[state["step"]]
                await tg.send_message(chat_id, next_param["prompt"])
                return {"status": "ok"}

            # All values collected
            collected = state["data"]
            del _pending[chat_id]

            # /scanqr is handled inline: QR data may contain spaces and cannot be
            # safely round-tripped through a space-delimited command string.
            if cmd == "/scanqr":
                try:
                    amount = float(collected.get("amount", 0))
                    qr_data = collected.get("qr_data", "")
                    if amount <= 0 or not qr_data:
                        await tg.send_message(chat_id, "❌ Invalid amount or missing QR data.")
                        return {"status": "ok"}
                    await _process_scanqr(tg, db, chat_id, username, amount, qr_data)
                except Exception as exc:
                    logger.error(f"/scanqr wizard completion error: {exc}", exc_info=True)
                    await tg.send_message(chat_id, "❌ An error occurred processing your QRPH payment. Please try again.")
                return {"status": "ok"}

            # /deposit is handled inline: store the deposit request and ask for receipt
            if cmd == "/deposit":
                try:
                    channel = str(collected.get("channel", "")).strip().upper()
                    account = str(collected.get("account", "")).strip()
                    amount_php = float(collected.get("amount", 0))
                    if not channel or not account or amount_php <= 0:
                        await tg.send_message(chat_id, "❌ Invalid deposit details. Please try /deposit again.")
                        return {"status": "ok"}
                    now = datetime.now()
                    deposit_req = BankDepositRequest(
                        chat_id=chat_id,
                        telegram_username=username,
                        channel=channel,
                        account_number=account,
                        amount_php=amount_php,
                        status="pending",
                        created_at=now,
                    )
                    db.add(deposit_req)
                    await db.commit()
                    await db.refresh(deposit_req)
                    await tg.send_message(
                        chat_id,
                        f"✅ <b>Deposit details recorded!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💳 Channel: <b>{channel}</b>\n"
                        f"🔢 Account: <code>{account}</code>\n"
                        f"💰 Amount: <b>₱{amount_php:,.2f}</b>\n"
                        f"🆔 Request ID: <code>#{deposit_req.id}</code>\n\n"
                        f"📷 <b>Next step:</b> Please send a screenshot /photo of your transfer confirmation in this chat.\n"
                        f"The admin will verify and credit your PHP wallet once the receipt is confirmed.",
                    )
                except Exception as exc:
                    logger.error(f"/deposit wizard completion error: {exc}", exc_info=True)
                    await tg.send_message(chat_id, "❌ An error occurred saving your deposit. Please try /deposit again.")
                return {"status": "ok"}

            if cmd == "/disburse":
                try:
                    bank = str(collected.get("bank", "")).upper()
                    account = str(collected.get("account", ""))
                    name = str(collected.get("name", ""))
                    amount = float(collected.get("amount", 0))

                    # Create failed record
                    now = datetime.now()
                    disb = Disbursements(
                        user_id=f"tg-{chat_id}",
                        external_id=f"fail-{uuid.uuid4().hex[:12]}",
                        xendit_id="",
                        amount=amount,
                        currency="PHP",
                        bank_code=bank,
                        account_number=account,
                        account_name=name,
                        description="TG disbursement (Failed - Feature Disabled)",
                        status="failed",
                        disbursement_type="single",
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(disb)
                    await db.commit()

                    # Notify user
                    await tg.send_message(chat_id, "Interbank transfer is not available at the moment, Please try again later")
                except Exception as exc:
                    logger.error(f"/disburse wizard completion error: {exc}", exc_info=True)
                    await tg.send_message(chat_id, "❌ An error occurred processing your disbursement request.")
                return {"status": "ok"}

            if cmd == "/pos":
                try:
                    amount = float(collected.get("amount", 0))
                    description = collected.get("description", "POS Sale")
                    terminal_code = collected.get("terminal_code", "AUTO")

                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        return {"status": "ok"}

                    pos_service = POSTerminalService(db)

                    # Try to find the terminal
                    terminal = None
                    if terminal_code != "AUTO":
                        terminal = await pos_service.get_terminal_by_code(terminal_code)
                    else:
                        # Find the first active terminal for this user
                        terminals, _ = await pos_service.list_user_terminals(f"tg-{chat_id}", page=1, per_page=1)
                        if terminals:
                            terminal = terminals[0]

                    if not terminal:
                        await tg.send_message(chat_id, "❌ No active terminal found to push this transaction to.")
                        return {"status": "ok"}

                    # Push to terminal (ECR Push)
                    order_id = f"pos-{uuid.uuid4().hex[:12]}"
                    from models.pos_terminal import POSTerminalTransaction
                    from services.event_bus import event_bus

                    txn = POSTerminalTransaction(
                        terminal_id=terminal.id,
                        user_id=f"tg-{chat_id}",
                        order_id=order_id,
                        description=description,
                        amount=int(amount * 100),
                        currency="PHP",
                        payment_method="awaiting_tap",
                        status="pending",
                    )
                    db.add(txn)
                    await db.commit()

                    # Emit event to wake up the physical terminal
                    await event_bus.emit("ecr_push", {
                        "terminal_id": terminal.id,
                        "device_id": terminal.device_id,
                        "order_id": order_id,
                        "amount": amount,
                        "description": description
                    })

                    reply = (
                        f"📲 <b>Transaction Pushed to Terminal</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"📟 Terminal: <b>{terminal.terminal_name}</b> (<code>{terminal.terminal_code}</code>)\n"
                        f"💰 Amount: <b>₱{amount:,.2f}</b>\n"
                        f"📝 {description}\n"
                        f"🆔 <code>{order_id}</code>\n\n"
                        f"Please tap the card on your terminal app to complete the payment."
                    )
                    await tg.send_message(chat_id, reply)

                except Exception as exc:
                    logger.error(f"/pos wizard completion error: {exc}", exc_info=True)
                    await tg.send_message(chat_id, "❌ An error occurred pushing your transaction. Please try again.")
                return {"status": "ok"}

            # Other commands: rebuild command text and fall through to routing
            # Special case for transfer commands because order changed
            if cmd in ("/send", "/sendusd", "/sendusdt"):
                # collected order is: recipient/address, then amount
                keys = [s["key"] for s in steps]
                text = f"{cmd} {collected[keys[0]]} {collected[keys[1]]}"
            else:
                parts = [cmd] + [collected.get(s["key"], s.get("default", "")) for s in steps]
                text = " ".join(str(p) for p in parts)
            # fall through to command routing below

        elif chat_id in _pending and text and text.startswith("/"):
            if text.startswith("/cancel"):
                # /cancel always aborts the current wizard
                del _pending[chat_id]
                await tg.send_message(chat_id, _t(chat_id, "❌ Wizard cancelled.", "❌ 已取消。"))
                return {"status": "ok"}
            # Any other new command: silently cancel wizard and process normally
            del _pending[chat_id]

        # ==================== /start ====================
        if text.startswith("/start"):
            # Clear stored language so the user is prompted to pick again.
            _user_lang.pop(chat_id, None)
            greeting = f"Hi {first_name}! 👋" if first_name else "👋 Hello!"
            await tg.send_message(
                chat_id,
                f"🌐 {greeting}\n\n<b>Select your language / 请选择语言</b>",
                reply_markup=_lang_kb(),
            )

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
                            greeting_name = _escape_html(kyb.full_name or "there")
                            await tg.send_message(
                                target_chat_id,
                                f"🎉 <b>Congratulations, {greeting_name}!</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━\n"
                                "Your KYB registration has been <b>approved</b>! 🥳 You now have full access to PayBot Philippines.\n\n"
                                "🔐 <b>One last step — secure your account:</b>\n"
                                "Set a PIN to protect your account before you start:\n\n"
                                "<code>/setpin [4–6 digit PIN]</code>\n\nExample: <code>/setpin 1234</code>\n\n"
                                "Welcome aboard! 🚀",
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/invoice"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Invoice payment"
                    maya = MayaService()
                    result = await maya.create_invoice(amount=amount, description=description)
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
                        # Then try DB save
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="invoice",
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/qr"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "QR payment"
                    maya = MayaService()
                    result = await maya.create_qr_code(amount=amount, description=description)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>QR Code Created!</b>\n\n💰 ₱{amount:,.2f}\n"
                            f"📱 QR: <code>{result.get('qr_string', '')}</code>\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="qr_code",
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

        # ==================== /scanqr (QRPH scan — upload QR image) ====================
        elif text.startswith("/scanqr"):
            await tg.send_message(chat_id, _wizard_start(chat_id, "/scanqr"))

        # ==================== /alipay (PhotonPay → Alipay QR, fallback → Xendit QRIS) ====================
        elif text.startswith("/alipay"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/alipay"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Alipay payment"
                    photonpay = PhotonPayService()
                    result = None
                    use_xendit_fallback = False
                    
                    if photonpay.is_configured:
                        backend_url = ""
                        try:
                            from core.config import settings as _settings
                            backend_url = _settings.backend_url
                        except Exception:
                            pass
                        result = await photonpay.create_alipay_session(
                            amount=amount,
                            currency="PHP",
                            description=description,
                            notify_url=f"{backend_url}/api/v1/photonpay/webhook",
                            redirect_url=f"{backend_url}/api/v1/photonpay/redirect/success",
                            shopper_id=str(chat_id),
                        )
                        if result.get("success"):
                            checkout_url = result.get("checkout_url", "")
                            ref_num = result.get("req_id", "")
                            caption = (
                                f"✅ <b>Alipay Payment Ready!</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                                f"📝 {description}\n"
                                f"🆔 <code>{ref_num}</code>\n\n"
                                f"📱 Tap the button below to open the Alipay checkout page.\n"
                                f"💳 Your PHP wallet will be credited automatically once paid."
                            )
                            keyboard = {"inline_keyboard": [[{"text": "🔴 Pay via Alipay", "url": checkout_url}]]} if checkout_url else None
                            await tg.send_message(chat_id, caption, reply_markup=keyboard)
                            try:
                                now = datetime.now()
                                txn = Transactions(
                                    user_id=f"tg-{chat_id}", transaction_type="alipay_qr",
                                    external_id=ref_num, xendit_id=result.get("pay_id", ""),
                                    amount=amount, currency="PHP", status="pending", description=description,
                                    qr_code_url=checkout_url, telegram_chat_id=chat_id,
                                    created_at=now, updated_at=now,
                                )
                                db.add(txn)
                                await db.commit()
                            except Exception as e:
                                logger.error(f"DB save failed for /alipay (PhotonPay): {e}", exc_info=True)
                                try:
                                    await db.rollback()
                                except Exception:
                                    pass
                        else:
                            logger.warning(f"PhotonPay Alipay failed: {result.get('error', 'Unknown error')} — trying Xendit fallback")
                            use_xendit_fallback = True
                    else:
                        # Fallback: use Maya
                        maya = MayaService()
                        if not maya.secret_key:
                            await tg.send_message(
                                chat_id,
                                "❌ <b>Alipay payments are not available at this time.</b>\n\n"
                                "Neither PhotonPay nor Maya is configured.",
                            )
                            await _safe_log(db, chat_id, username, text)
                            return {"status": "ok"}
                        result = await maya.create_qr_code(amount=amount, description=description)
                        if result.get("success"):
                            qr_url = result.get("qr_string", "")
                            ref_num = result.get("external_id", "")
                            caption = (
                                f"✅ <b>Alipay Payment Ready!</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━\n"
                                f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                                f"📝 {description}\n"
                                f"🆔 <code>{ref_num}</code>\n\n"
                                f"📱 Scan the QR code with your Alipay app.\n"
                                f"💳 Your PHP wallet will be credited automatically once paid."
                            )
                            await tg.send_message(chat_id, caption)
                            try:
                                now = datetime.now()
                                txn = Transactions(
                                    user_id=f"tg-{chat_id}", transaction_type="alipay_qr",
                                    external_id=ref_num, xendit_id=result.get("id", ""),
                                    amount=amount, currency="PHP", status="pending", description=description,
                                    qr_code_url=qr_url, telegram_chat_id=chat_id,
                                    created_at=now, updated_at=now,
                                )
                                db.add(txn)
                                await db.commit()
                            except Exception as e:
                                logger.error(f"DB save failed for /alipay (Xendit): {e}", exc_info=True)
                                try:
                                    await db.rollback()
                                except Exception:
                                    pass
                        else:
                            await tg.send_message(chat_id, f"❌ Alipay payment failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /wechat (PhotonPay → WeChat Pay QR) ====================
        elif text.startswith("/wechat"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/wechat"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "WeChat Pay"
                    photonpay = PhotonPayService()
                    if not photonpay.is_configured:
                        await tg.send_message(
                            chat_id,
                            "❌ <b>WeChat Pay is not available at this time.</b>\n\n"
                            "PhotonPay is not configured on this bot.",
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    backend_url = ""
                    try:
                        from core.config import settings as _settings
                        backend_url = _settings.backend_url
                    except Exception:
                        pass
                    result = await photonpay.create_wechat_session(
                        amount=amount,
                        currency="PHP",
                        description=description,
                        notify_url=f"{backend_url}/api/v1/photonpay/webhook",
                        redirect_url=f"{backend_url}/api/v1/photonpay/redirect/success",
                        shopper_id=str(chat_id),
                    )
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        ref_num = result.get("req_id", "")
                        caption = (
                            f"✅ <b>WeChat Pay Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ref_num}</code>\n\n"
                            f"📱 Tap the button below to open the WeChat Pay checkout page.\n"
                            f"💳 Your PHP wallet will be credited automatically once paid."
                        )
                        keyboard = {"inline_keyboard": [[{"text": "💚 Pay via WeChat", "url": checkout_url}]]} if checkout_url else None
                        await tg.send_message(chat_id, caption, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="wechat_qr",
                                external_id=ref_num, xendit_id=result.get("pay_id", ""),
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
                        error_msg = result.get('error', 'Unknown error')
                        logger.warning(f"WeChat Pay failed: {error_msg}")
                        await tg.send_message(
                            chat_id,
                            f"❌ <b>WeChat Pay temporarily unavailable.</b>\n\n"
                            f"Error: <code>{error_msg[:100]}</code>\n\n"
                            f"Please try again in a moment."
                        )
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /link ====================
        elif text.startswith("/link"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/link"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Payment link"
                    xendit = MayaService()
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
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="payment_link",
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/va"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    bank_code = parts[2].upper()
                    xendit = MayaService()
                    result = await xendit.create_virtual_account(amount=amount, bank_code=bank_code, name=username)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Virtual Account Created!</b>\n\n🏦 Bank: {bank_code}\n💰 ₱{amount:,.2f}\n"
                            f"🔢 Account: <code>{result.get('account_number', '')}</code>\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="virtual_account",
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/ewallet"))
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
                        "MAYA": "PH_MAYA", "PAYMAYA": "PH_MAYA", "PH_MAYA": "PH_MAYA",
                    }
                    channel = channel_map.get(provider, f"PH_{provider}")
                    maya = MayaService()
                    result = await maya.create_ewallet_charge(amount=amount, channel_code=channel)
                    if result.get("success"):
                        checkout = result.get("checkout_url", "")
                        reply = (
                            f"✅ <b>E-Wallet Charge Created!</b>\n\n📱 {provider}\n💰 ₱{amount:,.2f}\n"
                            f"{'🔗 Pay: ' + checkout if checkout else ''}\n"
                            f"🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        ewallet_keyboard = {"inline_keyboard": [[{"text": "📱 Pay Now", "url": checkout}]]} if checkout else None
                        await tg.send_message(chat_id, reply, reply_markup=ewallet_keyboard)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="ewallet",
                                external_id=result.get("external_id", ""), xendit_id=result.get("checkout_id", ""),
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/disburse"))
            else:
                # If command is run manually with all args, handle it same as wizard
                try:
                    bank = parts[1].upper()
                    account = parts[2]
                    name = parts[3]
                    amount = float(parts[4])

                    now = datetime.now()
                    disb = Disbursements(
                        user_id=f"tg-{chat_id}",
                        external_id=f"fail-{uuid.uuid4().hex[:12]}",
                        xendit_id="",
                        amount=amount,
                        currency="PHP",
                        bank_code=bank,
                        account_number=account,
                        account_name=name,
                        description="TG disbursement (Failed - Feature Disabled)",
                        status="failed",
                        disbursement_type="single",
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(disb)
                    await db.commit()
                    await tg.send_message(chat_id, "Interbank transfer is not available at the moment, Please try again later")
                except Exception as exc:
                    logger.error(f"/disburse command error: {exc}", exc_info=True)
                    await tg.send_message(chat_id, "❌ An error occurred. Please try again later.")
            return {"status": "ok"}

        # ==================== /refund ====================
        elif text.startswith("/refund"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/refund"))
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
                        xendit = MayaService()
                        ref_result = await xendit.create_refund(invoice_id=txn.xendit_id, amount=refund_amount)
                        ref_type = "full" if refund_amount >= txn.amount else "partial"
                        if ref_result.get("success"):
                            reply = f"✅ <b>Refund Processed!</b>\n\n💰 ₱{refund_amount:,.2f}\n📋 Type: {ref_type}\n🆔 {ext_id}"
                        else:
                            reply = f"❌ Refund failed: {ref_result.get('error', 'Unknown')}"
                        # Send reply FIRST
                        await tg.send_message(chat_id, reply)
                        # Then try DB save
                        try:
                            now = datetime.now()
                            ref = Refunds(
                                user_id=f"tg-{chat_id}", transaction_id=txn.id,
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
                    await tg.send_message(chat_id, "\n".join(lines))
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
                    else:
                        await tg.send_message(chat_id, reply)
                else:
                    await tg.send_message(chat_id, f"❌ Not found: <code>{ext_id}</code>")

        # ==================== /balance & /wallet ====================
        elif text.startswith("/balance") or text.startswith("/wallet"):
            is_wallet_cmd = text.startswith("/wallet")
            is_super = await _is_super_admin_chat(db, chat_id)

            # Super admins see the live Gateway balance on /balance.
            # Everyone else (and super admins on /wallet) see their internal stored balance.
            show_gateway = (not is_wallet_cmd) and is_super

            try:
                php_user_id = str(chat_id)
                # PHP wallet — get or create
                res = await db.execute(select(Wallets).where(Wallets.user_id == php_user_id, Wallets.currency == "PHP"))
                wallet = res.scalar_one_or_none()
                if not wallet:
                    now_w = datetime.now()
                    wallet = Wallets(user_id=php_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                    db.add(wallet)
                    await db.commit()
                    await db.refresh(wallet)

                php_balance = wallet.balance
                gateway_label = ""

                if show_gateway:
                    # Sync/Show PHP balance from PayMongo live account balance
                    try:
                        pm_svc = PayMongoService()
                        pm_bal = await pm_svc.get_balance()
                        if pm_bal.get("success"):
                            available = pm_bal.get("available", [])
                            php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
                            if php_entry is not None:
                                php_balance = float(php_entry["amount"]) / 100.0
                                gateway_label = " (Live Gateway)"
                    except Exception as pe:
                        logger.warning(f"PayMongo balance fetch failed for /balance: {pe}")

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
                logger.error(f"DB failed for balance check: {e}", exc_info=True)
                php_balance = 0.0
                usd_balance = 0.0
                recent_wt = []
                gateway_label = ""
                try:
                    await db.rollback()
                except Exception:
                    pass

            title = "Company Balance" if gateway_label else "Wallet Balances"
            reply = (
                f"💰 <b>{title}</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"🇵🇭 PHP: <b>₱{php_balance:,.2f}</b>{gateway_label}\n"
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
            await tg.send_message(chat_id, reply)

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
            await tg.send_message(chat_id, reply)

        # ==================== /sendusdt ====================
        elif text.startswith("/sendusdt"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/sendusdt"))
            else:
                try:
                    addr = parts[1].strip()
                    amount = float(parts[2])
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

                    # Create pending send request; balance is deducted only when approved
                    now = datetime.now()
                    send_req = UsdtSendRequest(
                        user_id=tg_user_id,
                        wallet_id=usd_wallet.id,
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
                        f"✅ <b>USDT Send Request Submitted</b>\n\n"
                        f"💵 Amount: <b>${amount:,.2f} USDT</b>\n"
                        f"📬 To: <code>{short_addr}</code>\n"
                        f"🆔 Request ID: <code>{send_req.id}</code>\n"
                        f"💰 Available balance: <b>${usd_balance:,.2f} USDT</b>\n\n"
                        f"⏳ Pending admin approval. You'll be notified once processed."
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/sendusd"))
            else:
                try:
                    recipient_username = parts[1].strip().lstrip("@")
                    amount = float(parts[2])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if not recipient_username:
                        await tg.send_message(chat_id, "❌ Recipient username is required.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Look up recipient with auto-promotion
                    recipient_admin = await _get_or_promote_recipient(db, recipient_username)

                    if not recipient_admin:
                        await tg.send_message(
                            chat_id,
                            f"❌ User @{recipient_username} not found in our system.\n"
                            "They must have started the bot or submitted a registration at least once."
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

                        # 5. Publish wallet events for real-time updates & bot notifications
                        payment_event_bus.publish({
                            "event_type": "wallet_update",
                            "user_id": tg_user_id,
                            "wallet_id": sender_wallet.id,
                            "balance": sender_wallet.balance,
                            "currency": "USD",
                            "transaction_type": "usd_send",
                            "amount": amount,
                            "transaction_id": debit_txn.id,
                            "note": f"Sent to @{recipient_username}",
                            "skip_bot_notify": True # Fix double notification (we send message below)
                        })

                        payment_event_bus.publish({
                            "event_type": "wallet_update",
                            "user_id": recipient_tg_user_id,
                            "wallet_id": recipient_wallet.id,
                            "balance": recipient_wallet.balance,
                            "currency": "USD",
                            "transaction_type": "usd_receive",
                            "amount": amount,
                            "transaction_id": credit_txn.id,
                            "note": f"Received from {sender_note}"
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

                    # Feedback message for the sender (wizard completion)
                    await tg.send_message(
                        chat_id,
                        f"✅ <b>Sent Successfully!</b>\n\n💸 ${amount:,.2f} USD → @{recipient_username}\n💰 New Balance: <b>${sender_wallet.balance:,.2f}</b>"
                    )
                    # Recipient notification is handled by the event bus (_sync_wallet_update_to_telegram)
                    logger.info("USD transfer via bot: sender=%s recipient=@%s amount=%s", tg_user_id, recipient_username, amount)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /sendusd 50 @johndoe")

        # ==================== /send ====================
        elif text.startswith("/send"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/send"))
            else:
                try:
                    recipient_raw = parts[1].strip()
                    amount = float(parts[2])
                    recipient_username = recipient_raw.lstrip("@")

                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be positive.")
                        return {"status": "ok"}

                    # Look up recipient with auto-promotion
                    recipient_admin = await _get_or_promote_recipient(db, recipient_username)

                    if not recipient_admin:
                        await tg.send_message(
                            chat_id,
                            f"❌ User <code>{recipient_raw}</code> not found in our system.\n"
                            "They must have started the bot or submitted a registration at least once."
                        )
                        return {"status": "ok"}

                    recipient_tg_user_id = str(recipient_admin.telegram_id)
                    sender_tg_user_id = str(chat_id)

                    # 2. Prevent self-transfers
                    if sender_tg_user_id == recipient_tg_user_id:
                        await tg.send_message(chat_id, "❌ You cannot send PHP to yourself.")
                        return {"status": "ok"}

                    # Check sender's PHP wallet balance
                    try:
                        sender_wallet = await _get_or_create_wallet(db, sender_tg_user_id, "PHP")
                        recipient_wallet = await _get_or_create_wallet(db, recipient_tg_user_id, "PHP")
                    except Exception as e:
                        logger.error(f"DB failed for /send wallet lookup: {e}", exc_info=True)
                        await tg.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        return {"status": "ok"}

                    if sender_wallet.balance < amount:
                        await tg.send_message(chat_id, f"❌ Insufficient balance: ₱{sender_wallet.balance:,.2f}")
                        return {"status": "ok"}

                    # 3. & 4. Deduct from sender and credit recipient
                    try:
                        now = datetime.now()
                        sender_bal_before = sender_wallet.balance
                        sender_wallet.balance = round(sender_wallet.balance - amount, 2)
                        sender_wallet.updated_at = now

                        recipient_bal_before = recipient_wallet.balance
                        recipient_wallet.balance = round(recipient_wallet.balance + amount, 2)
                        recipient_wallet.updated_at = now

                        # Create "send" transaction
                        sender_note = f"@{username}" if username and username != "unknown" else f"chat {chat_id}"
                        recipient_display = f"@{recipient_admin.telegram_username}" if recipient_admin.telegram_username else f"ID: {recipient_admin.telegram_id}"

                        sender_txn = Wallet_transactions(
                            user_id=sender_tg_user_id,
                            wallet_id=sender_wallet.id,
                            transaction_type="send",
                            amount=-amount, # Negative for debit
                            balance_before=sender_bal_before,
                            balance_after=sender_wallet.balance,
                            recipient=recipient_display,
                            note=f"Sent to {recipient_display} via Telegram",
                            status="completed",
                            reference_id=f"tg-send-{sender_wallet.id}-{int(now.timestamp())}",
                            created_at=now,
                        )

                        # Create "receive" transaction
                        recipient_txn = Wallet_transactions(
                            user_id=recipient_tg_user_id,
                            wallet_id=recipient_wallet.id,
                            transaction_type="receive",
                            amount=amount, # Positive for credit
                            balance_before=recipient_bal_before,
                            balance_after=recipient_wallet.balance,
                            recipient=sender_note,
                            note=f"Received from {sender_note} via Telegram",
                            status="completed",
                            reference_id=f"tg-recv-{recipient_wallet.id}-{int(now.timestamp())}",
                            created_at=now,
                        )

                        db.add(sender_txn)
                        db.add(recipient_txn)
                        await db.commit()

                        # 5. Publish wallet events for real-time updates
                        payment_event_bus.publish({
                            "event_type": "wallet_update",
                            "user_id": sender_tg_user_id,
                            "wallet_id": sender_wallet.id,
                            "balance": sender_wallet.balance,
                            "currency": "PHP",
                            "transaction_type": "send",
                            "amount": amount,
                            "transaction_id": sender_txn.id,
                            "note": f"Sent to {recipient_display}",
                            "skip_bot_notify": True # Fix double notification
                        })

                        payment_event_bus.publish({
                            "event_type": "wallet_update",
                            "user_id": recipient_tg_user_id,
                            "wallet_id": recipient_wallet.id,
                            "balance": recipient_wallet.balance,
                            "currency": "PHP",
                            "transaction_type": "receive",
                            "amount": amount,
                            "transaction_id": recipient_txn.id,
                            "note": f"Received from {sender_note}"
                        })

                        await tg.send_message(
                            chat_id,
                            f"✅ <b>Sent Successfully!</b>\n\n💸 ₱{amount:,.2f} → {recipient_display}\n💰 New Balance: <b>₱{sender_wallet.balance:,.2f}</b>"
                        )
                        # Recipient notification is handled by the event bus (_sync_wallet_update_to_telegram)
                    except Exception as e:
                        logger.error(f"DB save failed for /send: {e}", exc_info=True)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await tg.send_message(chat_id, "❌ Transaction failed. Please try again.")

                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /withdraw ====================
        elif text.startswith("/withdraw"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/withdraw"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be positive.")
                    else:
                        php_user_id = str(chat_id)
                        try:
                            res = await db.execute(select(Wallets).where(Wallets.user_id == php_user_id, Wallets.currency == "PHP"))
                            wallet = res.scalar_one_or_none()
                            if not wallet:
                                now_w = datetime.now()
                                wallet = Wallets(user_id=php_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
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
                            await tg.send_message(chat_id, reply)
                            # Then DB
                            try:
                                wallet.balance = new_balance
                                wallet.updated_at = now
                                wtxn = Wallet_transactions(
                                    user_id=php_user_id, wallet_id=wallet.id,
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
                                    "currency": "PHP",
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
            await tg.send_message(chat_id, reply)

        # ==================== /fees ====================
        elif text.startswith("/fees"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/fees"))
            else:
                try:
                    amount = float(parts[1])
                    method = parts[2].lower()
                    xendit = MayaService()
                    fees = xendit.calculate_fees(amount, method)
                    reply = (
                        f"💱 <b>Fee Calculation</b>\n\n💰 Amount: ₱{amount:,.2f}\n📋 Method: {method}\n"
                        f"💸 Fee: ₱{fees['fee']:,.2f}\n💵 Net: <b>₱{fees['net_amount']:,.2f}</b>"
                    )
                    await tg.send_message(chat_id, reply)
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
                    await tg.send_message(chat_id, reply)
                    # Then DB
                    try:
                        sub = Subscriptions(
                            user_id=f"tg-{chat_id}", plan_name=plan_name, amount=amount,
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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/remind"))
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
                await tg.send_message(chat_id, reply)

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
                await tg.send_message(chat_id, _wizard_start(chat_id, "/cancel"))
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
                "💳 /pos [amt] [desc] — Terminal POS payment\n"
                "🔴 /alipay [amt] [desc] — Alipay QR (PhotonPay)\n"
                "🟢 /wechat [amt] [desc] — WeChat QR (PhotonPay)\n"
                "📷 /scanqr — Scan &amp; pay via QRPH\n\n"
                "💡 Example: /invoice 500 Coffee order"
            )
            await tg.send_message(chat_id, menu)

        # ==================== /pos ====================
        elif text.startswith("/pos"):
            parts = text.split(maxsplit=3)
            if len(parts) < 2:
                await tg.send_message(chat_id, _wizard_start(chat_id, "/pos"))
            else:
                try:
                    amount = float(parts[1])
                    description = parts[2] if len(parts) > 2 else "POS Sale"
                    terminal_code = parts[3] if len(parts) > 3 else "AUTO"

                    pos_service = POSTerminalService(db)
                    terminal = None
                    if terminal_code != "AUTO":
                        terminal = await pos_service.get_terminal_by_code(terminal_code)
                    else:
                        terminals, _ = await pos_service.list_user_terminals(f"tg-{chat_id}", page=1, per_page=1)
                        if terminals:
                            terminal = terminals[0]

                    if not terminal:
                        await tg.send_message(chat_id, "❌ No active terminal found to push this transaction to.")
                        return {"status": "ok"}

                    # Push logic (same as wizard completion)
                    order_id = f"pos-{uuid.uuid4().hex[:12]}"
                    from models.pos_terminal import POSTerminalTransaction
                    from services.event_bus import event_bus

                    txn = POSTerminalTransaction(
                        terminal_id=terminal.id, user_id=f"tg-{chat_id}",
                        order_id=order_id, description=description,
                        amount=int(amount * 100), currency="PHP",
                        payment_method="awaiting_tap", status="pending",
                    )
                    db.add(txn)
                    await db.commit()

                    await event_bus.emit("ecr_push", {
                        "terminal_id": terminal.id, "device_id": terminal.device_id,
                        "order_id": order_id, "amount": amount, "description": description
                    })

                    reply = (
                        f"📲 <b>Transaction Pushed to Terminal</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"📟 Terminal: <b>{terminal.terminal_name}</b> (<code>{terminal.terminal_code}</code>)\n"
                        f"💰 Amount: <b>₱{amount:,.2f}</b>\n"
                        f"📝 {description}\n"
                        f"🆔 <code>{order_id}</code>\n\n"
                        f"Please tap the card on your terminal app to complete the payment."
                    )
                    await tg.send_message(chat_id, reply)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount.")
                except Exception as e:
                    logger.error(f"/pos command error: {e}", exc_info=True)
                    await tg.send_message(chat_id, "❌ Error processing command.")
            return {"status": "ok"}

        # ==================== /terminal ====================
        elif text.startswith("/terminal"):
            try:
                pos_service = POSTerminalService(db)
                terminals, _ = await pos_service.list_user_terminals(f"tg-{chat_id}")
                if not terminals:
                    await tg.send_message(chat_id, "📟 <b>No Terminals Found</b>\n\nYou don't have any POS terminals assigned yet. Contact your administrator to request one.")
                else:
                    lines = ["📟 <b>Your POS Terminals</b>\n━━━━━━━━━━━━━━━━━━━━"]
                    for t in terminals:
                        status_emoji = "✅" if t.is_active else "❌"
                        lines.append(f"{status_emoji} <b>{t.terminal_name}</b>\n   Code: <code>{t.terminal_code}</code>\n   Status: {t.status}")
                    lines.append("\n💡 Use <code>/pos [amount]</code> to push a transaction to your terminal.")
                    await tg.send_message(chat_id, "\n".join(lines))
            except Exception as e:
                logger.error(f"/terminal error: {e}", exc_info=True)
                await tg.send_message(chat_id, "❌ Error fetching terminals.")
            return {"status": "ok"}


        # ==================== /help ====================
        elif text.startswith("/help"):
            help_en = (
                "📋 <b>PayBot Commands — Quick Reference</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"
                "💳 <b>Accept Payments</b>\n"
                "  /pay — Open payment menu\n"
                "  /invoice — Create an invoice\n"
                "  /qr — Generate a QR code\n"
                "  /pos — Push to Terminal (Tap to Phone)\n"
                "  /link — Shareable payment link\n\n"
                "📟 <b>Terminal Management</b>\n"
                "  /terminal — List your active terminals\n"
                "  /status [id] — Check payment status\n\n"
                "💰 <b>Wallet & Transfers</b>\n"
                "  /wallet — Wallet summary & balance\n"
                "  /send [to] [amt] — Transfer PHP to user\n"
                "  /sendusd [to] [amt] — Transfer USD to user\n"
                "  /withdraw [amt] — Withdraw PHP\n\n"
                "📥 <b>Top Up</b>\n"
                "  /topup [amt] — via USDT TRC20\n"
                "  /deposit — via Bank/E-wallet transfer\n\n"
                "💡 <b>Tip:</b> Just type a command to start a wizard! 😊"
            )
            help_zh = (
                "📋 <b>PayBot 命令 — 快速参考</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"
                "💳 <b>收款</b>\n"
                "  /pay — 打开收款菜单\n"
                "  /invoice — 创建账单\n"
                "  /qr — 生成二维码\n"
                "  /pos — 终端支付 (Tap to Phone)\n"
                "  /link — 可分享付款链接\n\n"
                "📟 <b>终端管理</b>\n"
                "  /terminal — 查看您的活跃终端\n"
                "  /status [id] — 查询付款状态\n\n"
                "💰 <b>钱包与转账</b>\n"
                "  /wallet — 钱包摘要与余额\n"
                "  /send [接收方] [金额] — 转账 PHP\n"
                "  /sendusd [接收方] [金额] — 转账 USD\n"
                "  /withdraw [金额] — 提现 PHP\n\n"
                "📥 <b>充值</b>\n"
                "  /topup [金额] — 通过 USDT TRC20\n"
                "  /deposit — 通过银行/电子钱包转账\n\n"
                "💡 <b>提示：</b> 直接输入命令即可开始引导！ 😊"
            )
            await tg.send_message(chat_id, _t(chat_id, help_en, help_zh))
            return {"status": "ok"}


        # ==================== /topup ====================
        elif text.startswith("/topup"):
            parts = text.split(maxsplit=1)
            rate = await get_usdt_php_rate(db)
            trc20_address = await get_usdt_trc20_address(db)
            if len(parts) < 2:
                qr_url = _usdt_static_qr_url()
                caption = (
                    f"💵 <b>Top Up PHP Wallet via USDT TRC20</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"Send USDT (TRC20) to:\n\n"
                    f"<code>{trc20_address}</code>\n\n"
                    f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20 or BEP20\n\n"
                    f"💱 <b>Exchange Rate:</b> $1 USDT = ₱{rate:.2f} PHP\n\n"
                    f"Then run:\n"
                    f"  <b>/topup [amount]</b>  — to submit your request\n\n"
                    f"Example: /topup 50\n\n"
                    f"After submitting, send a screenshot of your transaction as a photo in this chat."
                )
                result = await tg.send_photo(chat_id, qr_url, caption=caption)
                if not result.get("success"):
                    await tg.send_message(chat_id, caption)
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                    else:
                        amount_php = round(amount * rate, 2)
                        now = datetime.now()
                        req = TopupRequest(
                            chat_id=chat_id,
                            telegram_username=username,
                            amount_usdt=amount,
                            currency="PHP",
                            status="pending",
                            created_at=now,
                        )
                        db.add(req)
                        await db.commit()
                        await db.refresh(req)
                        qr_url = _usdt_static_qr_url()
                        caption = (
                            f"💵 <b>Top Up PHP Wallet via USDT TRC20</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"📤 Send exactly <b>${amount:.2f} USDT</b> to:\n\n"
                            f"<code>{trc20_address}</code>\n\n"
                            f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20\n"
                            f"🆔 Request ID: <code>#{req.id}</code>\n\n"
                            f"💱 <b>Exchange Rate:</b> $1 USDT = ₱{rate:.2f} PHP\n"
                            f"💰 <b>You will receive:</b> ₱{amount_php:,.2f} PHP\n\n"
                            f"✅ After sending, <b>reply with a screenshot</b> of your transaction as a photo.\n"
                            f"The admin will verify and credit your PHP wallet within minutes."
                        )
                        result = await tg.send_photo(chat_id, qr_url, caption=caption)
                        if not result.get("success"):
                            await tg.send_message(chat_id, caption)
                except ValueError:
                    await tg.send_message(chat_id, "❌ Invalid amount. Example: /topup 50")
                except Exception as e:
                    logger.error(f"Topup create error: {e}", exc_info=True)
                    await tg.send_message(chat_id, "❌ Failed to create topup request. Please try again.")

        # ==================== /deposit ====================
        elif text.startswith("/deposit"):
            def _fmt_accounts(number_label: str, name_label: str) -> str:
                return "\n".join(
                    f"  • <b>{bank}</b>\n"
                    f"    {number_label}: <code>{info['number']}</code>\n"
                    f"    {name_label}: <b>{info['name']}</b>"
                    for bank, info in _PAYBOT_ACCOUNTS.items()
                )
            await tg.send_message(
                chat_id,
                _t(chat_id,
                   f"🏦 <b>Bank / E-Wallet Deposit</b>\n"
                   f"━━━━━━━━━━━━━━━━━━━━\n"
                   f"Please transfer your deposit to one of the following accounts:\n\n"
                   f"{_fmt_accounts('Account No', 'Account Name')}\n\n"
                   f"Supported send channels:\n"
                   f"  • <b>GCash</b> · <b>Maya</b>\n"
                   f"  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                   f"After sending, tap <b>Continue</b> or type anything to submit your receipt.",
                   f"🏦 <b>银行 / 电子钱包存款</b>\n"
                   f"━━━━━━━━━━━━━━━━━━━━\n"
                   f"请将存款转至以下账户之一：\n\n"
                   f"{_fmt_accounts('账号', '户名')}\n\n"
                   f"支持的转账渠道：\n"
                   f"  • <b>GCash</b> · <b>Maya</b>\n"
                   f"  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                   f"转账后，请继续填写收据信息。"),
            )
            prompt = _wizard_start(chat_id, "/deposit")
            await tg.send_message(chat_id, prompt)

        else:
            await tg.send_message(
                chat_id,
                _t(chat_id,
                   "🤔 Hmm, I don't recognise that command.\n\nType /help to see everything I can do! 😊",
                   "🤔 没有找到该命令。\n\n输入 /help 查看所有可用命令！😊")
            )

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


# ---------- Clone-bot endpoints ----------

class CloneBotTokenRequest(BaseModel):
    bot_token: str


@router.post("/clone-bot/validate")
async def clone_bot_validate(data: CloneBotTokenRequest):
    """Validate a BotFather token by calling Telegram getMe — no auth required."""
    token = data.bot_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="bot_token is required")
    service = TelegramService(token=token)
    result = await service.get_bot_info()
    if not result.get("success"):
        return {"success": False, "message": result.get("error", "Invalid token or Telegram API error")}
    bot = result.get("bot", {})
    return {"success": True, "bot": bot, "message": f"Token valid! Bot: @{bot.get('username', '')}"}


@router.post("/clone-bot/save")
async def clone_bot_save(
    data: CloneBotTokenRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a custom bot token for the current user and register its webhook."""
    token = data.bot_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="bot_token is required")

    # Validate token first
    service = TelegramService(token=token)
    info = await service.get_bot_info()
    if not info.get("success"):
        return {"success": False, "message": info.get("error", "Invalid bot token")}
    bot = info.get("bot", {})

    # Build webhook URL – prefer env-var domain (RAILWAY_PUBLIC_DOMAIN etc.) over
    # request headers so that a custom domain is used when configured.
    configured_base = settings.backend_url
    if configured_base and not configured_base.startswith("http://127.") and not configured_base.startswith("http://localhost"):
        webhook_url = f"{configured_base.rstrip('/')}/api/v1/telegram/webhook"
    else:
        scheme = request.headers.get("x-forwarded-proto", "https")
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        webhook_url = f"{scheme}://{host}/api/v1/telegram/webhook" if host else ""

    # Register webhook with the custom bot
    if webhook_url:
        wh_result = await service.set_webhook(webhook_url)
        if not wh_result.get("success"):
            logger.warning(f"Webhook registration failed for clone bot: {wh_result.get('error')}")
    else:
        webhook_url = ""

    # Persist to bot_settings
    db_service = Bot_settingsService(db)
    result = await db_service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    now = datetime.utcnow()
    update_dict = {
        "custom_bot_token": token,
        "custom_bot_name": bot.get("first_name", ""),
        "custom_bot_username": bot.get("username", ""),
        "custom_bot_id": str(bot.get("id", "")),
        "custom_webhook_url": webhook_url,
        "updated_at": now,
    }
    if result["total"] == 0:
        update_dict["created_at"] = now
        await db_service.create(update_dict, user_id=str(current_user.id))
    else:
        await db_service.update(result["items"][0].id, update_dict, user_id=str(current_user.id))

    return {
        "success": True,
        "message": "Bot saved and webhook registered!",
        "bot": bot,
        "webhook_url": webhook_url,
    }


@router.get("/clone-bot/info")
async def clone_bot_info(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the custom bot info for the current user."""
    db_service = Bot_settingsService(db)
    result = await db_service.get_list(skip=0, limit=1, user_id=str(current_user.id))
    if result["total"] == 0:
        return {"configured": False}
    obj = result["items"][0]
    if not obj.custom_bot_token:
        return {"configured": False}
    return {
        "configured": True,
        "bot_name": obj.custom_bot_name,
        "bot_username": obj.custom_bot_username,
        "bot_id": obj.custom_bot_id,
        "webhook_url": obj.custom_webhook_url,
        "webhook_secret": obj.webhook_secret,
    }


# ── Telegram file proxy ───────────────────────────────────────────────────────

@router.get("/file/{file_id:path}")
async def proxy_telegram_file(
    file_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Proxy a Telegram file by file_id so the frontend can display receipts and
    photos without exposing the bot token in the browser.
    Requires a valid admin/user session.
    """
    import mimetypes
    from fastapi.responses import Response as FastAPIResponse

    svc = TelegramService()
    meta = await svc.get_file(file_id)
    if not meta.get("success"):
        raise HTTPException(status_code=404, detail="File not found on Telegram")
    file_path: str = meta["file_path"]
    file_bytes = await svc.download_file_bytes(file_path)
    if file_bytes is None:
        raise HTTPException(status_code=502, detail="Failed to download file from Telegram")
    mime, _ = mimetypes.guess_type(file_path)
    return FastAPIResponse(
        content=file_bytes,
        media_type=mime or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{file_path.split("/")[-1]}"'},
    )
