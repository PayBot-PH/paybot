import logging
import uuid
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from core.auth import pwd_context
from dependencies.auth import get_current_user_id, get_current_admin, get_admin_user
from dependencies.database import get_db
from schemas.auth import UserResponse
from schemas.pos_terminal import (
    POSTerminalCreate,
    POSTerminalUpdate,
    POSTerminalResponse,
    POSTerminalListResponse,
    POSTerminalRequestCreate,
    POSTerminalRequestResponse,
    POSTerminalRequestListResponse,
    POSTerminalRequestApprove,
    POSTerminalTransactionCreate,
    POSTerminalTransactionResponse,
    POSTerminalTransactionListResponse,
    APIResponse,
    TerminalAssignmentResponse,
    CreateCheckoutResponse,
    POSTerminalDeviceCreate,
    POSTerminalDeviceResponse,
    POSTerminalDeviceListResponse,
)
from services.pos_terminal import POSTerminalService
from services.event_bus import event_bus
from models.pos_terminal import POSTerminal, TerminalStatus, POSTerminalTransaction
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/pos-terminals", tags=["POS Terminals"])



# ============ Device Endpoints ============


@router.post("/devices/register", response_model=APIResponse)
async def register_device(
    device_data: POSTerminalDeviceCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new device or update heartbeat (Public)."""
    service = POSTerminalService(db)
    result = await service.register_device(device_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to register device"))
    
    return APIResponse(
        success=True,
        message=result.get("message"),
        data={
            "is_authorized": result.get("device").is_authorized,
            "is_linked": result.get("is_linked"),
            "terminal_id": result.get("terminal_id"),
        },
    )


@router.get("/devices", response_model=POSTerminalDeviceListResponse)
async def list_devices(
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all registered devices (admin only)."""
    service = POSTerminalService(db)
    devices, total = await service.list_devices()
    
    return POSTerminalDeviceListResponse(
        success=True,
        data=[POSTerminalDeviceResponse.model_validate(d) for d in devices],
        total=total,
    )


@router.post("/devices/{device_id}/assign", response_model=APIResponse)
async def assign_device(
    device_id: str,
    user_id: str,
    terminal_name: Optional[str] = None,
    current_admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Assign a device to a user (admin only)."""
    service = POSTerminalService(db)
    result = await service.assign_device(device_id, user_id, terminal_name)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to assign device"))
    
    return APIResponse(success=True, message=result.get("message"))


# ============ Terminal Endpoints ============



@router.post("/", response_model=APIResponse)
async def create_terminal(
    create_data: POSTerminalCreate,
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new POS terminal (admin only)."""
    service = POSTerminalService(db)
    result = await service.create_terminal(
        user_id=create_data.user_id,
        create_data=create_data,
        assigned_by=user_id,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create terminal"))
    return APIResponse(
        success=True,
        message=result.get("message"),
        data={"terminal_code": result.get("terminal_code"), "terminal_id": result.get("terminal_id")},
    )


@router.get("/", response_model=POSTerminalListResponse)
async def list_user_terminals(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List all terminals for the current user."""
    service = POSTerminalService(db)
    terminals, total = await service.list_user_terminals(user_id, page=page, per_page=per_page)
    
    return POSTerminalListResponse(
        success=True,
        data=[POSTerminalResponse.model_validate(t) for t in terminals],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/all", response_model=POSTerminalListResponse)
async def list_all_terminals(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all terminals (admin only)."""
    service = POSTerminalService(db)
    terminals, total = await service.list_all_terminals(page=page, per_page=per_page, status=status)
    
    return POSTerminalListResponse(
        success=True,
        data=[POSTerminalResponse.model_validate(t) for t in terminals],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{terminal_id}", response_model=APIResponse)
async def get_terminal(
    terminal_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific terminal."""
    service = POSTerminalService(db)
    terminal = await service.get_terminal_by_id(terminal_id)
    
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    if terminal.user_id != user_id and not user_id.startswith("admin_"):
        raise HTTPException(status_code=403, detail="Not authorized to view this terminal")
    
    return APIResponse(
        success=True,
        data={"terminal": POSTerminalResponse.model_validate(terminal).model_dump()},
    )


@router.patch("/{terminal_id}", response_model=APIResponse)
async def update_terminal(
    terminal_id: int,
    update_data: POSTerminalUpdate,
    current_admin: UserResponse = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a terminal (admin only)."""
    service = POSTerminalService(db)
    
    # Only super admin can re-assign terminals to other users
    if update_data.user_id:
        if not current_admin.permissions or not current_admin.permissions.is_super_admin:
            raise HTTPException(
                status_code=403, 
                detail="Super admin access required to re-assign terminals"
            )

    terminal = await service.get_terminal_by_id(terminal_id)
    
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    result = await service.update_terminal(terminal_id, update_data)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to update terminal"))
    
    return APIResponse(success=True, message=result.get("message"))


@router.post("/{terminal_id}/deactivate", response_model=APIResponse)
async def deactivate_terminal(
    terminal_id: int,
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a terminal (admin only)."""
    service = POSTerminalService(db)
    result = await service.deactivate_terminal(terminal_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to deactivate terminal"))
    
    return APIResponse(success=True, message=result.get("message"))


# ============ Terminal Request Endpoints ============


@router.post("/requests", response_model=APIResponse)
async def create_terminal_request(
    request_data: POSTerminalRequestCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a terminal request."""
    service = POSTerminalService(db)
    result = await service.create_terminal_request(user_id, user_id, request_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create terminal request"))
    
    return APIResponse(
        success=True,
        message=result.get("message"),
        data={"request_id": result.get("request_id")},
    )


@router.get("/requests/pending", response_model=POSTerminalRequestListResponse)
async def list_pending_requests(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List pending terminal requests (admin only)."""
    service = POSTerminalService(db)
    requests, total = await service.list_pending_requests(page=page, per_page=per_page)
    
    return POSTerminalRequestListResponse(
        success=True,
        data=[POSTerminalRequestResponse.model_validate(r) for r in requests],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/requests/user", response_model=POSTerminalRequestListResponse)
async def list_user_requests(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List terminal requests for the current user."""
    service = POSTerminalService(db)
    requests, total = await service.list_user_requests(user_id, page=page, per_page=per_page)
    
    return POSTerminalRequestListResponse(
        success=True,
        data=[POSTerminalRequestResponse.model_validate(r) for r in requests],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/requests/{request_id}/approve", response_model=TerminalAssignmentResponse)
async def approve_request(
    request_id: int,
    admin_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Approve a terminal request (admin only)."""
    service = POSTerminalService(db)
    result = await service.approve_terminal_request(request_id, admin_id)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to approve request"))
    
    return TerminalAssignmentResponse(
        success=True,
        message=result.get("message"),
        terminal_code=result.get("terminal_code"),
    )


@router.post("/requests/{request_id}/reject", response_model=APIResponse)
async def reject_request(
    request_id: int,
    reason: str,
    admin_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reject a terminal request (admin only)."""
    service = POSTerminalService(db)
    result = await service.reject_terminal_request(request_id, admin_id, reason)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to reject request"))
    
    return APIResponse(success=True, message=result.get("message"))


# ============ Transaction Endpoints ============


@router.post("/{terminal_id}/transactions", response_model=CreateCheckoutResponse)
async def create_transaction(
    terminal_id: int,
    transaction_data: POSTerminalTransactionCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a transaction for a terminal."""
    service = POSTerminalService(db)
    
    # Verify user owns the terminal
    terminal = await service.get_terminal_by_id(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    if terminal.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to use this terminal")
    
    result = await service.create_transaction(terminal_id, user_id, transaction_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create transaction"))
    
    return CreateCheckoutResponse(
        success=True,
        checkout_url=result.get("payment_url", ""),
        payment_url=result.get("payment_url"),
        qr_content=result.get("qr_content"),
        order_id=result.get("order_id"),
        message=result.get("message"),
    )


@router.get("/{terminal_id}/transactions", response_model=POSTerminalTransactionListResponse)
async def list_terminal_transactions(
    terminal_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List transactions for a terminal."""
    service = POSTerminalService(db)
    
    # Verify user owns the terminal
    terminal = await service.get_terminal_by_id(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    if terminal.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these transactions")
    
    transactions, total = await service.list_terminal_transactions(
        terminal_id, page=page, per_page=per_page
    )
    
    return POSTerminalTransactionListResponse(
        success=True,
        data=[POSTerminalTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/transactions/{order_id}", response_model=APIResponse)
async def get_transaction(
    order_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a transaction by order ID."""
    service = POSTerminalService(db)
    transaction = await service.get_transaction_by_order_id(order_id)
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this transaction")
    
    return APIResponse(
        success=True,
        data={"transaction": POSTerminalTransactionResponse.model_validate(transaction).model_dump()},
    )


@router.post("/transactions/{order_id}/status", response_model=APIResponse)
async def update_transaction_status(
    order_id: str,
    status: str,
    failure_reason: str = "",
    user_id: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update transaction status (admin only)."""
    service = POSTerminalService(db)
    result = await service.update_transaction_status(
        order_id, status, failure_reason if failure_reason else None
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to update transaction"))
    
    return APIResponse(success=True, message=result.get("message"))


# ============ PIN Management ============


class PinSetRequest(BaseModel):
    pin: str


@router.post("/{terminal_id}/pin/set", response_model=APIResponse)
async def set_terminal_pin(
    terminal_id: int,
    payload: PinSetRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Set or update the operator PIN for a terminal."""
    from models.pos_terminal import POSTerminal
    res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = res.scalar_one_or_none()
    
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    if terminal.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(status_code=400, detail="PIN must be 4 digits")
    
    terminal.operator_pin = pwd_context.hash(payload.pin)
    await db.commit()
    
    return APIResponse(success=True, message="PIN set successfully")


@router.post("/{terminal_id}/pin/verify", response_model=APIResponse)
async def verify_terminal_pin(
    terminal_id: int,
    payload: PinSetRequest, # Reuse PinSetRequest as it just contains 'pin'
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Verify the operator PIN for a terminal."""
    from models.pos_terminal import POSTerminal
    res = await db.execute(select(POSTerminal).where(POSTerminal.id == terminal_id))
    terminal = res.scalar_one_or_none()
    
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    if not terminal.operator_pin:
        raise HTTPException(status_code=400, detail="PIN not set for this terminal")
    
    if not pwd_context.verify(payload.pin, terminal.operator_pin):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    return APIResponse(success=True, message="PIN verified")


@router.post("/{terminal_id}/ecr-push", response_model=APIResponse)
async def ecr_push_transaction(
    terminal_id: int,
    amount: float = Body(..., embed=True),
    description: str = Body("ECR Sale", embed=True),
    current_admin: str = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Push a transaction request from ECR to a terminal."""
    service = POSTerminalService(db)
    
    terminal = await service.get_terminal_by_id(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    
    # Create the pending transaction
    order_id = f"ecr-{uuid.uuid4().hex[:12]}"
    from models.pos_terminal import POSTerminalTransaction
    from services.event_bus import event_bus
    
    txn = POSTerminalTransaction(
        terminal_id=terminal_id,
        user_id=terminal.user_id,
        order_id=order_id,
        description=description,
        amount=int(amount * 100),
        currency="PHP",
        payment_method="awaiting_selection",
        status="pending",
    )
    db.add(txn)
    await db.commit()
    
    # Emit event to wake up the physical terminal
    await event_bus.emit("ecr_push", {
        "terminal_id": terminal_id,
        "device_id": terminal.device_id,
        "order_id": order_id,
        "amount": amount,
        "description": description
    })
    
    return APIResponse(
        success=True, 
        message="Transaction pushed to terminal",
        data={"order_id": order_id}
    )


@router.post("/{terminal_id}/transactions/{order_id}/finalize", response_model=CreateCheckoutResponse)
async def finalize_ecr_transaction(
    terminal_id: int,
    order_id: str,
    payload: Dict[str, str] = Body(...), # expects {"payment_method": "maya"}
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Finalize a transaction that was pushed from ECR."""
    service = POSTerminalService(db)
    
    # 1. Get the existing transaction
    txn = await service.get_transaction_by_order_id(order_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if txn.terminal_id != terminal_id:
        raise HTTPException(status_code=400, detail="Terminal ID mismatch")
    
    # 2. Re-use existing create_transaction logic but updating the existing record
    # Actually, we can just call create_transaction and it will create a NEW one, 
    # but we want to link it to the ECR one.
    # Simpler: Create a dummy transaction object and pass it to the logic that creates external payments.
    
    from schemas.pos_terminal import POSTerminalTransactionCreate
    transaction_data = POSTerminalTransactionCreate(
        amount=txn.amount,
        payment_method=payload.get("payment_method", "maya"),
        description=txn.description
    )
    
    # Call the service method that handles gateway integration
    result = await service.create_transaction(terminal_id, user_id, transaction_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to finalize"))
    
    # 3. Mark the ECR transaction as completed (replaced by the new gateway transaction)
    # or better: update the ECR transaction with gateway info.
    # For now, let's just return the new checkout info.
    
    return CreateCheckoutResponse(
        success=True,
        checkout_url=result.get("payment_url", ""),
        payment_url=result.get("payment_url"),
        qr_content=result.get("qr_content"),
        order_id=result.get("order_id"),
        message=result.get("message"),
    )
