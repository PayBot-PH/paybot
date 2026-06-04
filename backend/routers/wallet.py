import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, select, func, case, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.admin_users import AdminUser
from schemas.auth import UserResponse
from dependencies.auth import get_current_user
from services.paymongo_service import PayMongoService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])

# Credit/debit type categories for USD balance computation
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")


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


class AdminPhpWalletEntry(BaseModel):
    user_id: str
    telegram_username: Optional[str] = None
    balance: float
    wallet_id: int

    model_config = ConfigDict(from_attributes=True)


class AdminPhpWalletListResponse(BaseModel):
    items: List[AdminPhpWalletEntry]
    total: int


class AdminWalletAdjustRequest(BaseModel):
    amount: float
    note: str = ""


class WalletTransferRequest(BaseModel):
    recipient_user_id: str
    amount: float
    currency: str = "PHP"
    note: str = ""


# ---------- Helpers ----------
def _tg_user_id(user_id: str) -> str:
    """Return the Telegram-prefixed user_id used by the bot for wallet storage."""
    return f"tg-{user_id}"


async def _get_php_balance(db: AsyncSession, tg_user_id: str) -> float:
    """Return the user's stored PHP wallet balance from the database."""
    try:
        row = await db.execute(
            select(Wallets).where(Wallets.user_id == tg_user_id, Wallets.currency == "PHP")
        )
        wallet = row.scalar_one_or_none()
        if wallet:
            return float(wallet.balance)
    except Exception as e:
        logger.warning("PHP wallet balance lookup failed: %s", e)
    return 0.0


