import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.subscriptions import SubscriptionsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/subscriptions", tags=["subscriptions"])


# ---------- Pydantic Schemas ----------
class SubscriptionsData(BaseModel):
    """Entity data schema (for create/update)"""
    plan_name: str
    amount: float
    currency: str = None
    interval: str = None
    customer_name: str = None
    customer_email: str = None
    status: str = None
    next_billing_date: Optional[datetime] = None
    total_cycles: int = None
    external_id: str = None
    xendit_id: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SubscriptionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    plan_name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    interval: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    status: Optional[str] = None
    next_billing_date: Optional[datetime] = None
    total_cycles: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SubscriptionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    plan_name: str
    amount: float
    currency: Optional[str] = None
    interval: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    status: Optional[str] = None
    next_billing_date: Optional[datetime] = None
    total_cycles: Optional[int] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SubscriptionsListResponse(BaseModel):
    """List response schema"""
    items: List[SubscriptionsResponse]
    total: int
    skip: int
    limit: int


class SubscriptionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[SubscriptionsData]


class SubscriptionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: SubscriptionsUpdateData


class SubscriptionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[SubscriptionsBatchUpdateItem]


class SubscriptionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=SubscriptionsListResponse)
async def query_subscriptionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query subscriptionss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying subscriptionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = SubscriptionsService(db)
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
        logger.debug(f"Found {result['total']} subscriptionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying subscriptionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=SubscriptionsListResponse)
async def query_subscriptionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query subscriptionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying subscriptionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = SubscriptionsService(db)
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
        logger.debug(f"Found {result['total']} subscriptionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying subscriptionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=SubscriptionsResponse)
async def get_subscriptions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single subscriptions by ID (user can only see their own records)"""
    logger.debug(f"Fetching subscriptions with id: {id}, fields={fields}")
    
    service = SubscriptionsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Subscriptions with id {id} not found")
            raise HTTPException(status_code=404, detail="Subscriptions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subscriptions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=SubscriptionsResponse, status_code=201)
async def create_subscriptions(
    data: SubscriptionsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new subscriptions"""
    logger.debug(f"Creating new subscriptions with data: {data}")
    
    service = SubscriptionsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create subscriptions")
        
        logger.info(f"Subscriptions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating subscriptions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating subscriptions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[SubscriptionsResponse], status_code=201)
async def create_subscriptionss_batch(
    request: SubscriptionsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple subscriptionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} subscriptionss")
    
    service = SubscriptionsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} subscriptionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[SubscriptionsResponse])
async def update_subscriptionss_batch(
    request: SubscriptionsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple subscriptionss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} subscriptionss")
    
    service = SubscriptionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} subscriptionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=SubscriptionsResponse)
async def update_subscriptions(
    id: int,
    data: SubscriptionsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing subscriptions (requires ownership)"""
    logger.debug(f"Updating subscriptions {id} with data: {data}")

    service = SubscriptionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Subscriptions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Subscriptions not found")
        
        logger.info(f"Subscriptions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating subscriptions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating subscriptions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_subscriptionss_batch(
    request: SubscriptionsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple subscriptionss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} subscriptionss")
    
    service = SubscriptionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} subscriptionss successfully")
        return {"message": f"Successfully deleted {deleted_count} subscriptionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_subscriptions(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single subscriptions by ID (requires ownership)"""
    logger.debug(f"Deleting subscriptions with id: {id}")
    
    service = SubscriptionsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Subscriptions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Subscriptions not found")
        
        logger.info(f"Subscriptions {id} deleted successfully")
        return {"message": "Subscriptions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting subscriptions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")