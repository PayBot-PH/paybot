import logging
import os
import re
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ConfigDict, BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.transactions import Transactions
from models.crypto_topup import CryptoTopupRequest
from models.usdt_send_requests import UsdtSendRequest
from models.admin_users import AdminUser
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.xendit_service import XenditService

# Default USDT TRC20 deposit address — overridable via environment variable
DEFAULT_USDT_TRC20_ADDRESS = os.getenv("USDT_TRC20_ADDRESS", "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])

# Transaction types that credit / debit the USD wallet
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")

# Minimum PHP/Xendit balance required to allow a USDT withdrawal request
_PHP_MIN_WITHDRAWAL_BALANCE = 100_000.0


# ---------- Schemas ----------
class WalletBalanceResponse(BaseModel):
    wallet_id: int
    balance: float
    currency: str

class WalletListResponse(BaseModel):
    wallets: List["WalletBalanceResponse"]

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

class UsdtSendRequestListResponse(BaseModel):
    items: List[UsdtSendRequestOut]
    total: int

class UsdtSendDenyRequest(BaseModel):
    reason: str

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


class SendUsdToUserRequest(BaseModel):
    recipient_username: str
    amount: float
    note: str = ""


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


# ---------- Helpers ----------
def _tg_user_id(user_id: str) -> str:
    """Return the Telegram-prefixed user_id used by the bot for wallet storage."""
    return f"tg-{user_id}"


async def _get_php_balance(db: AsyncSession, tg_user_id: str) -> float:
    """Return the live Xendit PHP balance, falling back to the stored wallet balance.

    If neither is available, returns 0.0 so callers can decide how to handle it.
    """
    try:
        xendit = XenditService()
        result = await xendit.get_balance()
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


async def get_or_create_wallet(db: AsyncSession, user_id: str, currency: str = "PHP") -> Wallets:
    """Get user's wallet for a given currency, or create one with 0 balance."""
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == currency)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        now = datetime.now()
        wallet = Wallets(
            user_id=user_id,
            balance=0.0,
            currency=currency,
            created_at=now,
            updated_at=now,
        )
        db.add(wallet)
        await db.commit()
        await db.refresh(wallet)
    return wallet


async def _compute_usd_balance(db: AsyncSession, user_id: str) -> float:
    """Compute USD wallet balance from completed wallet_transactions (credits minus debits).

    Filters by user_id (not wallet_id) so the balance survives wallet row
    recreation after redeployment — even if the wallet.id changes, the
    transaction history is still found via the stable user_id.
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


def publish_wallet_event(user_id: str, wallet: Wallets, txn_type: str, amount: float, txn_id: int):
    """Publish a wallet event to the event bus for real-time updates"""
    payment_event_bus.publish({
        "event_type": "wallet_update",
        "user_id": user_id,
        "wallet_id": wallet.id,
        "balance": wallet.balance,
        "transaction_type": txn_type,
        "amount": amount,
        "transaction_id": txn_id,
    })


# ---------- Routes ----------
@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(
    currency: str = "PHP",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get wallet balance.

    - PHP: always synced from the live Xendit account balance so the value
      never diverges from what Xendit holds.
    - USD: always computed from wallet transaction history (credits minus
      debits) so the balance can never be stuck at 0 due to a stale row.
    """
    user_id = str(current_user.id)
    currency_upper = currency.upper()

    if currency_upper == "PHP":
        wallet = await get_or_create_wallet(db, user_id, "PHP")
        # Sync with Xendit live balance; fall back to stored balance on error
        try:
            xendit = XenditService()
            result = await xendit.get_balance()
            if result.get("success"):
                wallet.balance = float(result.get("balance", wallet.balance))
                wallet.updated_at = datetime.now()
                await db.commit()
                await db.refresh(wallet)
        except Exception as e:
            logger.warning("Xendit balance sync failed for user %s: %s", user_id, e)
        return WalletBalanceResponse(
            wallet_id=wallet.id,
            balance=wallet.balance,
            currency=wallet.currency or "PHP",
        )

    if currency_upper == "USD":
        # USD wallets are keyed with the "tg-" prefix (same as the Telegram bot)
        # so the dashboard always reads the same wallet row as the bot.
        tg_user_id = _tg_user_id(user_id)
        wallet = await get_or_create_wallet(db, tg_user_id, "USD")
        # Recompute from transaction history (keyed by user_id, not wallet_id)
        # so the balance is never lost even if the wallet row is recreated.
        computed = await _compute_usd_balance(db, tg_user_id)
        if computed != wallet.balance:
            wallet.balance = computed
            wallet.updated_at = datetime.now()
            await db.commit()
            await db.refresh(wallet)
        return WalletBalanceResponse(
            wallet_id=wallet.id,
            balance=wallet.balance,
            currency=wallet.currency or "USD",
        )

    # Any other currency — return stored balance as-is
    wallet = await get_or_create_wallet(db, user_id, currency_upper)
    return WalletBalanceResponse(
        wallet_id=wallet.id,
        balance=wallet.balance,
        currency=wallet.currency or currency_upper,
    )


