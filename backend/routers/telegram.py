import logging
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
from services.telegram_service import TelegramService
from services.xendit_service import XenditService
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


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


@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive Telegram bot updates (no auth required).

    Design principle: ALWAYS send the Telegram reply FIRST, then attempt
    database operations in a separate try/except so that DB failures
    never prevent the bot from responding to the user.
    """
    try:
        body = await request.json()
        logger.info(f"Telegram webhook received: {body}")

        message = body.get("message", {})
        if not message:
            return {"status": "ok"}

        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        username = message.get("from", {}).get("username", "unknown")

        if not text or not chat_id:
            return {"status": "ok"}

        tg = TelegramService()
        tg_user_id = f"tg-{chat_id}"

        # ==================== /start ====================
        if text.startswith("/start"):
            welcome = (
                "🤖 <b>Welcome to PayBot!</b>\n\n"
                "Your complete Xendit payment gateway bot.\n\n"
                "💳 <b>Payment Commands:</b>\n"
                "/invoice [amount] [desc] - Create invoice\n"
                "/qr [amount] [desc] - QR code payment\n"
                "/link [amount] [desc] - Payment link\n"
                "/va [amount] [bank] - Virtual account\n"
                "/ewallet [amount] [provider] - E-wallet charge\n\n"
                "💸 <b>Money Out:</b>\n"
                "/disburse [amount] [bank] [account] - Send money\n"
                "/refund [payment_id] [amount] - Process refund\n\n"
                "📊 <b>Management:</b>\n"
                "/status [id] - Check payment status\n"
                "/balance - Wallet balance\n"
                "/send [amount] [recipient] - Send from wallet\n"
                "/withdraw [amount] - Withdraw from wallet\n"
                "/report [daily|weekly|monthly] - Reports\n"
                "/fees [amount] [method] - Calculate fees\n"
                "/subscribe [amount] [plan] - Create subscription\n"
                "/remind [payment_id] - Send reminder\n"
                "/help - Show all commands"
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
                    description = parts[2] if len(parts) > 2 else "Invoice payment"
                    xendit = XenditService()
                    result = await xendit.create_invoice(amount=amount, description=description)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Invoice Created!</b>\n\n💰 Amount: ₱{amount:,.2f}\n📝 {description}\n"
                            f"🔗 Pay: {result.get('invoice_url', '')}\n🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        # Send reply FIRST
                        await tg.send_message(chat_id, reply)
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

        # ==================== /link ====================
        elif text.startswith("/link"):
            parts = text.split(maxsplit=2)
            if len(parts) < 2:
                await tg.send_message(chat_id, "❌ Usage: /link [amount] [description]")
            else:
                try:
                    amount = float(parts[1])
                    description = parts[2] if len(parts) > 2 else "Payment link"
                    xendit = XenditService()
                    result = await xendit.create_payment_link(amount=amount, description=description)
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Payment Link Created!</b>\n\n💰 ₱{amount:,.2f}\n📝 {description}\n"
                            f"🔗 {result.get('payment_link_url', '')}\n🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply)
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
            parts = text.split(maxsplit=3)
            if len(parts) < 4:
                await tg.send_message(chat_id, "❌ Usage: /disburse [amount] [bank_code] [account_number]\nExample: /disburse 500 BDO 1234567890")
            else:
                try:
                    amount = float(parts[1])
                    bank_code = parts[2].upper()
                    account_number = parts[3]
                    xendit = XenditService()
                    result = await xendit.create_disbursement(
                        amount=amount, bank_code=bank_code,
                        account_number=account_number, account_name=username,
                        description=f"Disbursement via Telegram by @{username}",
                    )
                    if result.get("success"):
                        reply = (
                            f"✅ <b>Disbursement Created!</b>\n\n💸 ₱{amount:,.2f}\n🏦 {bank_code}\n"
                            f"🔢 {account_number}\n🆔 <code>{result.get('external_id', '')}</code>"
                        )
                        await tg.send_message(chat_id, reply)
                        try:
                            now = datetime.now()
                            disb = Disbursements(
                                user_id="telegram", external_id=result.get("external_id", ""),
                                xendit_id=result.get("disbursement_id", ""), amount=amount, currency="PHP",
                                bank_code=bank_code, account_number=account_number, account_name=username,
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
                        await tg.send_message(chat_id, f"❌ Failed: {result.get('error', 'Unknown error')}")
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
                    refund_amount = float(parts[2]) if len(parts) > 2 else txn.amount
                    if refund_amount > txn.amount:
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
                await tg.send_message(chat_id, "❌ Usage: /status [external_id]")
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
                    reply = (
                        f"📊 <b>Transaction Status</b>\n\n🆔 <code>{txn.external_id}</code>\n"
                        f"💰 ₱{txn.amount:,.2f}\n📋 {txn.transaction_type}\n{emoji} <b>{txn.status.upper()}</b>\n"
                        f"📝 {txn.description or 'N/A'}"
                    )
                else:
                    reply = f"❌ Not found: {ext_id}"
                await tg.send_message(chat_id, reply)

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
            except Exception as e:
                logger.error(f"DB failed for /balance: {e}", exc_info=True)
                balance = 0.0
                currency = "PHP"
                try:
                    await db.rollback()
                except Exception:
                    pass

            reply = (
                f"💰 <b>Wallet Balance</b>\n\n💵 <b>₱{balance:,.2f}</b>\n💱 {currency}\n\n"
                f"/send [amount] [recipient] - Send\n/withdraw [amount] - Withdraw"
            )
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
                    msg = f"💳 <b>Payment Reminder</b>\n\n₱{txn.amount:,.2f} for {txn.description or 'your order'}"
                    if txn.payment_url:
                        msg += f"\n🔗 Pay: {txn.payment_url}"
                    if txn.telegram_chat_id:
                        await tg.send_message(txn.telegram_chat_id, msg)
                    reply = f"✅ Reminder sent for {ext_id}"
                elif txn:
                    reply = f"ℹ️ Transaction {ext_id} is already {txn.status}"
                else:
                    reply = f"❌ Not found: {ext_id}"
                await tg.send_message(chat_id, reply)

        # ==================== /pay (interactive menu) ====================
        elif text.startswith("/pay"):
            menu = (
                "💳 <b>Payment Menu</b>\n\n"
                "Choose a payment method:\n\n"
                "📄 /invoice [amount] [desc] - Invoice\n"
                "📱 /qr [amount] [desc] - QR Code\n"
                "🔗 /link [amount] [desc] - Payment Link\n"
                "🏦 /va [amount] [bank] - Virtual Account\n"
                "📲 /ewallet [amount] [provider] - E-Wallet\n\n"
                "💡 Example: /invoice 500 Coffee order"
            )
            await tg.send_message(chat_id, menu)

        # ==================== /help ====================
        elif text.startswith("/help"):
            help_text = (
                "📋 <b>PayBot Commands</b>\n\n"
                "💳 <b>Payments:</b>\n"
                "/pay - Payment menu\n"
                "/invoice [amt] [desc] - Invoice\n"
                "/qr [amt] [desc] - QR Code\n"
                "/link [amt] [desc] - Payment Link\n"
                "/va [amt] [bank] - Virtual Account\n"
                "/ewallet [amt] [provider] - E-Wallet\n\n"
                "💸 <b>Money Out:</b>\n"
                "/disburse [amt] [bank] [acct] - Disburse\n"
                "/refund [id] [amt] - Refund\n\n"
                "💰 <b>Wallet:</b>\n"
                "/balance - Check balance\n"
                "/send [amt] [to] - Send money\n"
                "/withdraw [amt] - Withdraw\n\n"
                "📊 <b>Tools:</b>\n"
                "/status [id] - Payment status\n"
                "/report [period] - Reports\n"
                "/fees [amt] [method] - Fees\n"
                "/subscribe [amt] [plan] - Subscribe\n"
                "/remind [id] - Send reminder\n"
                "/help - This message"
            )
            await tg.send_message(chat_id, help_text)

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
    from services.telegram_service import _resolve_bot_token
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
        from services.telegram_service import _resolve_bot_token
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