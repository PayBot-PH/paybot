"""
PhotonPay API Router.

Endpoints
---------
POST /alipay-session  — Create an Alipay cashier payment session (returns checkout URL).
POST /wechat-session  — Create a WeChat Pay cashier session (returns checkout URL).
POST /webhook         — Receive PhotonPay payment notifications (RSA-signature verified).
GET  /redirect/success — After-payment success landing page.
GET  /redirect/failed  — After-payment failure/cancel landing page.

Webhook processing
------------------
* Verifies the X-PD-SIGN header (MD5withRSA) using PhotonPay's RSA public key.
* On successful payment notifications (status == "succeed" / "success"), credits
  the user's PHP wallet and marks the transaction as paid.
* Idempotent — checks whether the transaction is already paid before crediting.

Configure the webhook in the PhotonPay merchant portal
  (Settings > Developer > Notify URL):
  URL : https://paybot-backend-production-84b2.up.railway.app/api/v1/photonpay/webhook
"""
import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from models.wallet_topups import WalletTopup
from models.wallet_transactions import Wallet_transactions
from models.wallets import Wallets
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.paymongo_service import PayMongoService
from services.photonpay_service import PhotonPayService
from services.xendit_service import XenditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/photonpay", tags=["photonpay"])


# ---------- Schemas ----------

class AlipaySessionRequest(BaseModel):
    amount: float
    currency: str = "PHP"
    description: str = "Alipay payment"
    success_url: Optional[str] = None
    notify_url: Optional[str] = None


class WeChatSessionRequest(BaseModel):
    amount: float
    currency: str = "PHP"
    description: str = "WeChat Pay payment"
    success_url: Optional[str] = None
    notify_url: Optional[str] = None


# ---------- Helpers ----------

async def _credit_wallet(
    db: AsyncSession,
    user_id: str,
    amount: float,
    reference_id: str,
    pay_method: str,
) -> None:
    """Credit the PHP wallet for a paid PhotonPay transaction."""
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
        note=f"PhotonPay {pay_method} payment",
        created_at=datetime.now(),
    )
    db.add(ledger)
    await db.commit()
    logger.info("Wallet credited +%s PHP for user=%s via PhotonPay (%s)", amount, user_id, pay_method)

    try:
        payment_event_bus.publish({
            "event": "payment_received",
            "provider": "photonpay",
            "pay_method": pay_method,
            "amount": amount,
            "currency": "PHP",
            "user_id": user_id,
            "reference_id": reference_id,
        })
    except Exception:
        pass


# ---------- Routes ----------