@router.get("/all", response_model=WalletListResponse)
async def get_all_wallets(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all wallets for the current user across currencies."""
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == str(current_user.id))
    )
    wallets = result.scalars().all()
    return WalletListResponse(wallets=[
        WalletBalanceResponse(wallet_id=w.id, balance=w.balance, currency=w.currency or "PHP")
        for w in wallets
    ])


@router.post("/create", response_model=WalletBalanceResponse)
async def create_currency_wallet(
    req: CreateWalletRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new wallet for a specific currency (e.g. USD). Returns existing if already present."""
    currency = req.currency.upper()
    wallet = await get_or_create_wallet(db, str(current_user.id), currency)
    return WalletBalanceResponse(
        wallet_id=wallet.id,
        balance=wallet.balance,
        currency=wallet.currency or currency,
    )


@router.post("/send", response_model=WalletActionResponse)
async def send_money(
    data: SendMoneyRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send money from wallet to a recipient"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    user_id = str(current_user.id)
    wallet = await get_or_create_wallet(db, user_id)

    if wallet.balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    now = datetime.now()
    balance_before = wallet.balance
    wallet.balance -= data.amount
    wallet.updated_at = now

    txn = Wallet_transactions(
        user_id=user_id,
        wallet_id=wallet.id,
        transaction_type="send",
        amount=data.amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        recipient=data.recipient,
        note=data.note or f"Sent to {data.recipient}",
        status="completed",
        reference_id=f"send-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(user_id, wallet, "send", data.amount, txn.id)

    return WalletActionResponse(
        success=True,
        message=f"Successfully sent ₱{data.amount:,.2f} to {data.recipient}",
        balance=wallet.balance,
        transaction_id=txn.id,
    )


@router.post("/withdraw", response_model=WalletActionResponse)
async def withdraw_money(
    data: WithdrawRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw money from wallet"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    user_id = str(current_user.id)
    wallet = await get_or_create_wallet(db, user_id)

    if wallet.balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    now = datetime.now()
    balance_before = wallet.balance
    wallet.balance -= data.amount
    wallet.updated_at = now

    bank_info = f"{data.bank_name} {data.account_number}".strip()
    txn = Wallet_transactions(
        user_id=user_id,
        wallet_id=wallet.id,
        transaction_type="withdraw",
        amount=data.amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        recipient=bank_info or "Bank withdrawal",
        note=data.note or f"Withdrawal to {bank_info or 'bank'}",
        status="completed",
        reference_id=f"withdraw-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(user_id, wallet, "withdraw", data.amount, txn.id)

    return WalletActionResponse(
        success=True,
        message=f"Successfully withdrew ₱{data.amount:,.2f}",
        balance=wallet.balance,
        transaction_id=txn.id,
    )


@router.post("/send-usdt", response_model=UsdtSendRequestOut, status_code=201)
async def send_usdt(
    data: SendUsdtRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a USDT TRC20 send request. Requires super admin approval before funds are moved."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    addr = data.to_address.strip()
    # TRC-20 addresses: 34 chars, start with 'T', base58 alphabet
    if not re.match(r'^T[1-9A-HJ-NP-Za-km-z]{33}$', addr):
        raise HTTPException(
            status_code=400,
            detail="Invalid TRC-20 address. Must be 34 characters starting with 'T' in base58 format.",
        )

    user_id = str(current_user.id)
    tg_user_id = _tg_user_id(user_id)
    usd_wallet = await get_or_create_wallet(db, tg_user_id, "USD")

    if usd_wallet.balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient USD wallet balance")

    # Reject if the PHP/Xendit balance is below the minimum threshold
    php_balance = await _get_php_balance(db, tg_user_id)
    if php_balance < _PHP_MIN_WITHDRAWAL_BALANCE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"USDT withdrawal rejected: Xendit PHP balance (₱{php_balance:,.2f}) is below "
                f"the required minimum of ₱{_PHP_MIN_WITHDRAWAL_BALANCE:,.2f}."
            ),
        )

    now = datetime.now()
    req = UsdtSendRequest(
        user_id=tg_user_id,
        wallet_id=usd_wallet.id,
        to_address=addr,
        amount=data.amount,
        note=data.note or None,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    logger.info("USDT send request submitted: user=%s amount=%s to=%s", tg_user_id, data.amount, addr)

    return req


@router.get("/usdt-send-requests", response_model=UsdtSendRequestListResponse)
async def list_usdt_send_requests(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List USDT send requests. Super admins see all; others see only their own."""
    perms = current_user.permissions
    is_super = perms and perms.is_super_admin
    if is_super:
        q = select(UsdtSendRequest).order_by(UsdtSendRequest.id.desc())
        count_q = select(func.count(UsdtSendRequest.id))
    else:
        uid = _tg_user_id(str(current_user.id))
        q = select(UsdtSendRequest).where(UsdtSendRequest.user_id == uid).order_by(UsdtSendRequest.id.desc())
        count_q = select(func.count(UsdtSendRequest.id)).where(UsdtSendRequest.user_id == uid)

    result = await db.execute(q)
    items = result.scalars().all()
    total = (await db.execute(count_q)).scalar() or 0
    return UsdtSendRequestListResponse(items=list(items), total=total)


@router.post("/usdt-send-requests/{request_id}/approve", response_model=UsdtSendRequestOut)
async def approve_usdt_send_request(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a USDT send request and deduct from the sender's USD wallet. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    result = await db.execute(select(UsdtSendRequest).where(UsdtSendRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    usd_wallet = await get_or_create_wallet(db, req.user_id, "USD")
    if usd_wallet.balance < req.amount:
        raise HTTPException(status_code=400, detail="Sender has insufficient USD wallet balance.")

    now = datetime.now()
    balance_before = usd_wallet.balance
    usd_wallet.balance -= req.amount
    usd_wallet.updated_at = now

    txn = Wallet_transactions(
        user_id=req.user_id,
        wallet_id=usd_wallet.id,
        transaction_type="usdt_send",
        amount=req.amount,
        balance_before=balance_before,
        balance_after=usd_wallet.balance,
        recipient=req.to_address,
        note=req.note or f"USDT sent to {req.to_address[:8]}...{req.to_address[-4:]}",
        status="completed",
        reference_id=f"usdt-send-{request_id}",
        created_at=now,
    )
    db.add(txn)

    req.status = "approved"
    req.reviewed_by = str(current_user.id)
    req.reviewed_at = now
    req.updated_at = now

    await db.commit()
    await db.refresh(req)

    publish_wallet_event(req.user_id, usd_wallet, "usdt_send", req.amount, txn.id)
    logger.info("USDT send request approved: request=%s user=%s amount=%s to=%s", request_id, req.user_id, req.amount, req.to_address)

    return req


@router.post("/usdt-send-requests/{request_id}/deny", response_model=UsdtSendRequestOut)
async def deny_usdt_send_request(
    request_id: int,
    body: UsdtSendDenyRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deny a USDT send request with a mandatory reason. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Denial reason is required.")

    result = await db.execute(select(UsdtSendRequest).where(UsdtSendRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    now = datetime.now()
    req.status = "denied"
    req.denial_reason = body.reason.strip()
    req.reviewed_by = str(current_user.id)
    req.reviewed_at = now
    req.updated_at = now

    await db.commit()
    await db.refresh(req)
    logger.info("USDT send request denied: request=%s user=%s reason=%s", request_id, req.user_id, body.reason)

    return req


@router.get("/transactions", response_model=WalletTxnListResponse)
async def get_wallet_transactions(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get wallet transaction history"""
    user_id = str(current_user.id)
    wallet = await get_or_create_wallet(db, user_id)

    count_result = await db.execute(
        select(func.count(Wallet_transactions.id)).where(
            Wallet_transactions.wallet_id == wallet.id
        )
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Wallet_transactions)
        .where(Wallet_transactions.wallet_id == wallet.id)
        .order_by(Wallet_transactions.id.desc())
        .limit(50)
    )
    items = result.scalars().all()

    return WalletTxnListResponse(items=items, total=total)


@router.post("/top-up-from-payment", response_model=WalletActionResponse)
async def top_up_from_payment(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manual top-up trigger (for testing). In production, this is called by the Xendit webhook."""
    # This is a placeholder — actual top-up happens in xendit webhook
    raise HTTPException(status_code=400, detail="Use Xendit payments to top up wallet")


class TopUpRequest(BaseModel):
    amount: float
    description: str = "Wallet Top Up"
    customer_name: str = ""
    customer_email: str = ""


class TopUpResponse(BaseModel):
    success: bool
    invoice_id: str = ""
    invoice_url: str = ""
    external_id: str = ""
    amount: float = 0.0
    message: str = ""


@router.post("/topup", response_model=TopUpResponse)
async def create_topup(
    req: TopUpRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Xendit invoice for wallet top-up. Wallet is credited automatically on payment via webhook."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    xendit = XenditService()
    result = await xendit.create_invoice(
        amount=req.amount,
        description=req.description or "Wallet Top Up",
        customer_name=req.customer_name,
        customer_email=req.customer_email,
    )

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Failed to create invoice"))

    # Save transaction tagged with current user so webhook credits their wallet
    now = datetime.now()
    txn = Transactions(
        user_id=current_user.id,
        transaction_type="top_up",
        external_id=result["external_id"],
        xendit_id=result["invoice_id"],
        amount=req.amount,
        currency="PHP",
        status="pending",
        description=req.description or "Wallet Top Up",
        payment_url=result["invoice_url"],
        created_at=now,
        updated_at=now,
    )
    db.add(txn)
    await db.commit()

    return TopUpResponse(
        success=True,
        invoice_id=result["invoice_id"],
        invoice_url=result["invoice_url"],
        external_id=result["external_id"],
        amount=req.amount,
        message="Invoice created. Complete payment to credit your wallet.",
    )


# ---------- Crypto Top-Up (Manual USDT TRC20) ----------

class CryptoDepositInfoResponse(BaseModel):
    address: str
    network: str
    currency: str
    notes: str


class CryptoTopupSubmitRequest(BaseModel):
    amount_usdt: float
    tx_hash: str
    network: str = "TRC20"


class CryptoTopupRequestOut(BaseModel):
    id: int
    user_id: str
    amount_usdt: float
    tx_hash: str
    network: str
    status: str
    notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CryptoTopupListResponse(BaseModel):
    items: List[CryptoTopupRequestOut]
    total: int


class CryptoTopupActionResponse(BaseModel):
    success: bool
    message: str


@router.get("/crypto-deposit-info", response_model=CryptoDepositInfoResponse)
async def get_crypto_deposit_info(
    current_user: UserResponse = Depends(get_current_user),
):
    """Return the USDT TRC20 deposit address for manual top-up of the USD wallet."""
    return CryptoDepositInfoResponse(
        address=DEFAULT_USDT_TRC20_ADDRESS,
        network="TRC20",
        currency="USDT",
        notes="Send USDT on the TRON (TRC20) network only. After sending, submit your transaction hash below for manual review.",
    )


@router.post("/crypto-topup", response_model=CryptoTopupActionResponse, status_code=201)
async def submit_crypto_topup(
    req: CryptoTopupSubmitRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a manual crypto top-up request with a USDT transaction hash. Admin will review and credit the USD wallet."""
    if req.amount_usdt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if not req.tx_hash.strip():
        raise HTTPException(status_code=400, detail="Transaction hash is required")

    existing = await db.execute(
        select(CryptoTopupRequest).where(CryptoTopupRequest.tx_hash == req.tx_hash.strip())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This transaction hash has already been submitted.")

    user_id = str(current_user.id)
    tg_user_id = _tg_user_id(user_id)
    usd_wallet = await get_or_create_wallet(db, tg_user_id, "USD")
    now = datetime.now()

    request = CryptoTopupRequest(
        user_id=tg_user_id,
        wallet_id=usd_wallet.id,
        amount_usdt=req.amount_usdt,
        tx_hash=req.tx_hash.strip(),
        network=req.network.upper(),
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)
    logger.info("Crypto topup request submitted: user=%s amount=%s tx=%s", tg_user_id, req.amount_usdt, req.tx_hash)

    return CryptoTopupActionResponse(
        success=True,
        message="Top-up request submitted. An admin will review and credit your USD wallet shortly.",
    )


@router.get("/crypto-topup-requests", response_model=CryptoTopupListResponse)
async def list_crypto_topup_requests(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List crypto top-up requests. Admins see all; regular users see only their own."""
    is_admin = current_user.role == "admin"
    if is_admin:
        q = select(CryptoTopupRequest).order_by(CryptoTopupRequest.id.desc())
    else:
        tg_uid = _tg_user_id(str(current_user.id))
        q = (
            select(CryptoTopupRequest)
            .where(CryptoTopupRequest.user_id == tg_uid)
            .order_by(CryptoTopupRequest.id.desc())
        )

    result = await db.execute(q)
    items = result.scalars().all()

    if is_admin:
        count_q = select(func.count(CryptoTopupRequest.id))
    else:
        count_q = select(func.count(CryptoTopupRequest.id)).where(
            CryptoTopupRequest.user_id == tg_uid
        )
    total = (await db.execute(count_q)).scalar() or 0

    return CryptoTopupListResponse(items=items, total=total)


@router.post("/crypto-topup-requests/{request_id}/approve", response_model=CryptoTopupActionResponse)
async def approve_crypto_topup(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a crypto top-up request and credit the user's USD wallet. Requires approve topups permission."""
    perms = current_user.permissions
    if not perms or not (perms.is_super_admin or perms.can_approve_topups):
        raise HTTPException(status_code=403, detail="Approve topups permission required.")

    result = await db.execute(select(CryptoTopupRequest).where(CryptoTopupRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    usd_wallet = await get_or_create_wallet(db, req.user_id, "USD")
    now = datetime.now()
    balance_before = usd_wallet.balance
    usd_wallet.balance += req.amount_usdt
    usd_wallet.updated_at = now

    txn = Wallet_transactions(
        user_id=req.user_id,
        wallet_id=usd_wallet.id,
        transaction_type="crypto_topup",
        amount=req.amount_usdt,
        balance_before=balance_before,
        balance_after=usd_wallet.balance,
        note=f"USDT TRC20 top-up — TX: {req.tx_hash}",
        status="completed",
        reference_id=f"crypto-{request_id}",
        created_at=now,
    )
    db.add(txn)

    req.status = "approved"
    req.reviewed_by = str(current_user.id)
    req.reviewed_at = now
    req.updated_at = now

    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(req.user_id, usd_wallet, "crypto_topup", req.amount_usdt, txn.id)
    logger.info("Crypto topup approved: request=%s user=%s amount=%s", request_id, req.user_id, req.amount_usdt)

    return CryptoTopupActionResponse(
        success=True,
        message=f"Approved. ${req.amount_usdt:,.2f} USDT credited to user's USD wallet.",
    )


@router.post("/crypto-topup-requests/{request_id}/reject", response_model=CryptoTopupActionResponse)
async def reject_crypto_topup(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a crypto top-up request. Requires approve topups permission."""
    perms = current_user.permissions
    if not perms or not (perms.is_super_admin or perms.can_approve_topups):
        raise HTTPException(status_code=403, detail="Approve topups permission required.")

    result = await db.execute(select(CryptoTopupRequest).where(CryptoTopupRequest.id == request_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}.")

    now = datetime.now()
    req.status = "rejected"
    req.reviewed_by = str(current_user.id)
    req.reviewed_at = now
    req.updated_at = now

    await db.commit()
    logger.info("Crypto topup rejected: request=%s user=%s", request_id, req.user_id)

    return CryptoTopupActionResponse(success=True, message="Request rejected.")


# ---------- User-to-User USD Transfer ----------

@router.post("/send-usd", response_model=WalletActionResponse, status_code=201)
async def send_usd_to_user(
    data: SendUsdToUserRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send USD from the current user's wallet to another user by Telegram username."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    recipient_username = data.recipient_username.strip().lstrip("@")
    if not recipient_username:
        raise HTTPException(status_code=400, detail="Recipient username is required")

    # Look up recipient in AdminUser table by telegram_username
    res = await db.execute(
        select(AdminUser).where(AdminUser.telegram_username == recipient_username, AdminUser.is_active.is_(True))
    )
    recipient_admin = res.scalar_one_or_none()
    if not recipient_admin:
        raise HTTPException(status_code=404, detail=f"User @{recipient_username} not found or not active")

    sender_user_id = str(current_user.id)
    sender_tg_user_id = _tg_user_id(sender_user_id)
    recipient_tg_user_id = f"tg-{recipient_admin.telegram_id}"

    if sender_tg_user_id == recipient_tg_user_id:
        raise HTTPException(status_code=400, detail="Cannot send USD to yourself")

    # Get sender's USD wallet balance (computed from transaction history)
    sender_balance = await _compute_usd_balance(db, sender_tg_user_id)
    if sender_balance < data.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient USD balance (${sender_balance:,.2f})")

    sender_wallet = await get_or_create_wallet(db, sender_tg_user_id, "USD")
    recipient_wallet = await get_or_create_wallet(db, recipient_tg_user_id, "USD")

    now = datetime.now()
    sender_display = current_user.id

    # Debit sender
    sender_balance_before = sender_wallet.balance
    sender_wallet.balance = max(0.0, sender_wallet.balance - data.amount)
    sender_wallet.updated_at = now
    debit_txn = Wallet_transactions(
        user_id=sender_tg_user_id,
        wallet_id=sender_wallet.id,
        transaction_type="usd_send",
        amount=data.amount,
        balance_before=sender_balance_before,
        balance_after=sender_wallet.balance,
        recipient=f"@{recipient_username}",
        note=data.note or f"Sent to @{recipient_username}",
        status="completed",
        reference_id=f"usd-send-{sender_wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(debit_txn)

    # Credit recipient
    recipient_balance_before = recipient_wallet.balance
    recipient_wallet.balance += data.amount
    recipient_wallet.updated_at = now
    credit_txn = Wallet_transactions(
        user_id=recipient_tg_user_id,
        wallet_id=recipient_wallet.id,
        transaction_type="usd_receive",
        amount=data.amount,
        balance_before=recipient_balance_before,
        balance_after=recipient_wallet.balance,
        recipient=f"@{recipient_username}",
        note=data.note or f"Received from {sender_display}",
        status="completed",
        reference_id=f"usd-recv-{recipient_wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(credit_txn)

    await db.commit()
    await db.refresh(debit_txn)

    publish_wallet_event(sender_tg_user_id, sender_wallet, "usd_send", data.amount, debit_txn.id)
    logger.info("USD transfer: sender=%s recipient=@%s amount=%s", sender_tg_user_id, recipient_username, data.amount)

    return WalletActionResponse(
        success=True,
        message=f"Successfully sent ${data.amount:,.2f} USD to @{recipient_username}",
        balance=sender_wallet.balance,
        transaction_id=debit_txn.id,
    )


# ---------- Super Admin: USD Wallet Management ----------

@router.get("/admin/usd-wallets", response_model=AdminUsdWalletListResponse)
async def admin_list_usd_wallets(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users' USD wallets. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    # Get all USD wallets
    result = await db.execute(
        select(Wallets).where(Wallets.currency == "USD").order_by(Wallets.id)
    )
    wallets = result.scalars().all()

    # Build response enriched with telegram_username from AdminUser table
    items: List[AdminUsdWalletEntry] = []
    for w in wallets:
        # The wallet user_id is "tg-{telegram_id}" — strip the prefix for lookup
        tg_id = w.user_id[3:] if w.user_id.startswith("tg-") else w.user_id
        admin_res = await db.execute(
            select(AdminUser).where(AdminUser.telegram_id == tg_id)
        )
        admin = admin_res.scalar_one_or_none()
        # Recompute live balance
        computed = await _compute_usd_balance(db, w.user_id)
        items.append(AdminUsdWalletEntry(
            user_id=w.user_id,
            telegram_username=admin.telegram_username if admin else None,
            balance=computed,
            wallet_id=w.id,
        ))

    return AdminUsdWalletListResponse(items=items, total=len(items))


@router.post("/admin/usd-wallets/{wallet_user_id:path}/adjust", response_model=WalletActionResponse)
async def admin_adjust_usd_wallet(
    wallet_user_id: str,
    data: AdminWalletAdjustRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Credit (positive amount) or debit (negative amount) a user's USD wallet. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    if data.amount == 0:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")

    wallet = await get_or_create_wallet(db, wallet_user_id, "USD")
    now = datetime.now()
    balance_before = wallet.balance
    txn_type = "admin_credit" if data.amount > 0 else "admin_debit"
    adj_amount = abs(data.amount)

    if data.amount < 0 and wallet.balance < adj_amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance (${wallet.balance:,.2f})")

    wallet.balance = max(0.0, wallet.balance + data.amount)
    wallet.updated_at = now

    txn = Wallet_transactions(
        user_id=wallet_user_id,
        wallet_id=wallet.id,
        transaction_type=txn_type,
        amount=adj_amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=data.note or f"Admin {'credit' if data.amount > 0 else 'debit'} by {current_user.id}",
        status="completed",
        reference_id=f"admin-adj-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(wallet_user_id, wallet, txn_type, adj_amount, txn.id)
    logger.info(
        "Admin wallet adjust: admin=%s target=%s amount=%s new_balance=%s",
        current_user.id, wallet_user_id, data.amount, wallet.balance,
    )

    action = "credited" if data.amount > 0 else "debited"
    return WalletActionResponse(
        success=True,
        message=f"Successfully {action} ${adj_amount:,.2f} USD for {wallet_user_id}",
        balance=wallet.balance,
        transaction_id=txn.id,
    )
