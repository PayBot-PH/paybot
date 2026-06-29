import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.audit_logs import AuditLog
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit-logs"])

class AuditLogOut(BaseModel):
    id: int
    admin_id: str
    admin_name: Optional[str] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[str] = None
    payload: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AuditLogList(BaseModel):
    items: List[AuditLogOut]
    total: int

@router.get("", response_model=AuditLogList)
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    admin_id: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all audit logs. Only super admins can view.
    """
    if not current_user.permissions or not current_user.permissions.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required to view audit logs.",
        )

    query = select(AuditLog)

    if action:
        query = query.where(AuditLog.action == action)
    if admin_id:
        query = query.where(AuditLog.admin_id == admin_id)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Get items
    query = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
    res = await db.execute(query)
    items = res.scalars().all()

    return AuditLogList(items=items, total=total)
