import logging
from datetime import datetime, timezone
from typing import Optional

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from models.app_settings import AppSettings
from pydantic import BaseModel
from schemas.auth import UserResponse
from services.exchange_rate_service import fetch_live_usdt_php_rate, get_cache_status as _get_exchange_rate_cache_status
from services.app_settings import (
    _get_setting,
    _set_setting,
    get_usdt_php_rate,
    get_usdt_trc20_address,
    ensure_maintenance_off,
    get_maintenance_mode,
    set_maintenance_mode,
)
from core.constants import (
    MAINTENANCE_MODE_KEY,
    USDT_PHP_RATE_KEY,
    DEFAULT_USDT_PHP_RATE,
    USDT_TRC20_ADDRESS_KEY,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/app-settings", tags=["app-settings"])

class MaintenanceStatusResponse(BaseModel):
    maintenance_mode: bool


class MaintenanceUpdateRequest(BaseModel):
    enabled: bool


class UsdtPhpRateResponse(BaseModel):
    rate: float


class LiveUsdtPhpRateResponse(BaseModel):
    rate: float
    source: str
    cached: bool


class UsdtPhpRateUpdateRequest(BaseModel):
    rate: float


class UsdtTrc20AddressResponse(BaseModel):
    address: str


class UsdtTrc20AddressUpdateRequest(BaseModel):
    address: str


@router.get("/maintenance", response_model=MaintenanceStatusResponse)
async def get_maintenance_mode_endpoint(db: AsyncSession = Depends(get_db)):
    """Get the current maintenance mode status. Publicly accessible."""
    enabled = await get_maintenance_mode(db)
    return MaintenanceStatusResponse(maintenance_mode=enabled)


@router.put("/maintenance", response_model=MaintenanceStatusResponse)
async def set_maintenance_mode_endpoint(
    body: MaintenanceUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable maintenance mode. Super admin only."""
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required.")
    enabled = await set_maintenance_mode(db, body.enabled)
    logger.info("Maintenance mode set to %s by user %s", "enabled" if enabled else "disabled", current_user.id)
    return MaintenanceStatusResponse(maintenance_mode=enabled)


@router.get("/usdt-php-rate", response_model=UsdtPhpRateResponse)
async def get_usdt_php_rate_endpoint(db: AsyncSession = Depends(get_db)):
    """Return the current USDT→PHP exchange rate used for topup conversion. Publicly accessible."""
    rate = await get_usdt_php_rate(db)
    return UsdtPhpRateResponse(rate=rate)


@router.get("/usdt-php-rate/live", response_model=LiveUsdtPhpRateResponse)
async def get_live_usdt_php_rate():
    """Fetch the real-time USDT→PHP exchange rate from CoinGecko. Publicly accessible.

    Results are cached for 5 minutes to stay within free-tier API limits.
    """
    try:
        rate = await fetch_live_usdt_php_rate()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    _, is_cached = _get_exchange_rate_cache_status()

    return LiveUsdtPhpRateResponse(
        rate=rate,
        source="CoinGecko",
        cached=is_cached,
    )


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
