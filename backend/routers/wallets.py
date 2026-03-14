import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.wallets import WalletsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/wallets", tags=["wallets"])


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


# ---------- Routes ----------
@router.get("", response_model=WalletsListResponse)
async def query_wallets(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query wallets with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying wallets: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = WalletsService(db)
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
        )
        logger.debug(f"Found {result['total']} wallets")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying wallets: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=WalletsListResponse)
async def query_wallets_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query wallets with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying wallets: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = WalletsService(db)
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
            sort=sort
        )
        logger.debug(f"Found {result['total']} wallets")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying wallets: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=WalletsResponse)
async def get_wallets(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single wallets by ID (user can only see their own records)"""
    logger.debug(f"Fetching wallets with id: {id}, fields={fields}")
    
    service = WalletsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Wallets with id {id} not found")
            raise HTTPException(status_code=404, detail="Wallets not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching wallets {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=WalletsResponse, status_code=201)
async def create_wallets(
    data: WalletsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new wallets"""
    logger.debug(f"Creating new wallets with data: {data}")
    
    service = WalletsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create wallets")
        
        logger.info(f"Wallets created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating wallets: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating wallets: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[WalletsResponse], status_code=201)
async def create_wallets_batch(
    request: WalletsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple wallets in a single request"""
    logger.debug(f"Batch creating {len(request.items)} wallets")
    
    service = WalletsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} wallets successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[WalletsResponse])
async def update_wallets_batch(
    request: WalletsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple wallets in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} wallets")
    
    service = WalletsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} wallets successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=WalletsResponse)
async def update_wallets(
    id: int,
    data: WalletsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing wallets (requires ownership)"""
    logger.debug(f"Updating wallets {id} with data: {data}")

    service = WalletsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Wallets with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Wallets not found")
        
        logger.info(f"Wallets {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating wallets {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating wallets {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_wallets_batch(
    request: WalletsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple wallets by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} wallets")
    
    service = WalletsService(db)
    try:
        deleted_count = await service.batch_delete(request.ids, user_id=str(current_user.id))
        logger.info(f"Batch deleted {deleted_count} wallets successfully")
        return {"message": f"Successfully deleted {deleted_count} wallets", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_wallets(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single wallets by ID (requires ownership)"""
    logger.debug(f"Deleting wallets with id: {id}")
    
    service = WalletsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Wallets with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Wallets not found")
        
        logger.info(f"Wallets {id} deleted successfully")
        return {"message": "Wallets deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting wallets {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")