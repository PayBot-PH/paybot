import logging
import os
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
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus
from services.xendit_service import XenditService

# Default USDT TRC20 deposit address — overridable via environment variable
DEFAULT_USDT_TRC20_ADDRESS = os.getenv("USDT_TRC20_ADDRESS", "TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])


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


# ---------- Helpers ----------
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
    """Get wallet balance for a given currency (default: PHP)."""
    wallet = await get_or_create_wallet(db, str(current_user.id), currency.upper())
    return WalletBalanceResponse(
        wallet_id=wallet.id,
        balance=wallet.balance,
        currency=wallet.currency or currency.upper(),
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
    usd_wallet = await get_or_create_wallet(db, user_id, "USD")
    now = datetime.now()

    request = CryptoTopupRequest(
        user_id=user_id,
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
    logger.info("Crypto topup request submitted: user=%s amount=%s tx=%s", user_id, req.amount_usdt, req.tx_hash)

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
        q = (
            select(CryptoTopupRequest)
            .where(CryptoTopupRequest.user_id == str(current_user.id))
            .order_by(CryptoTopupRequest.id.desc())
        )

    result = await db.execute(q)
    items = result.scalars().all()

    if is_admin:
        count_q = select(func.count(CryptoTopupRequest.id))
    else:
        count_q = select(func.count(CryptoTopupRequest.id)).where(
            CryptoTopupRequest.user_id == str(current_user.id)
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