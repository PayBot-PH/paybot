from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.subscriptions import SubscriptionsService


# ---------- Pydantic Schemas ----------
class SubscriptionsData(BaseModel):
    """Entity data schema (for create/update)"""
    plan_name: str
    amount: float
    currency: str = None
    interval: str = None
    customer_name: str = None
    customer_email: str = None
    status: str = None
    next_billing_date: Optional[datetime] = None
    total_cycles: int = None
    external_id: str = None
    xendit_id: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SubscriptionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    plan_name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    interval: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    status: Optional[str] = None
    next_billing_date: Optional[datetime] = None
    total_cycles: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SubscriptionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    plan_name: str
    amount: float
    currency: Optional[str] = None
    interval: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    status: Optional[str] = None
    next_billing_date: Optional[datetime] = None
    total_cycles: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SubscriptionsListResponse(BaseModel):
    """List response schema"""
    items: List[SubscriptionsResponse]
    total: int
    skip: int
    limit: int


class SubscriptionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[SubscriptionsData]


class SubscriptionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: SubscriptionsUpdateData


class SubscriptionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[SubscriptionsBatchUpdateItem]


class SubscriptionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/subscriptions",
    tags=["subscriptions"],
    service_class=SubscriptionsService,
    entity_name="Subscriptions",
    data_schema=SubscriptionsData,
    update_schema=SubscriptionsUpdateData,
    response_schema=SubscriptionsResponse,
    list_response_schema=SubscriptionsListResponse,
    batch_create_schema=SubscriptionsBatchCreateRequest,
    batch_update_schema=SubscriptionsBatchUpdateRequest,
    batch_delete_schema=SubscriptionsBatchDeleteRequest,
)
