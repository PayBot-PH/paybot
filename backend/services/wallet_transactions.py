import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.wallet_transactions import Wallet_transactions

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Wallet_transactionsService:
    """Service layer for Wallet_transactions operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Wallet_transactions]:
        """Create a new wallet_transactions"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Wallet_transactions(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created wallet_transactions with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating wallet_transactions: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[Wallet_transactions]:
        """Bulk-create multiple wallet_transactions in a single transaction (avoids N+1 commits)"""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, 'user_id': user_id}
                objs.append(Wallet_transactions(**data))
            self.db.add_all(objs)
            await self.db.commit()
            for obj in objs:
                await self.db.refresh(obj)
            logger.info(f"Bulk created {len(objs)} wallet_transactions")
            return objs
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating wallet_transactions: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for wallet_transactions {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Wallet_transactions]:
        """Get wallet_transactions by ID (user can only see their own records)"""
        try:
            query = select(Wallet_transactions).where(Wallet_transactions.id == obj_id)
            if user_id:
                query = query.where(Wallet_transactions.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching wallet_transactions {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of wallet_transactionss (user can only see their own records)"""
        try:
            query = select(Wallet_transactions)
            count_query = select(func.count(Wallet_transactions.id))
            
            if user_id:
                query = query.where(Wallet_transactions.user_id == user_id)
                count_query = count_query.where(Wallet_transactions.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Wallet_transactions, field):
                        query = query.where(getattr(Wallet_transactions, field) == value)
                        count_query = count_query.where(getattr(Wallet_transactions, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Wallet_transactions, field_name):
                        query = query.order_by(getattr(Wallet_transactions, field_name).desc())
                else:
                    if hasattr(Wallet_transactions, sort):
                        query = query.order_by(getattr(Wallet_transactions, sort))
            else:
                query = query.order_by(Wallet_transactions.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching wallet_transactions list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Wallet_transactions]:
        """Update wallet_transactions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Wallet_transactions {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated wallet_transactions {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating wallet_transactions {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete wallet_transactions (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Wallet_transactions {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted wallet_transactions {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting wallet_transactions {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Wallet_transactions]:
        """Get wallet_transactions by any field"""
        try:
            if not hasattr(Wallet_transactions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Wallet_transactions")
            result = await self.db.execute(
                select(Wallet_transactions).where(getattr(Wallet_transactions, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching wallet_transactions by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Wallet_transactions]:
        """Get list of wallet_transactionss filtered by field"""
        try:
            if not hasattr(Wallet_transactions, field_name):
                raise ValueError(f"Field {field_name} does not exist on Wallet_transactions")
            result = await self.db.execute(
                select(Wallet_transactions)
                .where(getattr(Wallet_transactions, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Wallet_transactions.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching wallet_transactionss by {field_name}: {str(e)}")
            raise