import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.disbursements import Disbursements

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class DisbursementsService:
    """Service layer for Disbursements operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Disbursements]:
        """Create a new disbursements"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Disbursements(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created disbursements with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating disbursements: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[Disbursements]:
        """Bulk-create multiple disbursements in a single transaction (avoids N+1 commits)"""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, 'user_id': user_id}
                objs.append(Disbursements(**data))
            self.db.add_all(objs)
            await self.db.flush()
            obj_ids = [obj.id for obj in objs]
            await self.db.commit()
            result = await self.db.execute(select(Disbursements).where(Disbursements.id.in_(obj_ids)))
            refreshed = list(result.scalars().all())
            logger.info(f"Bulk created {len(refreshed)} disbursements")
            return refreshed
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating disbursements: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for disbursements {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Disbursements]:
        """Get disbursements by ID (user can only see their own records)"""
        try:
            query = select(Disbursements).where(Disbursements.id == obj_id)
            if user_id:
                query = query.where(Disbursements.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching disbursements {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of disbursementss (user can only see their own records)"""
        try:
            query = select(Disbursements)
            count_query = select(func.count(Disbursements.id))
            
            if user_id:
                query = query.where(Disbursements.user_id == user_id)
                count_query = count_query.where(Disbursements.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Disbursements, field):
                        query = query.where(getattr(Disbursements, field) == value)
                        count_query = count_query.where(getattr(Disbursements, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Disbursements, field_name):
                        query = query.order_by(getattr(Disbursements, field_name).desc())
                else:
                    if hasattr(Disbursements, sort):
                        query = query.order_by(getattr(Disbursements, sort))
            else:
                query = query.order_by(Disbursements.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching disbursements list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Disbursements]:
        """Update disbursements (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Disbursements {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated disbursements {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating disbursements {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete disbursements (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Disbursements {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted disbursements {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting disbursements {obj_id}: {str(e)}")
            raise

    async def batch_delete(self, ids: List[int], user_id: Optional[str] = None) -> int:
        """Batch-delete multiple disbursements by IDs in a single query"""
        try:
            stmt = delete(Disbursements).where(Disbursements.id.in_(ids))
            if user_id:
                stmt = stmt.where(Disbursements.user_id == user_id)
            result = await self.db.execute(stmt)
            await self.db.commit()
            deleted_count = result.rowcount
            logger.info(f"Batch deleted {deleted_count} disbursements")
            return deleted_count
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error batch deleting disbursements: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Disbursements]:
        """Get disbursements by any field"""
        try:
            if not hasattr(Disbursements, field_name):
                raise ValueError(f"Field {field_name} does not exist on Disbursements")
            result = await self.db.execute(
                select(Disbursements).where(getattr(Disbursements, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching disbursements by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Disbursements]:
        """Get list of disbursementss filtered by field"""
        try:
            if not hasattr(Disbursements, field_name):
                raise ValueError(f"Field {field_name} does not exist on Disbursements")
            result = await self.db.execute(
                select(Disbursements)
                .where(getattr(Disbursements, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Disbursements.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching disbursementss by {field_name}: {str(e)}")
            raise