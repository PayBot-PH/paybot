import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.refunds import RefundsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/refunds", tags=["refunds"])


# ---------- Pydantic Schemas ----------
class RefundsData(BaseModel):
    """Entity data schema (for create/update)"""
    transaction_id: int = None
    external_id: str = None
    xendit_id: str = None
    amount: float
    reason: str = None
    status: str = None
    refund_type: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RefundsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    transaction_id: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: Optional[float] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    refund_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RefundsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    transaction_id: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: float
    reason: Optional[str] = None
    status: Optional[str] = None
    refund_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RefundsListResponse(BaseModel):
    """List response schema"""
    items: List[RefundsResponse]
    total: int
    skip: int
    limit: int


class RefundsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[RefundsData]


class RefundsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: RefundsUpdateData


class RefundsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[RefundsBatchUpdateItem]


class RefundsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=RefundsListResponse)
async def query_refundss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query refundss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying refundss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = RefundsService(db)
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
        logger.debug(f"Found {result['total']} refundss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying refundss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=RefundsListResponse)
async def query_refundss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query refundss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying refundss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = RefundsService(db)
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
        logger.debug(f"Found {result['total']} refundss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying refundss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=RefundsResponse)
async def get_refunds(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single refunds by ID (user can only see their own records)"""
    logger.debug(f"Fetching refunds with id: {id}, fields={fields}")
    
    service = RefundsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Refunds with id {id} not found")
            raise HTTPException(status_code=404, detail="Refunds not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching refunds {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=RefundsResponse, status_code=201)
async def create_refunds(
    data: RefundsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new refunds"""
    logger.debug(f"Creating new refunds with data: {data}")
    
    service = RefundsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create refunds")
        
        logger.info(f"Refunds created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating refunds: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating refunds: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[RefundsResponse], status_code=201)
async def create_refundss_batch(
    request: RefundsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple refundss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} refundss")
    
    service = RefundsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} refundss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[RefundsResponse])
async def update_refundss_batch(
    request: RefundsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple refundss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} refundss")
    
    service = RefundsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} refundss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=RefundsResponse)
async def update_refunds(
    id: int,
    data: RefundsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing refunds (requires ownership)"""
    logger.debug(f"Updating refunds {id} with data: {data}")

    service = RefundsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Refunds with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Refunds not found")
        
        logger.info(f"Refunds {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating refunds {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating refunds {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_refundss_batch(
    request: RefundsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple refundss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} refundss")
    
    service = RefundsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} refundss successfully")
        return {"message": f"Successfully deleted {deleted_count} refundss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_refunds(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single refunds by ID (requires ownership)"""
    logger.debug(f"Deleting refunds with id: {id}")
    
    service = RefundsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Refunds with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Refunds not found")
        
        logger.info(f"Refunds {id} deleted successfully")
        return {"message": "Refunds deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting refunds {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")