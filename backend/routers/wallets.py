from datetime import datetime
from typing import List, Optional

from pydantic import ConfigDict, BaseModel

from routers.base_router import create_crud_router
from services.wallets import WalletsService


# ---------- Pydantic Schemas ----------
class WalletsData(BaseModel):
    """Entity data schema (for create/update)"""
    balance: float
    currency: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WalletsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    balance: Optional[float] = None
    currency: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WalletsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    balance: float
    currency: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WalletsListResponse(BaseModel):
    """List response schema"""
    items: List[WalletsResponse]
    total: int
    skip: int
    limit: int


class WalletsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[WalletsData]


class WalletsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: WalletsUpdateData


class WalletsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[WalletsBatchUpdateItem]


class WalletsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Router ----------
router = create_crud_router(
    prefix="/api/v1/entities/wallets",
    tags=["wallets"],
    service_class=WalletsService,
    entity_name="Wallets",
    data_schema=WalletsData,
    update_schema=WalletsUpdateData,
    response_schema=WalletsResponse,
    list_response_schema=WalletsListResponse,
    batch_create_schema=WalletsBatchCreateRequest,
    batch_update_schema=WalletsBatchUpdateRequest,
    batch_delete_schema=WalletsBatchDeleteRequest,
)