@router.post("/alipay-session")
async def create_alipay_session(
    req: AlipaySessionRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an Alipay cashier session via PhotonPay.
    Falls back to PayMongo then Xendit when PhotonPay is not configured or
    when the PhotonPay auth request is rejected (e.g. wrong credentials).
    Returns a checkout_url the user opens to pay via Alipay QR.
    PHP wallet is credited automatically when the webhook confirms payment.
    """
    svc = PhotonPayService()
    backend_url = ""
    try:
        from core.config import settings
        backend_url = settings.backend_url
    except Exception:
        pass

    if not svc.is_configured:
        photonpay_result = None
    else:
        notify_url = req.notify_url or f"{backend_url}/api/v1/photonpay/webhook"
        redirect_url = req.success_url or f"{backend_url}/api/v1/photonpay/redirect/success"
        photonpay_result = await svc.create_alipay_session(
            amount=req.amount,
            currency=req.currency,
            description=req.description,
            notify_url=notify_url,
            redirect_url=redirect_url,
            shopper_id=str(current_user.id),
        )
        if not photonpay_result.get("success"):
            logger.warning("PhotonPay Alipay failed (%s), trying PayMongo fallback", photonpay_result.get("error", ""))
            photonpay_result = None  # fall through to PayMongo fallback

    if photonpay_result is None:
        # Fallback: try PayMongo Alipay source
        pm_svc = PayMongoService()
        if pm_svc.secret_key:
            pm_result = await pm_svc.create_alipay_qr(
                amount=req.amount,
                description=req.description,
                success_url=f"{backend_url}/api/v1/paymongo/redirect/success",
                failed_url=f"{backend_url}/api/v1/paymongo/redirect/failed",
            )
            if pm_result.get("success"):
                source_id = pm_result.get("source_id", "")
                reference_number = pm_result.get("reference_number", "")
                checkout_url = pm_result.get("checkout_url", "")
                now = datetime.now()
                topup = WalletTopup(
                    user_id=str(current_user.id),
                    amount=req.amount,
                    currency="PHP",
                    paymongo_source_id=source_id,
                    reference_number=reference_number,
                    payment_method="alipay",
                    status="pending",
                    description=req.description,
                    checkout_url=checkout_url,
                    created_at=now,
                    updated_at=now,
                )
                db.add(topup)
                txn = Transactions(
                    user_id=str(current_user.id),
                    transaction_type="alipay_qr",
                    external_id=reference_number,
                    xendit_id=source_id,
                    amount=req.amount,
                    currency="PHP",
                    status="pending",
                    description=req.description,
                    qr_code_url=checkout_url,
                    created_at=now,
                    updated_at=now,
                )
                db.add(txn)
                await db.commit()
                return {
                    "success": True,
                    "checkout_url": checkout_url,
                    "req_id": reference_number,
                    "amount": req.amount,
                    "currency": req.currency,
                    "pay_method": "Alipay",
                    "message": "Alipay session created via PayMongo. Open the URL and scan QR to pay — wallet credited automatically.",
                }
            else:
                logger.warning("PayMongo Alipay failed (%s), trying Xendit fallback", pm_result.get("error", ""))

        # Final fallback: Xendit Alipay QR
        xendit_svc = XenditService()
        if not xendit_svc.secret_key:
            raise HTTPException(
                status_code=503,
                detail="Alipay payments are not available: no payment provider (PhotonPay, PayMongo, Xendit) is configured. Contact the administrator.",
            )
        xendit_result = await xendit_svc.create_alipay_qr(
            amount=req.amount,
            description=req.description,
        )
        if not xendit_result.get("success"):
            raise HTTPException(status_code=502, detail=xendit_result.get("error", "Xendit error"))
        xendit_external_id = xendit_result.get("external_id", "")
        xendit_qr_string = xendit_result.get("qr_string", "")
        now = datetime.now()
        topup = WalletTopup(
            user_id=str(current_user.id),
            amount=req.amount,
            currency="PHP",
            reference_number=xendit_external_id,
            payment_method="alipay",
            status="pending",
            description=req.description,
            checkout_url=xendit_qr_string,
            created_at=now,
            updated_at=now,
        )
        db.add(topup)
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="alipay_qr",
            external_id=xendit_external_id,
            xendit_id=xendit_result.get("qr_id", ""),
            amount=req.amount,
            currency="PHP",
            status="pending",
            description=req.description,
            qr_code_url=xendit_qr_string,
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        return {
            "success": True,
            "checkout_url": xendit_qr_string,
            "req_id": xendit_external_id,
            "amount": req.amount,
            "currency": req.currency,
            "pay_method": "Alipay",
            "message": "Alipay QR created via Xendit. Scan QR to pay — wallet credited automatically.",
        }

    # PhotonPay success path — persist pending transaction
    now = datetime.now()
    txn = Transactions(
        user_id=str(current_user.id),
        transaction_type="alipay_qr",
        external_id=photonpay_result["req_id"],
        xendit_id=photonpay_result.get("pay_id", ""),
        amount=req.amount,
        currency="PHP",
        status="pending",
        description=req.description,
        qr_code_url=photonpay_result["checkout_url"],
        created_at=now,
        updated_at=now,
    )
    db.add(txn)
    await db.commit()

    return {
        "success": True,
        "checkout_url": photonpay_result["checkout_url"],
        "req_id": photonpay_result["req_id"],
        "amount": req.amount,
        "currency": req.currency,
        "pay_method": "Alipay",
        "message": "Alipay session created. Open the URL and scan QR to pay — wallet credited automatically.",
    }


@router.post("/wechat-session")
async def create_wechat_session(
    req: WeChatSessionRequest,
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a WeChat Pay cashier session via PhotonPay.
    Falls back to PayMongo WeChat source when PhotonPay is not configured or
    when the PhotonPay auth request is rejected (e.g. wrong credentials).
    Returns a checkout_url the user opens to pay via WeChat QR.
    PHP wallet is credited automatically when the webhook confirms payment.
    """
    svc = PhotonPayService()
    backend_url = ""
    try:
        from core.config import settings
        backend_url = settings.backend_url
    except Exception:
        pass

    if not svc.is_configured:
        photonpay_result = None
    else:
        notify_url = req.notify_url or f"{backend_url}/api/v1/photonpay/webhook"
        redirect_url = req.success_url or f"{backend_url}/api/v1/photonpay/redirect/success"
        photonpay_result = await svc.create_wechat_session(
            amount=req.amount,
            currency=req.currency,
            description=req.description,
            notify_url=notify_url,
            redirect_url=redirect_url,
            shopper_id=str(current_user.id),
        )
        if not photonpay_result.get("success"):
            logger.warning("PhotonPay WeChat failed (%s), trying PayMongo fallback", photonpay_result.get("error", ""))
            photonpay_result = None  # fall through to PayMongo fallback

    if photonpay_result is None:
        # Fallback: use PayMongo WeChat source
        pm_svc = PayMongoService()
        if not pm_svc.secret_key:
            raise HTTPException(
                status_code=503,
                detail="WeChat Pay is not available: neither PhotonPay nor PayMongo is configured. Contact the administrator.",
            )
        result = await pm_svc.create_wechat_qr(
            amount=req.amount,
            description=req.description,
            success_url=f"{backend_url}/api/v1/paymongo/redirect/success",
            failed_url=f"{backend_url}/api/v1/paymongo/redirect/failed",
        )
        if not result.get("success"):
            raise HTTPException(status_code=502, detail=result.get("error", "PayMongo error"))

        source_id = result.get("source_id", "")
        reference_number = result.get("reference_number", "")
        checkout_url = result.get("checkout_url", "")
        now = datetime.now()
        topup = WalletTopup(
            user_id=str(current_user.id),
            amount=req.amount,
            currency="PHP",
            paymongo_source_id=source_id,
            reference_number=reference_number,
            payment_method="wechat",
            status="pending",
            description=req.description,
            checkout_url=checkout_url,
            created_at=now,
            updated_at=now,
        )
        db.add(topup)
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="wechat_qr",
            external_id=reference_number,
            xendit_id=source_id,
            amount=req.amount,
            currency="PHP",
            status="pending",
            description=req.description,
            qr_code_url=checkout_url,
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()

        return {
            "success": True,
            "checkout_url": checkout_url,
            "req_id": reference_number,
            "amount": req.amount,
            "currency": req.currency,
            "pay_method": "WeChat",
            "message": "WeChat Pay session created via PayMongo. Open the URL and scan QR to pay — wallet credited automatically.",
        }

    # PhotonPay success path — persist pending transaction
    now = datetime.now()
    txn = Transactions(
        user_id=str(current_user.id),
        transaction_type="wechat_qr",
        external_id=photonpay_result["req_id"],
        xendit_id=photonpay_result.get("pay_id", ""),
        amount=req.amount,
        currency="PHP",
        status="pending",
        description=req.description,
        qr_code_url=photonpay_result["checkout_url"],
        created_at=now,
        updated_at=now,
    )
    db.add(txn)
    await db.commit()

    return {
        "success": True,
        "checkout_url": photonpay_result["checkout_url"],
        "req_id": photonpay_result["req_id"],
        "amount": req.amount,
        "currency": req.currency,
        "pay_method": "WeChat",
        "message": "WeChat Pay session created. Open the URL and scan QR to pay — wallet credited automatically.",
    }


@router.post("/webhook")
async def photonpay_webhook(
    request: Request,
    x_pd_sign: Optional[str] = Header(None, alias="X-PD-SIGN"),
    x_pd_notification_type: Optional[str] = Header(None, alias="X-PD-NOTIFICATION-TYPE"),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and process PhotonPay payment notification webhooks.

    PhotonPay signs the request body with their RSA private key (MD5withRSA).
    Set PHOTONPAY_RSA_PUBLIC_KEY to the PhotonPay platform public key to enable
    signature verification.

    Expected JSON body fields (cashier payment notification):
      reqId          — Merchant order ID (matches Transactions.external_id)
      transactionId  — PhotonPay transaction ID
      status         — "succeed" | "success" | "failed" | "cancelled"
      amount         — Amount paid
      currency       — Currency code
      payMethod      — "Alipay" | "WeChat"
    """
    raw_body = await request.body()

    svc = PhotonPayService()

    # Determine whether signature verification is required.
    # Read directly from os.environ so that the value is always current
    # (the pydantic-settings singleton is initialised at startup).
    # Defaults to True (secure for production); set
    # PHOTONPAY_WEBHOOK_VERIFY_REQUIRED=false only during initial integration.
    verify_required_raw = os.environ.get("PHOTONPAY_WEBHOOK_VERIFY_REQUIRED", "true").strip().lower()
    verify_required = verify_required_raw not in ("false", "0", "no", "off")

    if not x_pd_sign:
        if verify_required:
            logger.warning("PhotonPay webhook: X-PD-SIGN header missing — rejected")
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        else:
            logger.warning("PhotonPay webhook: X-PD-SIGN header missing — proceeding (verify not required)")
    else:
        if not svc.verify_webhook_signature(raw_body, x_pd_sign):
            logger.warning("PhotonPay webhook: invalid X-PD-SIGN — rejected")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        logger.error("PhotonPay webhook: non-JSON body received")
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    logger.info(
        "PhotonPay webhook [%s]: %s",
        x_pd_notification_type or "unknown",
        json.dumps(payload, ensure_ascii=False)[:500],
    )

    # Extract key fields — PhotonPay may use camelCase or snake_case
    req_id = (
        payload.get("reqId")
        or payload.get("req_id")
        or payload.get("merchantOrderId")
        or ""
    )
    transaction_id = (
        payload.get("transactionId")
        or payload.get("transaction_id")
        or payload.get("paymentId")
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

    is_success = status_raw in ("succeed", "success", "paid", "completed")
    is_failed = status_raw in ("failed", "failure", "cancelled", "canceled", "closed")

    # Look up the pending transaction by external_id (our req_id)
    txn_result = await db.execute(
        select(Transactions).where(Transactions.external_id == req_id)
    )
    txn = txn_result.scalar_one_or_none()

    if txn is None and transaction_id:
        # Fall back: look up by PhotonPay transaction ID stored in xendit_id column
        txn_result = await db.execute(
            select(Transactions).where(Transactions.xendit_id == transaction_id)
        )
        txn = txn_result.scalar_one_or_none()

    if txn is None:
        logger.warning("PhotonPay webhook: no transaction found for reqId=%s txnId=%s", req_id, transaction_id)
        # Return 200 to prevent PhotonPay from retrying for unknown orders
        return {"status": "ok", "message": "transaction not found — acknowledged"}

    if is_success:
        if txn.status == "paid":
            logger.info("PhotonPay webhook: transaction %s already paid — skipping", txn.id)
            return {"status": "ok", "message": "already processed"}

        # Update transaction record
        txn.status = "paid"
        txn.xendit_id = transaction_id or txn.xendit_id
        txn.updated_at = datetime.now()
        await db.flush()

        # Credit the wallet
        credit_amount = float(txn.amount) if txn.amount else amount
        await _credit_wallet(
            db,
            user_id=txn.user_id,
            amount=credit_amount,
            reference_id=req_id or transaction_id,
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
                logger.warning("PhotonPay webhook: Telegram notify failed: %s", e)

    elif is_failed:
        txn.status = "failed"
        txn.updated_at = datetime.now()
        await db.commit()
        logger.info("PhotonPay webhook: payment failed for reqId=%s", req_id)

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
        logger.info("PhotonPay webhook: unhandled status '%s' for reqId=%s", status_raw, req_id)

    return {"status": "ok"}


@router.get("/redirect/success", response_class=HTMLResponse)
async def redirect_success():
    """Landing page after successful PhotonPay payment."""
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
    """Landing page after failed or cancelled PhotonPay payment."""
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
