import json
import logging
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.wallet_transactions import Wallet_transactionsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/wallet_transactions", tags=["wallet_transactions"])


# ---------- Pydantic Schemas ----------
class Wallet_transactionsData(BaseModel):
    """Entity data schema (for create/update)"""
    wallet_id: int
    transaction_type: str
    amount: float
    balance_before: float = None
    balance_after: float = None
    recipient: str = None
    note: str = None
    status: str = None
    reference_id: str = None
    created_at: Optional[datetime] = None


class Wallet_transactionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    wallet_id: Optional[int] = None
    transaction_type: Optional[str] = None
    amount: Optional[float] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    recipient: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: Optional[datetime] = None


class Wallet_transactionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    wallet_id: int
    transaction_type: str
    amount: float
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None
    recipient: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class Wallet_transactionsListResponse(BaseModel):
    """List response schema"""
    items: List[Wallet_transactionsResponse]
    total: int
    skip: int
    limit: int


class Wallet_transactionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Wallet_transactionsData]


class Wallet_transactionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Wallet_transactionsUpdateData


class Wallet_transactionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Wallet_transactionsBatchUpdateItem]


class Wallet_transactionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Wallet_transactionsListResponse)
async def query_wallet_transactionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query wallet_transactionss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying wallet_transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Wallet_transactionsService(db)
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
        logger.debug(f"Found {result['total']} wallet_transactionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying wallet_transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Wallet_transactionsListResponse)
async def query_wallet_transactionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query wallet_transactionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying wallet_transactionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Wallet_transactionsService(db)
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
        logger.debug(f"Found {result['total']} wallet_transactionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying wallet_transactionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Wallet_transactionsResponse)
async def get_wallet_transactions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single wallet_transactions by ID (user can only see their own records)"""
    logger.debug(f"Fetching wallet_transactions with id: {id}, fields={fields}")
    
    service = Wallet_transactionsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Wallet_transactions with id {id} not found")
            raise HTTPException(status_code=404, detail="Wallet_transactions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching wallet_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Wallet_transactionsResponse, status_code=201)
async def create_wallet_transactions(
    data: Wallet_transactionsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new wallet_transactions"""
    logger.debug(f"Creating new wallet_transactions with data: {data}")
    
    service = Wallet_transactionsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create wallet_transactions")
        
        logger.info(f"Wallet_transactions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating wallet_transactions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating wallet_transactions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Wallet_transactionsResponse], status_code=201)
async def create_wallet_transactionss_batch(
    request: Wallet_transactionsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple wallet_transactionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} wallet_transactionss")
    
    service = Wallet_transactionsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} wallet_transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Wallet_transactionsResponse])
async def update_wallet_transactionss_batch(
    request: Wallet_transactionsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple wallet_transactionss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} wallet_transactionss")
    
    service = Wallet_transactionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} wallet_transactionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Wallet_transactionsResponse)
async def update_wallet_transactions(
    id: int,
    data: Wallet_transactionsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing wallet_transactions (requires ownership)"""
    logger.debug(f"Updating wallet_transactions {id} with data: {data}")

    service = Wallet_transactionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Wallet_transactions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Wallet_transactions not found")
        
        logger.info(f"Wallet_transactions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating wallet_transactions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating wallet_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_wallet_transactionss_batch(
    request: Wallet_transactionsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple wallet_transactionss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} wallet_transactionss")
    
    service = Wallet_transactionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} wallet_transactionss successfully")
        return {"message": f"Successfully deleted {deleted_count} wallet_transactionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_wallet_transactions(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single wallet_transactions by ID (requires ownership)"""
    logger.debug(f"Deleting wallet_transactions with id: {id}")
    
    service = Wallet_transactionsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Wallet_transactions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Wallet_transactions not found")
        
        logger.info(f"Wallet_transactions {id} deleted successfully")
        return {"message": "Wallet_transactions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting wallet_transactions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")