import logging
from datetime import datetime

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from models.app_settings import AppSettings
from pydantic import BaseModel
from schemas.auth import UserResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/app-settings", tags=["app-settings"])

MAINTENANCE_MODE_KEY = "maintenance_mode"


class MaintenanceStatusResponse(BaseModel):
    maintenance_mode: bool


class MaintenanceUpdateRequest(BaseModel):
    enabled: bool


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    row = result.scalar_one_or_none()
    now = datetime.now()
    if row:
        row.value = value
        row.updated_at = now
    else:
        row = AppSettings(key=key, value=value, updated_at=now)
        db.add(row)
    await db.commit()


@router.get("/maintenance", response_model=MaintenanceStatusResponse)
async def get_maintenance_mode(db: AsyncSession = Depends(get_db)):
    """Get the current maintenance mode status. Publicly accessible."""
    value = await _get_setting(db, MAINTENANCE_MODE_KEY)
    return MaintenanceStatusResponse(maintenance_mode=value == "true")


@router.put("/maintenance", response_model=MaintenanceStatusResponse)
async def set_maintenance_mode(
    body: MaintenanceUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable maintenance mode. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required.")
    value = "true" if body.enabled else "false"
    await _set_setting(db, MAINTENANCE_MODE_KEY, value)
    logger.info("Maintenance mode set to %s by user %s", value, current_user.id)
    return MaintenanceStatusResponse(maintenance_mode=body.enabled)
