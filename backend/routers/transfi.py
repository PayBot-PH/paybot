"""
TransFi Checkout API Router.

Endpoints
---------
POST /webhook  — Receive TransFi payment notifications (HMAC-SHA256 verified).
GET  /redirect/success — After-payment success landing page.
GET  /redirect/failed  — After-payment failure/cancel landing page.

Webhook processing
------------------
* Verifies the X-TransFi-Signature header (HMAC-SHA256) using TRANSFI_WEBHOOK_SECRET.
* On successful payment notifications, credits the user's PHP wallet and marks the
  transaction as paid.
* Idempotent — checks whether the transaction is already paid before crediting.

Configure the webhook in the TransFi merchant dashboard:
  URL : https://<your-domain>/api/v1/transfi/webhook
"""
import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.transactions import Transactions
from models.wallet_transactions import Wallet_transactions
from models.wallets import Wallets
from services.event_bus import payment_event_bus
from services.transfi_service import TransFiService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/transfi", tags=["transfi"])


# ---------- Helpers ----------

async def _credit_wallet(
    db: AsyncSession,
    user_id: str,
    amount: float,
    reference_id: str,
    pay_method: str,
) -> None:
    """Credit the PHP wallet for a paid TransFi transaction."""
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "PHP")
    )
    wallet = result.scalar_one_or_none()

    if wallet is None:
        wallet = Wallets(user_id=user_id, currency="PHP", balance=0.0)
        db.add(wallet)
        await db.flush()

    balance_before = float(wallet.balance or 0)
    wallet.balance = balance_before + amount
    wallet.updated_at = datetime.now()

    ledger = Wallet_transactions(
        user_id=user_id,
        wallet_id=wallet.id,
        transaction_type="credit",
        amount=amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        status="completed",
        reference_id=reference_id,
        note=f"TransFi {pay_method} payment",
        created_at=datetime.now(),
    )
    db.add(ledger)
    await db.commit()
    logger.info("Wallet credited +%s PHP for user=%s via TransFi (%s)", amount, user_id, pay_method)

    try:
        payment_event_bus.publish({
            "event": "payment_received",
            "provider": "transfi",
            "pay_method": pay_method,
            "amount": amount,
            "currency": "PHP",
            "user_id": user_id,
            "reference_id": reference_id,
        })
    except Exception:
        pass


# ---------- Routes ----------

