"""
Telegram bot handlers for POS Terminal feature
Allows users to request terminals and admins to manage them via Telegram commands
"""
import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session
from models.pos_terminal import POSTerminal
from services.pos_terminal import POSTerminalService
from services.telegram_service import TelegramService

logger = logging.getLogger(__name__)


class POSTerminalTelegramHandler:
    """Handles Telegram commands for POS terminals."""
    
    def __init__(self, telegram_service: TelegramService):
        self.telegram = telegram_service
    
    async def handle_terminal_request(
        self, user_id: str, user_name: str, message_text: str
    ) -> str:
        """
        Handle /request_terminal command
        User submits a request for a POS terminal
        """
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                
                # Parse request details from message
                # Expected format: /request_terminal Business Name, Type, Location
                parts = message_text.split("\n")
                
                if len(parts) < 2:
                    return (
                        "❌ *Invalid Request Format*\n\n"
                        "Please use this exact format:\n"
                        "`/request_terminal Business Name`\n"
                        "`Business Type` (e.g., Retail)\n"
                        "`Location` (e.g., Manila)\n"
                        "`Estimate Volume` (e.g., 50000)\n\n"
                        "💡 _Type each detail on a new line after the command._"
                    )
                
                business_name = parts[0].replace("/request_terminal", "").strip()
                business_type = parts[1].strip() if len(parts) > 1 else ""
                location = parts[2].strip() if len(parts) > 2 else ""
                monthly_volume_str = parts[3].strip() if len(parts) > 3 else "0"
                
                try:
                    monthly_volume = int(monthly_volume_str) if monthly_volume_str else 0
                except ValueError:
                    monthly_volume = 0
                
                # Create terminal request
                from schemas.pos_terminal import POSTerminalRequestCreate
                
                request_data = POSTerminalRequestCreate(
                    business_name=business_name or "Unnamed Business",
                    business_type=business_type,
                    location=location,
                    required_payment_methods=["card", "maya"],
                    monthly_transaction_volume=monthly_volume,
                )
                
                result = await service.create_terminal_request(
                    user_id=user_id,
                    user_name=user_name,
                    request_data=request_data,
                )
                
                if result.get("success"):
                    request_id = result.get("request_id")
                    return (
                        f"✅ Terminal request submitted!\n\n"
                        f"Request ID: {request_id}\n"
                        f"Business: {business_name}\n"
                        f"Status: Pending review\n\n"
                        f"Our admins will review your request within 24 hours."
                    )
                else:
                    return f"❌ {result.get('error', 'Failed to submit request')}"
        
        except Exception as exc:
            logger.error(f"Error handling terminal request: {exc}")
            return "❌ An error occurred while processing your request."
    
    async def handle_my_terminals(self, user_id: str) -> str:
        """Handle /my_terminals command - show user's terminals"""
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                terminals, total = await service.list_user_terminals(user_id, page=1, per_page=10)
                
                if not terminals:
                    return (
                        "📭 You don't have any POS terminals yet.\n\n"
                        "Use /request_terminal to request one!"
                    )
                
                message = "📱 Your POS Terminals:\n\n"
                for i, terminal in enumerate(terminals, 1):
                    status_emoji = "✅" if terminal.is_active else "❌"
                    message += (
                        f"{i}. {terminal.terminal_name}\n"
                        f"   Code: `{terminal.terminal_code}`\n"
                        f"   Status: {status_emoji} {terminal.status}\n"
                        f"   Created: {terminal.created_at.strftime('%Y-%m-%d') if terminal.created_at else 'N/A'}\n\n"
                    )
                
                if total > 10:
                    message += f"Showing 1-10 of {total} terminals"
                
                return message
        
        except Exception as exc:
            logger.error(f"Error fetching user terminals: {exc}")
            return "❌ Error fetching your terminals."
    
    async def handle_terminal_status(self, user_id: str, terminal_code: str) -> str:
        """Handle /terminal_status command - show terminal details"""
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                terminal = await service.get_terminal_by_code(terminal_code)
                
                if not terminal:
                    return f"❌ Terminal not found: {terminal_code}"
                
                if terminal.user_id != user_id:
                    return "❌ You don't have access to this terminal."
                
                status_emoji = "✅" if terminal.is_active else "❌"
                message = (
                    f"📱 Terminal Details\n\n"
                    f"Name: {terminal.terminal_name}\n"
                    f"Code: `{terminal.terminal_code}`\n"
                    f"Status: {status_emoji} {terminal.status}\n"
                    f"Active: {'Yes' if terminal.is_active else 'No'}\n"
                    f"Location: {terminal.location or 'Not specified'}\n"
                    f"Payment Methods: {', '.join(terminal.enabled_payment_methods)}\n"
                )
                
                if terminal.daily_transaction_limit:
                    message += f"Daily Limit: ₱{terminal.daily_transaction_limit:,}\n"
                
                if terminal.max_transaction_amount:
                    message += f"Max Transaction: ₱{terminal.max_transaction_amount:,}\n"
                
                message += f"Created: {terminal.created_at.strftime('%Y-%m-%d') if terminal.created_at else 'N/A'}\n"
                
                return message
        
        except Exception as exc:
            logger.error(f"Error fetching terminal status: {exc}")
            return "❌ Error fetching terminal status."
    
    async def handle_pending_requests(self, admin_id: str) -> str:
        """Handle /pending_requests command - show pending terminal requests (admin only)"""
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                requests, total = await service.list_pending_requests(page=1, per_page=5)
                
                if not requests:
                    return "✅ No pending terminal requests!"
                
                message = f"📋 Pending Terminal Requests ({total}):\n\n"
                for i, req in enumerate(requests, 1):
                    message += (
                        f"{i}. User: {req.user_name}\n"
                        f"   Business: {req.business_name}\n"
                        f"   Type: {req.business_type or 'Not specified'}\n"
                        f"   Location: {req.location or 'Not specified'}\n"
                        f"   Methods: {', '.join(req.required_payment_methods)}\n"
                        f"   Command: /approve_terminal {req.id}\n\n"
                    )
                
                return message
        
        except Exception as exc:
            logger.error(f"Error fetching pending requests: {exc}")
            return "❌ Error fetching pending requests."
    
    async def handle_approve_request(self, admin_id: str, request_id: int) -> str:
        """Handle /approve_terminal command"""
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                result = await service.approve_terminal_request(request_id, admin_id)
                
                if result.get("success"):
                    terminal_code = result.get("terminal_code")
                    user_id = result.get("user_id")

                    # Notify the user
                    if user_id:
                        await self.telegram.send_message(
                            chat_id=user_id,
                            text=(
                                f"🎊 *Your POS Terminal has been Approved!*\n\n"
                                f"Terminal Code: `{terminal_code}`\n\n"
                                f"You can now start using this terminal in the PayBot mobile app. "
                                f"Simply login and select this terminal to create payments."
                            ),
                            parse_mode="Markdown"
                        )

                    return (
                        f"✅ Terminal request approved!\n\n"
                        f"Terminal Code: `{terminal_code}`\n"
                        f"User {user_id} has been notified."
                    )
                else:
                    return f"❌ {result.get('error', 'Failed to approve request')}"
        
        except Exception as exc:
            logger.error(f"Error approving request: {exc}")
            return "❌ Error approving request."

    async def handle_cancel_request(self, user_id: str, request_id: int) -> str:
        """Handle /cancel_request command - user cancels their own pending request"""
        try:
            async with async_session() as db:
                # Basic implementation: check if request belongs to user and is pending
                from models.pos_terminal import POSTerminalRequest
                res = await db.execute(
                    select(POSTerminalRequest).where(
                        POSTerminalRequest.id == request_id,
                        POSTerminalRequest.user_id == user_id,
                        POSTerminalRequest.status == "pending"
                    )
                )
                req = res.scalar_one_or_none()
                if not req:
                    return "❌ Pending request not found or you don't have permission to cancel it."

                req.status = "cancelled"
                await db.commit()
                return f"✅ Terminal request #{request_id} has been cancelled."
        except Exception as exc:
            logger.error(f"Error cancelling request: {exc}")
            return "❌ Error cancelling request."

    async def handle_terminal_transactions(self, user_id: str, terminal_code: str) -> str:
        """Handle /transactions command - show terminal transactions"""
        try:
            async with async_session() as db:
                service = POSTerminalService(db)
                terminal = await service.get_terminal_by_code(terminal_code)
                
                if not terminal:
                    return f"❌ Terminal not found: {terminal_code}"
                
                if terminal.user_id != user_id:
                    return "❌ You don't have access to this terminal."
                
                transactions, total = await service.list_terminal_transactions(
                    terminal.id, page=1, per_page=5
                )
                
                if not transactions:
                    return f"📭 No transactions for terminal {terminal_code}"
                
                message = f"💳 Recent Transactions ({total}):\n\n"
                for txn in transactions:
                    status_emoji = "✅" if txn.status == "completed" else "⏳" if txn.status == "pending" else "❌"
                    message += (
                        f"{status_emoji} {txn.description}\n"
                        f"   Amount: ₱{txn.amount / 100:.2f}\n"
                        f"   Status: {txn.status}\n"
                        f"   Date: {txn.created_at.strftime('%Y-%m-%d') if txn.created_at else 'N/A'}\n\n"
                    )
                
                return message
        
        except Exception as exc:
            logger.error(f"Error fetching transactions: {exc}")
            return "❌ Error fetching transactions."


