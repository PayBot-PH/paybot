import asyncio
import json
import logging
import time
import random

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.event_bus import payment_event_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/events", tags=["events"])


# ---------- Simulate Webhook ----------
class SimulateWebhookRequest(BaseModel):
    transaction_type: str = "invoice"
    amount: float = 1000.0
    status: str = "paid"
    description: str = ""


@router.post("/simulate")
async def simulate_webhook(
    data: SimulateWebhookRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Simulate a Xendit webhook payment status change event for testing real-time notifications"""
    fake_id = random.randint(10000, 99999)
    external_id = f"sim-{data.transaction_type}-{fake_id}"
    description = data.description or f"Simulated {data.transaction_type.replace('_', ' ')} payment"

    old_status = "pending" if data.status in ("paid", "expired") else "unknown"

    payment_event_bus.publish({
        "event_type": "status_change",
        "transaction_id": fake_id,
        "external_id": external_id,
        "old_status": old_status,
        "new_status": data.status,
        "amount": data.amount,
        "description": description,
        "transaction_type": data.transaction_type,
        "user_id": str(current_user.id),
    })

    logger.info(
        f"Simulated webhook: {data.transaction_type} -> {data.status}, "
        f"amount={data.amount}, external_id={external_id}"
    )

    return {
        "success": True,
        "message": f"Simulated {data.status} event for {data.transaction_type}",
        "external_id": external_id,
        "amount": data.amount,
    }


@router.get("/stream")
async def event_stream(
    request: Request,
    current_user: UserResponse = Depends(get_current_user),
):
    """SSE endpoint for real-time payment status updates"""

    async def generate():
        last_ts = time.time()
        # Send initial keepalive
        yield f"data: {json.dumps({'type': 'connected', 'message': 'SSE connected'})}\n\n"

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            # Wait for new events or timeout
            has_event = await payment_event_bus.wait_for_event(timeout=15.0)

            if has_event:
                events = payment_event_bus.get_events_since(last_ts)
                for event in events:
                    event_data = {
                        "type": event.get("event_type", "status_change"),
                        "transaction_id": event.get("transaction_id"),
                        "external_id": event.get("external_id"),
                        "old_status": event.get("old_status"),
                        "new_status": event.get("new_status"),
                        "amount": event.get("amount"),
                        "description": event.get("description"),
                        "transaction_type": event.get("transaction_type"),
                        "timestamp": event.get("timestamp"),
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                    last_ts = event["timestamp"]
            else:
                # Send keepalive ping
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recent")
async def get_recent_events(
    since: float = Query(0, description="Timestamp to get events since"),
    current_user: UserResponse = Depends(get_current_user),
):
    """Polling endpoint: get recent payment events since a timestamp"""
    if since > 0:
        events = payment_event_bus.get_events_since(since)
    else:
        events = payment_event_bus.get_recent_events(20)

    return {
        "events": events,
        "server_time": time.time(),
    }