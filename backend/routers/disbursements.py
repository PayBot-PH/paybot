import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import ConfigDict, BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from services.disbursements import DisbursementsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/disbursements", tags=["disbursements"])


# ---------- Pydantic Schemas ----------
class DisbursementsData(BaseModel):
    """Entity data schema (for create/update)"""
    external_id: str = None
    xendit_id: str = None
    amount: float
    currency: str = None
    bank_code: str = None
    account_number: str = None
    account_name: str = None
    description: str = None
    status: str = None
    disbursement_type: str = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DisbursementsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    bank_code: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    disbursement_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DisbursementsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    external_id: Optional[str] = None
    xendit_id: Optional[str] = None
    amount: float
    currency: Optional[str] = None
    bank_code: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    disbursement_type: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DisbursementsListResponse(BaseModel):
    """List response schema"""
    items: List[DisbursementsResponse]
    total: int
    skip: int
    limit: int


class DisbursementsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[DisbursementsData]


class DisbursementsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: DisbursementsUpdateData


class DisbursementsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[DisbursementsBatchUpdateItem]


class DisbursementsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
async def _require_php_balance(db: AsyncSession, user_id: str, amount: float) -> Wallets:
    """Check user has sufficient PHP wallet balance. Raises 402 if insufficient."""
    result = await db.execute(
        select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "PHP")
    )
    wallet = result.scalar_one_or_none()
    balance = float(wallet.balance) if wallet else 0.0
    if balance <= 0:
        raise HTTPException(
            status_code=402,
            detail="Insufficient balance. Your wallet balance is ₱0.00. Please top up to continue.",
        )
    if balance < amount:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient balance. Available: ₱{balance:,.2f}, Required: ₱{amount:,.2f}. Please top up.",
        )
    return wallet


async def _deduct_php_balance(db: AsyncSession, wallet: Wallets, user_id: str, amount: float, note: str):
    """Deduct amount from PHP wallet and record a wallet transaction."""
    balance_before = wallet.balance
    wallet.balance = round(wallet.balance - amount, 2)
    wallet.updated_at = datetime.now()
    wtxn = Wallet_transactions(
        user_id=user_id,
        wallet_id=wallet.id,
        transaction_type="disbursement",
        amount=-amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        note=note,
        status="completed",
        created_at=datetime.now(),
    )
    db.add(wtxn)
    await db.commit()



@router.get("", response_model=DisbursementsListResponse)
async def query_disbursementss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query disbursementss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying disbursementss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = DisbursementsService(db)
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
        logger.debug(f"Found {result['total']} disbursementss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying disbursementss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=DisbursementsListResponse)
async def query_disbursementss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query disbursementss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying disbursementss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = DisbursementsService(db)
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
        logger.debug(f"Found {result['total']} disbursementss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying disbursementss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=DisbursementsResponse)
async def get_disbursements(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single disbursements by ID (user can only see their own records)"""
    logger.debug(f"Fetching disbursements with id: {id}, fields={fields}")
    
    service = DisbursementsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Disbursements with id {id} not found")
            raise HTTPException(status_code=404, detail="Disbursements not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching disbursements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=DisbursementsResponse, status_code=201)
async def create_disbursements(
    data: DisbursementsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new disbursements. Requires sufficient PHP wallet balance."""
    logger.debug(f"Creating new disbursements with data: {data}")

    user_id = str(current_user.id)

    # Balance gate — must have enough PHP to cover the disbursement
    wallet = await _require_php_balance(db, user_id, data.amount)

    service = DisbursementsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=user_id)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create disbursements")

        # Deduct from PHP wallet on successful creation
        await _deduct_php_balance(
            db, wallet, user_id, data.amount,
            f"Disbursement to {data.account_name or data.account_number or 'recipient'}: {data.description or ''}",
        )

        logger.info(f"Disbursements created successfully with id: {result.id}")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error creating disbursements: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating disbursements: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[DisbursementsResponse], status_code=201)
async def create_disbursementss_batch(
    request: DisbursementsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple disbursementss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} disbursementss")
    
    service = DisbursementsService(db)
    
    try:
        results = await service.bulk_create(
            [item.model_dump() for item in request.items],
            user_id=str(current_user.id),
        )
        logger.info(f"Batch created {len(results)} disbursementss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[DisbursementsResponse])
async def update_disbursementss_batch(
    request: DisbursementsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple disbursementss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} disbursementss")
    
    service = DisbursementsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} disbursementss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=DisbursementsResponse)
async def update_disbursements(
    id: int,
    data: DisbursementsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing disbursements (requires ownership)"""
    logger.debug(f"Updating disbursements {id} with data: {data}")

    service = DisbursementsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Disbursements with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Disbursements not found")
        
        logger.info(f"Disbursements {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating disbursements {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating disbursements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_disbursementss_batch(
    request: DisbursementsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple disbursementss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} disbursementss")
    
    service = DisbursementsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} disbursementss successfully")
        return {"message": f"Successfully deleted {deleted_count} disbursementss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_disbursements(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single disbursements by ID (requires ownership)"""
    logger.debug(f"Deleting disbursements with id: {id}")
    
    service = DisbursementsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Disbursements with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Disbursements not found")
        
        logger.info(f"Disbursements {id} deleted successfully")
        return {"message": "Disbursements deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting disbursements {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")