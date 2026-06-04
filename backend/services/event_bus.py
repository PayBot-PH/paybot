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
        if event_type == "wallet_update":
            await cls._sync_wallet_update_to_telegram(data)

    @classmethod
    def publish(cls, data: Dict[str, Any]):
        """Sync wrapper for emit (legacy support).
        Attempts to route to async emit() if an event loop is running.
        """
        event_type = data.get("event_type", "status_change")

        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                # We are in an async context, but called sync publish.
                # Schedule emit() task to ensure sync handlers are run.
                loop.create_task(cls.emit(event_type, data))
                return
        except RuntimeError:
            # No running loop in this thread
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(cls.emit(event_type, data), loop)
                    return
            except Exception:
                pass

        # Fallback: manually append to events if async routing failed
        data["timestamp"] = time.time()
        cls._events.append(data)
        logger.warning(f"EventBus.publish fallback used for {event_type} - sync handlers skipped")

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

    @classmethod
    async def _sync_wallet_update_to_telegram(cls, data: Dict[str, Any]):
        """Send a Telegram notification to the user for wallet credit/debit events."""
        if data.get("skip_bot_notify"):
            logger.debug(f"Skipping bot notification as requested for {data.get('transaction_type')}")
            return

        try:
            from services.telegram_service import TelegramService
            tg = TelegramService()

            user_id = data.get("user_id") or ""
            # Normalize chat id: allow both "tg-123" and "123"
            chat_id = user_id[3:] if isinstance(user_id, str) and user_id.startswith("tg-") else user_id

            txn_type = data.get("transaction_type", "")
            amount = data.get("amount")
            balance = data.get("balance")
            currency = data.get("currency", "PHP").upper()
            note = data.get("note") or ""

            # Format amount and balance
            symbol = "₱" if currency == "PHP" else "$"
            amt_str = f"{symbol}{float(amount):,.2f}" if amount is not None else ""
            bal_str = f"New balance: {symbol}{float(balance):,.2f}" if balance is not None else ""

            # Define messages based on transaction type
            messages = {
                # Credits
                "receive": f"💰 <b>Incoming Balance Received</b>\n\n{amt_str}\n{note}\n{bal_str}",
                "usd_receive": f"💰 <b>Incoming USD Received</b>\n\n{amt_str}\n{note}\n{bal_str}",
                "top_up": f"✅ <b>Wallet Topped Up</b>\n\n{amt_str}\n{note}\n{bal_str}",
                "crypto_topup": f"✅ <b>USDT Top-up Received</b>\n\n{amt_str}\n{note}\n{bal_str}",
                "admin_credit": f"💎 <b>Wallet Credited by Admin</b>\n\n{amt_str}\n{note}\n{bal_str}",

                # Debits
                "send": f"💸 <b>Transfer Successful</b>\n\nSent: {amt_str}\n{note}\n{bal_str}",
                "usd_send": f"💸 <b>USD Transfer Successful</b>\n\nSent: {amt_str}\n{note}\n{bal_str}",
                "withdraw": f"✅ <b>Withdrawal Submitted</b>\n\nAmount: {amt_str}\n{note}\n{bal_str}\n\n⏳ Bank processing typically takes 1–2 business days.",
                "usdt_send": f"📤 <b>USDT Send Request Submitted</b>\n\nAmount: {amt_str}\n{note}\n{bal_str}\n\n⏳ Pending admin approval.",
                "admin_debit": f"⚠️ <b>Wallet Debited by Admin</b>\n\nAmount: {amt_str}\n{note}\n{bal_str}",
            }

            message = messages.get(txn_type)
            if not message:
                # Default generic notification if type not mapped
                if any(t in txn_type for t in ("receive", "credit", "topup", "top_up")):
                    message = f"✅ <b>Wallet Credited</b>\n\n{amt_str}\n{note}\n{bal_str}"
                elif any(t in txn_type for t in ("send", "withdraw", "debit")):
                    message = f"✅ <b>Transaction Successful</b>\n\n{amt_str}\n{note}\n{bal_str}"
                else:
                    return # Don't send notification for unknown types

            await tg.send_message(chat_id=chat_id, text=message)
            logger.info(f"Notified Telegram user {chat_id} of wallet update: {txn_type} {amount}")
        except Exception as e:
            logger.error(f"Failed to notify wallet update to Telegram: {e}")

event_bus = EventBus()
payment_event_bus = event_bus # Alias for legacy code
