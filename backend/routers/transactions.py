from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.transactions import TransactionsService


# ---------- Pydantic Schemas ----------
class TransactionsData(BaseModel):
    """Entity data schema (for create/update)"""
    transaction_type: str
    external_id: str = None
    xendit_id: str = None
    amount: float
    currency: str = None
    status: str
    description: str = None
    customer_name: str = None
    customer_email: str = None
    payment_url: str = None
    qr_code_url: str = None
    telegram_chat_id: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TransactionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    transaction_type: Optional[str] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    payment_url: Optional[str] = None
    qr_code_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TransactionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    transaction_type: str
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: float
    currency: Optional[str] = None
    status: str
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    payment_url: Optional[str] = None
    qr_code_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionsListResponse(BaseModel):
    """List response schema"""
    items: List[TransactionsResponse]
    total: int
    skip: int
    limit: int


class TransactionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[TransactionsData]


class TransactionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: TransactionsUpdateData


class TransactionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[TransactionsBatchUpdateItem]


class TransactionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/transactions",
    tags=["transactions"],
    service_class=TransactionsService,
    entity_name="Transactions",
    data_schema=TransactionsData,
    update_schema=TransactionsUpdateData,
    response_schema=TransactionsResponse,
    list_response_schema=TransactionsListResponse,
    batch_create_schema=TransactionsBatchCreateRequest,
    batch_update_schema=TransactionsBatchUpdateRequest,
    batch_delete_schema=TransactionsBatchDeleteRequest,
)
