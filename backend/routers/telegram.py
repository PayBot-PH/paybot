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
from sqlalchemy import select, func
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
from services.xendit_service import XenditService
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService
from services.photonpay_service import PhotonPayService
from services.bot_settings import Bot_settingsService
from models.topup_requests import TopupRequest
from models.bank_deposit_requests import BankDepositRequest
from models.usdt_send_requests import UsdtSendRequest
from models.kyb_registrations import KybRegistration
from models.admin_users import AdminUser
from routers.app_settings import get_usdt_php_rate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

USDT_TRC20_ADDRESS = "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx"

# PayMongo wallet top-up via InstaPay / PESONet (values default to config, overridable via env vars)
PAYMONGO_BANK_NAME = settings.paymongo_bank_name
PAYMONGO_ACCOUNT_NAME = settings.paymongo_account_name
PAYMONGO_ACCOUNT_NUMBER = settings.paymongo_account_number

# Transaction types that credit / debit the USD wallet (keep in sync with wallet.py)
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")

# Minimum PHP balance required to allow a USDT withdrawal request
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


def _parse_tlv(tlv_string: str) -> dict:
    """Parse an EMVCo/QRPH TLV-encoded string into a tag→value dict.

    Tag reference: 53=Currency (608=PHP), 58=Country, 59=Merchant Name,
    60=City, 62=Additional Data (sub-tag 05=Reference Label, 01=Bill Number).
    The equivalent parser exists in ScanQRPH.tsx (frontend).
    """
    result: dict = {}
    i = 0
    while i + 4 <= len(tlv_string):
        tag = tlv_string[i:i+2]
        try:
            length = int(tlv_string[i+2:i+4])
        except ValueError:
            break
        if i + 4 + length > len(tlv_string):
            break
        result[tag] = tlv_string[i+4:i+4+length]
        i += 4 + length
    return result


async def _decode_qr_from_telegram_photo(telegram_service: "TelegramService", file_id: str) -> Optional[str]:
    """Download a Telegram photo by file_id and decode the first QR code found.

    Returns the decoded string, or None if no QR code could be detected.
    """
    file_info = await telegram_service.get_file(file_id)
    if not file_info.get("success"):
        logger.warning(f"getFile failed for file_id={file_id}: {file_info.get('error')}")
        return None

    image_bytes = await telegram_service.download_file_bytes(file_info["file_path"])
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
    telegram_service: "TelegramService",
    db: "AsyncSession",
    chat_id: str,
    username: str,
    amount: float,
    qr_data: str,
) -> None:
    """Process a QRPH payment after the amount and QR data have been collected."""
    parsed_tlv = _parse_tlv(qr_data)
    merchant_name = parsed_tlv.get("59", "")
    merchant_city = parsed_tlv.get("60", "")
    currency_code = parsed_tlv.get("53", "")
    currency = "PHP" if currency_code == "608" else currency_code or "PHP"
    reference_number = ""
    additional_data = parsed_tlv.get("62", "")
    if additional_data:
        sub_tlv_data = _parse_tlv(additional_data)
        reference_number = sub_tlv_data.get("05", sub_tlv_data.get("01", ""))

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
    if reference_number:
        reply_lines.append(f"🆔 Reference: <code>{reference_number}</code>")
    reply_lines += [
        "",
        "⏳ Status: <b>Pending</b>",
        "💳 Complete the payment via your bank or e-wallet app.",
    ]
    await telegram_service.send_message(chat_id, "\n".join(reply_lines))

    try:
        now = datetime.now()
        transaction = Transactions(
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
        db.add(transaction)
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
        paymongo_service = PayMongoService()
        result = await paymongo_service.get_balance()
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
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 1000</i>"},
        {"key": "bank",    "type": "str",   "prompt": "🏦 Enter the <b>bank code</b>:\n<i>BDO · BPI · UNIONBANK · METROBANK · LANDBANK · PNB · RCBC</i>"},
        {"key": "account", "type": "str",   "prompt": "🔢 Enter the <b>account number</b>:\n<i>e.g. 1234567890</i>"},
        {"key": "name",    "type": "str",   "prompt": "👤 Enter the <b>account holder name</b>:\n<i>e.g. Juan Dela Cruz</i>"},
    ],
    "/refund": [
        {"key": "id",     "type": "str",   "prompt": "🆔 Enter the <b>transaction ID</b> to refund:\n<i>e.g. INV-xxx</i>"},
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>refund amount</b> in PHP:\n<i>e.g. 500</i>"},
    ],
    "/send": [
        {"key": "amount",    "type": "float", "prompt": "💰 Enter the <b>amount</b> in PHP:\n<i>e.g. 500</i>"},
        {"key": "recipient", "type": "str",   "prompt": "👤 Enter the <b>recipient</b> (username or Telegram ID):\n<i>e.g. @username</i>"},
    ],
    "/withdraw": [
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>withdrawal amount</b> in PHP:\n<i>e.g. 500</i>"},
    ],
    "/topup": [
        {"key": "amount", "type": "float", "prompt": "💰 Enter the <b>USDT amount</b> to top up:\n<i>e.g. 100</i>"},
    ],
    "/sendusdt": [
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>USDT amount</b> to send:\n<i>e.g. 50</i>"},
        {"key": "address", "type": "str",   "prompt": "📬 Enter the <b>TRC20 wallet address</b>:\n<i>e.g. TXxx...</i>"},
    ],
    "/sendusd": [
        {"key": "amount",   "type": "float", "prompt": "💰 Enter the <b>USD amount</b> to send:\n<i>e.g. 50</i>"},
        {"key": "username", "type": "str",   "prompt": "👤 Enter the <b>recipient username</b>:\n<i>e.g. @username</i>"},
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
        {"key": "channel", "type": "str",   "prompt": "💳 Enter the <b>payment channel</b> used to send the money:\n<i>INSTAPAY · PESONET · GCASH · MAYA · BDO · BPI · METROBANK · UNIONBANK · LANDBANK</i>"},
        {"key": "account", "type": "str",   "prompt": "🔢 Enter the <b>account / mobile number</b> used to make the transfer:\n<i>e.g. 09XXXXXXXXX or your bank account number</i>"},
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>exact amount</b> sent in PHP:\n<i>e.g. 500.00</i>"},
    ],
    "/scanqr": [
        {"key": "qr_data", "type": "photo", "prompt": "📷 Please upload a photo of the <b>QRPH QR code</b>.\n<i>Make sure the QR code is clearly visible and well-lit.</i>"},
        {"key": "amount",  "type": "float", "prompt": "💰 Enter the <b>amount</b> to pay in PHP:\n<i>e.g. 500</i>"},
    ],
}


def _wizard_start(chat_id: str, cmd: str) -> str:
    """Initialise pending state for cmd and return the first prompt."""
    _pending[chat_id] = {"cmd": cmd, "step": 0, "data": {}}
    return (
        f"📋 <b>{cmd}</b> — let's fill in the details.\n"
        f"Type <code>/cancel</code> at any time to abort.\n\n"
        + _CMD_STEPS[cmd][0]["prompt"]
    )
def _start_reply_keyboard() -> dict:
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


def _language_inline_keyboard() -> dict:
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
        f"{greeting} Your all-in-one Philippine payment gateway is ready to go.\n\n"
        f"💳 <b>Accept Payments</b>\n"
        f"  /invoice [amt] [desc] — Create an invoice\n"
        f"  /qr [amt] [desc] — Generate QR code\n"
        f"  /link [amt] [desc] — Payment link\n"
        f"  /va [amt] [bank] — Virtual account\n"
        f"  /ewallet [amt] [provider] — E-wallet (GCash, Maya, GrabPay)\n"
        f"  /alipay [amt] [desc] — Alipay QR (via PhotonPay)\n"
        f"  /wechat [amt] [desc] — WeChat QR (via PhotonPay)\n\n"
        f"💸 <b>Send Money</b>\n"
        f"  /disburse [amt] [bank] [acct] [name] — Bank transfer\n"
        f"  /refund [id] [amt] — Refund a payment\n\n"
        f"💰 <b>PHP Wallet</b>\n"
        f"  /balance — View balances &amp; history\n"
        f"  /topup [amt] — Top up PHP wallet via USDT (auto-converted)\n"
        f"  /send [amt] [to] — Send funds to another user\n"
        f"  /withdraw [amt] — Withdraw\n\n"
        f"💵 <b>USD Wallet (USDT TRC20)</b>\n"
        f"  /usdbalance — USD balance &amp; history\n"
        f"  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
        f"  /sendusd [amt] [@username] — Send USD to another user\n\n"
        f"📊 <b>Reports &amp; Tools</b>\n"
        f"  /status [id] — Payment status\n"
        f"  /list — Recent transactions\n"
        f"  /report [daily|weekly|monthly]\n"
        f"  /fees [amt] [method] — Fee calculator\n"
        f"  /cancel [id] — Cancel pending payment\n"
        f"  /remind [id] — Send payment reminder\n\n"
        f"💡 <b>Tip:</b> Type any command or /help to see everything you can do!"
    )


