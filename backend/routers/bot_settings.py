from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.bot_settings import Bot_settingsService


# ---------- Pydantic Schemas ----------
class Bot_settingsData(BaseModel):
    """Entity data schema (for create/update)"""
    welcome_message: str = None
    bot_status: str = None
    webhook_url: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Bot_settingsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    welcome_message: Optional[str] = None
    bot_status: Optional[str] = None
    webhook_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Bot_settingsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    welcome_message: Optional[str] = None
    bot_status: Optional[str] = None
    webhook_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Bot_settingsListResponse(BaseModel):
    """List response schema"""
    items: List[Bot_settingsResponse]
    total: int
    skip: int
    limit: int


class Bot_settingsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Bot_settingsData]


class Bot_settingsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Bot_settingsUpdateData


class Bot_settingsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Bot_settingsBatchUpdateItem]


class Bot_settingsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/bot_settings",
    tags=["bot_settings"],
    service_class=Bot_settingsService,
    entity_name="Bot_settings",
    data_schema=Bot_settingsData,
    update_schema=Bot_settingsUpdateData,
    response_schema=Bot_settingsResponse,
    list_response_schema=Bot_settingsListResponse,
    batch_create_schema=Bot_settingsBatchCreateRequest,
    batch_update_schema=Bot_settingsBatchUpdateRequest,
    batch_delete_schema=Bot_settingsBatchDeleteRequest,
)
