from datetime import datetime, timezone, timedelta
import logging
import uuid
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, case
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
            if 'created_at' not in data or data['created_at'] is None:
                data['created_at'] = datetime.now(timezone.utc)
            if 'updated_at' not in data or data['updated_at'] is None:
                data['updated_at'] = datetime.now(timezone.utc)
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
            await self.db.commit()
            for obj in objs:
                await self.db.refresh(obj)
            logger.info(f"Bulk created {len(objs)} disbursements")
            return objs
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

    async def calculate_fee(self, amount: float, bank_code: str, disbursement_type: str = "single") -> float:
        """Calculate processing fee based on amount, bank, and type."""
        # Base fee structure (can be customized per bank)
        base_fee_percent = 0.01  # 1% base fee
        
        # Bank-specific fees (Philippines)
        bank_fees = {
            "gcash": 0.005,  # 0.5%
            "maya": 0.005,   # 0.5%
            "bdo": 0.01,     # 1%
            "bpi": 0.01,     # 1%
            "metrobank": 0.015,  # 1.5%
            "security_bank": 0.015,  # 1.5%
            "unionbank": 0.015,  # 1.5%
        }
        
        # Batch discount: 0.3% off for batch disbursements
        batch_discount = 0.003 if disbursement_type == "batch" else 0.0
        
        fee_percent = bank_fees.get(bank_code.lower(), base_fee_percent) - batch_discount
        fee_percent = max(0.0, fee_percent)  # Ensure non-negative
        
        return round(amount * fee_percent, 2)

    async def create_settlement_batch(
        self, user_ids: List[str], bank_code: str, priority: str = "normal"
    ) -> Dict[str, Any]:
        """Create a settlement batch for multiple users going to the same bank."""
        batch_id = f"batch-{bank_code}-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        
        # Get pending disbursements for specified users to this bank
        result = await self.db.execute(
            select(Disbursements)
            .where(
                Disbursements.user_id.in_(user_ids),
                Disbursements.bank_code == bank_code,
                Disbursements.status == "pending",
            )
        )
        disbursements = result.scalars().all()
        
        if not disbursements:
            return {"success": False, "message": "No pending disbursements found"}
        
        total_amount = 0.0
        total_fee = 0.0
        
        # Update all disbursements with batch info
        for disb in disbursements:
            fee = await self.calculate_fee(disb.amount, bank_code, "batch")
            disb.settlement_batch_id = batch_id
            disb.settlement_priority = priority
            disb.processing_fee = fee
            disb.net_amount = round(disb.amount - fee, 2)
            disb.updated_at = now
            
            total_amount += disb.amount
            total_fee += fee
        
        await self.db.commit()
        
        logger.info(
            f"Created settlement batch {batch_id}: {len(disbursements)} disbursements, "
            f"total={total_amount:,.2f}, fee={total_fee:,.2f}"
        )
        
        return {
            "success": True,
            "batch_id": batch_id,
            "count": len(disbursements),
            "total_amount": total_amount,
            "total_fee": total_fee,
            "net_amount": round(total_amount - total_fee, 2),
        }

    async def mark_settlement_completed(self, batch_id: str) -> Dict[str, Any]:
        """Mark all disbursements in a batch as completed."""
        result = await self.db.execute(
            select(Disbursements).where(Disbursements.settlement_batch_id == batch_id)
        )
        disbursements = result.scalars().all()
        
        if not disbursements:
            return {"success": False, "message": "Batch not found"}
        
        now = datetime.now(timezone.utc)
        for disb in disbursements:
            disb.status = "completed"
            disb.completed_at = now
            disb.updated_at = now
        
        await self.db.commit()
        
        logger.info(f"Marked settlement batch {batch_id} as completed ({len(disbursements)} disbursements)")
        
        return {
            "success": True,
            "batch_id": batch_id,
            "completed_count": len(disbursements),
        }

    async def get_settlement_stats(self) -> Dict[str, Any]:
        """Get settlement statistics for super admin dashboard."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        
        # Today's stats
        today_result = await self.db.execute(
            select(
                func.count(Disbursements.id),
                func.coalesce(func.sum(Disbursements.amount), 0.0),
                func.coalesce(func.sum(Disbursements.processing_fee), 0.0),
            ).where(
                Disbursements.created_at >= today_start,
                Disbursements.status.in_(("completed", "processing")),
            )
        )
        today_row = today_result.one()
        
        # Week's stats
        week_result = await self.db.execute(
            select(
                func.count(Disbursements.id),
                func.coalesce(func.sum(Disbursements.amount), 0.0),
                func.coalesce(func.sum(Disbursements.processing_fee), 0.0),
            ).where(
                Disbursements.created_at >= week_start,
                Disbursements.status.in_(("completed", "processing")),
            )
        )
        week_row = week_result.one()
        
        # Pending requests
        pending_result = await self.db.execute(
            select(
                func.count(Disbursements.id),
                func.coalesce(func.sum(Disbursements.amount), 0.0),
            ).where(Disbursements.status == "pending")
        )
        pending_row = pending_result.one()
        
        # Failed requests
        failed_result = await self.db.execute(
            select(
                func.count(Disbursements.id),
                func.coalesce(func.sum(Disbursements.amount), 0.0),
            ).where(Disbursements.status == "failed")
        )
        failed_row = failed_result.one()
        
        return {
            "today": {
                "count": int(today_row[0] or 0),
                "total_amount": float(today_row[1] or 0.0),
                "total_fees": float(today_row[2] or 0.0),
            },
            "week": {
                "count": int(week_row[0] or 0),
                "total_amount": float(week_row[1] or 0.0),
                "total_fees": float(week_row[2] or 0.0),
            },
            "pending": {
                "count": int(pending_row[0] or 0),
                "total_amount": float(pending_row[1] or 0.0),
            },
            "failed": {
                "count": int(failed_row[0] or 0),
                "total_amount": float(failed_row[1] or 0.0),
            },
        }