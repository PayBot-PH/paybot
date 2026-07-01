import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.mask_crypto import decrypt_text, key_prefix
from services.api_configs import Api_configsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/api_configs", tags=["api_configs"])

ALLOWED_API_KEY_SCOPES = {
    "payments:read",
    "payments:write",
    "customers:read",
    "customers:write",
    "disbursements:read",
    "disbursements:write",
    "wallet:read",
    "wallet:write",
    "webhooks:read",
    "webhooks:manage",
}


def _require_developer_or_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not (perms.is_super_admin or perms.can_manage_bot):
        raise HTTPException(status_code=403, detail="Developer or super admin access required.")


def _normalize_scopes(raw_value: str) -> str:
    scopes = [scope.strip() for scope in str(raw_value or "").split(",") if scope.strip()]
    if not scopes:
        raise HTTPException(status_code=400, detail="API key scopes cannot be empty")

    invalid = sorted({scope for scope in scopes if scope not in ALLOWED_API_KEY_SCOPES})
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid API key scopes: {', '.join(invalid)}")

    deduped = sorted(set(scopes))
    return ",".join(deduped)


def _validate_and_normalize_api_config(payload: dict) -> dict:
    config_key = str(payload.get("config_key") or "").strip().lower()
    config_value = str(payload.get("config_value") or "").strip()

    if config_key.endswith("_scopes"):
        payload["config_value"] = _normalize_scopes(config_value)

    if "payment_api_key" in config_key and not config_key.endswith("_scopes"):
        if len(config_value) < 24:
            raise HTTPException(status_code=400, detail="Payment API key must be at least 24 characters")

    return payload


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


# ---------- Routes ----------
@router.get("", response_model=Api_configsListResponse)
async def query_api_configss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    reveal: bool = Query(False, description="Reveal decrypted config values"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query api_configss with filtering, sorting, and pagination (user can only see their own records)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Querying api_configss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Api_configsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
            reveal=reveal,
        )
        logger.debug(f"Found {result['total']} api_configss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying api_configss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Api_configsListResponse)
async def query_api_configss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    reveal: bool = Query(False, description="Reveal decrypted config values"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_developer_or_super_admin(current_user)
    # Query api_configss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying api_configss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Api_configsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            reveal=reveal,
        )
        logger.debug(f"Found {result['total']} api_configss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying api_configss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Api_configsResponse)
async def get_api_configs(
    id: int,
    reveal: bool = Query(False, description="Reveal decrypted config value"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single api_configs by ID (user can only see their own records)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Fetching api_configs with id: {id}, fields={fields}")
    
    service = Api_configsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Api_configs with id {id} not found")
            raise HTTPException(status_code=404, detail="Api_configs not found")

        if reveal and result.config_value and isinstance(result.config_value, str) and result.config_value.startswith(key_prefix):
            try:
                result.config_value = decrypt_text(result.config_value)
            except Exception:
                pass
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching api_configs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Api_configsResponse, status_code=201)
async def create_api_configs(
    data: Api_configsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new api_configs"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Creating new api_configs with data: {data}")
    
    service = Api_configsService(db)
    try:
        payload = _validate_and_normalize_api_config(data.model_dump())
        result = await service.create(payload, user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create api_configs")
        
        logger.info(f"Api_configs created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating api_configs: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating api_configs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Api_configsResponse], status_code=201)
async def create_api_configss_batch(
    request: Api_configsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple api_configss in a single request"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Batch creating {len(request.items)} api_configss")
    
    service = Api_configsService(db)
    
    try:
        results = await service.bulk_create(
            [_validate_and_normalize_api_config(item.model_dump()) for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} api_configss successfully")
        return results
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Api_configsResponse])
async def update_api_configss_batch(
    request: Api_configsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple api_configss in a single request (requires ownership)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Batch updating {len(request.items)} api_configss")
    
    service = Api_configsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            current = await service.get_by_id(item.id, user_id=str(current_user.id))
            if not current:
                continue
            merged_payload = {
                "config_key": current.config_key,
                "config_value": current.config_value,
            }
            merged_payload.update(update_dict)
            normalized = _validate_and_normalize_api_config(merged_payload)
            if "config_value" in update_dict:
                update_dict["config_value"] = normalized["config_value"]
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} api_configss successfully")
        return results
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Api_configsResponse)
async def update_api_configs(
    id: int,
    data: Api_configsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing api_configs (requires ownership)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Updating api_configs {id} with data: {data}")

    service = Api_configsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        current = await service.get_by_id(id, user_id=str(current_user.id))
        if not current:
            logger.warning(f"Api_configs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Api_configs not found")

        merged_payload = {
            "config_key": current.config_key,
            "config_value": current.config_value,
        }
        merged_payload.update(update_dict)
        normalized = _validate_and_normalize_api_config(merged_payload)
        if "config_value" in update_dict:
            update_dict["config_value"] = normalized["config_value"]

        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Api_configs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Api_configs not found")
        
        logger.info(f"Api_configs {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating api_configs {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating api_configs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_api_configss_batch(
    request: Api_configsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple api_configss by their IDs (requires ownership)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Batch deleting {len(request.ids)} api_configss")
    
    service = Api_configsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} api_configss successfully")
        return {"message": f"Successfully deleted {deleted_count} api_configss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_api_configs(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single api_configs by ID (requires ownership)"""
    _require_developer_or_super_admin(current_user)
    logger.debug(f"Deleting api_configs with id: {id}")
    
    service = Api_configsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Api_configs with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Api_configs not found")
        
        logger.info(f"Api_configs {id} deleted successfully")
        return {"message": "Api_configs deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting api_configs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")