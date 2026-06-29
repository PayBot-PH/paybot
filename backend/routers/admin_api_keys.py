import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.api_configs import Api_configsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class ApiKeyIn(BaseModel):
    service_name: str
    config_key: str
    config_value: str
    is_active: Optional[bool] = True


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    user_id: str
    service_name: str
    config_key: str
    config_value: str
    is_active: Optional[bool] = None


def _require_super_admin(current_user: UserResponse):
    perms = current_user.permissions
    if not perms or not perms.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")


@router.get("/api-keys", response_model=List[ApiKeyOut])
async def list_api_keys(
    service_name: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(current_user)
    svc = Api_configsService(db)
    try:
        query = {"service_name": service_name} if service_name else None
        result = await svc.get_list(skip=0, limit=1000, query_dict=query, reveal=False)
        # return masked list by default
        return result["items"]
    except Exception as e:
        logger.error(f"Error listing API keys: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch API keys: {str(e)}"
        )


@router.post("/api-keys", response_model=ApiKeyOut, status_code=201)
async def upsert_api_key(
    data: ApiKeyIn,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(current_user)
    svc = Api_configsService(db)
    try:
        # Try find existing by service_name + config_key
        found = await svc.get_by_service_and_key(data.service_name, data.config_key)

        payload = {
            "service_name": data.service_name,
            "config_key": data.config_key,
            "config_value": data.config_value,
            "is_active": data.is_active,
        }

        if found:
            await svc.update(found.id, payload, user_id=str(current_user.id))
            # return masked record
            updated = await svc.get_by_id(found.id)
            if updated:
                updated.config_value = '••••••••'
            return updated

        created = await svc.create(payload, user_id=str(current_user.id))
        if created:
            created.config_value = '••••••••'
        return created
    except Exception as e:
        logger.error(f"Error upserting API key: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save API key: {str(e)}"
        )


@router.delete("/api-keys/{id}", status_code=204)
async def delete_api_key(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(current_user)
    svc = Api_configsService(db)
    try:
        success = await svc.delete(id, user_id=str(current_user.id))
        if not success:
            raise HTTPException(status_code=404, detail="API key not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting API key {id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete API key: {str(e)}"
        )
