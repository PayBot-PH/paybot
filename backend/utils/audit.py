import logging
from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from models.audit_logs import AuditLog
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

async def log_action(
    db: AsyncSession,
    user: UserResponse,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
    payload: Optional[Any] = None,
    ip_address: Optional[str] = None
):
    """
    Helper to record an administrative action in the audit logs.
    """
    try:
        entry = AuditLog(
            admin_id=user.id,
            admin_name=user.name or user.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            payload=payload,
            ip_address=ip_address
        )
        db.add(entry)
        # We don't commit here, assuming the caller will commit their transaction
        # or we rely on flush if it's a standalone log.
        await db.flush()
    except Exception as e:
        logger.error(f"Failed to record audit log: {e}")
