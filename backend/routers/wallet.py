import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.disbursements import Disbursements
from models.crypto_topup import CryptoTopupRequest
from schemas.auth import UserResponse
from dependencies.auth import get_current_user
from services.wallets import WalletsService
from services.paymongo_service import PayMongoService
from services.telegram_service import t, TelegramService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])


# ---------- Schemas ----------
class WalletBalanceResponse(BaseModel):
    wallet_id: int
    balance: float
    currency: str

class WalletListResponse(BaseModel):
    wallets: List[Dict[str, Any]]

class CreateWalletRequest(BaseModel):
    currency: str = "USD"

class SendMoneyRequest(BaseModel):
    recipient: str
    amount: float
    note: str = ""

class WithdrawRequest(BaseModel):
    amount: float
    bank_name: str = ""
    account_number: str = ""
    note: str = ""

class SendUsdtRequest(BaseModel):
    to_address: str
    amount: float
    note: str = ""

class UsdtSendRequestOut(BaseModel):
    id: int
    user_id: str
    to_address: str
    amount: float
    note: Optional[str] = None
    status: str
    denial_reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class WalletTxnResponse(BaseModel):
    id: int
    transaction_type: str
    amount: float
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    recipient: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class WalletTxnListResponse(BaseModel):
    items: List[WalletTxnResponse]
    total: int

class WalletActionResponse(BaseModel):
    success: bool
    message: str
    balance: float = 0
    transaction_id: int = 0

class AdminPhpWalletEntry(BaseModel):
    user_id: str
    telegram_username: Optional[str] = None
    balance: float
    wallet_id: int
    model_config = ConfigDict(from_attributes=True)

class AdminPhpWalletListResponse(BaseModel):
    items: List[AdminPhpWalletEntry]
    total: int

class AdminUsdWalletEntry(BaseModel):
    user_id: str
    telegram_username: Optional[str] = None
    balance: float
    wallet_id: int
    model_config = ConfigDict(from_attributes=True)

class AdminUsdWalletListResponse(BaseModel):
    items: List[AdminUsdWalletEntry]
    total: int

class AdminWalletAdjustRequest(BaseModel):
    amount: float
    note: str = ""

class WalletTransferRequest(BaseModel):
    recipient_user_id: str
    amount: float
    currency: str = "PHP"
    note: str = ""


# ---------- Endpoints ----------

