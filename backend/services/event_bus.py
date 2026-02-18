import asyncio
import logging
import time
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class PaymentEventBus:
    """In-memory event bus for real-time payment status notifications.
    Stores recent events and allows SSE clients to stream them.
    """

    def __init__(self, max_events: int = 200, ttl_seconds: int = 300):
        self._events: List[Dict[str, Any]] = []
        self._max_events = max_events
        self._ttl_seconds = ttl_seconds
        self._waiters: List[asyncio.Event] = []

    def publish(self, event: Dict[str, Any]) -> None:
        """Publish a payment status change event"""
        event["timestamp"] = time.time()
        self._events.append(event)
        # Trim old events
        cutoff = time.time() - self._ttl_seconds
        self._events = [e for e in self._events if e["timestamp"] > cutoff]
        if len(self._events) > self._max_events:
            self._events = self._events[-self._max_events:]
        # Notify all waiting SSE clients
        for waiter in self._waiters:
            waiter.set()
        logger.info(f"Published payment event: {event.get('event_type', 'unknown')}")

    def get_events_since(self, since_ts: float) -> List[Dict[str, Any]]:
        """Get all events since a given timestamp"""
        return [e for e in self._events if e["timestamp"] > since_ts]

    def get_recent_events(self, count: int = 20) -> List[Dict[str, Any]]:
        """Get the most recent events"""
        return self._events[-count:]

    async def wait_for_event(self, timeout: float = 30.0) -> bool:
        """Wait for a new event to be published, returns True if event received"""
        waiter = asyncio.Event()
        self._waiters.append(waiter)
        try:
            await asyncio.wait_for(waiter.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False
        finally:
            self._waiters.remove(waiter)


# Singleton instance
payment_event_bus = PaymentEventBus()