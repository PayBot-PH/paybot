import logging
from typing import TypeVar, Generic, Type, Optional, Dict, Any, List

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BaseCRUDService(Generic[T]):
    """Generic CRUD service base class.

    Subclasses must define a ``model`` class attribute pointing to the
    SQLAlchemy model class.  All common database operations are implemented
    here so that each concrete service file only needs a few lines.
    """

    model: Type[T]

    def __init__(self, db: AsyncSession):
        self.db = db

    def _name(self) -> str:
        """Return a lowercase label used in log messages."""
        return self.model.__name__.lower()

    # ------------------------------------------------------------------
    # Sort hook – override in subclasses for entity-specific sort logic.
    # ------------------------------------------------------------------
    def _apply_sort(self, query, sort: Optional[str]):
        """Apply an ORDER BY clause to *query* based on the *sort* string.

        The default implementation sorts descending by ``id`` when no *sort*
        is given.  Prefix a field name with ``-`` for descending order.
        Override in subclasses to add secondary sort keys, etc.
        """
        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(self.model, field_name):
                    query = query.order_by(getattr(self.model, field_name).desc())
            else:
                if hasattr(self.model, sort):
                    query = query.order_by(getattr(self.model, sort))
        else:
            query = query.order_by(self.model.id.desc())
        return query

    # ------------------------------------------------------------------
    # CRUD methods
    # ------------------------------------------------------------------

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[T]:
        """Create a new record."""
        try:
            if user_id:
                data["user_id"] = user_id
            obj = self.model(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created {self._name()} with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating {self._name()}: {str(e)}")
            raise

    async def bulk_create(self, items: List[Dict[str, Any]], user_id: Optional[str] = None) -> List[T]:
        """Bulk-create multiple records in a single transaction (avoids N+1 commits)."""
        try:
            objs = []
            for data in items:
                if user_id:
                    data = {**data, "user_id": user_id}
                objs.append(self.model(**data))
            self.db.add_all(objs)
            await self.db.flush()
            obj_ids = [obj.id for obj in objs]
            await self.db.commit()
            result = await self.db.execute(select(self.model).where(self.model.id.in_(obj_ids)))
            refreshed = list(result.scalars().all())
            logger.info(f"Bulk created {len(refreshed)} {self._name()}")
            return refreshed
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error bulk creating {self._name()}: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Return True if the user owns the record with *obj_id*."""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for {self._name()} {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[T]:
        """Get a record by primary key (optionally scoped to *user_id*)."""
        try:
            query = select(self.model).where(self.model.id == obj_id)
            if user_id:
                query = query.where(self.model.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching {self._name()} {obj_id}: {str(e)}")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return a paginated list of records (optionally scoped to *user_id*)."""
        try:
            query = select(self.model)
            count_query = select(func.count(self.model.id))

            if user_id:
                query = query.where(self.model.user_id == user_id)
                count_query = count_query.where(self.model.user_id == user_id)

            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(self.model, field):
                        query = query.where(getattr(self.model, field) == value)
                        count_query = count_query.where(getattr(self.model, field) == value)

            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            query = self._apply_sort(query, sort)

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {"items": items, "total": total, "skip": skip, "limit": limit}
        except Exception as e:
            logger.error(f"Error fetching {self._name()} list: {str(e)}")
            raise

    async def update(
        self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None
    ) -> Optional[T]:
        """Update a record (requires ownership when *user_id* is supplied)."""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"{self.model.__name__} {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != "user_id":
                    setattr(obj, key, value)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated {self._name()} {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating {self._name()} {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete a record (requires ownership when *user_id* is supplied)."""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"{self.model.__name__} {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted {self._name()} {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting {self._name()} {obj_id}: {str(e)}")
            raise

    async def batch_delete(self, ids: List[int], user_id: Optional[str] = None) -> int:
        """Batch-delete records by IDs in a single query."""
        try:
            stmt = delete(self.model).where(self.model.id.in_(ids))
            if user_id:
                stmt = stmt.where(self.model.user_id == user_id)
            result = await self.db.execute(stmt)
            await self.db.commit()
            deleted_count = result.rowcount
            logger.info(f"Batch deleted {deleted_count} {self._name()}")
            return deleted_count
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error batch deleting {self._name()}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[T]:
        """Get a single record matching ``field_name == field_value``."""
        try:
            if not hasattr(self.model, field_name):
                raise ValueError(f"Field {field_name} does not exist on {self.model.__name__}")
            result = await self.db.execute(
                select(self.model).where(getattr(self.model, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching {self._name()} by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[T]:
        """Get a paginated list of records where ``field_name == field_value``."""
        try:
            if not hasattr(self.model, field_name):
                raise ValueError(f"Field {field_name} does not exist on {self.model.__name__}")
            result = await self.db.execute(
                select(self.model)
                .where(getattr(self.model, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(self.model.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching {self._name()} list by {field_name}: {str(e)}")
            raise
