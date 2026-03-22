from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.customers import CustomersService


# ---------- Pydantic Schemas ----------
class CustomersData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    email: str = None
    phone: str = None
    notes: str = None
    total_payments: int = None
    total_amount: float = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    total_payments: Optional[int] = None
    total_amount: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomersResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    total_payments: Optional[int] = None
    total_amount: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomersListResponse(BaseModel):
    """List response schema"""
    items: List[CustomersResponse]
    total: int
    skip: int
    limit: int


class CustomersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[CustomersData]


class CustomersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: CustomersUpdateData


class CustomersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[CustomersBatchUpdateItem]


class CustomersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/customers",
    tags=["customers"],
    service_class=CustomersService,
    entity_name="Customers",
    data_schema=CustomersData,
    update_schema=CustomersUpdateData,
    response_schema=CustomersResponse,
    list_response_schema=CustomersListResponse,
    batch_create_schema=CustomersBatchCreateRequest,
    batch_update_schema=CustomersBatchUpdateRequest,
    batch_delete_schema=CustomersBatchDeleteRequest,
)
