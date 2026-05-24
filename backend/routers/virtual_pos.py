"""Virtual POS Terminal & Wallet Engine API Endpoints.

Provides RESTful interface for:
- Interactive POS terminal operations
- Wallet balance queries
- Payment processing (QR, Card, Withdrawals)
- Daily settlement batch processing
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from core.database import get_db
from services.virtual_pos_service import VirtualPOSService
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/virtual-pos", tags=["virtual-pos"])


# ============================================================================
# Pydantic Request/Response Schemas
# ============================================================================


class WalletResponse(BaseModel):
    """Wallet state response."""
    wallet_id: str
    available_balance: int  # Centavos
    pending_balance: int    # Centavos
    total_lifetime: int     # Centavos
    currency: str


class LedgerEntryResponse(BaseModel):
    """Ledger entry response."""
    id: int
    wallet_id: str
    type: str
    status: str
    amount_centavos: int
    external_reference: str
    payment_method: Optional[str] = None
    created_at: Optional[str] = None


class ChargeRequest(BaseModel):
    """POS charge request."""
    user_id: str = Field(..., description="Merchant wallet identifier")
    amount_pesos: float = Field(..., gt=0, description="Amount in PHP")
    payment_method: str = Field(
        "QRPH",
        description="Payment method: QRPH, VISA, MASTERCARD, GCASH, MAYA"
    )


class ChargeResponse(BaseModel):
    """POS charge response."""
    success: bool
    reference_no: str
    settlement: str  # INSTANT_CREDIT or PENDING_T1
    wallet: WalletResponse


class WithdrawRequest(BaseModel):
    """InstaPay withdrawal request."""
    user_id: str = Field(..., description="Merchant wallet identifier")
    amount_pesos: float = Field(..., gt=0, description="Amount to withdraw")
    bank_code: str = Field(..., description="Bank code (BDO, BPI, etc)")
    account_number: str = Field(..., description="Destination account number")


class WithdrawResponse(BaseModel):
    """Withdrawal response."""
    success: bool
    reference_no: str
    message: str
    wallet: WalletResponse


class WalletHistoryResponse(BaseModel):
    """Wallet with history response."""
    wallet: WalletResponse
    history: list[LedgerEntryResponse]


class SweepResponse(BaseModel):
    """Daily card sweep response."""
    success: bool
    message: str
    total_cleared: int
    wallet_count: int


# ============================================================================
# Dependency: Get VirtualPOSService
# ============================================================================


async def get_virtual_pos_service(db: AsyncSession = Depends(get_db)) -> VirtualPOSService:
    """Dependency to provide VirtualPOSService."""
    return VirtualPOSService(db)


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/wallet/{user_id}", response_model=WalletHistoryResponse)
async def get_wallet(
    user_id: str,
    limit: int = 50,
    service: VirtualPOSService = Depends(get_virtual_pos_service),
) -> dict:
    """Get wallet balance and recent transaction history."""
    try:
        result = await service.get_wallet_with_history(user_id, limit=limit)
        return result
    except Exception as e:
        logger.error(f"Failed to get wallet: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve wallet"
        )


@router.post("/charge", response_model=ChargeResponse)
async def process_charge(
    request: ChargeRequest,
    service: VirtualPOSService = Depends(get_virtual_pos_service),
) -> dict:
    """Process POS charge (QR or Card)."""
    try:
        is_card = request.payment_method.upper() in ["VISA", "MASTERCARD"]
        
        if is_card:
            result = await service.process_card_charge(
                wallet_id=request.user_id,
                amount_pesos=request.amount_pesos,
                card_type=request.payment_method.upper(),
            )
        else:
            result = await service.process_qr_charge(
                wallet_id=request.user_id,
                amount_pesos=request.amount_pesos,
                payment_method=request.payment_method.upper(),
            )
        
        return result
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Charge processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Charge processing failed"
        )


@router.post("/withdraw", response_model=WithdrawResponse)
async def process_withdrawal(
    request: WithdrawRequest,
    service: VirtualPOSService = Depends(get_virtual_pos_service),
) -> dict:
    """Process InstaPay withdrawal."""
    try:
        result = await service.process_withdrawal(
            wallet_id=request.user_id,
            amount_pesos=request.amount_pesos,
            bank_code=request.bank_code,
            account_number=request.account_number,
        )
        return result
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Withdrawal processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Withdrawal processing failed"
        )


@router.post("/system/sweep-cards", response_model=SweepResponse)
async def daily_card_sweep(
    service: VirtualPOSService = Depends(get_virtual_pos_service),
) -> dict:
    """Process daily T+1 card settlement batch."""
    try:
        result = await service.process_daily_card_sweep()
        return result
    except Exception as e:
        logger.error(f"Daily sweep failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Daily sweep processing failed"
        )
