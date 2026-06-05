import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models.transactions import Transactions
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class TransactionsService:
    """Service layer for Transactions operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_transaction(
        self,
        user_id: str,
        transaction_type: str,
        amount: float,
        external_id: str = "",
        gateway_id: str = "",
        description: str = "",
        customer_name: str = "",
        customer_email: str = "",
        payment_url: str = "",
        status: str = "pending",
        currency: str = "PHP",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Transactions:
        """Create a new transaction record with consistent defaults."""
        now = datetime.now(timezone.utc)
        txn = Transactions(
            user_id=user_id,
            transaction_type=transaction_type,
            amount=amount,
            currency=currency,
            external_id=external_id,
            xendit_id=gateway_id,  # Using xendit_id column for gateway reference
            status=status,
            description=description,
            customer_name=customer_name,
            customer_email=customer_email,
            payment_url=payment_url,
            created_at=now,
            updated_at=now,
        )
        # Handle metadata if we ever add a metadata column to Transactions
        self.db.add(txn)
        await self.db.commit()
        await self.db.refresh(txn)
        return txn

    async def get_or_create_wallet(self, user_id: str, currency: str = "PHP") -> Wallets:
        """Helper to get or create a user wallet."""
        result = await self.db.execute(
            select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == currency)
        )
        wallet = result.scalar_one_or_none()
        if wallet is None:
            now = datetime.now(timezone.utc)
            wallet = Wallets(user_id=user_id, currency=currency, balance=0.0, created_at=now, updated_at=now)
            self.db.add(wallet)
            await self.db.flush()
        return wallet

    async def credit_wallet_from_transaction(self, txn: Transactions, gateway_label: str = "Gateway") -> Wallets:
        """Credit the user's wallet based on a successful transaction."""
        wallet = await self.get_or_create_wallet(txn.user_id, txn.currency or "PHP")
        amount = float(txn.amount or 0.0)
        balance_before = float(wallet.balance or 0.0)
        wallet.balance = balance_before + amount
        wallet.updated_at = datetime.now(timezone.utc)

        wtxn = Wallet_transactions(
            user_id=txn.user_id,
            wallet_id=wallet.id,
            transaction_type="receive",
            amount=amount,
            balance_before=balance_before,
            balance_after=wallet.balance,
            note=f"{gateway_label} payment credited: {txn.description or txn.transaction_type}",
            status="completed",
            reference_id=txn.external_id or txn.xendit_id or f"txn-{txn.id}",
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(wtxn)
        await self.db.flush()

        # Publish wallet update event
        try:
            payment_event_bus.publish({
                "event_type": "wallet_update",
                "user_id": txn.user_id,
                "wallet_id": wallet.id,
                "balance": wallet.balance,
                "currency": txn.currency or "PHP",
                "transaction_type": "receive",
                "amount": amount,
                "transaction_id": wtxn.id,
                "note": f"{gateway_label} payment received"
            })
        except Exception as e:
            logger.warning(f"Failed to publish wallet update event: {e}")

        return wallet

    async def mark_as_paid(self, txn: Transactions, gateway_label: str = "Gateway") -> bool:
        """Mark a transaction as paid and credit the wallet."""
        if txn.status == "paid":
            return True

        old_status = txn.status
        txn.status = "paid"
        txn.updated_at = datetime.now(timezone.utc)

        await self.credit_wallet_from_transaction(txn, gateway_label)

        # Publish status change event
        try:
            payment_event_bus.publish({
                "event_type": "status_change",
                "transaction_id": txn.id,
                "external_id": txn.external_id,
                "old_status": old_status,
                "new_status": txn.status,
                "amount": txn.amount,
                "description": txn.description or "",
                "transaction_type": txn.transaction_type,
                "user_id": txn.user_id,
            })
        except Exception as e:
            logger.warning(f"Failed to publish status change event: {e}")

        await self.db.commit()
        return True

    async def mark_as_expired(self, txn: Transactions) -> bool:
        """Mark a transaction as expired."""
        if txn.status != "pending":
            return False

        old_status = txn.status
        txn.status = "expired"
        txn.updated_at = datetime.now(timezone.utc)

        # Publish status change event
        try:
            payment_event_bus.publish({
                "event_type": "status_change",
                "transaction_id": txn.id,
                "external_id": txn.external_id,
                "old_status": old_status,
                "new_status": txn.status,
                "amount": txn.amount,
                "description": txn.description or "",
                "transaction_type": txn.transaction_type,
                "user_id": txn.user_id,
            })
        except Exception as e:
            logger.warning(f"Failed to publish status change event: {e}")

        await self.db.commit()
        return True

    async def find_by_external_or_gateway_id(self, identifier: str) -> Optional[Transactions]:
        """Find a transaction by external_id or xendit_id."""
        result = await self.db.execute(
            select(Transactions).where(
                or_(Transactions.xendit_id == identifier, Transactions.external_id == identifier)
            )
        )
        return result.scalar_one_or_none()

    async def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Fetch transaction statistics for a user."""
        # Total counts by status
        async def get_count(status: Optional[str] = None):
            stmt = select(func.count(Transactions.id)).where(Transactions.user_id == user_id)
            if status:
                stmt = stmt.where(Transactions.status == status)
            res = await self.db.execute(stmt)
            return res.scalar() or 0

        # Total amounts by status
        async def get_sum(status: Optional[str] = None):
            stmt = select(func.sum(Transactions.amount)).where(Transactions.user_id == user_id)
            if status:
                stmt = stmt.where(Transactions.status == status)
            res = await self.db.execute(stmt)
            return res.scalar() or 0.0

        total_count = await get_count()
        paid_count = await get_count("paid")
        pending_count = await get_count("pending")
        expired_count = await get_count("expired")

        total_amount = await get_sum()
        paid_amount = await get_sum("paid")
        pending_amount = await get_sum("pending")

        return {
            "total_count": total_count,
            "paid_count": paid_count,
            "pending_count": pending_count,
            "expired_count": expired_count,
            "total_amount": float(total_amount),
            "paid_amount": float(paid_amount),
            "pending_amount": float(pending_amount),
            "currency": "PHP"
        }

    # --- Standard CRUD Methods ---

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Transactions]:
        """Create a new transactions"""
        try:
            if user_id:
                data['user_id'] = user_id
            if 'created_at' not in data or data['created_at'] is None:
                data['created_at'] = datetime.now(timezone.utc)
            if 'updated_at' not in data or data['updated_at'] is None:
                data['updated_at'] = datetime.now(timezone.utc)
            obj = Transactions(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created transactions with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating transactions: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[Transactions]:
        """Bulk-create multiple transactions in a single transaction (avoids N+1 commits)"""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, 'user_id': user_id}
                objs.append(Transactions(**data))
            self.db.add_all(objs)
            await self.db.commit()
            for obj in objs:
                await self.db.refresh(obj)
            logger.info(f"Bulk created {len(objs)} transactions")
            return objs
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating transactions: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for transactions {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Transactions]:
        """Get transactions by ID (user can only see their own records)"""
        try:
            query = select(Transactions).where(Transactions.id == obj_id)
            if user_id:
                query = query.where(Transactions.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching transactions {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of transactionss (user can only see their own records)"""
        try:
            query = select(Transactions)
            count_query = select(func.count(Transactions.id))
            
            if user_id:
                query = query.where(Transactions.user_id == user_id)
                count_query = count_query.where(Transactions.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Transactions, field):
                        query = query.where(getattr(Transactions, field) == value)
                        count_query = count_query.where(getattr(Transactions, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Transactions, field_name):
                        query = query.order_by(getattr(Transactions, field_name).desc(), Transactions.id.desc())
                else:
                    if hasattr(Transactions, sort):
                        query = query.order_by(getattr(Transactions, sort), Transactions.id.asc())
            else:
                query = query.order_by(Transactions.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching transactions list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Transactions]:
        """Update transactions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Transactions {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated transactions {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating transactions {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete transactions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Transactions {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted transactions {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting transactions {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Transactions]:
        """Get transactions by any field"""
        try:
            if not hasattr(Transactions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Transactions")
            result = await self.db.execute(
                select(Transactions).where(getattr(Transactions, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching transactions by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Transactions]:
        """Get list of transactionss filtered by field"""
        try:
            if not hasattr(Transactions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Transactions")
            result = await self.db.execute(
                select(Transactions)
                .where(getattr(Transactions, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Transactions.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching transactionss by {field_name}: {str(e)}")
            raise