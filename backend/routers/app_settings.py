import logging
from datetime import datetime

from core.config import settings
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
USDT_PHP_RATE_KEY = "usdt_php_rate"
DEFAULT_USDT_PHP_RATE = 58.0
USDT_TRC20_ADDRESS_KEY = "usdt_trc20_address"


class MaintenanceStatusResponse(BaseModel):
    maintenance_mode: bool


class MaintenanceUpdateRequest(BaseModel):
    enabled: bool


class UsdtPhpRateResponse(BaseModel):
    rate: float


class UsdtPhpRateUpdateRequest(BaseModel):
    rate: float


class UsdtTrc20AddressResponse(BaseModel):
    address: str


class UsdtTrc20AddressUpdateRequest(BaseModel):
    address: str


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


async def get_usdt_php_rate(db: AsyncSession) -> float:
    """Return the configured USDT→PHP exchange rate, falling back to the default."""
    value = await _get_setting(db, USDT_PHP_RATE_KEY)
    try:
        return float(value) if value is not None else DEFAULT_USDT_PHP_RATE
    except (ValueError, TypeError):
        return DEFAULT_USDT_PHP_RATE


async def get_usdt_trc20_address(db: AsyncSession) -> str:
    """Return the configured USDT TRC20 deposit address.

    Priority: DB-stored value → USDT_TRC20_ADDRESS env var / config default.
    """
    value = await _get_setting(db, USDT_TRC20_ADDRESS_KEY)
    if value:
        return value
    return settings.usdt_trc20_address


async def ensure_maintenance_off(db: AsyncSession) -> None:
    """Ensure maintenance mode is disabled. Called during application startup."""
    value = await _get_setting(db, MAINTENANCE_MODE_KEY)
    if value == "true":
        await _set_setting(db, MAINTENANCE_MODE_KEY, "false")
        logger.info("Maintenance mode was on at startup — automatically turned off.")


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


@router.get("/usdt-php-rate", response_model=UsdtPhpRateResponse)
async def get_usdt_php_rate_endpoint(db: AsyncSession = Depends(get_db)):
    """Return the current USDT→PHP exchange rate used for topup conversion. Publicly accessible."""
    rate = await get_usdt_php_rate(db)
    return UsdtPhpRateResponse(rate=rate)


@router.put("/usdt-php-rate", response_model=UsdtPhpRateResponse)
async def set_usdt_php_rate(
    body: UsdtPhpRateUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the USDT→PHP exchange rate used for wallet top-up conversions. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required.")
    if body.rate <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rate must be greater than zero.")
    await _set_setting(db, USDT_PHP_RATE_KEY, str(body.rate))
    logger.info("USDT→PHP rate updated to %s by user %s", body.rate, current_user.id)
    return UsdtPhpRateResponse(rate=body.rate)


@router.get("/usdt-trc20-address", response_model=UsdtTrc20AddressResponse)
async def get_usdt_trc20_address_endpoint(db: AsyncSession = Depends(get_db)):
    """Return the configured USDT TRC20 deposit wallet address. Publicly accessible."""
    address = await get_usdt_trc20_address(db)
    return UsdtTrc20AddressResponse(address=address)


@router.put("/usdt-trc20-address", response_model=UsdtTrc20AddressResponse)
async def set_usdt_trc20_address_endpoint(
    body: UsdtTrc20AddressUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the USDT TRC20 deposit wallet address. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required.")
    address = body.address.strip()
    if not address:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Address must not be empty.")
    if not (address.startswith("T") and len(address) == 34):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TRC20 address. Must start with 'T' and be exactly 34 characters.",
        )
    await _set_setting(db, USDT_TRC20_ADDRESS_KEY, address)
    logger.info("USDT TRC20 address updated to %s by user %s", address, current_user.id)
    return UsdtTrc20AddressResponse(address=address)
