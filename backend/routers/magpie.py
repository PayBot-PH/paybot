"""Legacy Magpie route compatibility layer.

Keeps old /api/v1/magpie endpoints working by forwarding to the xend router logic.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_payment_user
from schemas.auth import UserResponse
from routers import xend

router = APIRouter(prefix="/api/v1/magpie", tags=["magpie-legacy"])


@router.get("/payment-methods")
async def get_supported_payment_methods():
    return await xend.get_supported_payment_methods()


@router.get("/transaction-stats")
async def get_transaction_stats(
    current_user: UserResponse = Depends(get_payment_user("payments:read")),
    db: AsyncSession = Depends(get_db),
):
    return await xend.get_transaction_stats(current_user=current_user, db=db)


@router.post("/create-invoice")
async def create_invoice(
    data: xend.CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await xend.create_invoice(data=data, current_user=current_user, db=db)


@router.post("/create-payment-link")
async def create_payment_link(
    data: xend.CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await xend.create_payment_link(data=data, current_user=current_user, db=db)


@router.post("/create-qr-code")
async def create_qr_code(
    data: xend.CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await xend.create_qr_code(data=data, current_user=current_user, db=db)


@router.post("/pay-qrph")
async def pay_qrph(
    data: xend.PayQRPhRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await xend.pay_qrph(data=data, current_user=current_user, db=db)