async def get_or_create_wallet(db: AsyncSession, user_id: str, currency: str = "PHP") -> Wallets:
    """Get user's wallet for a given currency, or create one with 0 balance.

    PHP wallets are normalized to plain Telegram user IDs so bot and web
    workflows share the same wallet row. Legacy "tg-" prefixes are migrated
    to the normalized ID when found.
    """
    currency_upper = currency.upper()
    normalized_user_id = user_id.strip()
    if currency_upper == "PHP" and normalized_user_id.startswith("tg-"):
        normalized_user_id = normalized_user_id[3:]

    result = await db.execute(
        select(Wallets).where(Wallets.user_id == normalized_user_id, Wallets.currency == currency_upper)
    )
    wallet = result.scalar_one_or_none()

    if not wallet and currency_upper == "PHP":
        legacy_user_id = _tg_user_id(normalized_user_id)
        result = await db.execute(
            select(Wallets).where(Wallets.user_id == legacy_user_id, Wallets.currency == "PHP")
        )
        wallet = result.scalar_one_or_none()
        if wallet:
            wallet.user_id = normalized_user_id
            wallet.updated_at = datetime.now()
            await db.execute(
                update(Wallet_transactions)
                .where(
                    Wallet_transactions.wallet_id == wallet.id,
                    Wallet_transactions.user_id == legacy_user_id,
                )
                .values(user_id=normalized_user_id)
            )
            await db.commit()
            await db.refresh(wallet)
            return wallet

    if not wallet:
        now = datetime.now()
        wallet = Wallets(
            user_id=normalized_user_id,
            balance=0.0,
            currency=currency_upper,
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

    Uses a single query with conditional aggregation instead of two separate
    queries to halve the number of database round-trips.
    """
    row = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(_USD_CREDIT_TYPES),
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("credits"),
            func.coalesce(
                func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(_USD_DEBIT_TYPES),
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("debits"),
        ).where(
            Wallet_transactions.user_id == user_id,
            Wallet_transactions.status == "completed",
        )
    )
    result = row.one()
    credits = float(result.credits or 0.0)
    debits = float(result.debits or 0.0)
    return max(0.0, credits - debits)


async def _get_admin_username(db: AsyncSession, wallet_user_id: str) -> Optional[str]:
    tg_id = wallet_user_id[3:] if wallet_user_id.startswith("tg-") else wallet_user_id
    result = await db.execute(select(AdminUser).where(AdminUser.telegram_id == tg_id))
    admin = result.scalar_one_or_none()
    return admin.telegram_username if admin else None


def publish_wallet_event(user_id: str, wallet: Wallets, transaction_type: str, amount: float, txn_id: int, note: str = "", skip_bot_notify: bool = False):
    """Publish a wallet event to the event bus for real-time updates"""
    from services.event_bus import event_bus
    event_bus.publish({
        "event_type": "wallet_update",
        "user_id": user_id,
        "wallet_id": wallet.id,
        "balance": wallet.balance,
        "currency": wallet.currency or "PHP",
        "transaction_type": transaction_type,
        "amount": amount,
        "transaction_id": txn_id,
        "note": note,
        "skip_bot_notify": skip_bot_notify,
    })


# ---------- Endpoints ----------

@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(
    currency: str = "PHP",
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get wallet balance.

    - PHP (super admin): always synced real-time from the live Xendit account
      balance so the value never diverges from what Xendit holds.
    - PHP (other users): returns the stored wallet balance.
    - USD: always computed from wallet transaction history (credits minus
      debits) so the balance can never be stuck at 0 due to a stale row.
    - Other currencies: returns the stored balance as-is.
    """
    user_id = str(current_user.id)
    currency_upper = currency.upper()

    if currency_upper == "PHP":
        wallet = await get_or_create_wallet(db, user_id, "PHP")

        # Super admin: live gateway balance sync removed (Xendit deprecated).
        # Maya Manager does not provide a balance endpoint via the checkout API,
        # so we rely on the stored wallet balance here.
        perms = current_user.permissions
        if perms and perms.is_super_admin:
            logger.debug("Live gateway balance sync disabled: using stored wallet balance for super admin")

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

@router.get("/list")
async def list_wallets(
    currency: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's wallets."""
    query = select(Wallets).where(Wallets.user_id == str(current_user.id))
    if currency:
        query = query.where(Wallets.currency == currency.upper())
    result = await db.execute(query)
    wallets = result.scalars().all()
    return {"wallets": wallets}

@router.post("/send-money", response_model=WalletActionResponse)
async def send_money(
    data: SendMoneyRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send money from wallet to another user"""
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

    publish_wallet_event(user_id, wallet, "send", data.amount, txn.id, data.note)

    return WalletActionResponse(
        success=True,
        message=f"Successfully sent {data.amount} to {data.recipient}",
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
        note=data.note or "Bank withdrawal",
        status="completed",
        reference_id=f"withdraw-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(user_id, wallet, "withdraw", data.amount, txn.id, data.note)

    return WalletActionResponse(
        success=True,
        message=f"Successfully withdrew {data.amount}",
        balance=wallet.balance,
        transaction_id=txn.id,
    )

@router.post("/send-usdt", response_model=WalletActionResponse)
async def send_usdt(
    data: SendUsdtRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send USDT to a blockchain address"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    user_id = str(current_user.id)
    tg_user_id = _tg_user_id(user_id)
    wallet = await get_or_create_wallet(db, tg_user_id, "USD")

    balance = await _compute_usd_balance(db, tg_user_id)
    if balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient USD balance")

    now = datetime.now()
    new_balance = balance - data.amount

    txn = Wallet_transactions(
        user_id=tg_user_id,
        wallet_id=wallet.id,
        transaction_type="usdt_send",
        amount=data.amount,
        balance_before=balance,
        balance_after=new_balance,
        recipient=data.to_address,
        note=data.note or f"USDT send to {data.to_address}",
        status="pending",
        reference_id=f"usdt-send-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    wallet.balance = new_balance
    wallet.updated_at = now
    await db.commit()

    publish_wallet_event(tg_user_id, wallet, "usdt_send", data.amount, txn.id, data.note)

    return WalletActionResponse(
        success=True,
        message=f"Successfully sent {data.amount} USDT to {data.to_address}",
        balance=new_balance,
        transaction_id=txn.id,
    )

@router.get("/transactions")
async def get_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    currency: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get wallet transactions for current user"""
    user_id = str(current_user.id)
    query = select(Wallet_transactions).where(Wallet_transactions.user_id == user_id)

    if currency and currency.upper() == "USD":
        user_id = _tg_user_id(user_id)
        query = select(Wallet_transactions).where(Wallet_transactions.user_id == user_id)

    count_result = await db.execute(select(func.count(Wallet_transactions.id)).where(Wallet_transactions.user_id == user_id))
    total = count_result.scalar()

    result = await db.execute(query.order_by(Wallet_transactions.created_at.desc()).offset(skip).limit(limit))
    items = result.scalars().all()

    return {"items": items, "total": total, "skip": skip, "limit": limit}

# ────────────────────────────────────────────────────────────────────────────────
# Admin endpoints
# ────────────────────────────────────────────────────────────────────────────────

@router.get("/admin/php-wallets", response_model=AdminPhpWalletListResponse)
async def admin_list_php_wallets(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users' PHP wallets. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    # Get all PHP wallets
    result = await db.execute(
        select(Wallets).where(Wallets.currency == "PHP").order_by(Wallets.id)
    )
    wallets = result.scalars().all()

    items: List[AdminPhpWalletEntry] = []
    for w in wallets:
        admin_username = await _get_admin_username(db, w.user_id)
        items.append(AdminPhpWalletEntry(
            user_id=w.user_id,
            telegram_username=admin_username,
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
    """Credit (positive amount) or debit (negative amount) a user's PHP wallet. Super admin only."""
    wallet_user_id = user_id  # Already URL-decoded by FastAPI
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    if data.amount == 0:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")

    wallet = await get_or_create_wallet(db, wallet_user_id, "PHP")
    now = datetime.now()
    balance_before = wallet.balance
    txn_type = "admin_credit" if data.amount > 0 else "admin_debit"
    adj_amount = abs(data.amount)

    if data.amount < 0 and wallet.balance < adj_amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance (₱{wallet.balance:,.2f})")

    wallet.balance = round(max(0.0, wallet.balance + data.amount), 2)
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

    publish_wallet_event(wallet_user_id, wallet, txn_type, adj_amount, txn.id, data.note)
    logger.info(
        "Admin PHP wallet adjust: admin=%s target=%s amount=%s new_balance=%s",
        current_user.id, wallet_user_id, data.amount, wallet.balance,
    )

    action = "credited" if data.amount > 0 else "debited"
    return WalletActionResponse(
        success=True,
        message=f"Successfully {action} ₱{adj_amount:,.2f} PHP for {wallet_user_id}",
        balance=wallet.balance,
        transaction_id=txn.id,
    )

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
        admin_username = await _get_admin_username(db, w.user_id)
        # Recompute live balance
        computed = await _compute_usd_balance(db, w.user_id)
        items.append(AdminUsdWalletEntry(
            user_id=w.user_id,
            telegram_username=admin_username,
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
    """Credit (positive amount) or debit (negative amount) a user's USD wallet. Super admin only."""
    wallet_user_id = user_id  # Already URL-decoded by FastAPI
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required.")

    if data.amount == 0:
        raise HTTPException(status_code=400, detail="Amount must be non-zero")

    wallet = await get_or_create_wallet(db, wallet_user_id, "USD")
    now = datetime.now()
    balance_before = await _compute_usd_balance(db, wallet_user_id)
    txn_type = "admin_credit" if data.amount > 0 else "admin_debit"
    adj_amount = abs(data.amount)

    if data.amount < 0 and balance_before < adj_amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance (${balance_before:,.2f})")

    balance_after = round(max(0.0, balance_before + data.amount), 2)

    txn = Wallet_transactions(
        user_id=wallet_user_id,
        wallet_id=wallet.id,
        transaction_type=txn_type,
        amount=adj_amount,
        balance_before=balance_before,
        balance_after=balance_after,
        note=data.note or f"Admin {'credit' if data.amount > 0 else 'debit'} by {current_user.id}",
        status="completed",
        reference_id=f"admin-adj-{wallet.id}-{int(now.timestamp())}",
        created_at=now,
    )
    db.add(txn)
    wallet.balance = balance_after
    wallet.updated_at = now
    await db.commit()
    await db.refresh(txn)

    publish_wallet_event(wallet_user_id, wallet, txn_type, adj_amount, txn.id, data.note)
    logger.info(
        "Admin USD wallet adjust: admin=%s target=%s amount=%s new_balance=%s",
        current_user.id, wallet_user_id, data.amount, balance_after,
    )

    action = "credited" if data.amount > 0 else "debited"
    return WalletActionResponse(
        success=True,
        message=f"Successfully {action} ${adj_amount:,.2f} USD for {wallet_user_id}",
        balance=balance_after,
        transaction_id=txn.id,
    )

@router.post("/transfer", response_model=WalletActionResponse)
async def transfer_between_wallets(
    data: WalletTransferRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Transfer funds between users (admin only)"""
    perms = current_user.permissions
    if not perms or (not perms.is_super_admin and not perms.can_manage_wallet):
        raise HTTPException(status_code=403, detail="Wallet management permission required")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    sender_id = str(current_user.id)
    sender_wallet = await get_or_create_wallet(db, sender_id, data.currency)

    if sender_wallet.balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    recipient_wallet = await get_or_create_wallet(db, data.recipient_user_id, data.currency)

    now = datetime.now()

    # Debit sender
    sender_wallet.balance -= data.amount
    sender_txn = Wallet_transactions(
        user_id=sender_id,
        wallet_id=sender_wallet.id,
        transaction_type="transfer_out",
        amount=data.amount,
        balance_before=sender_wallet.balance + data.amount,
        balance_after=sender_wallet.balance,
        recipient=data.recipient_user_id,
        note=data.note or f"Transfer to {data.recipient_user_id}",
        status="completed",
        reference_id=f"transfer-{int(now.timestamp())}",
        created_at=now,
    )

    # Credit recipient
    recipient_wallet.balance += data.amount
    recipient_txn = Wallet_transactions(
        user_id=data.recipient_user_id,
        wallet_id=recipient_wallet.id,
        transaction_type="transfer_in",
        amount=data.amount,
        balance_before=recipient_wallet.balance - data.amount,
        balance_after=recipient_wallet.balance,
        recipient=sender_id,
        note=data.note or f"Transfer from {sender_id}",
        status="completed",
        reference_id=f"transfer-{int(now.timestamp())}",
        created_at=now,
    )

    sender_wallet.updated_at = now
    recipient_wallet.updated_at = now

    db.add(sender_txn)
    db.add(recipient_txn)
    await db.commit()

    # 5. Publish wallet events for real-time updates & bot notifications
    # 5. Publish wallet events for real-time updates & bot notifications
    publish_wallet_event(
        sender_id, sender_wallet,
        "send", data.amount, sender_txn.id,
        data.note or f"Transfer to {data.recipient_user_id}"
    )

    publish_wallet_event(
        data.recipient_user_id, recipient_wallet,
        "receive", data.amount, recipient_txn.id,
        data.note or f"Transfer from {sender_id}"
    )

    return WalletActionResponse(
        success=True,
        message=f"Successfully transferred {data.amount} {data.currency} to {data.recipient_user_id}",
        balance=sender_wallet.balance,
        transaction_id=sender_txn.id,
    )

@router.get("/crypto-deposit-info")
async def get_crypto_deposit_info():
    """Get crypto deposit addresses and info for the user"""
    return {
        "address": "TDqXEn3LXW7V7r8HXB4B7k1KQQaGYJ5cU9",
        "network": "TRC20",
        "currency": "USDT",
        "notes": "Send only USDT on TRC20 network. Do not send other tokens.",
    }

@router.get("/crypto-topup-requests")
async def list_crypto_topup_requests(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List crypto top-up requests (admin only)"""
    perms = current_user.permissions
    if not perms or (not perms.is_super_admin and not perms.can_approve_topups):
        raise HTTPException(status_code=403, detail="Permission required")

    # TODO: Implement based on actual schema
    return {"items": [], "total": 0}

@router.post("/crypto-topup-requests/{request_id}/approve")
async def approve_crypto_topup(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a crypto top-up request"""
    perms = current_user.permissions
    if not perms or (not perms.is_super_admin and not perms.can_approve_topups):
        raise HTTPException(status_code=403, detail="Permission required")

    # TODO: Implement
    return {"success": True, "message": "Request approved"}

@router.post("/crypto-topup-requests/{request_id}/reject")
async def reject_crypto_topup(
    request_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a crypto top-up request"""
    perms = current_user.permissions
    if not perms or (not perms.is_super_admin and not perms.can_approve_topups):
        raise HTTPException(status_code=403, detail="Permission required")

    # TODO: Implement
    return {"success": True, "message": "Request rejected"}
