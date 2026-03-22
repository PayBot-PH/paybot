from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.bot_logs import Bot_logsService


# ---------- Pydantic Schemas ----------
class Bot_logsData(BaseModel):
    """Entity data schema (for create/update)"""
    log_type: str
    message: str
    telegram_chat_id: str = None
    telegram_username: str = None
    command: str = None
    created_at: Optional[datetime] = None


class Bot_logsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    log_type: Optional[str] = None
    message: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_username: Optional[str] = None
    command: Optional[str] = None
    created_at: Optional[datetime] = None


class Bot_logsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    log_type: str
    message: str
    telegram_chat_id: Optional[str] = None
    telegram_username: Optional[str] = None
    command: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Bot_logsListResponse(BaseModel):
    """List response schema"""
    items: List[Bot_logsResponse]
    total: int
    skip: int
    limit: int


class Bot_logsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Bot_logsData]


class Bot_logsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Bot_logsUpdateData


class Bot_logsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Bot_logsBatchUpdateItem]


class Bot_logsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/bot_logs",
    tags=["bot_logs"],
    service_class=Bot_logsService,
    entity_name="Bot_logs",
    data_schema=Bot_logsData,
    update_schema=Bot_logsUpdateData,
    response_schema=Bot_logsResponse,
    list_response_schema=Bot_logsListResponse,
    batch_create_schema=Bot_logsBatchCreateRequest,
    batch_update_schema=Bot_logsBatchUpdateRequest,
    batch_delete_schema=Bot_logsBatchDeleteRequest,
)
