"""
Maya Business Manager API Router
WeChat Pay QR code generation via Maya's checkout API.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.transactions import Transactions
from schemas.auth import UserResponse
from services.maya_manager_service import MayaManagerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/maya", tags=["maya"])


class WeChatQRRequest(BaseModel):
    amount: float
    description: str = "WeChat Pay"
    currency: str = "PHP"
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class AlipayQRRequest(BaseModel):
    amount: float
    description: str = "Alipay"
    currency: str = "PHP"
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/wechat-qr")
async def create_wechat_qr(
    req: WeChatQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a WeChat Pay QR checkout via Maya Business Manager."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    maya = MayaManagerService()
    result = await maya.create_wechat_qr(
        amount=req.amount,
        description=req.description,
        currency=req.currency,
        success_url=req.success_url,
        cancel_url=req.cancel_url,
    )

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Maya API error"))

    # Persist transaction
    try:
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="wechat_qr",
            external_id=result.get("reference_number", ""),
            xendit_id=result.get("checkout_id", ""),
            amount=req.amount,
            currency="PHP",
            status="pending",
            description=req.description,
            qr_code_url=result.get("checkout_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)
        result["transaction_id"] = txn.id
    except Exception as e:
        logger.error("DB save failed for wechat-qr: %s", e, exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass

    return {"success": True, "message": "WeChat QR created successfully", "data": result}


@router.post("/alipay-qr")
async def create_alipay_qr(
    req: AlipayQRRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an Alipay QR checkout via Maya Business Manager (default: PHP)."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    maya = MayaManagerService()
    result = await maya.create_alipay_qr(
        amount=req.amount,
        description=req.description,
        currency=req.currency,
        success_url=req.success_url,
        cancel_url=req.cancel_url,
    )

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Maya API error"))

    try:
        now = datetime.now()
        txn = Transactions(
            user_id=str(current_user.id),
            transaction_type="alipay_qr",
            external_id=result.get("reference_number", ""),
            xendit_id=result.get("checkout_id", ""),
            amount=req.amount,
            currency=req.currency.upper(),
            status="pending",
            description=req.description,
            qr_code_url=result.get("checkout_url", ""),
            created_at=now,
            updated_at=now,
        )
        db.add(txn)
        await db.commit()
        await db.refresh(txn)
        result["transaction_id"] = txn.id
    except Exception as e:
        logger.error("DB save failed for alipay-qr: %s", e, exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass

    return {"success": True, "message": "Alipay QR created successfully", "data": result}


@router.get("/checkouts/{checkout_id}")
async def get_checkout_status(
    checkout_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """Check the status of a Maya checkout session."""
    maya = MayaManagerService()
    result = await maya.get_checkout(checkout_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Checkout not found"))
    return result


@router.get("/redirect/success")
async def redirect_success(id: Optional[str] = None):
    """WeChat Pay success redirect from Maya."""
    return {"status": "success", "message": "WeChat payment completed", "checkout_id": id}


@router.get("/redirect/failed")
async def redirect_failed(id: Optional[str] = None):
    """WeChat Pay failed/cancelled redirect from Maya."""
    return {"status": "failed", "message": "WeChat payment was not completed", "checkout_id": id}
