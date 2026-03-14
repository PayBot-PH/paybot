import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.bot_logs import Bot_logsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/bot_logs", tags=["bot_logs"])


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


# ---------- Routes ----------
@router.get("", response_model=Bot_logsListResponse)
async def query_bot_logs(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query bot_logs with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying bot_logs: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Bot_logsService(db)
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
        logger.debug(f"Found {result['total']} bot_logs")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bot_logs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Bot_logsListResponse)
async def query_bot_logs_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query bot_logs with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying bot_logs: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Bot_logsService(db)
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
        logger.debug(f"Found {result['total']} bot_logs")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying bot_logs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Bot_logsResponse)
async def get_bot_logs(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single bot_logs by ID (user can only see their own records)"""
    logger.debug(f"Fetching bot_logs with id: {id}, fields={fields}")
    
    service = Bot_logsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Bot_logs with id {id} not found")
            raise HTTPException(status_code=404, detail="Bot_logs not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching bot_logs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Bot_logsResponse, status_code=201)
async def create_bot_logs(
    data: Bot_logsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new bot_logs"""
    logger.debug(f"Creating new bot_logs with data: {data}")
    
    service = Bot_logsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create bot_logs")
        
        logger.info(f"Bot_logs created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating bot_logs: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating bot_logs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Bot_logsResponse], status_code=201)
async def create_bot_logs_batch(
    request: Bot_logsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple bot_logs in a single request"""
    logger.debug(f"Batch creating {len(request.items)} bot_logs")
    
    service = Bot_logsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} bot_logs successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Bot_logsResponse])
async def update_bot_logs_batch(
    request: Bot_logsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple bot_logs in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} bot_logs")
    
    service = Bot_logsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} bot_logs successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Bot_logsResponse)
async def update_bot_logs(
    id: int,
    data: Bot_logsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing bot_logs (requires ownership)"""
    logger.debug(f"Updating bot_logs {id} with data: {data}")

    service = Bot_logsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Bot_logs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Bot_logs not found")
        
        logger.info(f"Bot_logs {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating bot_logs {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating bot_logs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_bot_logs_batch(
    request: Bot_logsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple bot_logs by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} bot_logs")
    
    service = Bot_logsService(db)
    try:
        deleted_count = await service.batch_delete(request.ids, user_id=str(current_user.id))
        logger.info(f"Batch deleted {deleted_count} bot_logs successfully")
        return {"message": f"Successfully deleted {deleted_count} bot_logs", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_bot_logs(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single bot_logs by ID (requires ownership)"""
    logger.debug(f"Deleting bot_logs with id: {id}")
    
    service = Bot_logsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Bot_logs with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Bot_logs not found")
        
        logger.info(f"Bot_logs {id} deleted successfully")
        return {"message": "Bot_logs deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bot_logs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")