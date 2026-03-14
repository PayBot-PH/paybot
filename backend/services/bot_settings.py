import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.bot_settings import Bot_settings

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Bot_settingsService:
    """Service layer for Bot_settings operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Bot_settings]:
        """Create a new bot_settings"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Bot_settings(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created bot_settings with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating bot_settings: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[Bot_settings]:
        """Bulk-create multiple bot_settings in a single transaction (avoids N+1 commits)"""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, 'user_id': user_id}
                objs.append(Bot_settings(**data))
            self.db.add_all(objs)
            await self.db.commit()
            for obj in objs:
                await self.db.refresh(obj)
            logger.info(f"Bulk created {len(objs)} bot_settings")
            return objs
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating bot_settings: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for bot_settings {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Bot_settings]:
        """Get bot_settings by ID (user can only see their own records)"""
        try:
            query = select(Bot_settings).where(Bot_settings.id == obj_id)
            if user_id:
                query = query.where(Bot_settings.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bot_settings {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of bot_settingss (user can only see their own records)"""
        try:
            query = select(Bot_settings)
            count_query = select(func.count(Bot_settings.id))
            
            if user_id:
                query = query.where(Bot_settings.user_id == user_id)
                count_query = count_query.where(Bot_settings.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Bot_settings, field):
                        query = query.where(getattr(Bot_settings, field) == value)
                        count_query = count_query.where(getattr(Bot_settings, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Bot_settings, field_name):
                        query = query.order_by(getattr(Bot_settings, field_name).desc())
                else:
                    if hasattr(Bot_settings, sort):
                        query = query.order_by(getattr(Bot_settings, sort))
            else:
                query = query.order_by(Bot_settings.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching bot_settings list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Bot_settings]:
        """Update bot_settings (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Bot_settings {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated bot_settings {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating bot_settings {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete bot_settings (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Bot_settings {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted bot_settings {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting bot_settings {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Bot_settings]:
        """Get bot_settings by any field"""
        try:
            if not hasattr(Bot_settings, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bot_settings")
            result = await self.db.execute(
                select(Bot_settings).where(getattr(Bot_settings, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching bot_settings by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Bot_settings]:
        """Get list of bot_settingss filtered by field"""
        try:
            if not hasattr(Bot_settings, field_name):
                raise ValueError(f"Field {field_name} does not exist on Bot_settings")
            result = await self.db.execute(
                select(Bot_settings)
                .where(getattr(Bot_settings, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Bot_settings.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching bot_settingss by {field_name}: {str(e)}")
            raise