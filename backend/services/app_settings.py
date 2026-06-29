"""App Settings Service - manages application configuration values stored in database."""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.constants import (
    MAINTENANCE_MODE_KEY,
    USDT_PHP_RATE_KEY,
    DEFAULT_USDT_PHP_RATE,
    USDT_TRC20_ADDRESS_KEY,
)
from models.app_settings import AppSettings

logger = logging.getLogger(__name__)


async def _get_setting(db: AsyncSession, key: str) -> Optional[str]:
    """Retrieve a setting value from the database."""
    result = await db.execute(select(AppSettings).where(AppSettings.key == key).limit(1))
    row = result.scalars().first()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str) -> None:
    """Store or update a setting value in the database."""
    result = await db.execute(select(AppSettings).where(AppSettings.key == key).limit(1))
    row = result.scalars().first()
    now = datetime.now(timezone.utc)
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


async def get_maintenance_mode(db: AsyncSession) -> bool:
    """Get the current maintenance mode status."""
    value = await _get_setting(db, MAINTENANCE_MODE_KEY)
    return value == "true"


async def set_maintenance_mode(db: AsyncSession, enabled: bool) -> bool:
    """Enable or disable maintenance mode."""
    value = "true" if enabled else "false"
    await _set_setting(db, MAINTENANCE_MODE_KEY, value)
    return enabled
