import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_payment_user
from schemas.auth import UserResponse
from services.maya_service import MayaService
from services.transactions import TransactionsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/xend", tags=["xend"])


class CreatePaymentRequest(BaseModel):
    amount: float
    description: str = ""
    descriptor: str = ""
    merchant_name: str = ""
    customer_name: str = ""
    customer_email: str = ""
    external_id: str = ""
    payment_methods: List[str] = Field(default_factory=list)


class PayQRPhRequest(BaseModel):
    qr_data: str
    amount: float
    description: str = ""
    merchant_name: str = ""
    reference_number: str = ""


XEND_PAYMENT_METHOD_ALIASES = {
    "visa": "visa",
    "mastercard": "mastercard",
    "jcb": "jcb",
    "amex": "amex",
    "american_express": "amex",
    "unionpay": "unionpay",
    "applepay": "apple_pay",
    "apple_pay": "apple_pay",
    "googlepay": "google_pay",
    "google_pay": "google_pay",
    "paypal": "paypal",
    "gcash": "gcash",
    "grabpay": "grabpay",
    "maya": "maya",
    "paymaya": "maya",
    "alipay": "alipay",
    "wechat": "wechat_pay",
    "wechatpay": "wechat_pay",
    "wechat_pay": "wechat_pay",
    "bank_transfer": "bank_transfer",
    "instapay": "instapay",
    "pesonet": "pesonet",
    "qr": "qrph",
    "qrph": "qrph",
}

XEND_SUPPORTED_PAYMENT_METHODS = sorted(set(XEND_PAYMENT_METHOD_ALIASES.values()))


def _normalize_payment_methods(methods: List[str]) -> tuple[List[str], List[str]]:
    normalized: List[str] = []
    invalid: List[str] = []
    for raw in methods or []:
        key = (raw or "").strip().lower().replace("-", "_").replace(" ", "_")
        if not key:
            continue
        mapped = XEND_PAYMENT_METHOD_ALIASES.get(key)
        if not mapped:
            invalid.append(raw)
            continue
        if mapped not in normalized:
            normalized.append(mapped)
    return normalized, invalid


@router.get("/payment-methods")
async def get_supported_payment_methods():
    return {
        "success": True,
        "source": "https://xend.apidocumentation.com/xend-platform/payments/payment-methods",
        "payment_methods": XEND_SUPPORTED_PAYMENT_METHODS,
    }


@router.get("/transaction-stats")
async def get_transaction_stats(
    current_user: UserResponse = Depends(get_payment_user("payments:read")),
    db: AsyncSession = Depends(get_db),
):
    txn_service = TransactionsService(db)
    stats = await txn_service.get_user_stats(str(current_user.id))
    return {"success": True, **stats}


async def _create_checkout_transaction(
    *,
    db: AsyncSession,
    current_user: UserResponse,
    request: CreatePaymentRequest,
    transaction_type: str,
    external_prefix: str,
    use_qr: bool,
):
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    payment_methods, invalid_methods = _normalize_payment_methods(request.payment_methods)
    if invalid_methods:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported payment method(s): {', '.join(invalid_methods)}. Supported: {', '.join(XEND_SUPPORTED_PAYMENT_METHODS)}",
        )

    service = MayaService()
    external_id = request.external_id or f"{external_prefix}-{uuid.uuid4().hex[:12]}"
    merchant_name = (request.merchant_name or "").strip()
    descriptor = (request.descriptor or "").strip().upper()[:22]
    base_description = (request.description or "").strip() or "xend payment"

    # Keep the user description intact while injecting descriptor/merchant context
    # so checkout pages and records visibly reflect these settings.
    checkout_desc = base_description
    if descriptor and descriptor not in checkout_desc:
        checkout_desc = f"{descriptor} | {checkout_desc}"
    elif merchant_name and merchant_name not in checkout_desc:
        checkout_desc = f"{merchant_name} | {checkout_desc}"

    metadata = {
        "payment_methods": payment_methods,
        "merchant_name": merchant_name,
        "descriptor": descriptor,
        "source": "xend",
    }

    if use_qr:
        result = await service.create_qr_payment(
            amount=request.amount,
            description=checkout_desc,
            external_id=external_id,
            payment_methods=payment_methods,
            merchant_name=merchant_name,
            descriptor=descriptor,
        )
    else:
        result = await service.create_checkout(
            amount=request.amount,
            description=checkout_desc,
            descriptor=descriptor,
            merchant_name=merchant_name,
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            external_id=external_id,
            metadata=metadata,
        )

    if not result.get("success"):
        return {"success": False, "message": result.get("error", "Failed to create payment")}

    txn_service = TransactionsService(db)
    txn = await txn_service.create_transaction(
        user_id=str(current_user.id),
        transaction_type=transaction_type,
        amount=request.amount,
        external_id=result.get("external_id", external_id),
        gateway_id=result.get("checkout_id", "") or result.get("qr_id", ""),
        description=request.description,
        customer_name=request.customer_name,
        customer_email=request.customer_email,
        payment_url=result.get("checkout_url", "") or result.get("redirect_url", "") or result.get("qr_content", ""),
    )

    return {
        "success": True,
        "message": f"xend {transaction_type.replace('_', ' ')} created",
        "data": {
            "transaction_id": txn.id,
            "external_id": result.get("external_id", external_id),
            "checkout_id": result.get("checkout_id", ""),
            "invoice_id": result.get("checkout_id", ""),
            "payment_link_id": result.get("checkout_id", ""),
            "qr_id": result.get("qr_id", ""),
            "invoice_url": result.get("checkout_url", "") or result.get("redirect_url", ""),
            "checkout_url": result.get("checkout_url", "") or result.get("redirect_url", ""),
            "payment_link_url": result.get("checkout_url", "") or result.get("redirect_url", ""),
            "qr_image_url": result.get("qr_content", "") or result.get("redirect_url", ""),
            "amount": request.amount,
            "payment_methods": payment_methods,
            "merchant_name": merchant_name,
            "descriptor": descriptor,
            "applied_description": checkout_desc,
            "gateway": "xend",
        },
    }


@router.post("/create-invoice")
async def create_invoice(
    data: CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await _create_checkout_transaction(
        db=db,
        current_user=current_user,
        request=data,
        transaction_type="invoice",
        external_prefix="xend-inv",
        use_qr=False,
    )


@router.post("/create-payment-link")
async def create_payment_link(
    data: CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await _create_checkout_transaction(
        db=db,
        current_user=current_user,
        request=data,
        transaction_type="payment_link",
        external_prefix="xend-pl",
        use_qr=False,
    )


@router.post("/create-qr-code")
async def create_qr_code(
    data: CreatePaymentRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    return await _create_checkout_transaction(
        db=db,
        current_user=current_user,
        request=data,
        transaction_type="qr_code",
        external_prefix="xend-qr",
        use_qr=True,
    )


@router.post("/pay-qrph")
async def pay_qrph(
    data: PayQRPhRequest,
    current_user: UserResponse = Depends(get_payment_user("payments:write")),
    db: AsyncSession = Depends(get_db),
):
    request = CreatePaymentRequest(
        amount=data.amount,
        description=data.description or data.merchant_name or "QRPH payment",
        merchant_name=data.merchant_name,
        external_id=data.reference_number,
        payment_methods=["qrph"],
    )
    return await _create_checkout_transaction(
        db=db,
        current_user=current_user,
        request=request,
        transaction_type="qrph_payment",
        external_prefix="xend-qrph",
        use_qr=True,
    )
