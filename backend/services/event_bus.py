import logging
import asyncio
import time
from typing import Dict, Any, List, Callable, Awaitable
from collections import deque

logger = logging.getLogger(__name__)

class EventBus:
    """System-wide event bus for synchronizing components."""
    
    _subscribers: Dict[str, List[Callable[[Dict[str, Any]], Awaitable[None]]]] = {}
    _events = deque(maxlen=100)
    _new_event_signal = asyncio.Condition()

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
        
        # Legacy support for publish() style data
        event_data = {**data, "timestamp": time.time(), "event_type": event_type}
        cls._events.append(event_data)

        async with cls._new_event_signal:
            cls._new_event_signal.notify_all()
        
        # Notify local async subscribers
        if event_type in cls._subscribers:
            tasks = [handler(data) for handler in cls._subscribers[event_type]]
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

        # Trigger specialized cross-component sync logic
        if event_type == "payment_completed":
            await cls._sync_payment_to_telegram(data)

    @classmethod
    def publish(cls, data: Dict[str, Any]):
        """Sync wrapper for emit (legacy support)."""
        event_type = data.get("event_type", "status_change")
        # Run async emit in background if possible, or just append to deque
        data["timestamp"] = time.time()
        cls._events.append(data)
        
        # We can't easily wait for condition in sync, but we can notify if we have a loop
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(cls._notify_signal(), loop)
        except Exception:
            pass

    @classmethod
    async def _notify_signal(cls):
        async with cls._new_event_signal:
            cls._new_event_signal.notify_all()

    @classmethod
    async def wait_for_event(cls, timeout: float = 15.0) -> bool:
        try:
            async with cls._new_event_signal:
                await asyncio.wait_for(cls._new_event_signal.wait(), timeout=timeout)
                return True
        except asyncio.TimeoutError:
            return False

    @classmethod
    def get_events_since(cls, since_ts: float) -> List[Dict[str, Any]]:
        return [e for e in cls._events if e.get("timestamp", 0) > since_ts]

    @classmethod
    def get_recent_events(cls, limit: int = 20) -> List[Dict[str, Any]]:
        return list(cls._events)[-limit:]

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
            
            await tg.send_message(chat_id=user_id, text=message)
            logger.info(f"Synced payment {order_id} to Telegram user {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to sync payment to Telegram: {e}")

event_bus = EventBus()
payment_event_bus = event_bus # Alias for legacy code
