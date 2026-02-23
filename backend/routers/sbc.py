"""
Security Bank Collect (Magpie) API Router
Endpoints for Alipay and WeChat QR payment generation.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.sbc_collect_service import SecurityBankCollectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sbc", tags=["sbc"])


# ---------- Schemas ----------

class AlipayQRRequest(BaseModel):
    amount: float
    description: str = "Alipay payment"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


class WeChatQRRequest(BaseModel):
    amount: float
    description: str = "WeChat payment"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


# ---------- Endpoints ----------

@router.post("/alipay/qr")
async def create_alipay_qr(
    req: AlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an Alipay QR code for payment collection via Security Bank Collect."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    sbc = SecurityBankCollectService()
    result = await sbc.create_alipay_qr(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url,
        failed_url=req.failed_url,
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "SBC API error"))
    return result


@router.post("/wechat/qr")
async def create_wechat_qr(
    req: WeChatQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a WeChat Pay QR code for payment collection via Security Bank Collect."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    sbc = SecurityBankCollectService()
    result = await sbc.create_wechat_qr(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url,
        failed_url=req.failed_url,
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "SBC API error"))
    return result


@router.get("/sources/{source_id}")
async def get_source_status(
    source_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Check the status of an Alipay or WeChat source."""
    sbc = SecurityBankCollectService()
    result = await sbc.get_source(source_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Source not found"))
    return result


@router.get("/redirect/success")
async def redirect_success(reference_number: Optional[str] = None):
    """Payment success redirect from SBC."""
    return {"status": "success", "message": "Payment completed", "reference": reference_number}


@router.get("/redirect/failed")
async def redirect_failed(reference_number: Optional[str] = None):
    """Payment failed redirect from SBC."""
    return {"status": "failed", "message": "Payment was not completed", "reference": reference_number}