# Command handlers registry
TERMINAL_COMMANDS = {
    "request_terminal": "Request a new POS terminal",
    "my_terminals": "View your POS terminals",
    "terminal_status": "Get terminal status",
    "transactions": "View recent transactions",
    "cancel_request": "Cancel a pending terminal request",
    "pending_requests": "View pending terminal requests (admin)",
    "approve_terminal": "Approve a terminal request (admin)",
}


def register_terminal_commands(handler: POSTerminalTelegramHandler) -> Dict[str, Any]:
    """Register terminal commands with the bot."""
    def _parse_int(msg: str, default: int = 0) -> int:
        try:
            return int(str(msg).strip())
        except (ValueError, TypeError):
            return default

    return {
        "request_terminal": lambda user_id, user_name, msg: handler.handle_terminal_request(user_id, user_name, msg),
        "my_terminals": lambda user_id, user_name, msg: handler.handle_my_terminals(user_id),
        "terminal_status": lambda user_id, user_name, msg: handler.handle_terminal_status(user_id, msg),
        "transactions": lambda user_id, user_name, msg: handler.handle_terminal_transactions(user_id, msg),
        "cancel_request": lambda user_id, user_name, msg: handler.handle_cancel_request(user_id, _parse_int(msg)),
        "pending_requests": lambda user_id, user_name, msg: handler.handle_pending_requests(user_id),
        "approve_terminal": lambda user_id, user_name, msg: handler.handle_approve_request(user_id, _parse_int(msg)),
    }