def _welcome_zh(name: str = "") -> str:
    greeting = f"嗨 {name}！🎉" if name else "🎉 欢迎回来！"
    return (
        f"👋 <b>欢迎使用 PayBot Philippines！</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{greeting} 您的一站式菲律宾支付机器人已就绪。\n\n"
        f"💳 <b>收款</b>\n"
        f"  /invoice [金额] [说明] — 创建账单\n"
        f"  /qr [金额] [说明] — 生成二维码\n"
        f"  /link [金额] [说明] — 付款链接\n"
        f"  /va [金额] [银行] — 虚拟账户\n"
        f"  /ewallet [金额] [提供商] — 电子钱包（GCash、Maya、GrabPay）\n"
        f"  /alipay [金额] [说明] — 支付宝收款\n"
        f"  /wechat [金额] [说明] — 微信支付收款\n\n"
        f"💸 <b>转账</b>\n"
        f"  /disburse [金额] [银行] [账号] [姓名] — 银行转账\n"
        f"  /refund [ID] [金额] — 退款\n\n"
        f"💰 <b>PHP 钱包</b>\n"
        f"  /balance — 查看余额及历史\n"
        f"  /topup [金额] — 通过 USDT 充值至 PHP 钱包（自动换汇）\n"
        f"  /send [金额] [接收方] — 向用户转账\n"
        f"  /withdraw [金额] — 提现\n\n"
        f"💵 <b>USD 钱包（USDT TRC20）</b>\n"
        f"  /usdbalance — USD 余额及历史\n"
        f"  /sendusdt [金额] [地址] — 发送 USDT 至 TRC20 地址\n"
        f"  /sendusd [金额] [@用户名] — 向用户转账 USD\n\n"
        f"📊 <b>报表与工具</b>\n"
        f"  /status [ID] — 付款状态\n"
        f"  /list — 近期交易记录\n"
        f"  /report [daily|weekly|monthly]\n"
        f"  /fees [金额] [方式] — 费用计算\n"
        f"  /cancel [ID] — 取消待付款项\n"
        f"  /remind [ID] — 发送付款提醒\n\n"
        f"💡 <b>提示：</b>输入任意命令或 /help 查看全部功能！"
    )


def _payment_reply_keyboard() -> dict:
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


def _wallet_reply_keyboard() -> dict:
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


def _info_reply_keyboard() -> dict:
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


def _get_user_language(chat_id: str) -> str:
    """Return the stored language for a chat, defaulting to English."""
    return _user_lang.get(chat_id, "en")


