import logging
import asyncio
from typing import Dict, Any, List, Callable, Awaitable
from core.database import db_manager
from sqlalchemy import select

logger = logging.getLogger(__name__)

class EventBus:
    """System-wide event bus for synchronizing components."""
    
    _subscribers: Dict[str, List[Callable[[Dict[str, Any]], Awaitable[None]]]] = {}

    @classmethod
    def subscribe(cls, event_type: str, handler: Callable[[Dict[str, Any]], Awaitable[None]]):
        if event_type not in cls._subscribers:
            cls._subscribers[event_type] = []
        cls._subscribers[event_type].append(handler)
        logger.info(f"Subscribed to event: {event_type}")

    @classmethod
    async def emit(cls, event_type: str, data: Dict[str, Any]):
        """Emit an event and notify all subscribers."""
        logger.info(f"Emitting event: {event_type} - {data}")
        
        # Notify local async subscribers
        if event_type in cls._subscribers:
            tasks = [handler(data) for handler in cls._subscribers[event_type]]
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

        # Trigger specialized cross-component sync logic
        if event_type == "payment_completed":
            await cls._sync_payment_to_telegram(data)

    @classmethod
    async def _sync_payment_to_telegram(cls, data: Dict[str, Any]):
        """Specialized logic to send payment confirmation to Telegram user."""
        try:
            from services.telegram_service import TelegramService
            tg = TelegramService()
            
            user_id = data.get("user_id")
            amount = data.get("amount", 0) / 100
            order_id = data.get("order_id")
            terminal_id = data.get("terminal_id")
            
            # Format message
            message = (
                f"✅ <b>Payment Received!</b>\n\n"
                f"💰 Amount: ₱{amount:,.2f}\n"
                f"🆔 Order ID: <code>{order_id}</code>\n"
                f"📟 Terminal ID: {terminal_id}\n"
                f"🕒 Time: {data.get('completed_at', 'Just now')}\n\n"
                f"Your dashboard and terminal have been updated."
            )
            
            # Send to user (Assuming user_id is the Telegram Chat ID)
            # In some cases, user_id might be the DB user_id, which for bot users is their chat_id
            await tg.send_message(chat_id=user_id, text=message)
            logger.info(f"Synced payment {order_id} to Telegram user {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to sync payment to Telegram: {e}")

event_bus = EventBus()
