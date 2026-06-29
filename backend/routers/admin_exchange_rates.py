import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_admin
from schemas.auth import UserResponse
from services.currency_service import CurrencyService
from models.exchange_rate_override import ExchangeRateOverride
from models.exchange_rate_history import ExchangeRateHistory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin/exchange-rates", tags=["admin-exchange-rates"])


# ---------- Schemas ----------
class RateOverrideRequest(BaseModel):
    currency_pair: str
    override_rate: float
    reason: str
    expires_at: Optional[datetime] = None


class RateOverrideResponse(BaseModel):
    id: int
    currency_pair: str
    override_rate: float
    reason: str
    created_by: str
    expires_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class RateHistoryResponse(BaseModel):
    id: int
    currency_pair: str
    rate: float
    provider: str
    source: Optional[str]
    recorded_at: datetime
    created_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class RateStatsResponse(BaseModel):
    currency_pair: str
    current: float
    min: float
    max: float
    avg: float
    volatility: float
    data_points: int


class SupportedCurrencyResponse(BaseModel):
    currencies: List[str]
    total: int


# ---------- Endpoints ----------


@router.get("/stats", response_model=RateStatsResponse)
async def get_rate_stats(
    currency_pair: str = Query(..., description="e.g., USDT_PHP"),
    days: int = Query(7, ge=1, le=90),
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> RateStatsResponse:
    """Get exchange rate statistics (volatility, min/max, trends).
    
    Requires super admin permission.
    """
    service = CurrencyService(db)

    try:
        stats = await service.get_rate_stats(currency_pair, days=days)
        return RateStatsResponse(currency_pair=currency_pair, **stats)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get rate stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rate statistics")


@router.get("/", response_model=List[RateOverrideResponse])
async def list_rate_overrides(
    currency_pair: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[RateOverrideResponse]:
    """List active (non-expired) rate overrides.
    
    Requires super admin permission.
    """
    now = datetime.utcnow()

    query = select(ExchangeRateOverride).where(
        ExchangeRateOverride.expires_at > now
    )

    if currency_pair:
        query = query.where(
            ExchangeRateOverride.currency_pair == currency_pair.upper()
        )

    query = query.order_by(ExchangeRateOverride.created_at.desc()).offset(skip).limit(
        limit
    )

    result = await db.execute(query)
    overrides = result.scalars().all()

    return [RateOverrideResponse.from_attributes(**{**o.__dict__}) for o in overrides]


@router.post("/override", response_model=RateOverrideResponse, status_code=201)
async def create_rate_override(
    request: RateOverrideRequest,
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> RateOverrideResponse:
    """Set an admin override for an exchange rate.
    
    Requires super admin permission.
    
    Args:
        currency_pair: Currency pair (e.g., USDT_PHP)
        override_rate: New rate to use
        reason: Reason for override (e.g., "Market volatility adjustment")
        expires_at: Optional expiration time (defaults to 24 hours if not set)
    """
    if request.override_rate <= 0:
        raise HTTPException(status_code=400, detail="Override rate must be positive")

    # Default: expires in 24 hours if not specified
    expires_at = request.expires_at or datetime.utcnow() + timedelta(hours=24)

    service = CurrencyService(db)

    try:
        override = await service.set_rate_override(
            currency_pair=request.currency_pair.upper(),
            override_rate=request.override_rate,
            reason=request.reason,
            created_by=current_user.user_id,
            expires_at=expires_at,
        )
        await db.commit()
        return RateOverrideResponse.model_validate(override)
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create rate override: {e}")
        raise HTTPException(status_code=500, detail="Failed to create override")


@router.delete("/override/{override_id}", status_code=204)
async def delete_rate_override(
    override_id: int,
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove an active rate override.
    
    Requires super admin permission.
    """
    service = CurrencyService(db)

    try:
        await service.remove_rate_override(override_id)
        await db.commit()
        logger.info(f"Admin {current_user.user_id} removed rate override {override_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete rate override: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete override")


@router.get("/history", response_model=List[RateHistoryResponse])
async def get_rate_history(
    currency_pair: Optional[str] = Query(None),
    days: int = Query(7, ge=1, le=90),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[RateHistoryResponse]:
    """Get historical exchange rates with filtering.
    
    Requires super admin permission.
    
    Args:
        currency_pair: Filter by currency pair (optional)
        days: Number of days to include (default 7)
        skip: Offset for pagination
        limit: Max results to return
    """
    cutoff_time = datetime.utcnow() - timedelta(days=days)

    query = select(ExchangeRateHistory).where(
        ExchangeRateHistory.recorded_at >= cutoff_time
    )

    if currency_pair:
        query = query.where(
            ExchangeRateHistory.currency_pair == currency_pair.upper()
        )

    query = (
        query.order_by(ExchangeRateHistory.recorded_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    records = result.scalars().all()

    return [RateHistoryResponse.model_validate(r) for r in records]


@router.get("/supported", response_model=SupportedCurrencyResponse)
async def get_supported_currencies(
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SupportedCurrencyResponse:
    """Get list of supported currencies for conversions.
    
    Requires super admin permission.
    """
    service = CurrencyService(db)
    currencies = await service.get_supported_currencies()

    return SupportedCurrencyResponse(
        currencies=sorted(currencies), total=len(currencies)
    )
