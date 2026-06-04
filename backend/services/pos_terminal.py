import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, update, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.pos_terminal import (
    POSTerminal,
    POSTerminalRequest,
    POSTerminalTransaction,
    POSTerminalDevice,
    TerminalStatus,
)
from models.wallet_transactions import Wallet_transactions
from schemas.pos_terminal import (
    POSTerminalCreate,
    POSTerminalUpdate,
    POSTerminalRequestCreate,
    POSTerminalTransactionCreate,
    POSTerminalDeviceCreate,
)
from services.maya_service import MayaService
from services.paymongo_service import PayMongoService
from services.wallets import WalletsService
from services.event_bus import event_bus

logger = logging.getLogger(__name__)


class POSTerminalService:
    """Service for managing POS terminals and transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.maya_service = MayaService()
        self.paymongo_service = PayMongoService()

    def _generate_terminal_code(self) -> str:
        """Generate a unique terminal code."""
        return f"TERM-{uuid.uuid4().hex[:8].upper()}"

    async def create_terminal(
        self, user_id: str, create_data: POSTerminalCreate, assigned_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new POS terminal."""
        try:
            terminal_code = self._generate_terminal_code()
            
            # Check for duplicate code (very unlikely but possible)
            existing = await self.db.execute(
                select(POSTerminal).where(POSTerminal.terminal_code == terminal_code)
            )
            if existing.scalar_one_or_none():
                return {"success": False, "error": "Failed to generate unique terminal code"}

            terminal = POSTerminal(
                terminal_code=terminal_code,
                terminal_name=create_data.terminal_name,
                user_id=user_id,
                status=TerminalStatus.ASSIGNED if assigned_by else TerminalStatus.UNASSIGNED,
                is_active=True,
                is_t0_settlement=create_data.is_t0_settlement,
                enabled_payment_methods=create_data.enabled_payment_methods,
                daily_transaction_limit=create_data.daily_transaction_limit,
                max_transaction_amount=create_data.max_transaction_amount,
                location=create_data.location,
                description=create_data.description,
                assigned_by=assigned_by,
                assigned_at=datetime.utcnow() if assigned_by else None,
            )
            self.db.add(terminal)
            await self.db.commit()
            await self.db.refresh(terminal)

            logger.info(f"Terminal {terminal_code} created for user {user_id}")
            return {
                "success": True,
                "terminal_id": terminal.id,
                "terminal_code": terminal.terminal_code,
                "message": "Terminal created successfully",
            }
        except Exception as exc:
            logger.error(f"Error creating terminal: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def get_terminal_by_id(self, terminal_id: int) -> Optional[POSTerminal]:
        """Get a terminal by ID."""
        result = await self.db.execute(
            select(POSTerminal).where(POSTerminal.id == terminal_id)
        )
        return result.scalar_one_or_none()

    async def get_terminal_by_code(self, terminal_code: str) -> Optional[POSTerminal]:
        """Get a terminal by code."""
        result = await self.db.execute(
            select(POSTerminal).where(POSTerminal.terminal_code == terminal_code)
        )
        return result.scalar_one_or_none()

    async def list_user_terminals(
        self, user_id: str, page: int = 1, per_page: int = 10
    ) -> Tuple[List[POSTerminal], int]:
        """List all terminals for a user."""
        # Get total count
        count_result = await self.db.execute(
            select(POSTerminal).where(POSTerminal.user_id == user_id)
        )
        total = len(count_result.scalars().all())

        # Get paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(POSTerminal)
            .where(POSTerminal.user_id == user_id)
            .order_by(desc(POSTerminal.created_at))
            .offset(offset)
            .limit(per_page)
        )
        terminals = result.scalars().all()
        return list(terminals), total

    async def list_all_terminals(
        self, page: int = 1, per_page: int = 10, status: Optional[str] = None
    ) -> Tuple[List[POSTerminal], int]:
        """List all terminals (admin only)."""
        query = select(POSTerminal)
        if status:
            query = query.where(POSTerminal.status == status)

        # Get total count
        count_result = await self.db.execute(query)
        total = len(count_result.scalars().all())

        # Get paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            query.order_by(desc(POSTerminal.created_at)).offset(offset).limit(per_page)
        )
        terminals = result.scalars().all()
        return list(terminals), total

    async def update_terminal(
        self, terminal_id: int, update_data: POSTerminalUpdate
    ) -> Dict[str, Any]:
        """Update a terminal."""
        try:
            terminal = await self.get_terminal_by_id(terminal_id)
            if not terminal:
                return {"success": False, "error": "Terminal not found"}

            update_dict = update_data.model_dump(exclude_unset=True)
            for key, value in update_dict.items():
                if hasattr(terminal, key):
                    if key == "user_id" and value:
                        # Update assignment metadata if user_id is changed
                        terminal.user_id = value
                        terminal.status = TerminalStatus.ASSIGNED
                        terminal.assigned_at = datetime.utcnow()
                    else:
                        setattr(terminal, key, value)

            await self.db.commit()
            await self.db.refresh(terminal)

            logger.info(f"Terminal {terminal_id} updated")
            return {"success": True, "message": "Terminal updated successfully"}
        except Exception as exc:
            logger.error(f"Error updating terminal: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def deactivate_terminal(self, terminal_id: int) -> Dict[str, Any]:
        """Deactivate a terminal."""
        try:
            terminal = await self.get_terminal_by_id(terminal_id)
            if not terminal:
                return {"success": False, "error": "Terminal not found"}

            terminal.is_active = False
            terminal.status = TerminalStatus.INACTIVE
            terminal.deactivated_at = datetime.utcnow()

            await self.db.commit()
            logger.info(f"Terminal {terminal_id} deactivated")
            return {"success": True, "message": "Terminal deactivated successfully"}
        except Exception as exc:
            logger.error(f"Error deactivating terminal: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    # ============ Terminal Request Methods ============

    async def create_terminal_request(
        self, user_id: str, user_name: str, request_data: POSTerminalRequestCreate
    ) -> Dict[str, Any]:
        """Create a terminal request from a customer."""
        try:
            # Check for existing pending request
            existing = await self.db.execute(
                select(POSTerminalRequest).where(
                    and_(
                        POSTerminalRequest.user_id == user_id,
                        POSTerminalRequest.status == "pending",
                    )
                )
            )
            if existing.scalar_one_or_none():
                return {
                    "success": False,
                    "error": "You already have a pending terminal request",
                }

            terminal_request = POSTerminalRequest(
                user_id=user_id,
                user_name=user_name,
                user_email=request_data.user_email,
                user_phone=request_data.user_phone,
                business_name=request_data.business_name,
                business_type=request_data.business_type,
                location=request_data.location,
                description=request_data.description,
                required_payment_methods=request_data.required_payment_methods,
                monthly_transaction_volume=request_data.monthly_transaction_volume,
                average_transaction_amount=request_data.average_transaction_amount,
            )
            self.db.add(terminal_request)
            await self.db.commit()
            await self.db.refresh(terminal_request)

            logger.info(f"Terminal request {terminal_request.id} created for user {user_id}")
            return {
                "success": True,
                "request_id": terminal_request.id,
                "message": "Terminal request submitted successfully",
            }
        except Exception as exc:
            logger.error(f"Error creating terminal request: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def get_terminal_request(self, request_id: int) -> Optional[POSTerminalRequest]:
        """Get a terminal request by ID."""
        result = await self.db.execute(
            select(POSTerminalRequest).where(POSTerminalRequest.id == request_id)
        )
        return result.scalar_one_or_none()

    async def list_pending_requests(
        self, page: int = 1, per_page: int = 10
    ) -> Tuple[List[POSTerminalRequest], int]:
        """List pending terminal requests (admin only)."""
        query = select(POSTerminalRequest).where(POSTerminalRequest.status == "pending")

        # Get total count using func.count()
        count_result = await self.db.execute(
            select(func.count()).select_from(POSTerminalRequest).where(POSTerminalRequest.status == "pending")
        )
        total = count_result.scalar() or 0

        # Get paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            query.order_by(desc(POSTerminalRequest.created_at))
            .offset(offset)
            .limit(per_page)
        )
        requests = result.scalars().all()
        return list(requests), total

    async def list_user_requests(
        self, user_id: str, page: int = 1, per_page: int = 10
    ) -> Tuple[List[POSTerminalRequest], int]:
        """List terminal requests for a user."""
        query = select(POSTerminalRequest).where(POSTerminalRequest.user_id == user_id)

        # Get total count using func.count()
        count_result = await self.db.execute(
            select(func.count()).select_from(POSTerminalRequest).where(POSTerminalRequest.user_id == user_id)
        )
        total = count_result.scalar() or 0

        # Get paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            query.order_by(desc(POSTerminalRequest.created_at))
            .offset(offset)
            .limit(per_page)
        )
        requests = result.scalars().all()
        return list(requests), total

    async def approve_terminal_request(
        self, request_id: int, admin_id: str
    ) -> Dict[str, Any]:
        """Approve a terminal request and create a terminal."""
        try:
            terminal_request = await self.get_terminal_request(request_id)
            if not terminal_request:
                return {"success": False, "error": "Terminal request not found"}

            if terminal_request.status != "pending":
                return {"success": False, "error": "Terminal request is not pending"}

            # Create a terminal for the user
            create_data = POSTerminalCreate(
                user_id=terminal_request.user_id,
                terminal_name=f"{terminal_request.business_name} Terminal",
                location=terminal_request.location,
                description=terminal_request.description,
                enabled_payment_methods=terminal_request.required_payment_methods,
            )

            terminal_result = await self.create_terminal(
                terminal_request.user_id, create_data, assigned_by=admin_id
            )

            if not terminal_result.get("success"):
                return terminal_result

            # Update the request
            terminal_request.status = "approved"
            terminal_request.reviewed_by = admin_id
            terminal_request.reviewed_at = datetime.utcnow()
            terminal_request.assigned_terminal_id = terminal_result.get("terminal_id")

            await self.db.commit()
            logger.info(f"Terminal request {request_id} approved by {admin_id}")

            return {
                "success": True,
                "message": "Terminal request approved",
                "terminal_code": terminal_result.get("terminal_code"),
            }
        except Exception as exc:
            logger.error(f"Error approving terminal request: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def reject_terminal_request(
        self, request_id: int, admin_id: str, reason: str
    ) -> Dict[str, Any]:
        """Reject a terminal request."""
        try:
            terminal_request = await self.get_terminal_request(request_id)
            if not terminal_request:
                return {"success": False, "error": "Terminal request not found"}

            if terminal_request.status != "pending":
                return {"success": False, "error": "Terminal request is not pending"}

            terminal_request.status = "rejected"
            terminal_request.rejection_reason = reason
            terminal_request.reviewed_by = admin_id
            terminal_request.reviewed_at = datetime.utcnow()

            await self.db.commit()
            logger.info(f"Terminal request {request_id} rejected by {admin_id}")

            return {"success": True, "message": "Terminal request rejected"}
        except Exception as exc:
            logger.error(f"Error rejecting terminal request: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    # ============ Terminal Transaction Methods ============

    async def create_transaction(
        self, terminal_id: int, user_id: str, transaction_data: POSTerminalTransactionCreate
    ) -> Dict[str, Any]:
        """Create a transaction for a terminal."""
        try:
            terminal = await self.get_terminal_by_id(terminal_id)
            if not terminal:
                return {"success": False, "error": "Terminal not found"}

            if not terminal.is_active:
                return {"success": False, "error": "Terminal is not active"}

            # Check daily limit
            if terminal.daily_transaction_limit:
                today_result = await self.db.execute(
                    select(POSTerminalTransaction).where(
                        and_(
                            POSTerminalTransaction.terminal_id == terminal_id,
                            POSTerminalTransaction.created_at >= datetime.utcnow().replace(
                                hour=0, minute=0, second=0, microsecond=0
                            ),
                        )
                    )
                )
                daily_transactions = today_result.scalars().all()
                daily_sum = sum(t.amount for t in daily_transactions)
                if daily_sum + transaction_data.amount > terminal.daily_transaction_limit * 100:
                    return {"success": False, "error": "Daily transaction limit exceeded"}

            # Check max amount
            if (
                terminal.max_transaction_amount
                and transaction_data.amount > terminal.max_transaction_amount * 100
            ):
                return {"success": False, "error": "Transaction amount exceeds maximum"}

            order_id = f"order-{uuid.uuid4().hex[:12]}"
            payment_url = None
            payment_gateway_id = None
            qr_content = None

            # Create payment based on selected method
            if transaction_data.payment_method == "maya":
                # Check if we should use QR payment for T0 settlement
                # In real terminal mode, QR is often preferred for immediate settlement
                maya_result = await self.maya_service.create_qr_payment(
                    amount=transaction_data.amount / 100,
                    description=transaction_data.description,
                    external_id=order_id,
                )
                
                if maya_result.get("success"):
                    payment_url = maya_result.get("checkout_url")
                    payment_gateway_id = maya_result.get("checkout_id") or maya_result.get("qr_id")
                    qr_content = maya_result.get("qr_content")
                else:
                    # Fallback to terminal payment if QR fails
                    maya_result = await self.maya_service.create_terminal_payment(
                        amount=transaction_data.amount / 100,
                        description=transaction_data.description,
                        terminal_id=terminal.terminal_code,
                        external_id=order_id,
                        customer_name=transaction_data.customer_name,
                        customer_email=transaction_data.customer_email,
                        mobile_number=transaction_data.customer_phone,
                    )
                    if maya_result.get("success"):
                        payment_url = maya_result.get("checkout_url")
                        payment_gateway_id = maya_result.get("checkout_id")
                    else:
                        return {
                            "success": False,
                            "error": f"Failed to create Maya payment: {maya_result.get('error')}",
                        }
            elif transaction_data.payment_method == "card":
                # Use Maya Business API for card payments
                card_result = await self.maya_service.create_card_payment(
                    amount=transaction_data.amount / 100,
                    description=transaction_data.description,
                    customer_name=transaction_data.customer_name,
                    customer_email=transaction_data.customer_email,
                    customer_phone=transaction_data.customer_phone,
                    external_id=order_id,
                )
                if card_result.get("success"):
                    payment_url = card_result.get("checkout_url")
                    payment_gateway_id = card_result.get("checkout_id")
                else:
                    return {
                        "success": False,
                        "error": f"Failed to create payment: {card_result.get('error')}",
                    }
            elif transaction_data.payment_method in ["gcash", "grabpay"]:
                # Use PayMongo for e-wallet payments
                paymongo_result = await self.paymongo_service.create_checkout(
                    amount=transaction_data.amount,
                    description=transaction_data.description,
                    payment_method=transaction_data.payment_method,
                    customer_email=transaction_data.customer_email,
                    customer_name=transaction_data.customer_name,
                    external_id=order_id,
                )
                if paymongo_result.get("success"):
                    payment_url = paymongo_result.get("checkout_url")
                    payment_gateway_id = paymongo_result.get("checkout_id")
                else:
                    return {
                        "success": False,
                        "error": f"Failed to create payment: {paymongo_result.get('error')}",
                    }

            # Create transaction record
            db_transaction = POSTerminalTransaction(
                terminal_id=terminal_id,
                user_id=user_id,
                order_id=order_id,
                description=transaction_data.description,
                amount=transaction_data.amount,
                currency="PHP",
                payment_method=transaction_data.payment_method,
                maya_checkout_id=payment_gateway_id if transaction_data.payment_method == "maya" else None,
                paymongo_checkout_id=payment_gateway_id
                if transaction_data.payment_method in ["gcash", "grabpay"]
                else None,
                payment_url=payment_url,
                qr_content=qr_content,
                customer_name=transaction_data.customer_name,
                customer_email=transaction_data.customer_email,
                customer_phone=transaction_data.customer_phone,
                status="pending",
            )
            self.db.add(db_transaction)
            await self.db.commit()
            await self.db.refresh(db_transaction)

            logger.info(f"Transaction {order_id} created for terminal {terminal_id}")
            return {
                "success": True,
                "order_id": order_id,
                "payment_url": payment_url,
                "qr_content": qr_content,
                "message": "Transaction created successfully",
            }
        except Exception as exc:
            logger.error(f"Error creating transaction: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def get_transaction(self, transaction_id: int) -> Optional[POSTerminalTransaction]:
        """Get a transaction by ID."""
        result = await self.db.execute(
            select(POSTerminalTransaction).where(POSTerminalTransaction.id == transaction_id)
        )
        return result.scalar_one_or_none()

    async def get_transaction_by_order_id(
        self, order_id: str
    ) -> Optional[POSTerminalTransaction]:
        """Get a transaction by order ID."""
        result = await self.db.execute(
            select(POSTerminalTransaction).where(POSTerminalTransaction.order_id == order_id)
        )
        return result.scalar_one_or_none()

    async def list_terminal_transactions(
        self, terminal_id: int, page: int = 1, per_page: int = 10
    ) -> Tuple[List[POSTerminalTransaction], int]:
        """List transactions for a terminal."""
        query = select(POSTerminalTransaction).where(
            POSTerminalTransaction.terminal_id == terminal_id
        )

        # Get total count
        count_result = await self.db.execute(query)
        total = len(count_result.scalars().all())

        # Get paginated results
        offset = (page - 1) * per_page
        result = await self.db.execute(
            query.order_by(desc(POSTerminalTransaction.created_at))
            .offset(offset)
            .limit(per_page)
        )
        transactions = result.scalars().all()
        return list(transactions), total

    async def update_transaction_status(
        self, order_id: str, status: str, failure_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update transaction status."""
        try:
            transaction = await self.get_transaction_by_order_id(order_id)
            if not transaction:
                return {"success": False, "error": "Transaction not found"}

            # Update status and timestamp
            transaction.status = status
            if status == "completed":
                transaction.completed_at = datetime.utcnow()
                
                # Note: Merchant wallet credit is handled by wallet_integration.py
                # subscribing to the 'payment_completed' event emitted below.

                # Trigger sync event
                await event_bus.emit("payment_completed", {
                    "user_id": transaction.user_id,
                    "amount": transaction.amount,
                    "order_id": transaction.order_id,
                    "terminal_id": transaction.terminal_id,
                    "terminal_code": terminal.terminal_code if terminal else "N/A",
                    "completed_at": transaction.completed_at.isoformat()
                })
            elif status == "failed" and failure_reason:
                transaction.failure_reason = failure_reason

            # Ensure transaction is tracked and commit
            self.db.add(transaction)
            await self.db.commit()
            logger.info(f"Transaction {order_id} status updated to {status}")
            return {"success": True, "message": "Transaction updated"}
        except Exception as exc:
            logger.error(f"Error updating transaction: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    # ============ Device Management Methods ============

    async def register_device(self, data: POSTerminalDeviceCreate) -> Dict[str, Any]:
        """Register or update device information."""
        try:
            result = await self.db.execute(
                select(POSTerminalDevice).where(POSTerminalDevice.device_id == data.device_id)
            )
            device = result.scalar_one_or_none()

            if device:
                # Update existing device info
                device.brand = data.brand
                device.model = data.model
                device.os_version = data.os_version
                device.app_version = data.app_version
                device.metadata_json = data.metadata_json
                device.last_seen_at = datetime.utcnow()
            else:
                # Create new device record
                device = POSTerminalDevice(
                    device_id=data.device_id,
                    brand=data.brand,
                    model=data.model,
                    os_version=data.os_version,
                    app_version=data.app_version,
                    metadata_json=data.metadata_json,
                    is_authorized=False, # Wait for admin to authorize/assign
                )
                self.db.add(device)

            await self.db.commit()
            await self.db.refresh(device)
            
            # Check if this device is already linked to a terminal
            terminal_result = await self.db.execute(
                select(POSTerminal).where(POSTerminal.device_id == data.device_id)
            )
            terminal = terminal_result.scalar_one_or_none()

            return {
                "success": True,
                "device": device,
                "is_linked": terminal is not None,
                "terminal_id": terminal.id if terminal else None,
                "message": "Device registered successfully",
            }
        except Exception as exc:
            logger.error(f"Error registering device: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}

    async def list_devices(self) -> Tuple[List[POSTerminalDevice], int]:
        """List all registered devices."""
        result = await self.db.execute(
            select(POSTerminalDevice).order_by(desc(POSTerminalDevice.last_seen_at))
        )
        devices = result.scalars().all()
        return list(devices), len(devices)

    async def assign_device(self, device_id: str, user_id: str, terminal_name: Optional[str] = None) -> Dict[str, Any]:
        """Assign a device to a user by creating/updating a terminal."""
        try:
            # Check if device exists
            device_result = await self.db.execute(
                select(POSTerminalDevice).where(POSTerminalDevice.device_id == device_id)
            )
            device = device_result.scalar_one_or_none()
            if not device:
                return {"success": False, "error": "Device not found"}

            # Check if user already has a terminal for this device
            existing_terminal_result = await self.db.execute(
                select(POSTerminal).where(POSTerminal.device_id == device_id)
            )
            terminal = existing_terminal_result.scalar_one_or_none()

            if terminal:
                # Re-assign or update existing terminal
                terminal.user_id = user_id
                terminal.status = TerminalStatus.ACTIVE
                terminal.is_active = True
                if terminal_name:
                    terminal.terminal_name = terminal_name
            else:
                # Create a new terminal for this device
                terminal_code = self._generate_terminal_code()
                terminal = POSTerminal(
                    terminal_code=terminal_code,
                    terminal_name=terminal_name or f"Terminal for {device.model or 'Device'}",
                    user_id=user_id,
                    device_id=device_id,
                    status=TerminalStatus.ACTIVE,
                    is_active=True,
                    assigned_at=datetime.utcnow(),
                )
                self.db.add(terminal)

            # Mark device as authorized
            device.is_authorized = True

            await self.db.commit()
            await self.db.refresh(terminal)

            return {
                "success": True,
                "terminal_id": terminal.id,
                "terminal_code": terminal.terminal_code,
                "message": "Device assigned and terminal activated",
            }
        except Exception as exc:
            logger.error(f"Error assigning device: {exc}")
            await self.db.rollback()
            return {"success": False, "error": str(exc)}
