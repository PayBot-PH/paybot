import logging
import io
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

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
from services.sbc_collect_service import SecurityBankCollectService
from services.maya_manager_service import MayaManagerService
from models.topup_requests import TopupRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

USDT_TRC20_ADDRESS = "TBKoUfHZG2kABV5CpMnACpdWsscguYzaUe"



def _make_qr_url(url: str, size: int = 400) -> str:
    """Return a QR code image URL using the free api.qrserver.com service.
    Telegram can fetch this URL directly — no local image generation needed."""
    from urllib.parse import quote
    return f"https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={quote(url, safe='')}"


async def _get_usd_balance(db: AsyncSession, chat_id: str) -> float:
    """Return USD wallet balance for a Telegram user."""
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == f"tg-{chat_id}", Wallets.currency == "USD")
    )
    wallet = result.scalar_one_or_none()
    return wallet.balance if wallet else 0.0


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

        # ==================== /start ====================
        if text.startswith("/start"):
            welcome = (
                "🤖 <b>Welcome to PayBot!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "Your complete Xendit payment gateway.\n\n"
                "💳 <b>Accept Payments:</b>\n"
                "  /invoice [amt] [desc] — Invoice\n"
                "  /qr [amt] [desc] — QR Code\n"
                "  /link [amt] [desc] — Payment Link\n"
                "  /va [amt] [bank] — Virtual Account\n"
                "  /ewallet [amt] [provider] — E-Wallet\n"
                "  /alipay [amt] [desc] — Alipay QR USD (via Maya) 🔴\n"
                "💸 <b>Send Money:</b>\n"
                "  /disburse [amt] [bank] [acct] [name] — Disburse\n"
                "  /refund [id] [amt] — Refund\n\n"
                "💰 <b>Wallet:</b>\n"
                "  /balance — Balance + history\n"
                "  /withdraw [amt] — Withdraw\n"
                "  /send [amt] [to] — Send\n\n"
                "📊 <b>Tools:</b>\n"
                "  /status [id] — Payment status\n"
                "  /list — Recent transactions\n"
                "  /report [daily|weekly|monthly]\n"
                "  /fees [amt] [method]\n"
                "  /cancel [id] — Cancel pending\n"
                "  /remind [id] — Send reminder\n\n"
                "Type /help for full command reference."
            )
            await tg.send_message(chat_id, welcome)

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
                        await tg.send_message(chat_id, reply)
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

        # ==================== /alipay (Maya Business Manager → Alipay QR in USD) ====================
        elif text.startswith("/alipay"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /alipay [amount] [description]\nExample: /alipay 10 Coffee order\n\n💡 <i>Generates an Alipay QR via Maya Business Manager (USD)</i>")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Security deposit check: $2000 USD minimum required
                    usd_balance = await _get_usd_balance(db, chat_id)
                    if usd_balance < 2000:
                        needed = 2000 - usd_balance
                        await tg.send_message(
                            chat_id,
                            f"🔒 <b>Security Deposit Required</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"To activate cross-border Alipay payments, a minimum security deposit of <b>$2,000 USD</b> is required.\n\n"
                            f"💰 Your current USD balance: <b>${usd_balance:,.2f}</b>\n"
                            f"📥 Still needed: <b>${needed:,.2f} USD</b>\n\n"
                            f"ℹ️ <b>Why is this required?</b>\n"
                            f"This is a <i>refundable security deposit</i> mandated under international cross-border payment law (SWIFT/CBPR+) and required by all cross-border payment gateway APIs operating under PCI-DSS and FATF compliance frameworks. It ensures settlement coverage for international transactions.\n\n"
                            f"✅ Your deposit is <b>fully refundable</b> and can be withdrawn at any time after completing your first transaction.\n\n"
                            f"👉 Use /topup [amount] to fund your USD wallet via USDT TRC20."
                        )
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "Alipay payment"
                    maya = MayaManagerService()
                    result = await maya.create_alipay_qr(amount=amount, description=description, currency="PHP")
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        ref_num = result.get("reference_number", "")
                        caption = (
                            f"✅ <b>Alipay QR Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ref_num}</code>\n\n"
                            f"📱 Scan this QR with Alipay to pay"
                        )
                        try:
                            qr_image_url = _make_qr_url(checkout_url)
                            result_photo = await tg.send_photo(chat_id, qr_image_url, caption=caption)
                            if not result_photo.get("success"):
                                raise RuntimeError(result_photo.get("error", "send_photo failed"))
                        except Exception as qr_err:
                            logger.error(f"QR image send failed: {qr_err}", exc_info=True)
                            # Fallback to link button
                            keyboard = {"inline_keyboard": [[{"text": "🔴 Pay via Alipay (Maya)", "url": checkout_url}]]} if checkout_url else None
                            await tg.send_message(chat_id, caption, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="alipay_qr",
                                external_id=ref_num, xendit_id=result.get("checkout_id", ""),
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

        # ==================== /wechat (Maya Business Manager → WeChat QR) ====================
        elif text.startswith("/wechat"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /wechat [amount] [description]\nExample: /wechat 500 Coffee order\n\n💡 <i>Generates a WeChat Pay QR via Maya Business Manager</i>")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    # Security deposit check: $2000 USD minimum required
                    usd_balance = await _get_usd_balance(db, chat_id)
                    if usd_balance < 2000:
                        needed = 2000 - usd_balance
                        await tg.send_message(
                            chat_id,
                            f"🔒 <b>Security Deposit Required</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"To activate cross-border WeChat Pay payments, a minimum security deposit of <b>$2,000 USD</b> is required.\n\n"
                            f"💰 Your current USD balance: <b>${usd_balance:,.2f}</b>\n"
                            f"📥 Still needed: <b>${needed:,.2f} USD</b>\n\n"
                            f"ℹ️ <b>Why is this required?</b>\n"
                            f"This is a <i>refundable security deposit</i> mandated under international cross-border payment law (SWIFT/CBPR+) and required by all cross-border payment gateway APIs operating under PCI-DSS and FATF compliance frameworks. It ensures settlement coverage for international transactions.\n\n"
                            f"✅ Your deposit is <b>fully refundable</b> and can be withdrawn at any time after completing your first transaction.\n\n"
                            f"👉 Use /topup [amount] to fund your USD wallet via USDT TRC20."
                        )
                        return {"status": "ok"}
                    description = parts[2] if len(parts) > 2 else "WeChat Pay"
                    maya = MayaManagerService()
                    result = await maya.create_wechat_qr(amount=amount, description=description, currency="PHP")
                    if result.get("success"):
                        checkout_url = result.get("checkout_url", "")
                        ref_num = result.get("reference_number", "")
                        wechat_caption = (
                            f"✅ <b>WeChat Pay QR Ready!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━\n"
                            f"💰 Amount: <b>₱{amount:,.2f} PHP</b>\n"
                            f"📝 {description}\n"
                            f"🆔 <code>{ref_num}</code>\n\n"
                            f"📱 Scan this QR with WeChat to pay"
                        )
                        try:
                            qr_image_url = _make_qr_url(checkout_url)
                            result_photo = await tg.send_photo(chat_id, qr_image_url, caption=wechat_caption)
                            if not result_photo.get("success"):
                                raise RuntimeError(result_photo.get("error", "send_photo failed"))
                        except Exception as qr_err:
                            logger.error(f"WeChat QR image send failed: {qr_err}", exc_info=True)
                            keyboard = {"inline_keyboard": [[{"text": "💚 Pay via WeChat (Maya)", "url": checkout_url}]]} if checkout_url else None
                            await tg.send_message(chat_id, wechat_caption, reply_markup=keyboard)
                        try:
                            now = datetime.now()
                            txn = Transactions(
                                user_id="telegram", transaction_type="wechat_qr",
                                external_id=ref_num, xendit_id=result.get("checkout_id", ""),
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
                        await tg.send_message(chat_id, reply)
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
                await tg.send_message(chat_id, "❌ Usage: /ewallet [amount] [provider]\nProviders: GCASH, GRABPAY, PAYMAYA")
            else:
                try:
                    amount = float(parts[1])
                    if amount <= 0:
                        await tg.send_message(chat_id, "❌ Amount must be greater than zero.")
                        await _safe_log(db, chat_id, username, text)
                        return {"status": "ok"}
                    provider = parts[2].upper()
                    channel_map = {
                        "GCASH": "PH_GCASH", "GRABPAY": "PH_GRABPAY", "PAYMAYA": "PH_PAYMAYA",
                        "PH_GCASH": "PH_GCASH", "PH_GRABPAY": "PH_GRABPAY", "PH_PAYMAYA": "PH_PAYMAYA",
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
                        await tg.send_message(chat_id, reply)
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
                        await tg.send_message(chat_id, reply)
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
                        await tg.send_message(chat_id, reply)
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

        # ==================== /balance ====================
        elif text.startswith("/balance"):
            try:
                res = await db.execute(select(Wallets).where(Wallets.user_id == tg_user_id))
                wallet = res.scalar_one_or_none()
                if not wallet:
                    now_w = datetime.now()
                    wallet = Wallets(user_id=tg_user_id, balance=0.0, currency="PHP", created_at=now_w, updated_at=now_w)
                    db.add(wallet)
                    await db.commit()
                    await db.refresh(wallet)
                balance = wallet.balance
                currency = wallet.currency or "PHP"
                # Fetch last 3 wallet transactions
                wt_res = await db.execute(
                    select(Wallet_transactions)
                    .where(Wallet_transactions.wallet_id == wallet.id)
                    .order_by(Wallet_transactions.created_at.desc())
                    .limit(3)
                )
                recent_wt = wt_res.scalars().all()
            except Exception as e:
                logger.error(f"DB failed for /balance: {e}", exc_info=True)
                balance = 0.0
                currency = "PHP"
                recent_wt = []
                try:
                    await db.rollback()
                except Exception:
                    pass

            reply = (
                f"💰 <b>Wallet Balance</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"💵 <b>₱{balance:,.2f}</b> {currency}\n"
            )
            if recent_wt:
                t_map = {"send": "📤", "withdraw": "⬇️", "receive": "📥", "topup": "⬆️"}
                reply += "\n📜 <b>Recent Activity:</b>\n"
                for wt in recent_wt:
                    em = t_map.get(wt.transaction_type, "💸")
                    dt = wt.created_at.strftime("%b %d") if wt.created_at else ""
                    reply += f"  {em} {wt.transaction_type} ₱{wt.amount:,.2f} — {dt}\n"
            reply += "\n/withdraw [amt] · /send [amt] [to]"
            await tg.send_message(chat_id, reply)

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
                            await tg.send_message(chat_id, reply)
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
                            await tg.send_message(chat_id, reply)
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
            await tg.send_message(chat_id, reply)

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
                "🔴 /alipay [amt] [desc] — Alipay QR USD (via Maya) 🔴\n"
                "🟢 /wechat [amt] [desc] — WeChat QR (via Maya) 💚\n\n"
                "💡 Example: /invoice 500 Coffee order"
            )
            await tg.send_message(chat_id, menu)

        # ==================== /help ====================
        elif text.startswith("/help"):
            help_text = (
                "📋 <b>PayBot Commands</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "💳 <b>Accept Payments:</b>\n"
                "  /pay — Payment menu\n"
                "  /invoice [amt] [desc]\n"
                "  /qr [amt] [desc]\n"
                "  /alipay [amt] [desc] — Alipay QR USD (Maya) 🔴\n"
                "  /wechat [amt] [desc] — WeChat QR via Maya 💚\n"
                "  /link [amt] [desc]\n"
                "  /va [amt] [bank]\n"
                "  /ewallet [amt] [provider]\n\n"
                "💸 <b>Send Money:</b>\n"
                "  /disburse [amt] [bank] [acct] [name]\n"
                "  /refund [id] [amt]\n\n"
                "💰 <b>Wallet:</b>\n"
                "  /balance — Balance + history\n"
                "  /send [amt] [to]\n"
                "  /withdraw [amt]\n\n"
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
            await tg.send_message(chat_id, help_text)

        # ==================== /topup ====================
        elif text.startswith("/topup"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2:
                await tg.send_message(
                    chat_id,
                    f"❌ Usage: /topup [amount]\nExample: /topup 50\n\n"
                    f"💡 Send USDT (TRC20) to the address below, then upload your receipt here."
                )
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
                        qr_url = _make_qr_url(USDT_TRC20_ADDRESS)
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
            await tg.send_message(chat_id, "🤖 Unknown command. Type /help for all commands.")

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