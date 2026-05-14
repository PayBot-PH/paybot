import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.transactions import TransactionsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/transactions", tags=["transactions"])


# ---------- Pydantic Schemas ----------
class TransactionsData(BaseModel):
    """Entity data schema (for create/update)"""
    transaction_type: str
    external_id: str = None
    xendit_id: str = None
    amount: float
    currency: str = None
    status: str
    description: str = None
    customer_name: str = None
    customer_email: str = None
    payment_url: str = None
    qr_code_url: str = None
    telegram_chat_id: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TransactionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    transaction_type: Optional[str] = None
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    payment_url: Optional[str] = None
    qr_code_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TransactionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    transaction_type: str
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: float
    currency: Optional[str] = None
    status: str
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    payment_url: Optional[str] = None
    qr_code_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionsListResponse(BaseModel):
    """List response schema"""
    items: List[TransactionsResponse]
    total: int
    skip: int
    limit: int


class TransactionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[TransactionsData]


class TransactionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: TransactionsUpdateData


class TransactionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[TransactionsBatchUpdateItem]


class TransactionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=TransactionsListResponse)
async def query_transactionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query transactionss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = TransactionsService(db)
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
        logger.debug(f"Found {result['total']} transactionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=TransactionsListResponse)
async def query_transactionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query transactionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = TransactionsService(db)
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
        logger.debug(f"Found {result['total']} transactionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=TransactionsResponse)
async def get_transactions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single transactions by ID (user can only see their own records)"""
    logger.debug(f"Fetching transactions with id: {id}, fields={fields}")
    
    service = TransactionsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Transactions with id {id} not found")
            raise HTTPException(status_code=404, detail="Transactions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=TransactionsResponse, status_code=201)
async def create_transactions(
    data: TransactionsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new transactions"""
    logger.debug(f"Creating new transactions with data: {data}")
    
    service = TransactionsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create transactions")
        
        logger.info(f"Transactions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating transactions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating transactions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[TransactionsResponse], status_code=201)
async def create_transactionss_batch(
    request: TransactionsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple transactionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} transactionss")
    
    service = TransactionsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[TransactionsResponse])
async def update_transactionss_batch(
    request: TransactionsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple transactionss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} transactionss")
    
    service = TransactionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=TransactionsResponse)
async def update_transactions(
    id: int,
    data: TransactionsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing transactions (requires ownership)"""
    logger.debug(f"Updating transactions {id} with data: {data}")

    service = TransactionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Transactions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Transactions not found")
        
        logger.info(f"Transactions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating transactions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_transactionss_batch(
    request: TransactionsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple transactionss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} transactionss")
    
    service = TransactionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} transactionss successfully")
        return {"message": f"Successfully deleted {deleted_count} transactionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_transactions(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single transactions by ID (requires ownership)"""
    logger.debug(f"Deleting transactions with id: {id}")
    
    service = TransactionsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Transactions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Transactions not found")
        
        logger.info(f"Transactions {id} deleted successfully")
        return {"message": "Transactions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")