def _localize(chat_id: str, en: str, zh: str = "") -> str:
    """Pick the localised string based on the user's stored language."""
    if _get_user_language(chat_id) == "zh" and zh:
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
    telegram_service: "TelegramService",
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
        await telegram_service.send_message(
            chat_id,
            "🌐 <b>Select Language / 请选择语言</b>",
            reply_markup=_language_inline_keyboard(),
        )
        return True

    # Check existing KYB record
    try:
        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == chat_id))
        kyb = res.scalar_one_or_none()
    except Exception as e:
        logger.error("KYB lookup failed: %s", e)
        await telegram_service.send_message(chat_id, "⚠️ A database error occurred. Please try again later.")
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
                await telegram_service.send_message(chat_id, "⚠️ Could not start registration. Please try again.")
                return True
            await telegram_service.send_message(
                chat_id,
                "🎉 <b>KYB Registration Started!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Great! Let's get you set up. Please answer a few quick questions so our team can verify your account.\n"
                "Your information is kept safe and reviewed only by the bot administrator.\n\n"
                + _KYB_PROMPTS["full_name"],
            )
        else:
            await telegram_service.send_message(
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
        await telegram_service.send_message(chat_id, "✅ Your KYB is approved. You can now use all bot commands. Type /start to begin.")
        return True

    # KYB rejected
    if kyb.status == "rejected":
        reason = kyb.rejection_reason or "No reason provided."
        await telegram_service.send_message(
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
        await telegram_service.send_message(
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
            await telegram_service.send_message(chat_id, _KYB_PROMPTS["full_name"])
            return True
        try:
            kyb.full_name = text.strip()
            kyb.step = "phone"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (full_name): %s", e)
            await db.rollback()
        await telegram_service.send_message(chat_id, _KYB_PROMPTS["phone"])
        return True

    if step == "phone":
        if not text or text.startswith("/"):
            await telegram_service.send_message(chat_id, _KYB_PROMPTS["phone"])
            return True
        try:
            kyb.phone = text.strip()
            kyb.step = "address"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (phone): %s", e)
            await db.rollback()
        await telegram_service.send_message(chat_id, _KYB_PROMPTS["address"])
        return True

    if step == "address":
        if not text or text.startswith("/"):
            await telegram_service.send_message(chat_id, _KYB_PROMPTS["address"])
            return True
        try:
            kyb.address = text.strip()
            kyb.step = "bank"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (address): %s", e)
            await db.rollback()
        await telegram_service.send_message(chat_id, _KYB_PROMPTS["bank"])
        return True

    if step == "bank":
        if not text or text.startswith("/"):
            await telegram_service.send_message(chat_id, _KYB_PROMPTS["bank"])
            return True
        try:
            kyb.bank_name = text.strip()
            kyb.step = "id_photo"
            await db.commit()
        except Exception as e:
            logger.error("KYB update failed (bank): %s", e)
            await db.rollback()
        await telegram_service.send_message(chat_id, _KYB_PROMPTS["id_photo"])
        return True

    if step == "id_photo":
        if not photos:
            await telegram_service.send_message(chat_id, _KYB_PROMPTS["id_photo"])
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
            await telegram_service.send_message(chat_id, "⚠️ Could not save your ID photo. Please try again.")
            return True

        await telegram_service.send_message(
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
            await telegram_service.send_message(
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
    await telegram_service.send_message(chat_id, "⚠️ Registration state reset. Let's start again.\n\n" + _KYB_PROMPTS["full_name"])
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
        callback_query = body.get("callback_query", {})

        # ── Handle inline button callbacks (language selection) ──────────
        if callback_query:
            callback_query_id = callback_query.get("id", "")
            callback_query_data = callback_query.get("data", "")
            callback_query_sender = callback_query.get("from", {})
            callback_sender_chat_id = str(callback_query_sender.get("id", ""))
            callback_sender_first_name = _escape_html(callback_query_sender.get("first_name", ""))
            telegram_service = TelegramService()

            if callback_query_data in ("lang:en", "lang:zh"):
                await telegram_service.answer_callback_query(callback_query_id)
                lang = callback_query_data.split(":")[1]

                # Persist the language choice for this user.
                _user_lang[callback_sender_chat_id] = lang

                # Check whether this chat belongs to a registered admin
                is_registered = False
                admin_user = None
                try:
                    admin_result = await db.execute(select(AdminUser).where(AdminUser.telegram_id == callback_sender_chat_id, AdminUser.is_active.is_(True)))
                    admin_user = admin_result.scalar_one_or_none()
                    is_registered = admin_user is not None
                except Exception:
                    pass

                if is_registered:
                    welcome = None
                    if admin_user:
                        try:
                            bot_settings_service = Bot_settingsService(db)
                            bot_config_result = await bot_settings_service.get_list(skip=0, limit=1, user_id=str(admin_user.id))
                            if bot_config_result["total"] > 0:
                                bot_settings_config = bot_config_result["items"][0]
                                welcome_template = bot_settings_config.welcome_message_en if lang == "en" else bot_settings_config.welcome_message_zh
                                if welcome_template:
                                    welcome = welcome_template.replace("{name}", callback_sender_first_name or "")
                        except Exception as e:
                            logger.warning(f"Could not load welcome template for user {admin_user.id}: {e}")
                    if not welcome:
                        welcome = _welcome_en(callback_sender_first_name) if lang == "en" else _welcome_zh(callback_sender_first_name)
                    await telegram_service.send_message(callback_sender_chat_id, welcome)
                else:
                    if lang == "en":
                        greeting = f"Hi {callback_sender_first_name}! 👋" if callback_sender_first_name else "👋 Hello!"
                        welcome_message = (
                            f"🌟 <b>Welcome to PayBot Philippines!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"{greeting} Great to have you here! 😊\n\n"
                            f"This bot is currently available to <b>registered merchants</b> only.\n\n"
                            f"📋 <b>To get started:</b>\n"
                            f"Complete a quick KYB (Know Your Business) registration so we can verify your account and unlock all payment features.\n\n"
                            f"👉 Type /register to begin — it only takes a few minutes!"
                        )
                    else:
                        greeting = f"嗨 {callback_sender_first_name}！👋" if callback_sender_first_name else "👋 你好！"
                        welcome_message = (
                            f"🌟 <b>欢迎使用 PayBot Philippines！</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"{greeting} 很高兴认识你！😊\n\n"
                            f"本机器人目前仅对<b>已注册商户</b>开放。\n\n"
                            f"📋 <b>如何开始：</b>\n"
                            f"完成快速 KYB（了解您的业务）注册，我们将验证您的账户并开放所有支付功能。\n\n"
                            f"👉 输入 /register 开始注册，只需几分钟！"
                        )
                    await telegram_service.send_message(callback_sender_chat_id, welcome_message)

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

        telegram_service = TelegramService()
        tg_user_id = f"tg-{chat_id}"

        # ==================== Access control: KYB gate ====================
        # Check if this user is an authorized admin.  Non-admins are routed
        # through the KYB registration flow (photos or text).
        is_admin = await _is_authorized_admin(db, chat_id)
        if not is_admin:
            await _handle_kyb_flow(db, telegram_service, chat_id, username, text, photos)
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
                    admin_query_result = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                    admin_record = admin_query_result.scalar_one_or_none()
                except Exception:
                    admin_record = None
                if admin_record and admin_record.pin_hash:
                    name_display = f" {first_name}" if first_name else ""
                    await telegram_service.send_message(
                        chat_id,
                        f"🔐 <b>Session Expired</b>\n\n"
                        f"Hey{name_display}! Your session has timed out for security. No worries — just log back in:\n\n"
                        f"<code>/login [your PIN]</code>",
                    )
                    return {"status": "ok"}
                elif admin_record and not admin_record.pin_hash:
                    await telegram_service.send_message(
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
                    .limit(1)
                )
                pending_topup = result.scalars().first()
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
                    await telegram_service.send_message(
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
                    .limit(1)
                )
                pending_deposit = dep_result.scalars().first()
                if pending_deposit:
                    best_photo = max(photos, key=lambda p: p.get("file_size", 0))
                    pending_deposit.receipt_file_id = best_photo["file_id"]
                    pending_deposit.updated_at = datetime.now()
                    await db.commit()
                    await telegram_service.send_message(
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

                await telegram_service.send_message(chat_id, "ℹ️ No pending top-up request found. Use /topup [amount] for USDT.")
                return {"status": "ok"}
            # Fall through to the wizard handler below (photo step is active)

        if not text and not photos:
            return {"status": "ok"}

        # ==================== /login ====================
        if text.startswith("/login"):
            parts = text.split(maxsplit=1)
            pin_input = parts[1].strip() if len(parts) > 1 else ""
            try:
                admin_query_result = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                admin_record = admin_query_result.scalar_one_or_none()
            except Exception:
                admin_record = None

            if not admin_record:
                await telegram_service.send_message(chat_id, "⚠️ Account not found. Please contact your administrator.")
                return {"status": "ok"}

            if not admin_record.pin_hash:
                await telegram_service.send_message(
                    chat_id,
                    "ℹ️ No PIN set yet. Use <code>/setpin [4–6 digits]</code> to create your PIN first.",
                )
                return {"status": "ok"}

            # Check lock
            if admin_record.pin_locked_until and datetime.utcnow() < admin_record.pin_locked_until.replace(tzinfo=None):
                remaining = int((admin_record.pin_locked_until.replace(tzinfo=None) - datetime.utcnow()).total_seconds() / 60) + 1
                await telegram_service.send_message(chat_id, f"🔒 Account temporarily locked. Try again in {remaining} minute(s).")
                return {"status": "ok"}

            if not pin_input:
                await telegram_service.send_message(chat_id, "❌ Usage: <code>/login [your PIN]</code>\nExample: <code>/login 1234</code>")
                return {"status": "ok"}

            if not pin_input.isdigit() or not (4 <= len(pin_input) <= 6):
                await telegram_service.send_message(chat_id, "❌ PIN must be 4–6 digits.")
                return {"status": "ok"}

            expected = _hash_pin(pin_input, admin_record.pin_salt or "")
            if expected == admin_record.pin_hash:
                # Correct — start session, reset failed attempts
                _start_pin_session(chat_id)
                try:
                    admin_record.pin_failed_attempts = 0
                    admin_record.pin_locked_until = None
                    admin_record.updated_at = datetime.now()
                    await db.commit()
                except Exception:
                    await db.rollback()
                await telegram_service.send_message(
                    chat_id,
                    _localize(chat_id,
                       f"✅ <b>Welcome back, {admin_record.name or username}!</b> 👋\n\n"
                       f"You're all set — your session is active for 2 hours. Let's get to work! 💪\n\n"
                       f"Type /help to explore all commands.",
                       f"✅ <b>欢迎回来，{admin_record.name or username}！</b> 👋\n\n"
                       f"登录成功，会话有效期 2 小时。开始吧！💪\n\n"
                       f"输入 /help 查看所有命令。"),
                )
            else:
                # Wrong PIN
                failed = (admin_record.pin_failed_attempts or 0) + 1
                locked_until = None
                if failed >= _PIN_MAX_ATTEMPTS:
                    locked_until = datetime.now() + timedelta(minutes=_PIN_LOCK_MINUTES)
                try:
                    admin_record.pin_failed_attempts = failed
                    admin_record.pin_locked_until = locked_until
                    admin_record.updated_at = datetime.now()
                    await db.commit()
                except Exception:
                    await db.rollback()
                if locked_until:
                    await telegram_service.send_message(
                        chat_id,
                        f"🔒 <b>Account Temporarily Locked</b>\n\nToo many incorrect PIN attempts. Please wait {_PIN_LOCK_MINUTES} minutes before trying again.",
                    )
                else:
                    remaining_attempts = _PIN_MAX_ATTEMPTS - failed
                    await telegram_service.send_message(
                        chat_id,
                        f"❌ Incorrect PIN. You have {remaining_attempts} attempt(s) remaining.\n\nIf you've forgotten your PIN, please contact the administrator.",
                    )
            return {"status": "ok"}

        # ==================== /setpin ====================
        elif text.startswith("/setpin"):
            parts = text.split(maxsplit=1)
            pin_input = parts[1].strip() if len(parts) > 1 else ""
            if not pin_input or not pin_input.isdigit() or not (4 <= len(pin_input) <= 6):
                await telegram_service.send_message(
                    chat_id,
                    "❌ Usage: <code>/setpin [4–6 digit PIN]</code>\n\nExample: <code>/setpin 1234</code>\n\n"
                    "⚠️ <i>Choose a PIN only you know. Do not share it.</i>",
                )
                return {"status": "ok"}
            try:
                admin_query_result = await db.execute(select(AdminUser).where(AdminUser.telegram_id == chat_id))
                admin_record = admin_query_result.scalar_one_or_none()
            except Exception:
                admin_record = None
            if not admin_record:
                await telegram_service.send_message(chat_id, "⚠️ Account not found.")
                return {"status": "ok"}
            salt = _generate_salt()
            try:
                admin_record.pin_salt = salt
                admin_record.pin_hash = _hash_pin(pin_input, salt)
                admin_record.pin_failed_attempts = 0
                admin_record.pin_locked_until = None
                admin_record.updated_at = datetime.now()
                await db.commit()
            except Exception as e:
                logger.error(f"setpin DB error: {e}", exc_info=True)
                await db.rollback()
                await telegram_service.send_message(chat_id, "⚠️ Could not save PIN. Please try again.")
                return {"status": "ok"}
            _start_pin_session(chat_id)
            await telegram_service.send_message(
                chat_id,
                _localize(chat_id,
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
            await telegram_service.send_message(
                chat_id,
                _localize(chat_id,
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
                        await telegram_service.send_message(
                            chat_id,
                            "❌ Please upload a photo of the QR code.\n\n" + param["prompt"],
                        )
                        return {"status": "ok"}
                    # Use the largest resolution photo (last in list)
                    photo_file_id = photos[-1].get("file_id", "")
                    qr_decoded = await _decode_qr_from_telegram_photo(telegram_service, photo_file_id)
                    if not qr_decoded:
                        await telegram_service.send_message(
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
                            parsed_float_value = float(raw)
                            if parsed_float_value <= 0:
                                raise ValueError("Must be > 0")
                            state["data"][param["key"]] = str(parsed_float_value)
                        except ValueError:
                            await telegram_service.send_message(
                                chat_id,
                                "❌ Please enter a valid positive number.\n\n" + param["prompt"],
                            )
                            return {"status": "ok"}
                    else:
                        if not raw:
                            await telegram_service.send_message(chat_id, "❌ Value cannot be empty.\n\n" + param["prompt"])
                            return {"status": "ok"}
                        state["data"][param["key"]] = raw

                state["step"] += 1

            # More steps outstanding?
            if state["step"] < len(steps):
                # /scanqr: after the QR photo is decoded, check PHP balance before
                # asking for the amount — fail immediately if no funds available.
                if cmd == "/scanqr" and state["step"] == 1:
                    php_bal = await _get_php_balance_for_bot(db, f"tg-{chat_id}")
                    if php_bal <= 0:
                        del _pending[chat_id]
                        await telegram_service.send_message(
                            chat_id,
                            "❌ <b>Transaction Failed — No Balance</b>\n\n"
                            "Your PHP wallet balance is <b>₱0.00</b>.\n"
                            "You do not have sufficient funds to complete this QRPH payment.\n\n"
                            "💳 <b>Top up via Bank / E-Wallet Deposit:</b>\n"
                            "━━━━━━━━━━━━━━━━━━━━\n"
                            f"🏦 Bank: <b>{PAYMONGO_BANK_NAME}</b>\n"
                            f"👤 Account Name: <b>{PAYMONGO_ACCOUNT_NAME}</b>\n"
                            f"🔢 Account Number: <code>{PAYMONGO_ACCOUNT_NUMBER}</code>\n\n"
                            "Supported channels:\n"
                            "  • <b>InstaPay</b> · <b>PESONet</b>\n"
                            "  • <b>GCash</b> · <b>Maya</b>\n"
                            "  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                            "After transferring, use /deposit to record your payment.",
                        )
                        return {"status": "ok"}
                next_param = steps[state["step"]]
                await telegram_service.send_message(chat_id, next_param["prompt"])
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
                        await telegram_service.send_message(chat_id, "❌ Invalid amount or missing QR data.")
                        return {"status": "ok"}
                    # Final balance check: ensure the user has enough to cover the exact amount.
                    php_bal = await _get_php_balance_for_bot(db, f"tg-{chat_id}")
                    if php_bal < amount:
                        await telegram_service.send_message(
                            chat_id,
                            f"❌ <b>Transaction Failed — Insufficient Balance</b>\n\n"
                            f"💰 Required: <b>₱{amount:,.2f}</b>\n"
                            f"💳 Available: <b>₱{php_bal:,.2f}</b>\n\n"
                            f"Your balance is not enough to complete this QRPH payment.\n\n"
                            "💳 <b>Top up via Bank / E-Wallet Deposit:</b>\n"
                            "━━━━━━━━━━━━━━━━━━━━\n"
                            f"🏦 Bank: <b>{PAYMONGO_BANK_NAME}</b>\n"
                            f"👤 Account Name: <b>{PAYMONGO_ACCOUNT_NAME}</b>\n"
                            f"🔢 Account Number: <code>{PAYMONGO_ACCOUNT_NUMBER}</code>\n\n"
                            "Supported channels:\n"
                            "  • <b>InstaPay</b> · <b>PESONet</b>\n"
                            "  • <b>GCash</b> · <b>Maya</b>\n"
                            "  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                            "After transferring, use /deposit to record your payment.",
                        )
                        return {"status": "ok"}
                    await _process_scanqr(telegram_service, db, chat_id, username, amount, qr_data)
                except Exception as exc:
                    logger.error(f"/scanqr wizard completion error: {exc}", exc_info=True)
                    await telegram_service.send_message(chat_id, "❌ An error occurred processing your QRPH payment. Please try again.")
                return {"status": "ok"}

            # /deposit is handled inline: store the deposit request and ask for receipt
            if cmd == "/deposit":
                try:
                    channel = str(collected.get("channel", "")).strip().upper()
                    account = str(collected.get("account", "")).strip()
                    amount_php = float(collected.get("amount", 0))
                    if not channel or not account or amount_php <= 0:
                        await telegram_service.send_message(chat_id, "❌ Invalid deposit details. Please try /deposit again.")
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
                    await telegram_service.send_message(
                        chat_id,
                        f"✅ <b>Deposit details recorded!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💳 Channel: <b>{channel}</b>\n"
                        f"🔢 Account: <code>{account}</code>\n"
                        f"💰 Amount: <b>₱{amount_php:,.2f}</b>\n"
                        f"🆔 Request ID: <code>#{deposit_req.id}</code>\n\n"
                        f"📷 <b>Next step:</b> Please send a screenshot / photo of your transfer confirmation in this chat.\n"
                        f"The admin will verify and credit your PHP wallet once the receipt is confirmed.",
                    )
                except Exception as exc:
                    logger.error(f"/deposit wizard completion error: {exc}", exc_info=True)
                    await telegram_service.send_message(chat_id, "❌ An error occurred saving your deposit. Please try /deposit again.")
                return {"status": "ok"}

            # Other commands: rebuild command text and fall through to routing
            parts = [cmd] + [collected.get(s["key"], s.get("default", "")) for s in steps]
            text = " ".join(str(p) for p in parts)
            # fall through to command routing below

        elif chat_id in _pending and text and text.startswith("/"):
            if text.startswith("/cancel"):
                # /cancel always aborts the current wizard
                del _pending[chat_id]
                await telegram_service.send_message(chat_id, _localize(chat_id, "❌ Wizard cancelled.", "❌ 已取消。"))
                return {"status": "ok"}
            # Any other new command: silently cancel wizard and process normally
            del _pending[chat_id]

        # ==================== /start ====================
        if text.startswith("/start"):
            # Clear stored language so the user is prompted to pick again.
            _user_lang.pop(chat_id, None)
            greeting = f"Hi {first_name}! 👋" if first_name else "👋 Hello!"
            await telegram_service.send_message(
                chat_id,
                f"🌐 {greeting}\n\n<b>Select your language / 请选择语言</b>",
                reply_markup=_language_inline_keyboard(),
            )

        # ==================== /kyb_list (bot owner only) ====================
        elif text.startswith("/kyb_list"):
            if chat_id != _get_bot_owner_id():
                await telegram_service.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                try:
                    res = await db.execute(
                        select(KybRegistration).where(KybRegistration.status == "pending_review").order_by(KybRegistration.created_at.asc())
                    )
                    pending_kybs = res.scalars().all()
                    if not pending_kybs:
                        await telegram_service.send_message(chat_id, "✅ No pending KYB registrations.")
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
                        await telegram_service.send_message(chat_id, "\n".join(lines))
                except Exception as e:
                    logger.error("kyb_list error: %s", e)
                    await telegram_service.send_message(chat_id, "⚠️ Failed to fetch KYB list.")

        # ==================== /kyb_approve (bot owner only) ====================
        elif text.startswith("/kyb_approve"):
            if chat_id != _get_bot_owner_id():
                await telegram_service.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                parts = text.split(maxsplit=1)
                if len(parts) < 2:
                    await telegram_service.send_message(chat_id, "❌ Usage: /kyb_approve [chat_id]")
                else:
                    target_chat_id = parts[1].strip()
                    try:
                        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == target_chat_id))
                        kyb = res.scalar_one_or_none()
                        if not kyb:
                            await telegram_service.send_message(chat_id, f"❌ No KYB record found for chat_id: {target_chat_id}")
                        elif kyb.status == "approved":
                            await telegram_service.send_message(chat_id, f"ℹ️ KYB for {target_chat_id} is already approved.")
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
                            await telegram_service.send_message(chat_id, f"✅ KYB approved for {target_chat_id} ({kyb.full_name}). Admin access granted.")
                            # Notify the approved user — prompt them to set PIN
                            greeting_name = _escape_html(kyb.full_name or "there")
                            await telegram_service.send_message(
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
                        await telegram_service.send_message(chat_id, f"⚠️ Failed to approve KYB: {e}")

        # ==================== /kyb_reject (bot owner only) ====================
        elif text.startswith("/kyb_reject"):
            if chat_id != _get_bot_owner_id():
                await telegram_service.send_message(chat_id, "❌ This command is only available to the bot owner.")
            else:
                parts = text.split(maxsplit=2)
                if len(parts) < 2:
                    await telegram_service.send_message(chat_id, "❌ Usage: /kyb_reject [chat_id] [reason]")
                else:
                    target_chat_id = parts[1].strip()
                    reason = parts[2].strip() if len(parts) > 2 else "No reason provided."
                    try:
                        res = await db.execute(select(KybRegistration).where(KybRegistration.chat_id == target_chat_id))
                        kyb = res.scalar_one_or_none()
                        if not kyb:
                            await telegram_service.send_message(chat_id, f"❌ No KYB record found for chat_id: {target_chat_id}")
                        else:
                            kyb.status = "rejected"
                            kyb.rejection_reason = reason
                            await db.commit()
                            await telegram_service.send_message(chat_id, f"✅ KYB rejected for {target_chat_id} ({kyb.full_name}).")
                            # Notify the rejected user
                            await telegram_service.send_message(
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
                        await telegram_service.send_message(chat_id, f"⚠️ Failed to reject KYB: {e}")

        # ==================== /invoice ====================
        elif text.startswith("/invoice"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/invoice"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
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
                        await telegram_service.send_message(chat_id, reply, reply_markup=keyboard)
                        # Then try DB save
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="invoice",
                                external_id=result.get("external_id", ""), xendit_id=result.get("invoice_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                payment_url=result.get("invoice_url", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /invoice: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /qr ====================
        elif text.startswith("/qr"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/qr"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
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
                        await telegram_service.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="qr_code",
                                external_id=result.get("external_id", ""), xendit_id=result.get("qr_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=result.get("qr_string", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /qr: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /scanqr (QRPH scan — upload QR image) ====================
        elif text.startswith("/scanqr"):
            await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/scanqr"))

        # ==================== /alipay (PhotonPay → Alipay QR) ====================
        elif text.startswith("/alipay"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/alipay"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Alipay payment"
                    photonpay = PhotonPayService()
                    backend_url = ""
                    try:
                        from core.config import settings as _settings
                        backend_url = _settings.backend_url
                    except Exception:
                        pass
                    result = await photonpay.create_alipay_session(
                        amount=amount,
                        description=description,
                        notify_url=f"{backend_url}/api/v1/photonpay/webhook",
                        redirect_url=f"{backend_url}/api/v1/photonpay/redirect/success",
                        shopper_id=str(chat_id),
                    )
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        reference_number = result.get("req_id", "")
                        caption = (
                            f"✅ <b>Alipay Payment Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"�� Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{reference_number}</code>\n\n"
                            f"📱 Tap the button below to open the Alipay checkout page.\n"
                            f"💳 Your PHP wallet will be credited automatically once paid."
                        )
                        keyboard = {"inline_keyboard": [[{"text": "🔴 Pay via Alipay", "url": checkout_url}]]} if checkout_url else None
                        await telegram_service.send_message(chat_id, caption, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="alipay_qr",
                                external_id=reference_number, xendit_id=result.get("pay_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=checkout_url, telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /alipay: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Alipay payment failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /wechat (PhotonPay → WeChat Pay QR) ====================
        elif text.startswith("/wechat"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/wechat"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "WeChat Pay"
                    photonpay = PhotonPayService()
                    backend_url = ""
                    try:
                        from core.config import settings as _settings
                        backend_url = _settings.backend_url
                    except Exception:
                        pass
                    result = await photonpay.create_wechat_session(
                        amount=amount,
                        description=description,
                        notify_url=f"{backend_url}/api/v1/photonpay/webhook",
                        redirect_url=f"{backend_url}/api/v1/photonpay/redirect/success",
                        shopper_id=str(chat_id),
                    )
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        reference_number = result.get("req_id", "")
                        caption = (
                            f"✅ <b>WeChat Pay Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{reference_number}</code>\n\n"
                            f"📱 Tap the button below to open the WeChat Pay checkout page.\n"
                            f"💳 Your PHP wallet will be credited automatically once paid."
                        )
                        keyboard = {"inline_keyboard": [[{"text": "💚 Pay via WeChat", "url": checkout_url}]]} if checkout_url else None
                        await telegram_service.send_message(chat_id, caption, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="wechat_qr",
                                external_id=reference_number, xendit_id=result.get("pay_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                qr_code_url=checkout_url, telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /wechat: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ WeChat Pay failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /link ====================
        elif text.startswith("/link"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/link"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
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
                        await telegram_service.send_message(chat_id, reply, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="payment_link",
                                external_id=result.get("external_id", ""), xendit_id=result.get("payment_link_id", ""),
                                amount=amount, currency="PHP", status="pending", description=description,
                                payment_url=result.get("payment_link_url", ""), telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /link: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /va ====================
        elif text.startswith("/va"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/va"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
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
                        await telegram_service.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="virtual_account",
                                external_id=result.get("external_id", ""), xendit_id=result.get("va_id", ""),
                                amount=amount, currency="PHP", status="pending",
                                description=f"VA: {bank_code}", telegram_chat_id=chat_id,
                                created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /va: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /ewallet ====================
        elif text.startswith("/ewallet"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/ewallet"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    provider = parts[2].upper()
                    channel_map = {
                        "GCASH": "PH_GCASH", "GRABPAY": "PH_GRABPAY",
                        "PH_GCASH": "PH_GCASH", "PH_GRABPAY": "PH_GRABPAY",
                        "MAYA": "PH_MAYA", "PAYMAYA": "PH_MAYA", "PH_MAYA": "PH_MAYA",
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
                        await telegram_service.send_message(chat_id, reply, reply_markup=ewallet_keyboard)
                        try:
                            now = datetime.now()
                            transaction = Transactions(
                                user_id=f"tg-{chat_id}", transaction_type="ewallet",
                                external_id=result.get("external_id", ""), xendit_id=result.get("charge_id", ""),
                                amount=amount, currency="PHP", status="pending",
                                description=f"E-Wallet: {provider}", payment_url=checkout,
                                telegram_chat_id=chat_id, created_at=now, updated_at=now,
                            )
                            db.add(transaction)
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /ewallet: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /disburse ====================
        elif text.startswith("/disburse"):
            parts = text.split(maxsplit=4)
            if len(parts) < 5:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/disburse"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Balance gate — check user has sufficient PHP wallet balance
                    tg_uid = f"tg-{chat_id}"
                    php_bal = await _get_php_balance_for_bot(db, tg_uid)
                    if php_bal <= 0:
                        await telegram_service.send_message(
                            chat_id,
                            "❌ <b>Insufficient balance.</b>\n\n"
                            "Your PHP wallet balance is <b>₱0.00</b>.\n"
                            "Please top up first using /alipay or /wechat.\n\n"
                            "💡 Use /balance to check your balance.",
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if php_bal < amount:
                        await telegram_service.send_message(
                            chat_id,
                            f"❌ <b>Insufficient balance.</b>\n\n"
                            f"Available: <b>₱{php_bal:,.2f}</b>\n"
                            f"Required: <b>₱{amount:,.2f}</b>\n\n"
                            f"Please top up the difference using /alipay or /wechat.",
                        )
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
                        await telegram_service.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            disb = Disbursements(
                                user_id=tg_uid, external_id=result.get("external_id", ""),
                                xendit_id=result.get("disbursement_id", ""), amount=amount, currency="PHP",
                                bank_code=bank_code, account_number=account_number, account_name=account_name,
                                description="TG disbursement", status="pending", disbursement_type="single",
                                created_at=now, updated_at=now,
                            )
                            db.add(disb)
                            # Deduct from user's PHP wallet
                            from models.wallets import Wallets as WalletModel
                            from models.wallet_transactions import Wallet_transactions as WalletTxn
                            wallet_row = await db.execute(
                                select(WalletModel).where(
                                    WalletModel.user_id == tg_uid,
                                    WalletModel.currency == "PHP",
                                )
                            )
                            w = wallet_row.scalar_one_or_none()
                            if w:
                                bal_before = w.balance
                                w.balance = round(w.balance - amount, 2)
                                w.updated_at = now
                                db.add(WalletTxn(
                                    user_id=tg_uid, wallet_id=w.id,
                                    transaction_type="disbursement", amount=-amount,
                                    balance_before=bal_before, balance_after=w.balance,
                                    note=f"Disbursement to {account_name} ({bank_code})",
                                    status="completed", created_at=now,
                                ))
                            await db.commit()
                        except Exception as e:
                            logger.error(f"DB save failed for /disburse: {e}", exc_info=True)
                            try:
                                await db.rollback()
                            except Exception:
                                pass
                    else:
                        await telegram_service.send_message(chat_id, f"❌ Disbursement failed: {result.get('error', 'Unknown error')}")
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /refund ====================
        elif text.startswith("/refund"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/refund"))
            else:
                ext_id = parts[1].strip()
                # DB lookup is required for refund logic — wrap it safely
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    transaction = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /refund: {e}", exc_info=True)
                    await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    transaction = None
                    # Skip further processing
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if not transaction:
                    await telegram_service.send_message(chat_id, f"❌ Transaction not found: {ext_id}")
                elif transaction.status != "paid":
                    await telegram_service.send_message(chat_id, "❌ Only paid transactions can be refunded.")
                else:
                    try:
                        refund_amount = float(parts[2]) if len(parts) > 2 else transaction.amount
                    except ValueError:
                        await telegram_service.send_message(chat_id, "❌ Invalid refund amount.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if refund_amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Refund amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    elif refund_amount > transaction.amount:
                        await telegram_service.send_message(chat_id, "❌ Refund amount exceeds transaction amount.")
                    else:
                        xendit = XenditService()
                        ref_result = await xendit.create_refund(invoice_id=transaction.xendit_id, amount=refund_amount)
                        ref_type = "full" if refund_amount >= transaction.amount else "partial"
                        if ref_result.get("success"):
                            reply = f"✅ <b>Refund Processed!</b>\n\n💰 ₱{refund_amount:,.2f}\n📋 Type: {ref_type}\n🆔 {ext_id}"
                        else:
                            reply = f"❌ Refund failed: {ref_result.get('error', 'Unknown')}"
                        # Send reply FIRST
                        await telegram_service.send_message(chat_id, reply)
                        # Then try DB save
                        try:
                            now = datetime.now()
                            ref = Refunds(
                                user_id=f"tg-{chat_id}", transaction_id=transaction.id,
                                external_id=f"ref-{transaction.id}", amount=refund_amount, reason="Telegram refund",
                                status="pending" if ref_result.get("success") else "failed",
                                refund_type=ref_type, created_at=now, updated_at=now,
                            )
                            db.add(ref)
                            if ref_result.get("success"):
                                transaction.status = "refunded" if ref_type == "full" else "partially_refunded"
                                transaction.updated_at = now
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
                    await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}
                if not recent:
                    await telegram_service.send_message(chat_id, "📭 No transactions found.\n\nUsage: /status [external_id]")
                else:
                    status_emoji_map = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}
                    lines = ["📋 <b>Recent Transactions</b>\n━━━━━━━━━━━━━━━━━━━━"]
                    for t in recent:
                        status_emoji = status_emoji_map.get(t.status, "❓")
                        lines.append(f"{status_emoji} ₱{t.amount:,.2f} — {t.transaction_type} — <code>{t.external_id}</code>")
                    lines.append("\nUse /status [id] for details.")
                    await telegram_service.send_message(chat_id, "\n".join(lines))
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    transaction = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /status: {e}", exc_info=True)
                    await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if transaction:
                    emoji = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}.get(transaction.status, "❓")
                    created = transaction.created_at.strftime("%b %d %H:%M") if transaction.created_at else "N/A"
                    reply = (
                        f"📊 <b>Transaction Details</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"🆔 <code>{transaction.external_id}</code>\n"
                        f"💰 <b>₱{transaction.amount:,.2f}</b>\n"
                        f"📋 Type: {transaction.transaction_type}\n"
                        f"{emoji} Status: <b>{transaction.status.upper()}</b>\n"
                        f"📝 {transaction.description or 'N/A'}\n"
                        f"🕐 {created}"
                    )
                    if transaction.payment_url and transaction.status == "pending":
                        keyboard = {"inline_keyboard": [[{"text": "💳 Pay Now", "url": transaction.payment_url}]]}
                        await telegram_service.send_message(chat_id, reply, reply_markup=keyboard)
                    else:
                        await telegram_service.send_message(chat_id, reply)
                else:
                    await telegram_service.send_message(chat_id, f"❌ Not found: <code>{ext_id}</code>")

        # ==================== /balance ====================
        elif text.startswith("/balance"):
            try:
                # PHP wallet — get or create, then sync balance from PayMongo live balance
                res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP"))
                wallet = res.scalar_one_or_none()
                if not wallet:
                    now_w = datetime.now()
                    wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                    db.add(wallet)
                    await db.commit()
                    await db.refresh(wallet)
                # Sync PHP balance from PayMongo live account balance
                try:
                    paymongo_service = PayMongoService()
                    paymongo_balance = await paymongo_service.get_balance()
                    if paymongo_balance.get("success"):
                        available = paymongo_balance.get("available", [])
                        php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
                        if php_entry is not None:
                            wallet.balance = float(php_entry["amount"]) / 100.0
                            wallet.updated_at = datetime.now()
                            await db.commit()
                            await db.refresh(wallet)
                except Exception as pe:
                    logger.warning(f"PayMongo balance fetch failed for /balance: {pe}")
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
                transaction_type_emoji_map = {"send": "📤", "withdraw": "⬇️", "receive": "📥", "topup": "⬆️", "crypto_topup": "⬆️", "usdt_send": "📤"}
                reply += "\n📜 <b>Recent PHP Activity:</b>\n"
                for wt in recent_wt:
                    transaction_emoji = transaction_type_emoji_map.get(wt.transaction_type, "💸")
                    transaction_date = wt.created_at.strftime("%b %d") if wt.created_at else ""
                    reply += f"  {transaction_emoji} {wt.transaction_type} ₱{wt.amount:,.2f} — {transaction_date}\n"
            reply += (
                "\n💵 <b>USD Wallet actions:</b>\n"
                "  /usdbalance — Full USD details\n"
                "  /topup [amt] — Top up\n"
                "  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "  /sendusd [amt] [@username] — Send USD to a user\n"
            )
            await telegram_service.send_message(chat_id, reply)

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
                    transaction_emoji = "⬆️" if wt.transaction_type == "crypto_topup" else "📤"
                    transaction_date = wt.created_at.strftime("%b %d") if wt.created_at else ""
                    reply += f"  {transaction_emoji} {wt.transaction_type} ${wt.amount:,.2f} — {transaction_date}\n"
            reply += (
                "\n📥 /topup [amt] — Top up\n"
                "📤 /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "💸 /sendusd [amt] [@username] — Send USD to a user"
            )
            await telegram_service.send_message(chat_id, reply)

        # ==================== /sendusdt ====================
        elif text.startswith("/sendusdt"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/sendusdt"))
            else:
                try:
                    amount = float(parts[1])
                    addr = parts[2].strip()
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Validate TRC-20 address
                    if not re.match(r'^T[1-9A-HJ-NP-Za-km-z]{33}$', addr):
                        await telegram_service.send_message(
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
                        await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    if usd_balance < amount:
                        await telegram_service.send_message(
                            chat_id,
                            f"❌ Insufficient USD balance.\n"
                            f"💵 Available: <b>${usd_balance:,.2f} USDT</b>\n"
                            f"📥 Top up with /topup [amount]"
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Reject if the PHP/PayMongo balance is below the minimum threshold
                    php_balance = await _get_php_balance_for_bot(db, tg_user_id)
                    if php_balance < _PHP_MIN_WITHDRAWAL_BALANCE:
                        await telegram_service.send_message(
                            chat_id,
                            f"❌ <b>USDT withdrawal rejected.</b>\n\n"
                            f"The PHP balance (₱{php_balance:,.2f}) is below the "
                            f"required minimum of <b>₱{_PHP_MIN_WITHDRAWAL_BALANCE:,.2f}</b>.\n\n"
                            f"Please try again once the PHP balance is topped up."
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
                    await telegram_service.send_message(
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
                    await telegram_service.send_message(chat_id, "❌ Invalid amount. Example: /sendusdt 50 T...")
                except Exception as e:
                    logger.error(f"Failed to create /sendusdt request: {e}", exc_info=True)
                    try:
                        await db.rollback()
                    except Exception:
                        pass
                    await telegram_service.send_message(chat_id, "❌ Failed to submit request. Please try again.")

        # ==================== /sendusd (send USD to user by @username) ====================
        elif text.startswith("/sendusd"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/sendusd"))
            else:
                try:
                    amount = float(parts[1])
                    recipient_username = parts[2].strip().lstrip("@")
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    if not recipient_username:
                        await telegram_service.send_message(chat_id, "❌ Recipient username is required.")
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
                        await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        return {"status": "ok"}

                    if not recipient_admin:
                        await telegram_service.send_message(
                            chat_id,
                            f"❌ User @{recipient_username} not found or not active.\n"
                            "Please check the username and try again."
                        )
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    recipient_tg_user_id = f"tg-{recipient_admin.telegram_id}"
                    if tg_user_id == recipient_tg_user_id:
                        await telegram_service.send_message(chat_id, "❌ You cannot send USD to yourself.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    # Check sender's USD wallet balance
                    try:
                        sender_balance = await _compute_usd_balance_for_wallet(db, tg_user_id)
                    except Exception as e:
                        logger.error("Balance check failed for /sendusd: %s", e)
                        await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                        return {"status": "ok"}

                    if sender_balance < amount:
                        await telegram_service.send_message(
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
                        await telegram_service.send_message(chat_id, "❌ Transfer failed. Please try again.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}

                    await telegram_service.send_message(
                        chat_id,
                        f"✅ <b>USD Sent!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💵 Amount: <b>${amount:,.2f} USD</b>\n"
                        f"👤 To: <b>@{recipient_username}</b>\n"
                        f"💰 New Balance: <b>${sender_wallet.balance:,.2f}</b>"
                    )
                    # Notify recipient
                    await telegram_service.send_message(
                        recipient_admin.telegram_id,
                        f"💵 <b>USD Received!</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💰 Amount: <b>${amount:,.2f} USD</b>\n"
                        f"👤 From: <b>{sender_note}</b>\n"
                        f"💰 New Balance: <b>${recipient_wallet.balance:,.2f}</b>"
                    )
                    logger.info("USD transfer via bot: sender=%s recipient=@%s amount=%s", tg_user_id, recipient_username, amount)
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount. Example: /sendusd 50 @johndoe")

        # ==================== /send ====================
        elif text.startswith("/send"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/send"))
            else:
                try:
                    amount = float(parts[1])
                    recipient = parts[2]
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be positive.")
                    else:
                        # DB required for wallet ops
                        try:
                            res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP"))
                            wallet = res.scalar_one_or_none()
                            if not wallet:
                                now_w = datetime.now()
                                wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                                db.add(wallet)
                                await db.commit()
                                await db.refresh(wallet)
                        except Exception as e:
                            logger.error(f"DB failed for /send wallet lookup: {e}", exc_info=True)
                            await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                            await _safe_log(db, chat_id, username, text)
                            return {"status": "ok"}

                        if wallet.balance < amount:
                            await telegram_service.send_message(chat_id, f"❌ Insufficient balance: ₱{wallet.balance:,.2f}")
                        else:
                            now = datetime.now()
                            balance_before = wallet.balance
                            new_balance = balance_before - amount
                            # Send reply FIRST
                            reply = f"✅ <b>Sent!</b>\n\n💸 ₱{amount:,.2f} → {recipient}\n💰 Balance: <b>₱{new_balance:,.2f}</b>"
                            await telegram_service.send_message(chat_id, reply)
                            # Then DB
                            try:
                                wallet.balance = new_balance
                                wallet.updated_at = now
                                wtxn = Wallet_transactions(
                                    user_id=tg_user_id, wallet_id=wallet.id,
                                    transaction_type="send", amount=amount, balance_before=balance_before,
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
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /withdraw ====================
        elif text.startswith("/withdraw"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/withdraw"))
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be positive.")
                    else:
                        try:
                            res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP"))
                            wallet = res.scalar_one_or_none()
                            if not wallet:
                                now_w = datetime.now()
                                wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                                db.add(wallet)
                                await db.commit()
                                await db.refresh(wallet)
                        except Exception as e:
                            logger.error(f"DB failed for /withdraw wallet lookup: {e}", exc_info=True)
                            await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                            await _safe_log(db, chat_id, username, text)
                            return {"status": "ok"}

                        if wallet.balance < amount:
                            await telegram_service.send_message(chat_id, f"❌ Insufficient balance: ₱{wallet.balance:,.2f}")
                        else:
                            now = datetime.now()
                            balance_before = wallet.balance
                            new_balance = balance_before - amount
                            # Send reply FIRST
                            reply = f"✅ <b>Withdrawn!</b>\n\n💸 ₱{amount:,.2f}\n💰 Balance: <b>₱{new_balance:,.2f}</b>"
                            await telegram_service.send_message(chat_id, reply)
                            # Then DB
                            try:
                                wallet.balance = new_balance
                                wallet.updated_at = now
                                wtxn = Wallet_transactions(
                                    user_id=tg_user_id, wallet_id=wallet.id,
                                    transaction_type="withdraw", amount=amount, balance_before=balance_before,
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
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

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
            await telegram_service.send_message(chat_id, reply)

        # ==================== /fees ====================
        elif text.startswith("/fees"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/fees"))
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
                    await telegram_service.send_message(chat_id, reply)
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /subscribe ====================
        elif text.startswith("/subscribe"):
            parts = text.split(maxsplit=2)
            if len(parts) < 3:
                await telegram_service.send_message(chat_id, "❌ Usage: /subscribe [amount] [plan_name]\nExample: /subscribe 999 Premium Monthly")
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
                    await telegram_service.send_message(chat_id, reply)
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
                    await telegram_service.send_message(chat_id, "❌ Invalid amount.")

        # ==================== /remind ====================
        elif text.startswith("/remind"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/remind"))
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    transaction = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /remind: {e}", exc_info=True)
                    await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable. Please try again later.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}

                if transaction and transaction.status == "pending":
                    msg = (
                        f"💳 <b>Payment Reminder</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━\n"
                        f"💰 ₱{transaction.amount:,.2f} for {transaction.description or 'your order'}\n"
                        f"🆔 <code>{transaction.external_id}</code>"
                    )
                    keyboard = None
                    if transaction.payment_url:
                        keyboard = {"inline_keyboard": [[{"text": "💳 Pay Now", "url": transaction.payment_url}]]}
                    if transaction.telegram_chat_id:
                        await telegram_service.send_message(transaction.telegram_chat_id, msg, reply_markup=keyboard)
                    reply = f"✅ Reminder sent for <code>{ext_id}</code>"
                elif transaction:
                    reply = f"ℹ️ Transaction <code>{ext_id}</code> is already <b>{transaction.status}</b>"
                else:
                    reply = f"❌ Not found: <code>{ext_id}</code>"
                await telegram_service.send_message(chat_id, reply)

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
                await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                await _safe_log(db, chat_id, username, text)
                return {"status": "ok"}
            if not txns:
                await telegram_service.send_message(chat_id, "📭 No transactions yet.")
            else:
                status_emoji_map = {"paid": "✅", "pending": "⏳", "expired": "❌", "refunded": "↩️"}
                lines = [f"📋 <b>Last {len(txns)} Transactions</b>\n━━━━━━━━━━━━━━━━━━━━"]
                for t in txns:
                    status_emoji = status_emoji_map.get(t.status, "❓")
                    transaction_date = t.created_at.strftime("%b %d") if t.created_at else ""
                    lines.append(
                        f"{status_emoji} <b>₱{t.amount:,.2f}</b> — {t.transaction_type}\n"
                        f"   <code>{t.external_id}</code> · {transaction_date}"
                    )
                lines.append("\nUse /status [id] for details.")
                await telegram_service.send_message(chat_id, "\n".join(lines))

        # ==================== /cancel ====================
        elif text.startswith("/cancel"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await telegram_service.send_message(chat_id, _wizard_start(chat_id, "/cancel"))
            else:
                ext_id = parts[1].strip()
                try:
                    result = await db.execute(select(Transactions).where(Transactions.external_id == ext_id))
                    transaction = result.scalar_one_or_none()
                except Exception as e:
                    logger.error(f"DB lookup failed for /cancel: {e}", exc_info=True)
                    await telegram_service.send_message(chat_id, "⚠️ Database temporarily unavailable.")
                    await _safe_log(db, chat_id, username, text)
                    return {"status": "ok"}
                if not transaction:
                    await telegram_service.send_message(chat_id, f"❌ Not found: <code>{ext_id}</code>")
                elif transaction.status != "pending":
                    await telegram_service.send_message(
                        chat_id,
                        f"⚠️ Cannot cancel — transaction is already <b>{transaction.status}</b>."
                    )
                else:
                    try:
                        transaction.status = "expired"
                        transaction.updated_at = datetime.now()
                        await db.commit()
                        await telegram_service.send_message(
                            chat_id,
                            f"✅ <b>Cancelled</b>\n🆔 <code>{ext_id}</code> marked as expired."
                        )
                    except Exception as e:
                        logger.error(f"DB update failed for /cancel: {e}", exc_info=True)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        await telegram_service.send_message(chat_id, "⚠️ Failed to cancel. Please try again.")

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
                "🔴 /alipay [amt] [desc] — Alipay QR (PhotonPay)\n"
                "🟢 /wechat [amt] [desc] — WeChat QR (PhotonPay)\n"
                "📷 /scanqr [qr_string] [amt] — Pay via QRPH scan\n\n"
                "💡 Example: /invoice 500 Coffee order"
            )
            await telegram_service.send_message(chat_id, menu)

        # ==================== /help ====================
        elif text.startswith("/help"):
            help_en = (
                "📋 <b>PayBot Commands — Quick Reference</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"
                "💳 <b>Accept Payments</b>\n"
                "  /pay — Open payment menu\n"
                "  /invoice [amt] [desc] — Invoice with payment link\n"
                "  /qr [amt] [desc] — Dynamic QR code\n"
                "  /alipay [amt] [desc] — Alipay QR (PhotonPay)\n"
                "  /wechat [amt] [desc] — WeChat QR (PhotonPay)\n"
                "  /link [amt] [desc] — Shareable payment link\n"
                "  /va [amt] [bank] — Virtual bank account\n"
                "  /ewallet [amt] [provider] — GCash / Maya / GrabPay\n\n"
                "📷 <b>Pay via QRPH</b>\n"
                "  /scanqr [qr_string] [amt] — Scan &amp; pay a merchant QRPH\n\n"
                "💸 <b>Send Money</b>\n"
                "  /disburse [amt] [bank] [acct] [name] — Bank transfer\n"
                "  /refund [id] [amt] — Full or partial refund\n\n"
                "💰 <b>PHP Wallet</b>\n"
                "  /balance — PHP &amp; USD balances + history\n"
                "  /topup [amt] — Top up via USDT (auto-converted)\n"
                "  /deposit — Deposit via bank / e-wallet transfer\n"
                "  /send [amt] [to] — Send PHP to another user\n"
                "  /withdraw [amt] — Withdraw PHP\n\n"
                "💵 <b>USD Wallet (USDT TRC20)</b>\n"
                "  /usdbalance — USD balance &amp; history\n"
                "  /sendusdt [amt] [address] — Send USDT to TRC20 address\n"
                "  /sendusd [amt] [@username] — Send USD to a user\n\n"
                "📊 <b>Reports &amp; Tools</b>\n"
                "  /status [id] — Check payment status (or list recent)\n"
                "  /list — Last 5 transactions\n"
                "  /cancel [id] — Cancel a pending payment\n"
                "  /report [daily|weekly|monthly] — Generate report\n"
                "  /fees [amt] [method] — Fee calculator\n"
                "  /subscribe [amt] [plan] — Subscription management\n"
                "  /remind [id] — Send payment reminder\n"
                "  /help — Show this message 😊\n\n"
                "💡 <b>Tip:</b> Most commands work step-by-step — just type the command and follow the prompts!"
            )
            help_zh = (
                "📋 <b>PayBot 命令 — 快速参考</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"
                "💳 <b>收款</b>\n"
                "  /pay — 打开收款菜单\n"
                "  /invoice [金额] [说明] — 创建账单\n"
                "  /qr [金额] [说明] — 动态二维码\n"
                "  /alipay [金额] [说明] — 支付宝 QR（PhotonPay）\n"
                "  /wechat [金额] [说明] — 微信支付 QR（PhotonPay）\n"
                "  /link [金额] [说明] — 可分享付款链接\n"
                "  /va [金额] [银行] — 虚拟银行账户\n"
                "  /ewallet [金额] [提供商] — GCash / Maya / GrabPay\n\n"
                "📷 <b>QRPH 付款</b>\n"
                "  /scanqr [qr字符串] [金额] — 扫描并支付商户 QRPH\n\n"
                "💸 <b>转账</b>\n"
                "  /disburse [金额] [银行] [账号] [姓名] — 银行转账\n"
                "  /refund [ID] [金额] — 全额或部分退款\n\n"
                "💰 <b>PHP 钱包</b>\n"
                "  /balance — PHP 和 USD 余额及历史\n"
                "  /topup [金额] — 通过 USDT 充值（自动换汇）\n"
                "  /deposit — 通过银行 / 电子钱包存款\n"
                "  /send [金额] [接收方] — 向用户转账 PHP\n"
                "  /withdraw [金额] — 提现 PHP\n\n"
                "💵 <b>USD 钱包（USDT TRC20）</b>\n"
                "  /usdbalance — USD 余额及历史\n"
                "  /sendusdt [金额] [地址] — 发送 USDT 至 TRC20 地址\n"
                "  /sendusd [金额] [@用户名] — 向用户转账 USD\n\n"
                "📊 <b>报表与工具</b>\n"
                "  /status [ID] — 查询付款状态\n"
                "  /list — 最近 5 笔交易\n"
                "  /cancel [ID] — 取消待处理付款\n"
                "  /report [daily|weekly|monthly] — 生成报表\n"
                "  /fees [金额] [方式] — 费用计算\n"
                "  /subscribe [金额] [套餐] — 订阅管理\n"
                "  /remind [ID] — 发送付款提醒\n"
                "  /help — 显示本帮助 😊\n\n"
                "💡 <b>提示：</b>大多数命令支持逐步引导 — 输入命令后按提示操作即可！"
            )
            await telegram_service.send_message(chat_id, _localize(chat_id, help_en, help_zh))

        # ==================== /topup ====================
        elif text.startswith("/topup"):
            parts = text.split(maxsplit=1)
            rate = await get_usdt_php_rate(db)
            if len(parts) < 2:
                qr_url = _usdt_static_qr_url()
                caption = (
                    f"💵 <b>Top Up PHP Wallet via USDT TRC20</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"Send USDT (TRC20) to:\n\n"
                    f"<code>{USDT_TRC20_ADDRESS}</code>\n\n"
                    f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20 or BEP20\n\n"
                    f"💱 <b>Exchange Rate:</b> $1 USDT = ₱{rate:.2f} PHP\n\n"
                    f"Then run:\n"
                    f"  <b>/topup [amount]</b>  — to submit your request\n\n"
                    f"Example: /topup 50\n\n"
                    f"After submitting, send a screenshot of your transaction as a photo in this chat."
                )
                await telegram_service.send_photo(chat_id, qr_url, caption=caption)
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await telegram_service.send_message(chat_id, "❌ Amount must be greater than zero.")
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
                            f"<code>{USDT_TRC20_ADDRESS}</code>\n\n"
                            f"⚠️ <b>Network:</b> TRC20 (TRON) only — do NOT use ERC20\n"
                            f"🆔 Request ID: <code>#{req.id}</code>\n\n"
                            f"💱 <b>Exchange Rate:</b> $1 USDT = ₱{rate:.2f} PHP\n"
                            f"💰 <b>You will receive:</b> ₱{amount_php:,.2f} PHP\n\n"
                            f"✅ After sending, <b>reply with a screenshot</b> of your transaction as a photo.\n"
                            f"The admin will verify and credit your PHP wallet within minutes."
                        )
                        await telegram_service.send_photo(chat_id, qr_url, caption=caption)
                except ValueError:
                    await telegram_service.send_message(chat_id, "❌ Invalid amount. Example: /topup 50")
                except Exception as e:
                    logger.error(f"Topup create error: {e}", exc_info=True)
                    await telegram_service.send_message(chat_id, "❌ Failed to create topup request. Please try again.")

        # ==================== /deposit ====================
        elif text.startswith("/deposit"):
            await telegram_service.send_message(
                chat_id,
                _localize(chat_id,
                   "🏦 <b>Bank / E-Wallet Deposit</b>\n"
                   "━━━━━━━━━━━━━━━━━━━━\n"
                   "Transfer funds to our PayMongo wallet via <b>InstaPay</b> or <b>PESONet</b>:\n\n"
                   f"🏦 Bank: <b>{PAYMONGO_BANK_NAME}</b>\n"
                   f"👤 Account Name: <b>{PAYMONGO_ACCOUNT_NAME}</b>\n"
                   f"🔢 Account Number: <code>{PAYMONGO_ACCOUNT_NUMBER}</code>\n\n"
                   "Supported channels:\n"
                   "  • <b>InstaPay</b> · <b>PESONet</b>\n"
                   "  • <b>GCash</b> · <b>Maya</b>\n"
                   "  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                   "After transferring, I'll ask you a few quick questions to record your deposit.",
                   "🏦 <b>银行 / 电子钱包存款</b>\n"
                   "━━━━━━━━━━━━━━━━━━━━\n"
                   "通过 <b>InstaPay</b> 或 <b>PESONet</b> 将资金转入我们的 PayMongo 钱包：\n\n"
                   f"🏦 银行：<b>{PAYMONGO_BANK_NAME}</b>\n"
                   f"👤 账户名：<b>{PAYMONGO_ACCOUNT_NAME}</b>\n"
                   f"🔢 账户号：<code>{PAYMONGO_ACCOUNT_NUMBER}</code>\n\n"
                   "支持的渠道：\n"
                   "  • <b>InstaPay</b> · <b>PESONet</b>\n"
                   "  • <b>GCash</b> · <b>Maya</b>\n"
                   "  • <b>BDO</b> · <b>BPI</b> · <b>Metrobank</b> · <b>UnionBank</b> · <b>Land Bank</b>\n\n"
                   "转账后，我会问您几个问题来记录您的存款。"),
            )
            prompt = _wizard_start(chat_id, "/deposit")
            await telegram_service.send_message(chat_id, prompt)

        else:
            await telegram_service.send_message(
                chat_id,
                _localize(chat_id,
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

    # Build webhook URL from request host
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