@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(
    currency: str = "PHP",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get live gateway balance for super admins (PHP), or internal wallet balance for others."""
    user_id = str(current_user.id)
    currency_upper = currency.upper()

    svc = WalletsService(db)

    # Special case for Super Admins requesting PHP balance: show live PayMongo balance
    perms = current_user.permissions
    if currency_upper == "PHP" and perms and perms.is_super_admin:
        try:
            pm_svc = PayMongoService()
            pm_bal = await pm_svc.get_balance()
            if pm_bal.get("success"):
                available = pm_bal.get("available", [])
                php_entry = next((e for e in available if e.get("currency", "").upper() == "PHP"), None)
                if php_entry is not None:
                    # Satisfy schema with any wallet ID for this user
                    wallet_info = await svc.get_balance(user_id, "PHP")
                    return WalletBalanceResponse(
                        wallet_id=wallet_info["wallet_id"],
                        balance=float(php_entry["amount"]) / 100.0,
                        currency="PHP",
                    )
        except Exception as pe:
            logger.warning(f"PayMongo balance fetch failed: {pe}")

    # Default: Return internal wallet balance via service
    result = await svc.get_balance(user_id, currency_upper)
    return WalletBalanceResponse(**result)


@router.get("/wallet", response_model=WalletBalanceResponse)
async def get_wallet_internal_balance(
    currency: str = "PHP",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Explicitly fetch the internal wallet balance, bypassing live gateway checks."""
    svc = WalletsService(db)
    result = await svc.get_balance(str(current_user.id), currency)
    return WalletBalanceResponse(**result)


@router.get("/list", response_model=WalletListResponse)
async def list_wallets(
    currency: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all wallets belonging to the current user."""
    svc = WalletsService(db)
    result = await svc.get_list(user_id=str(current_user.id), currency=currency)
    return {"wallets": result["items"]}


@router.post("/send-money", response_model=WalletActionResponse)
async def send_money(
    data: SendMoneyRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Perform an internal transfer between users (PHP or USD)."""
    svc = WalletsService(db)
    try:
        result = await svc.transfer(
            sender_user_id=str(current_user.id),
            recipient_identifier=data.recipient,
            amount=data.amount,
            note=data.note,
            currency="PHP" # Default for this endpoint
        )
        return WalletActionResponse(
            success=True,
            message=f"Successfully sent ₱{data.amount:,.2f} to {result['recipient_name']}",
            balance=result["balance"],
            transaction_id=result["transaction_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/withdraw", response_model=WalletActionResponse)
async def withdraw_money(
    data: WithdrawRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a withdrawal request for approval."""
    svc = WalletsService(db)
    try:
        result = await svc.withdraw_request(
            user_id=str(current_user.id),
            amount=data.amount,
            bank_name=data.bank_name,
            account_number=data.account_number,
            account_name=current_user.name or str(current_user.id),
            note=data.note
        )

        # Optional: Notify super admin via Telegram
        from core.config import settings
        owner_id = str(getattr(settings, "telegram_bot_owner_id", "") or "").strip()
        if owner_id:
            try:
                tg = TelegramService()
                await tg.send_message(
                    owner_id,
                    f"🔔 <b>New Dashboard Withdrawal Request</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"👤 From: {current_user.name} (ID: {current_user.id})\n"
                    f"💰 Amount: <b>₱{data.amount:,.2f}</b>\n"
                    f"🏦 Bank: {data.bank_name}\n"
                    f"🔢 Account: <code>{data.account_number}</code>\n"
                    f"🆔 Ref: <code>{result['reference_id']}</code>"
                )
            except Exception: pass

        return WalletActionResponse(
            success=True,
            message="Withdrawal request submitted. Please wait for manual processing.",
            balance=result["balance"],
            transaction_id=result["transaction_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/send-usdt", response_model=WalletActionResponse)
async def send_usdt(
    data: SendUsdtRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request a USDT withdrawal to a blockchain address."""
    svc = WalletsService(db)
    user_id = str(current_user.id)
    # USD operations use "tg-" prefix internally
    tg_user_id = f"tg-{user_id}" if not user_id.startswith("tg-") else user_id

    try:
        # Re-using adjust_balance for a pending debit is one way,
        # but here we implement the specific logic for USDT send.
        balance = await svc.compute_usd_balance(tg_user_id)
        if balance < data.amount:
            raise HTTPException(status_code=400, detail="Insufficient USD balance")

        wallet = await svc.get_or_create_wallet(tg_user_id, "USD")
        now = datetime.now()
        new_bal = balance - data.amount

        txn = Wallet_transactions(
            user_id=tg_user_id,
            wallet_id=wallet.id,
            transaction_type="usdt_send",
            amount=data.amount,
            balance_before=balance,
            balance_after=new_bal,
            recipient=data.to_address,
            note=data.note or f"USDT send to {data.to_address}",
            status="pending",
            reference_id=f"usdt-send-{wallet.id}-{int(now.timestamp())}",
            created_at=now,
        )
        db.add(txn)
        wallet.balance = new_bal
        await db.commit()
        await db.refresh(txn)

        await svc.publish_wallet_event(tg_user_id, wallet, "usdt_send", data.amount, txn.id, data.note)

        return WalletActionResponse(
            success=True,
            message=f"Successfully submitted request for {data.amount} USDT",
            balance=new_bal,
            transaction_id=txn.id
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/transactions")
async def get_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    currency: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve transaction history for the user."""
    user_id = str(current_user.id)
    if currency and currency.upper() == "USD":
        user_id = f"tg-{user_id}" if not user_id.startswith("tg-") else user_id

    query = select(Wallet_transactions).where(Wallet_transactions.user_id == user_id)
    count_query = select(func.count(Wallet_transactions.id)).where(Wallet_transactions.user_id == user_id)

    total = (await db.execute(count_query)).scalar()
    result = await db.execute(query.order_by(Wallet_transactions.created_at.desc()).offset(skip).limit(limit))
    items = result.scalars().all()

    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ---------- Admin Endpoints ----------

@router.get("/admin/php-wallets", response_model=AdminPhpWalletListResponse)
async def admin_list_php_wallets(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List all PHP wallets with associated Telegram usernames."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    svc = WalletsService(db)
    res = await db.execute(select(Wallets).where(Wallets.currency == "PHP").order_by(Wallets.id))
    wallets = res.scalars().all()

    items = []
    for w in wallets:
        items.append(AdminPhpWalletEntry(
            user_id=w.user_id,
            telegram_username=await svc.get_admin_username(w.user_id),
            balance=w.balance,
            wallet_id=w.id,
        ))
    return AdminPhpWalletListResponse(items=items, total=len(items))


@router.post("/admin/php-wallets/{user_id}/adjust", response_model=WalletActionResponse)
async def admin_adjust_php_wallet(
    user_id: str,
    data: AdminWalletAdjustRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Manually credit or debit a user's PHP wallet."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    svc = WalletsService(db)
    try:
        res = await svc.adjust_balance(
            target_user_id=user_id,
            amount=data.amount,
            admin_id=str(current_user.id),
            note=data.note,
            currency="PHP"
        )
        return WalletActionResponse(
            success=True,
            message=f"Successfully {res['action']} ₱{abs(data.amount):,.2f} for {user_id}",
            balance=res["balance"],
            transaction_id=res["transaction_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/usd-wallets", response_model=AdminUsdWalletListResponse)
async def admin_list_usd_wallets(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List all USD wallets with recomputed balances."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    svc = WalletsService(db)
    res = await db.execute(select(Wallets).where(Wallets.currency == "USD").order_by(Wallets.id))
    wallets = res.scalars().all()

    items = []
    for w in wallets:
        computed = await svc.compute_usd_balance(w.user_id)
        items.append(AdminUsdWalletEntry(
            user_id=w.user_id,
            telegram_username=await svc.get_admin_username(w.user_id),
            balance=computed,
            wallet_id=w.id,
        ))
    return AdminUsdWalletListResponse(items=items, total=len(items))


@router.post("/admin/usd-wallets/{user_id}/adjust", response_model=WalletActionResponse)
async def admin_adjust_usd_wallet(
    user_id: str,
    data: AdminWalletAdjustRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Manually credit or debit a user's USD wallet."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    svc = WalletsService(db)
    try:
        res = await svc.adjust_balance(
            target_user_id=user_id,
            amount=data.amount,
            admin_id=str(current_user.id),
            note=data.note,
            currency="USD"
        )
        return WalletActionResponse(
            success=True,
            message=f"Successfully {res['action']} ${abs(data.amount):,.2f} for {user_id}",
            balance=res["balance"],
            transaction_id=res["transaction_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/usdt-stats")
async def get_usdt_stats(db: AsyncSession = Depends(get_db)):
    """Admin: Get aggregated USDT stats for the dashboard."""
    svc = WalletsService(db)
    try:
        return await svc.get_usdt_stats()
    except Exception as e:
        logger.error(f"USDT stats failed: {e}")
        return {"settlement": 0.0, "txnCount": 0, "change": 0.0, "pending": 0.0}


@router.get("/crypto-deposit-info")
async def get_crypto_deposit_info():
    """Information for users on where to send USDT."""
    return {
        "address": "TDqXEn3LXW7V7r8HXB4B7k1KQQaGYJ5cU9",
        "network": "TRC20",
        "currency": "USDT",
        "notes": "TRC20 only. Other tokens will be lost.",
    }


# ---------- Withdrawal & Top-up Approval ----------

@router.post("/admin/withdrawals/{disb_id}/approve")
async def admin_approve_withdrawal(
    disb_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Approve withdrawal and trigger real-money transfer via PayMongo."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    res = await db.execute(select(Disbursements).where(Disbursements.id == disb_id))
    disb = res.scalar_one_or_none()
    if not disb or disb.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid or already processed request.")

    # 1. Trigger PayMongo Payout
    pm_svc = PayMongoService()
    payout_res = await pm_svc.create_payout(
        amount=disb.amount,
        bank_code=disb.bank_code,
        account_number=disb.account_number,
        account_name=disb.account_name,
        description=f"PayBot Withdrawal #{disb.external_id}",
        external_id=disb.external_id
    )

    if not payout_res.get("success"):
        raise HTTPException(status_code=502, detail=f"PayMongo failed: {payout_res.get('error')}")

    # 2. Update records
    disb.status = "completed"
    disb.updated_at = datetime.now()
    disb.xendit_id = payout_res.get("payout_id")

    ledger_res = await db.execute(
        select(Wallet_transactions).where(
            Wallet_transactions.reference_id == disb.external_id,
            Wallet_transactions.transaction_type == "withdraw"
        )
    )
    ledger = ledger_res.scalar_one_or_none()
    if ledger: ledger.status = "completed"

    await db.commit()

    # 3. User Notification
    if disb.user_id.startswith("tg-") or len(disb.user_id) > 5: # Likely a TG ID
        chat_id = disb.user_id[3:] if disb.user_id.startswith("tg-") else disb.user_id
        try:
            tg = TelegramService()
            msg = t(chat_id,
                f"✅ <b>Withdrawal Approved!</b>\nAmount: <b>₱{disb.amount:,.2f}</b>",
                f"✅ <b>提款已批准</b>\n金额: <b>₱{disb.amount:,.2f}</b>"
            )
            await tg.send_message(chat_id, msg)
        except Exception: pass

    return {"success": True, "payout_id": disb.xendit_id}


@router.post("/admin/withdrawals/{disb_id}/reject")
async def admin_reject_withdrawal(
    disb_id: int,
    reason: str = Query("Rejected by admin"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Reject withdrawal and refund the user's internal wallet."""
    if not (current_user.permissions and current_user.permissions.is_super_admin):
        raise HTTPException(status_code=403, detail="Super admin access required.")

    res = await db.execute(select(Disbursements).where(Disbursements.id == disb_id))
    disb = res.scalar_one_or_none()
    if not disb or disb.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid request.")

    disb.status = "failed"
    disb.description = f"Rejected: {reason}"
    disb.updated_at = datetime.now()

    # Refund internal wallet
    ledger_res = await db.execute(select(Wallet_transactions).where(Wallet_transactions.reference_id == disb.external_id))
    ledger = ledger_res.scalar_one_or_none()
    if ledger:
        ledger.status = "failed"
        svc = WalletsService(db)
        await svc.adjust_balance(disb.user_id, disb.amount, str(current_user.id), f"Refund for #{disb.external_id}")

    await db.commit()
    return {"success": True}


@router.post("/crypto-topup-requests/{request_id}/approve")
async def approve_crypto_topup(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Approve a crypto top-up (USDT)."""
    if not (current_user.permissions and (current_user.permissions.is_super_admin or current_user.permissions.can_approve_topups)):
        raise HTTPException(status_code=403, detail="Permission required")

    res = await db.execute(select(CryptoTopupRequest).where(CryptoTopupRequest.id == request_id))
    req = res.scalar_one_or_none()
    if not req or req.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid request")

    svc = WalletsService(db)
    # Credit USD wallet via admin adjustment logic (marked as crypto_topup)
    now = datetime.now()
    req.status = "approved"
    req.reviewed_by = str(current_user.id)
    req.reviewed_at = now

    # We use adjust_balance but customize the type
    wallet = await svc.get_or_create_wallet(req.user_id, "USD")
    bal_before = await svc.compute_usd_balance(req.user_id)

    txn = Wallet_transactions(
        user_id=req.user_id,
        wallet_id=wallet.id,
        transaction_type="crypto_topup",
        amount=req.amount_usdt,
        balance_before=bal_before,
        balance_after=bal_before + req.amount_usdt,
        note=f"USDT Top-up (Hash: {req.tx_hash[:8]}...)",
        status="completed",
        reference_id=f"cry-{req.id}",
        created_at=now,
    )
    db.add(txn)
    wallet.balance = txn.balance_after
    await db.commit()

    await svc.publish_wallet_event(req.user_id, wallet, "crypto_topup", req.amount_usdt, txn.id)
    return {"success": True}
