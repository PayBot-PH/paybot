"""
Security Bank Collect (SBC WebCollect) API Router
Session-based checkout for GCash, Maya, BPI payments.
Note: SBC supports gcash, paymaya, bpi — not Alipay or WeChat.
The /alipay/qr and /wechat/qr endpoints are kept for backward compatibility
but now generate GCash and Maya sessions respectively.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.sbc_collect_service import SecurityBankCollectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sbc", tags=["sbc"])


# ---------- Schemas ----------

class SBCCheckoutRequest(BaseModel):
    amount: float
    description: str = "Payment"
    payment_method_types: List[str] = ["gcash"]
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class AlipayQRRequest(BaseModel):
    amount: float
    description: str = "GCash payment (via SBC)"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


class WeChatQRRequest(BaseModel):
    amount: float
    description: str = "Maya payment (via SBC)"
    success_url: Optional[str] = None
    failed_url: Optional[str] = None


# ---------- Endpoints ----------

@router.post("/checkout")
async def create_checkout_session(
    req: SBCCheckoutRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a SBC checkout session. Supported: gcash, paymaya, bpi."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    sbc = SecurityBankCollectService()
    result = await sbc.create_checkout_session(
        amount=req.amount,
        description=req.description,
        payment_method_types=req.payment_method_types,
        success_url=req.success_url,
        cancel_url=req.cancel_url,
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "SBC API error"))
    return result


@router.post("/gcash")
async def create_gcash_session(
    req: AlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a GCash checkout session via Security Bank Collect."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    sbc = SecurityBankCollectService()
    result = await sbc.create_gcash_session(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url,
        cancel_url=req.failed_url,
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "SBC API error"))
    return result


@router.post("/maya")
async def create_maya_session(
    req: WeChatQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Maya (PayMaya) checkout session via Security Bank Collect."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    sbc = SecurityBankCollectService()
    result = await sbc.create_maya_session(
        amount=req.amount,
        description=req.description,
        success_url=req.success_url,
        cancel_url=req.failed_url,
    )
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "SBC API error"))
    return result


# Backward-compatible aliases (bot commands use these)
@router.post("/alipay/qr")
async def create_alipay_compat(
    req: AlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Backward-compat: creates a GCash session (SBC does not support Alipay)."""
    return await create_gcash_session(req, current_user, db)


@router.post("/wechat/qr")
async def create_wechat_compat(
    req: WeChatQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Backward-compat: creates a Maya session (SBC does not support WeChat)."""
    return await create_maya_session(req, current_user, db)


@router.get("/sessions/{session_id}")
async def get_session_status(
    session_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Check the status of an SBC checkout session."""
    sbc = SecurityBankCollectService()
    result = await sbc.get_session(session_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Session not found"))
    return result


# Legacy alias
@router.get("/sources/{source_id}")
async def get_source_status(
    source_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    return await get_session_status(source_id, current_user)


@router.get("/redirect/success")
async def redirect_success(id: Optional[str] = None):
    """Payment success redirect from SBC."""
    return {"status": "success", "message": "Payment completed", "session_id": id}


@router.get("/redirect/failed")
async def redirect_failed(id: Optional[str] = None):
    """Payment failed/cancelled redirect from SBC."""
    return {"status": "failed", "message": "Payment was not completed", "session_id": id}
