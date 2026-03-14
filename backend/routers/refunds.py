from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.refunds import RefundsService


# ---------- Pydantic Schemas ----------
class RefundsData(BaseModel):
    """Entity data schema (for create/update)"""
    transaction_id: int = None
    external_id: str = None
    xendit_id: str = None
    amount: float
    reason: str = None
    status: str = None
    refund_type: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RefundsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    transaction_id: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: Optional[float] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    refund_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RefundsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    transaction_id: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: float
    reason: Optional[str] = None
    status: Optional[str] = None
    refund_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RefundsListResponse(BaseModel):
    """List response schema"""
    items: List[RefundsResponse]
    total: int
    skip: int
    limit: int


class RefundsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[RefundsData]


class RefundsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: RefundsUpdateData


class RefundsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[RefundsBatchUpdateItem]


class RefundsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/refunds",
    tags=["refunds"],
    service_class=RefundsService,
    entity_name="Refunds",
    data_schema=RefundsData,
    update_schema=RefundsUpdateData,
    response_schema=RefundsResponse,
    list_response_schema=RefundsListResponse,
    batch_create_schema=RefundsBatchCreateRequest,
    batch_update_schema=RefundsBatchUpdateRequest,
    batch_delete_schema=RefundsBatchDeleteRequest,
)
