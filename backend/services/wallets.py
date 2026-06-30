import logging
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple

from sqlalchemy import select, func, case, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from models.admin_users import AdminUser
from models.disbursements import Disbursements
from models.crypto_topup import CryptoTopupRequest
from models.topup_requests import TopupRequest

logger = logging.getLogger(__name__)

# Credit/debit type categories for USD balance computation
_USD_CREDIT_TYPES = ("crypto_topup", "usd_receive", "admin_credit")
_USD_DEBIT_TYPES = ("usdt_send", "usd_send", "admin_debit")

class WalletsService:
    """Enhanced service layer for Wallets operations with integrated business logic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_wallet(self, user_id: str, currency: str = "PHP", lock: bool = False) -> Wallets:
        """Get user's wallet for a given currency, or create one with 0 balance.

        PHP wallets are normalized to plain Telegram user IDs so bot and web
        workflows share the same wallet row. Legacy "tg-" prefixes are migrated
        to the normalized ID when found.
        """
        currency_upper = currency.upper()
        normalized_user_id = user_id.strip()

        # PHP wallets migration logic: "tg-123" -> "123"
        if currency_upper == "PHP" and normalized_user_id.startswith("tg-"):
            normalized_user_id = normalized_user_id[3:]

        query = select(Wallets).where(
            Wallets.user_id == normalized_user_id,
            Wallets.currency == currency_upper
        )
        if lock:
            query = query.with_for_update()

        result = await self.db.execute(query)
        wallet = result.scalar_one_or_none()

        # Check for legacy "tg-" prefixed row if not found for PHP
        if not wallet and currency_upper == "PHP":
            legacy_user_id = f"tg-{normalized_user_id}"
            query_legacy = select(Wallets).where(
                Wallets.user_id == legacy_user_id,
                Wallets.currency == "PHP"
            )
            if lock:
                query_legacy = query_legacy.with_for_update()

            result = await self.db.execute(query_legacy)
            wallet = result.scalar_one_or_none()
            if wallet:
                # Migrate the wallet row to normalized ID
                wallet.user_id = normalized_user_id
                wallet.updated_at = datetime.now(timezone.utc)
                # Also update all transaction history for this wallet
                await self.db.execute(
                    update(Wallet_transactions)
                    .where(
                        Wallet_transactions.wallet_id == wallet.id,
                        Wallet_transactions.user_id == legacy_user_id,
                    )
                    .values(user_id=normalized_user_id)
                )
                await self.db.commit()
                # Re-fetch with lock if requested
                return await self.get_or_create_wallet(normalized_user_id, currency_upper, lock=lock)

        if not wallet:
            now = datetime.now(timezone.utc)
            org_id = None
            admin_res = await self.db.execute(select(AdminUser).where(AdminUser.telegram_id == normalized_user_id))
            admin_user = admin_res.scalar_one_or_none()
            if admin_user and admin_user.organization_id:
                org_id = admin_user.organization_id
            wallet = Wallets(
                user_id=normalized_user_id,
                organization_id=org_id,
                balance=0.0,
                currency=currency_upper,
                created_at=now,
                updated_at=now,
            )
            self.db.add(wallet)
            await self.db.flush() # Flush to get ID without committing
            if lock:
                # Re-fetch with lock
                return await self.get_or_create_wallet(normalized_user_id, currency_upper, lock=True)
            logger.info(f"Created new {currency_upper} wallet for user {normalized_user_id}")

        return wallet

    async def get_or_create_organization_wallet(
        self, organization_id: str, currency: str = "PHP", lock: bool = False
    ) -> Wallets:
        """Get or create the dedicated organization wallet row."""
        if not organization_id:
            raise ValueError("organization_id is required")

        normalized_org_id = organization_id.strip()
        currency_upper = currency.upper()
        org_wallet_user_id = f"org:{normalized_org_id}"

        query = select(Wallets).where(
            Wallets.user_id == org_wallet_user_id,
            Wallets.currency == currency_upper,
        )
        if lock:
            query = query.with_for_update()

        result = await self.db.execute(query)
        wallet = result.scalar_one_or_none()
        if wallet:
            return wallet

        now = datetime.now(timezone.utc)
        wallet = Wallets(
            user_id=org_wallet_user_id,
            organization_id=normalized_org_id,
            balance=0.0,
            available_balance=0.0,
            pending_balance=0.0,
            currency=currency_upper,
            created_at=now,
            updated_at=now,
        )
        self.db.add(wallet)
        await self.db.flush()
        if lock:
            return await self.get_or_create_organization_wallet(normalized_org_id, currency_upper, lock=True)
        return wallet

    async def compute_usd_balance(self, user_id: str) -> float:
        """Compute USD wallet balance from completed wallet_transactions (credits minus debits).

        Filters by user_id so the balance survives wallet row recreation.
        """
        row = await self.db.execute(
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

    async def get_balance(self, user_id: str, currency: str = "PHP") -> Dict[str, Any]:
        """Get wallet balance. For USD, it ensures the balance field is synced with history."""
        currency_upper = currency.upper()

        if currency_upper == "USD":
            # USD wallets use "tg-" prefix internally (heritage from bot)
            tg_user_id = f"tg-{user_id}" if not user_id.startswith("tg-") else user_id
            computed = await self.compute_usd_balance(tg_user_id)
            wallet = await self.get_or_create_wallet(tg_user_id, "USD")
            
            if abs(computed - wallet.balance) > 0.001:
                wallet.balance = computed
                wallet.updated_at = datetime.now(timezone.utc)
                await self.db.commit()
                await self.db.refresh(wallet)
            
            return {
                "wallet_id": wallet.id,
                "balance": wallet.balance,
                "available_balance": wallet.available_balance,
                "pending_balance": wallet.pending_balance,
                "currency": "USD"
            }

        wallet = await self.get_or_create_wallet(user_id, currency_upper)
        return {
            "wallet_id": wallet.id,
            "balance": wallet.balance,
            "available_balance": wallet.available_balance,
            "pending_balance": wallet.pending_balance,
            "currency": currency_upper
        }

    async def transfer(self, sender_user_id: str, recipient_identifier: str, amount: float, note: str = "", currency: str = "PHP") -> Dict[str, Any]:
        """Perform an internal transfer between users using available liquidity."""
        if amount <= 0:
            raise ValueError("Amount must be positive")

        # 1. Lookup recipient (username or ID)
        recipient_identifier = recipient_identifier.strip().lstrip("@")
        res = await self.db.execute(
            select(AdminUser).where(
                (func.lower(AdminUser.telegram_username) == recipient_identifier.lower()) |
                (AdminUser.telegram_id == recipient_identifier)
            )
        )
        recipient_admin = res.scalar_one_or_none()

        if not recipient_admin:
            raise ValueError(f"Recipient '{recipient_identifier}' not found.")

        recipient_id = str(recipient_admin.telegram_id)
        if sender_user_id == recipient_id:
            raise ValueError("Cannot send money to yourself")

        # 2. Get wallets with row-level locks to prevent race conditions
        sender_wallet = await self.get_or_create_wallet(sender_user_id, currency, lock=True)
        recipient_wallet = await self.get_or_create_wallet(recipient_id, currency, lock=True)

        # Maximize internal control: Check against available liquidity, not just total balance
        if sender_wallet.available_balance < amount:
            # Fallback for legacy rows with 0 available but non-zero total balance
            if sender_wallet.available_balance == 0 and sender_wallet.balance >= amount:
                 logger.warning(f"Migrating balance to available for user {sender_user_id}")
                 sender_wallet.available_balance = sender_wallet.balance
            else:
                 raise ValueError(f"Insufficient available liquidity ({currency} {sender_wallet.available_balance:,.2f})")

        # 3. Perform internal transfer
        now = datetime.now(timezone.utc)
        ref_id = f"trf-{uuid.uuid4().hex[:8]}"

        # Debit sender
        sender_bal_before = sender_wallet.balance
        sender_wallet.available_balance = round(sender_wallet.available_balance - amount, 2)
        sender_wallet.balance = round(sender_wallet.balance - amount, 2)
        sender_wallet.updated_at = now

        sender_txn = Wallet_transactions(
            user_id=sender_user_id,
            wallet_id=sender_wallet.id,
            transaction_type="send" if currency == "PHP" else "usd_send",
            amount=amount,
            balance_before=sender_bal_before,
            balance_after=sender_wallet.balance,
            recipient=f"@{recipient_admin.telegram_username}" if recipient_admin.telegram_username else recipient_id,
            note=note or f"Transfer to {recipient_id}",
            status="completed",
            reference_id=ref_id,
            created_at=now,
        )

        # Credit recipient (Direct to available for internal transfers)
        recipient_bal_before = recipient_wallet.balance
        recipient_wallet.available_balance = round(recipient_wallet.available_balance + amount, 2)
        recipient_wallet.balance = round(recipient_wallet.balance + amount, 2)
        recipient_wallet.updated_at = now

        recipient_txn = Wallet_transactions(
            user_id=recipient_id,
            wallet_id=recipient_wallet.id,
            transaction_type="receive" if currency == "PHP" else "usd_receive",
            amount=amount,
            balance_before=recipient_bal_before,
            balance_after=recipient_wallet.balance,
            recipient=sender_user_id,
            note=note or f"Transfer from {sender_user_id}",
            status="completed",
            reference_id=ref_id,
            created_at=now,
        )

        self.db.add(sender_txn)
        self.db.add(recipient_txn)
        await self.db.commit()
        await self.db.refresh(sender_txn)

        # 4. Notify both parties
        await self.publish_wallet_event(sender_user_id, sender_wallet, sender_txn.transaction_type, amount, sender_txn.id, note)
        await self.publish_wallet_event(recipient_id, recipient_wallet, recipient_txn.transaction_type, amount, recipient_txn.id, note)

        # 5. Send SMS notifications (async, non-blocking)
        from services.notification_service import SMSService
        
        # Get mobile numbers if available (try to fetch from user profiles or fallback)
        try:
            sender_result = await self.db.execute(select(AdminUser).where(AdminUser.telegram_id == sender_user_id))
            sender_admin = sender_result.scalar_one_or_none()
            if sender_admin and sender_admin.mobile_number:
                asyncio.create_task(SMSService.notify_user_of_successful_transfer(
                    sender_admin.mobile_number, amount, 
                    recipient_admin.telegram_username or recipient_id, ref_id
                ))
        except Exception as e:
            logger.warning(f"Could not send SMS to sender: {str(e)}")

        return {
            "success": True,
            "balance": sender_wallet.balance,
            "transaction_id": sender_txn.id,
            "recipient_name": recipient_admin.name or recipient_identifier
        }

    async def withdraw_request(self, user_id: str, amount: float, bank_name: str, account_number: str, account_name: str, note: str = "") -> Dict[str, Any]:
        """Submit a withdrawal request against available liquidity."""
        if amount <= 0:
            raise ValueError("Amount must be positive")

        # Lock wallet for withdrawal processing
        wallet = await self.get_or_create_wallet(user_id, "PHP", lock=True)

        # Ensure liquidity check against available_balance
        if wallet.available_balance < amount:
             if wallet.available_balance == 0 and wallet.balance >= amount:
                 wallet.available_balance = wallet.balance
             else:
                 raise ValueError(f"Insufficient available liquidity (Available: ₱{wallet.available_balance:,.2f})")

        now = datetime.now(timezone.utc)
        balance_before = wallet.balance
        ext_id = f"wd-db-{uuid.uuid4().hex[:12]}"

        # 1. Create a pending Disbursement record
        disb = Disbursements(
            user_id=user_id,
            external_id=ext_id,
            amount=amount,
            currency="PHP",
            bank_code=bank_name or "Manual",
            account_number=account_number or "Manual",
            account_name=account_name or user_id,
            description=note or "Withdrawal request via Dashboard",
            status="pending",
            disbursement_type="single",
            created_at=now,
            updated_at=now,
        )
        self.db.add(disb)

        # 2. Deduct from wallet immediately (hold funds from available)
        wallet.available_balance = round(wallet.available_balance - amount, 2)
        wallet.balance = round(wallet.balance - amount, 2)
        wallet.updated_at = now

        # 3. Record the ledger entry
        txn = Wallet_transactions(
            user_id=user_id,
            wallet_id=wallet.id,
            transaction_type="withdraw",
            amount=amount,
            balance_before=balance_before,
            balance_after=wallet.balance,
            recipient=f"{bank_name} {account_number}".strip() or "Bank withdrawal",
            note=note or "Bank withdrawal request",
            status="pending",
            reference_id=ext_id,
            created_at=now,
        )
        self.db.add(txn)
        await self.db.commit()
        await self.db.refresh(txn)

        # 4. Notify via event bus
        await self.publish_wallet_event(user_id, wallet, "withdraw", amount, txn.id, note, skip_bot_notify=True)

        # 5. Send SMS notification (async, non-blocking)
        try:
            from services.notification_service import SMSService
            from models.admin_users import AdminUser
            
            admin_result = await self.db.execute(select(AdminUser).where(AdminUser.telegram_id == user_id))
            admin_user = admin_result.scalar_one_or_none()
            if admin_user and admin_user.mobile_number:
                asyncio.create_task(SMSService.notify_user_of_disbursement(
                    admin_user.mobile_number, amount, bank_name or "Bank", 
                    account_name or "Account", ext_id, "pending"
                ))
        except Exception as e:
            logger.warning(f"Could not send SMS notification for withdrawal: {str(e)}")

        return {
            "success": True,
            "balance": wallet.balance,
            "transaction_id": txn.id,
            "reference_id": ext_id
        }

    async def adjust_balance(self, target_user_id: str, amount: float, admin_id: str, note: str = "", currency: str = "PHP") -> Dict[str, Any]:
        """Admin credit/debit adjustment (Maximizing Manual control)."""
        if amount == 0:
            raise ValueError("Amount must be non-zero")

        currency_upper = currency.upper()
        # Lock wallet for adjustment
        wallet = await self.get_or_create_wallet(target_user_id, currency_upper, lock=True)

        balance_before = wallet.balance
        if currency_upper == "USD":
            # Ensure we are adjusting relative to the computed balance for USD
            balance_before = await self.compute_usd_balance(target_user_id)

        txn_type = "admin_credit" if amount > 0 else "admin_debit"
        adj_amount = abs(amount)

        if amount < 0 and wallet.available_balance < adj_amount:
            # Fallback for adjustment
            if wallet.available_balance == 0 and wallet.balance >= adj_amount:
                wallet.available_balance = wallet.balance
            else:
                raise ValueError(f"Insufficient available balance ({currency_upper} {wallet.available_balance:,.2f})")

        now = datetime.now(timezone.utc)

        # Update both balances for manual adjustments
        wallet.available_balance = round(max(0.0, wallet.available_balance + amount), 2)
        wallet.balance = round(max(0.0, balance_before + amount), 2)
        wallet.updated_at = now

        balance_after = wallet.balance

        txn = Wallet_transactions(
            user_id=target_user_id,
            wallet_id=wallet.id,
            transaction_type=txn_type,
            amount=adj_amount,
            balance_before=balance_before,
            balance_after=balance_after,
            note=note or f"Admin {'credit' if amount > 0 else 'debit'} by {admin_id}",
            status="completed",
            reference_id=f"admin-adj-{wallet.id}-{int(now.timestamp())}",
            created_at=now,
        )
        self.db.add(txn)

        await self.db.commit()
        await self.db.refresh(txn)

        await self.publish_wallet_event(target_user_id, wallet, txn_type, adj_amount, txn.id, note)

        return {
            "success": True,
            "balance": wallet.balance,
            "transaction_id": txn.id,
            "action": "credited" if amount > 0 else "debited"
        }

    async def publish_wallet_event(self, user_id: str, wallet: Wallets, transaction_type: str, amount: float, txn_id: int, note: str = "", skip_bot_notify: bool = False):
        """Publish a wallet event to the event bus for real-time updates and notifications."""
        from services.event_bus import event_bus
        await event_bus.emit("wallet_update", {
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

    # --- Standard CRUD Methods (preserved for backward compatibility) ---
    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Wallets]:
        query = select(Wallets).where(Wallets.id == obj_id)
        if user_id:
            query = query.where(Wallets.user_id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_list(self, skip: int = 0, limit: int = 20, user_id: Optional[str] = None, currency: Optional[str] = None) -> Dict[str, Any]:
        query = select(Wallets)
        count_query = select(func.count(Wallets.id))

        if user_id:
            query = query.where(Wallets.user_id == user_id)
            count_query = count_query.where(Wallets.user_id == user_id)
        if currency:
            query = query.where(Wallets.currency == currency.upper())
            count_query = count_query.where(Wallets.currency == currency.upper())
            
        count_result = await self.db.execute(count_query)
        total = count_result.scalar()

        result = await self.db.execute(query.order_by(Wallets.updated_at.desc()).offset(skip).limit(limit))
        items = result.scalars().all()

        return {"items": items, "total": total}

    async def get_admin_username(self, wallet_user_id: str) -> Optional[str]:
        tg_id = wallet_user_id[3:] if wallet_user_id.startswith("tg-") else wallet_user_id
        result = await self.db.execute(select(AdminUser).where(AdminUser.telegram_id == tg_id))
        admin = result.scalar_one_or_none()
        return admin.telegram_username if admin else None

    async def get_usdt_stats(self) -> Dict[str, Any]:
        """Aggregate USDT settlement statistics."""

        now = datetime.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_yesterday = start_of_day - timedelta(days=1)

        # Incoming USDT today
        res_php = await self.db.execute(
            select(func.coalesce(func.sum(TopupRequest.amount_usdt), 0.0), func.count(TopupRequest.id))
            .where(TopupRequest.status == "approved", TopupRequest.created_at >= start_of_day)
        )
        row_php = res_php.one()

        res_usd = await self.db.execute(
            select(func.coalesce(func.sum(CryptoTopupRequest.amount_usdt), 0.0), func.count(CryptoTopupRequest.id))
            .where(CryptoTopupRequest.status == "approved", CryptoTopupRequest.created_at >= start_of_day)
        )
        row_usd = res_usd.one()

        settlement = float(row_php[0] or 0.0) + float(row_usd[0] or 0.0)
        txn_count = int(row_php[1] or 0) + int(row_usd[1] or 0)

        # Incoming USDT yesterday
        res_php_y = await self.db.execute(
            select(func.coalesce(func.sum(TopupRequest.amount_usdt), 0.0))
            .where(TopupRequest.status == "approved", TopupRequest.created_at >= start_of_yesterday, TopupRequest.created_at < start_of_day)
        )
        res_usd_y = await self.db.execute(
            select(func.coalesce(func.sum(CryptoTopupRequest.amount_usdt), 0.0))
            .where(CryptoTopupRequest.status == "approved", CryptoTopupRequest.created_at >= start_of_yesterday, CryptoTopupRequest.created_at < start_of_day)
        )
        yest_settlement = float(res_php_y.scalar() or 0.0) + float(res_usd_y.scalar() or 0.0)

        # Pending requests
        res_p_php = await self.db.execute(
            select(func.coalesce(func.sum(TopupRequest.amount_usdt), 0.0))
            .where(TopupRequest.status == "pending")
        )
        res_p_usd = await self.db.execute(
            select(func.coalesce(func.sum(CryptoTopupRequest.amount_usdt), 0.0))
            .where(CryptoTopupRequest.status == "pending")
        )
        pending = float(res_p_php.scalar() or 0.0) + float(res_p_usd.scalar() or 0.0)

        change = 0.0
        if yest_settlement > 0:
            change = ((settlement - yest_settlement) / yest_settlement) * 100

        return {
            "settlement": settlement,
            "txnCount": txn_count,
            "change": change,
            "pending": pending
        }

    async def freeze_wallet(self, user_id: str, reason: str = "") -> Dict[str, Any]:
        """Super admin: Freeze a user's wallet to prevent transactions."""
        wallet_php = await self.get_or_create_wallet(user_id, "PHP")
        wallet_php.is_frozen = True
        wallet_php.freeze_reason = reason or "Frozen by super admin"
        wallet_php.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        
        logger.info(f"Wallet for user {user_id} frozen: {reason}")
        return {"success": True, "wallet_id": wallet_php.id, "status": "frozen"}

    async def unfreeze_wallet(self, user_id: str) -> Dict[str, Any]:
        """Super admin: Unfreeze a user's wallet."""
        wallet_php = await self.get_or_create_wallet(user_id, "PHP")
        wallet_php.is_frozen = False
        wallet_php.freeze_reason = None
        wallet_php.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        
        logger.info(f"Wallet for user {user_id} unfrozen")
        return {"success": True, "wallet_id": wallet_php.id, "status": "active"}

    async def get_wallet_analytics(self, user_id: str) -> Dict[str, Any]:
        """Get detailed analytics for a user's wallet(s)."""
        wallets = []
        for currency in ["PHP", "USD"]:
            try:
                wallet = await self.get_or_create_wallet(user_id, currency)
                wallets.append({
                    "id": wallet.id,
                    "currency": wallet.currency,
                    "balance": wallet.balance,
                    "available_balance": wallet.available_balance,
                    "pending_balance": wallet.pending_balance,
                    "total_credits": wallet.total_credits or 0.0,
                    "total_debits": wallet.total_debits or 0.0,
                    "transaction_count": wallet.transaction_count or 0,
                    "is_frozen": wallet.is_frozen or False,
                    "freeze_reason": wallet.freeze_reason,
                    "last_activity": wallet.last_activity,
                    "created_at": wallet.created_at,
                    "updated_at": wallet.updated_at,
                })
            except Exception as e:
                logger.error(f"Error fetching {currency} wallet analytics: {str(e)}")

        # Get recent transactions
        recent_txns = await self.db.execute(
            select(Wallet_transactions)
            .where(Wallet_transactions.user_id == user_id)
            .order_by(Wallet_transactions.created_at.desc())
            .limit(10)
        )
        recent = recent_txns.scalars().all()

        return {
            "user_id": user_id,
            "wallets": wallets,
            "recent_transactions": [
                {
                    "id": txn.id,
                    "type": txn.transaction_type,
                    "amount": txn.amount,
                    "status": txn.status,
                    "created_at": txn.created_at,
                }
                for txn in recent
            ],
        }

    async def reconcile_wallet(self, user_id: str, currency: str = "PHP") -> Dict[str, Any]:
        """Super admin: Reconcile wallet balance from transaction history."""
        wallet = await self.get_or_create_wallet(user_id, currency.upper())
        
        # Recompute balance from all completed transactions
        result = await self.db.execute(
            select(
                func.coalesce(func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(("receive", "admin_credit", "deposit")), 
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ), 0.0),
                func.coalesce(func.sum(
                    case(
                        (Wallet_transactions.transaction_type.in_(("send", "admin_debit", "withdraw", "payment")), 
                         Wallet_transactions.amount),
                        else_=0.0,
                    )
                ), 0.0),
            ).where(
                Wallet_transactions.wallet_id == wallet.id,
                Wallet_transactions.status == "completed",
            )
        )
        
        row = result.one()
        computed_balance = float(row[0] or 0.0) - float(row[1] or 0.0)
        difference = round(wallet.balance - computed_balance, 2)

        if abs(difference) > 0.01:
            logger.warning(f"Wallet reconciliation mismatch for {user_id}: recorded={wallet.balance}, computed={computed_balance}, diff={difference}")
            wallet.balance = round(computed_balance, 2)
            wallet.available_balance = round(computed_balance, 2)
            wallet.updated_at = datetime.now(timezone.utc)
            await self.db.commit()

        return {
            "success": True,
            "user_id": user_id,
            "currency": currency.upper(),
            "recorded_balance": wallet.balance,
            "computed_balance": computed_balance,
            "difference": difference,
            "reconciled": abs(difference) > 0.01,
        }

    async def batch_credit_wallets(self, credits: List[Dict[str, Any]], admin_id: str) -> Dict[str, Any]:
        """Super admin: Bulk credit multiple wallets."""
        results = []
        for credit in credits:
            try:
                result = await self.adjust_balance(
                    target_user_id=credit["user_id"],
                    amount=credit["amount"],
                    admin_id=admin_id,
                    note=credit.get("note", "Batch credit"),
                    currency=credit.get("currency", "PHP"),
                )
                results.append({"user_id": credit["user_id"], "success": True, **result})
            except Exception as e:
                logger.error(f"Error crediting user {credit['user_id']}: {str(e)}")
                results.append({"user_id": credit["user_id"], "success": False, "error": str(e)})

        successful = sum(1 for r in results if r["success"])
        return {
            "total": len(credits),
            "successful": successful,
            "failed": len(credits) - successful,
            "results": results,
        }

    async def update_wallet_analytics(self, wallet_id: int, transaction_amount: float, is_credit: bool):
        """Update wallet analytics after a transaction."""
        wallet = await self.db.get(Wallets, wallet_id)
        if not wallet:
            return

        wallet.total_credits = (wallet.total_credits or 0.0) + (transaction_amount if is_credit else 0.0)
        wallet.total_debits = (wallet.total_debits or 0.0) + (transaction_amount if not is_credit else 0.0)
        wallet.transaction_count = (wallet.transaction_count or 0) + 1
        wallet.last_activity = datetime.now(timezone.utc)
        wallet.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
