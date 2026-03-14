from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.api_configs import Api_configsService


# ---------- Pydantic Schemas ----------
class Api_configsData(BaseModel):
    """Entity data schema (for create/update)"""
    config_key: str
    config_value: str
    service_name: str
    is_active: bool = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Api_configsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    config_key: Optional[str] = None
    config_value: Optional[str] = None
    service_name: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Api_configsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    config_key: str
    config_value: str
    service_name: str
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Api_configsListResponse(BaseModel):
    """List response schema"""
    items: List[Api_configsResponse]
    total: int
    skip: int
    limit: int


class Api_configsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Api_configsData]


class Api_configsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Api_configsUpdateData


class Api_configsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Api_configsBatchUpdateItem]


class Api_configsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/api_configs",
    tags=["api_configs"],
    service_class=Api_configsService,
    entity_name="Api_configs",
    data_schema=Api_configsData,
    update_schema=Api_configsUpdateData,
    response_schema=Api_configsResponse,
    list_response_schema=Api_configsListResponse,
    batch_create_schema=Api_configsBatchCreateRequest,
    batch_update_schema=Api_configsBatchUpdateRequest,
    batch_delete_schema=Api_configsBatchDeleteRequest,
)
