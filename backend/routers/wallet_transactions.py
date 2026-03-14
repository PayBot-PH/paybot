from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.wallet_transactions import Wallet_transactionsService


# ---------- Pydantic Schemas ----------
class Wallet_transactionsData(BaseModel):
    """Entity data schema (for create/update)"""
    wallet_id: int
    transaction_type: str
    amount: float
    balance_before: float = None
    balance_after: float = None
    recipient: str = None
    note: str = None
    status: str = None
    reference_id: str = None
    created_at: Optional[datetime] = None


class Wallet_transactionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    wallet_id: Optional[int] = None
    transaction_type: Optional[str] = None
    amount: Optional[float] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    recipient: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: Optional[datetime] = None


class Wallet_transactionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    wallet_id: int
    transaction_type: str
    amount: float
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    recipient: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Wallet_transactionsListResponse(BaseModel):
    """List response schema"""
    items: List[Wallet_transactionsResponse]
    total: int
    skip: int
    limit: int


class Wallet_transactionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Wallet_transactionsData]


class Wallet_transactionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Wallet_transactionsUpdateData


class Wallet_transactionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Wallet_transactionsBatchUpdateItem]


class Wallet_transactionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/wallet_transactions",
    tags=["wallet_transactions"],
    service_class=Wallet_transactionsService,
    entity_name="Wallet_transactions",
    data_schema=Wallet_transactionsData,
    update_schema=Wallet_transactionsUpdateData,
    response_schema=Wallet_transactionsResponse,
    list_response_schema=Wallet_transactionsListResponse,
    batch_create_schema=Wallet_transactionsBatchCreateRequest,
    batch_update_schema=Wallet_transactionsBatchUpdateRequest,
    batch_delete_schema=Wallet_transactionsBatchDeleteRequest,
)