@router.post("/webhook")
async def transfi_webhook(
    request: Request,
    x_transfi_signature: Optional[str] = Header(None, alias="X-TransFi-Signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and process TransFi payment notification webhooks.

    TransFi signs the request body with HMAC-SHA256 using the webhook secret.
    Set TRANSFI_WEBHOOK_SECRET to enable signature verification.

    Expected JSON body fields:
      reqId         — Merchant order ID (matches Transactions.external_id)
      invoiceId     — TransFi invoice ID
      status        — "paid" | "completed" | "success" | "failed" | "cancelled"
      amount        — Amount paid
      currency      — Currency code
      payMethod     — "Alipay" | "WeChat"
    """
    raw_body = await request.body()

    svc = TransFiService()

    # Determine whether signature verification is required.
    verify_required_raw = os.environ.get("TRANSFI_WEBHOOK_VERIFY_REQUIRED", "true").strip().lower()
    verify_required = verify_required_raw not in ("false", "0", "no", "off")

    if not x_transfi_signature:
        if verify_required and svc.webhook_secret:
            logger.warning("TransFi webhook: X-TransFi-Signature header missing — rejected")
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        else:
            logger.warning("TransFi webhook: X-TransFi-Signature header missing — proceeding")
    else:
        if svc.webhook_secret and not svc.verify_webhook_signature(raw_body, x_transfi_signature):
            logger.warning("TransFi webhook: invalid X-TransFi-Signature — rejected")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        logger.error("TransFi webhook: non-JSON body received")
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    logger.info(
        "TransFi webhook received: %s",
        json.dumps(payload, ensure_ascii=False)[:500],
    )

    # Extract key fields — support both camelCase and snake_case
    req_id = (
        payload.get("reqId")
        or payload.get("req_id")
        or payload.get("merchantOrderId")
        or payload.get("merchant_order_id")
        or ""
    )
    invoice_id = (
        payload.get("invoiceId")
        or payload.get("invoice_id")
        or payload.get("transactionId")
        or payload.get("transaction_id")
        or ""
    )
    status_raw = (
        payload.get("status")
        or payload.get("payStatus")
        or payload.get("orderStatus")
        or ""
    ).lower()
    amount_raw = payload.get("amount") or payload.get("payAmount") or 0
    currency = payload.get("currency") or payload.get("payCurrency") or "PHP"
    pay_method = payload.get("payMethod") or payload.get("pay_method") or "unknown"

    try:
        amount = float(amount_raw)
    except (ValueError, TypeError):
        amount = 0.0

    is_success = status_raw in ("paid", "completed", "success", "succeed")
    is_failed = status_raw in ("failed", "failure", "cancelled", "canceled", "closed", "expired")

    # Look up the pending transaction by external_id (our req_id)
    txn_result = await db.execute(
        select(Transactions).where(Transactions.external_id == req_id)
    )
    txn = txn_result.scalar_one_or_none()

    if txn is None and invoice_id:
        # Fall back: look up by TransFi invoice ID stored in xendit_id column
        txn_result = await db.execute(
            select(Transactions).where(Transactions.xendit_id == invoice_id)
        )
        txn = txn_result.scalar_one_or_none()

    if txn is None:
        logger.warning(
            "TransFi webhook: no transaction found for reqId=%s invoiceId=%s",
            req_id,
            invoice_id,
        )
        # Return 200 to prevent TransFi from retrying for unknown orders
        return {"status": "ok", "message": "transaction not found — acknowledged"}

    if is_success:
        if txn.status == "paid":
            logger.info("TransFi webhook: transaction %s already paid — skipping", txn.id)
            return {"status": "ok", "message": "already processed"}

        # Update transaction record
        txn.status = "paid"
        txn.xendit_id = invoice_id or txn.xendit_id
        txn.updated_at = datetime.now()
        await db.flush()

        # Credit the wallet
        credit_amount = float(txn.amount) if txn.amount else amount
        await _credit_wallet(
            db,
            user_id=txn.user_id,
            amount=credit_amount,
            reference_id=req_id or invoice_id,
            pay_method=pay_method,
        )

        # Notify Telegram user if chat_id is stored
        if txn.telegram_chat_id:
            try:
                from services.telegram_service import TelegramService
                tg = TelegramService()
                await tg.send_message(
                    txn.telegram_chat_id,
                    f"✅ <b>Payment received!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"💰 <b>+₱{credit_amount:,.2f} PHP</b> credited to your wallet\n"
                    f"💳 via {pay_method}\n"
                    f"🆔 <code>{req_id}</code>",
                )
            except Exception as e:
                logger.warning("TransFi webhook: Telegram notify failed: %s", e)

    elif is_failed:
        txn.status = "failed"
        txn.updated_at = datetime.now()
        await db.commit()
        logger.info("TransFi webhook: payment failed for reqId=%s", req_id)

        if txn.telegram_chat_id:
            try:
                from services.telegram_service import TelegramService
                tg = TelegramService()
                await tg.send_message(
                    txn.telegram_chat_id,
                    f"❌ <b>Payment failed</b> ({pay_method})\n"
                    f"🆔 <code>{req_id}</code>\n"
                    f"Please try again with /alipay or /wechat.",
                )
            except Exception:
                pass
    else:
        logger.info("TransFi webhook: unhandled status '%s' for reqId=%s", status_raw, req_id)

    return {"status": "ok"}


@router.get("/redirect/success", response_class=HTMLResponse)
async def redirect_success():
    """Landing page after successful TransFi payment."""
    return HTMLResponse(content="""
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Payment Successful</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#0f172a;color:#fff;text-align:center;}
.box{padding:2rem;}.icon{font-size:4rem;}.title{font-size:1.5rem;font-weight:700;margin:.5rem 0;}
.sub{color:#94a3b8;font-size:.9rem;}</style></head>
<body><div class="box">
<div class="icon">✅</div>
<div class="title">Payment Successful!</div>
<div class="sub">Your wallet has been credited. Return to Telegram to check your balance.</div>
</div></body></html>
""")


@router.get("/redirect/failed", response_class=HTMLResponse)
async def redirect_failed():
    """Landing page after failed or cancelled TransFi payment."""
    return HTMLResponse(content="""
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Payment Failed</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#0f172a;color:#fff;text-align:center;}
.box{padding:2rem;}.icon{font-size:4rem;}.title{font-size:1.5rem;font-weight:700;margin:.5rem 0;}
.sub{color:#94a3b8;font-size:.9rem;}</style></head>
<body><div class="box">
<div class="icon">❌</div>
<div class="title">Payment Failed or Cancelled</div>
<div class="sub">Please return to Telegram and try again using /alipay or /wechat.</div>
</div></body></html>
""")
