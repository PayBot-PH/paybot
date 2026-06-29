import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.api_configs import Api_configs
from core.mask_crypto import encrypt_text, decrypt_text, key_prefix

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Api_configsService:
    """Service layer for Api_configs operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Api_configs]:
        """Create a new api_configs"""
        try:
            if user_id:
                data['user_id'] = user_id
            # Encrypt config_value if present and not already encrypted
            if 'config_value' in data and data['config_value']:
                raw = data['config_value']
                if not (isinstance(raw, str) and raw.startswith(key_prefix)):
                    data['config_value'] = encrypt_text(str(raw))
            obj = Api_configs(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created api_configs with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating api_configs: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[Api_configs]:
        """Bulk-create multiple api_configs in a single transaction (avoids N+1 commits)"""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, 'user_id': user_id}
                if 'config_value' in data and data['config_value']:
                    raw = data['config_value']
                    if not (isinstance(raw, str) and raw.startswith(key_prefix)):
                        data['config_value'] = encrypt_text(str(raw))
                objs.append(Api_configs(**data))
            self.db.add_all(objs)
            await self.db.commit()
            for obj in objs:
                await self.db.refresh(obj)
            logger.info(f"Bulk created {len(objs)} api_configs")
            return objs
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating api_configs: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for api_configs {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Api_configs]:
        """Get api_configs by ID (user can only see their own records)"""
        try:
            query = select(Api_configs).where(Api_configs.id == obj_id)
            if user_id:
                query = query.where(Api_configs.user_id == user_id)
            result = await self.db.execute(query)
            obj = result.scalar_one_or_none()
            return obj
        except Exception as e:
            logger.error(f"Error fetching api_configs {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
        reveal: bool = False,
    ) -> Dict[str, Any]:
        """Get paginated list of api_configss (user can only see their own records)"""
        try:
            query = select(Api_configs)
            count_query = select(func.count(Api_configs.id))
            
            if user_id:
                query = query.where(Api_configs.user_id == user_id)
                count_query = count_query.where(Api_configs.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Api_configs, field):
                        query = query.where(getattr(Api_configs, field) == value)
                        count_query = count_query.where(getattr(Api_configs, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Api_configs, field_name):
                        query = query.order_by(getattr(Api_configs, field_name).desc())
                else:
                    if hasattr(Api_configs, sort):
                        query = query.order_by(getattr(Api_configs, sort))
            else:
                query = query.order_by(Api_configs.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            # Decrypt or mask config_value depending on reveal flag
            for it in items:
                try:
                    val = getattr(it, 'config_value', None)
                    if val:
                        if reveal:
                            if isinstance(val, str) and val.startswith(key_prefix):
                                try:
                                    setattr(it, 'config_value', decrypt_text(val))
                                except Exception:
                                    # leave as-is if decryption fails
                                    pass
                        else:
                            # mask the secret
                            setattr(it, 'config_value', '••••••••')
                except Exception:
                    continue

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching api_configs list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Api_configs]:
        """Update api_configs (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Api_configs {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if key == 'config_value' and value:
                    # encrypt before storing
                    raw = value
                    if not (isinstance(raw, str) and raw.startswith(key_prefix)):
                        value = encrypt_text(str(raw))
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated api_configs {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating api_configs {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete api_configs (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Api_configs {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted api_configs {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting api_configs {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Api_configs]:
        """Get api_configs by any field"""
        try:
            if not hasattr(Api_configs, field_name):
                raise ValueError(f"Field {field_name} does not exist on Api_configs")
            result = await self.db.execute(
                select(Api_configs).where(getattr(Api_configs, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching api_configs by {field_name}: {str(e)}")
            raise

    async def get_by_service_and_key(self, service_name: str, config_key: str, user_id: Optional[str] = None) -> Optional[Api_configs]:
        """Fetch a single Api_configs by service_name + config_key pair"""
        try:
            query = select(Api_configs).where(
                Api_configs.service_name == service_name,
                Api_configs.config_key == config_key,
            )
            if user_id:
                query = query.where(Api_configs.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching api_configs by service+key: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Api_configs]:
        """Get list of api_configss filtered by field"""
        try:
            if not hasattr(Api_configs, field_name):
                raise ValueError(f"Field {field_name} does not exist on Api_configs")
            result = await self.db.execute(
                select(Api_configs)
                .where(getattr(Api_configs, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Api_configs.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching api_configss by {field_name}: {str(e)}")
            raise