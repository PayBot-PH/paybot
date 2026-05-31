"""
Webhook handlers for payment gateway callbacks (Maya Business API, PayMongo, etc.)
"""
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from dependencies.database import get_db
from services.pos_terminal import POSTerminalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])


@router.post("/maya/payment-status")
async def maya_payment_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook endpoint for Maya Business API payment status updates.
    Maya sends payment status notifications to this endpoint.
    
    Webhook signature verification:
    X-Maya-Signature header contains HMAC-SHA256(webhook_body, api_key)
    """
    try:
        # Get signature from headers
        signature = request.headers.get("X-Maya-Signature", "")
        
        # Read request body
        body = await request.body()
        
        # Verify signature
        webhook_secret = (
            settings.maya_webhook_secret or 
            settings.maya_business_secret_key or 
            settings.maya_business_api_key
        )
        
        if not webhook_secret:
            # In production, always require signature verification
            if not settings.debug:
                logger.error("Maya webhook secret not configured - rejecting webhook in production")
                raise HTTPException(status_code=403, detail="Webhook not configured")
            logger.warning("Maya webhook secret not configured, skipping signature verification (DEBUG MODE)")
        elif signature:
            expected_signature = hmac.new(
                webhook_secret.encode("utf-8"),
                body,
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(signature, expected_signature):
                logger.warning("Invalid Maya webhook signature - rejecting request")
                raise HTTPException(status_code=401, detail="Invalid signature")
        else:
            # No signature provided
            if not settings.debug:
                logger.error("Missing Maya webhook signature - rejecting in production")
                raise HTTPException(status_code=401, detail="Signature required")
            logger.warning("Missing Maya webhook signature (DEBUG MODE)")
        
        # Parse payload
        payload = json.loads(body)
        logger.info(f"Maya webhook received: {payload}")
        
        # Extract payment information
        checkout_id = payload.get("id") or payload.get("checkoutId")
        status = payload.get("status", "").upper()
        request_reference = payload.get("requestReferenceNumber") or payload.get("reference")
        
        if not request_reference:
            logger.warning("No request reference in Maya webhook")
            raise HTTPException(status_code=400, detail="Missing reference ID")

        service = POSTerminalService(db)
        
        # Map Maya status to our status
        status_map = {
            "COMPLETED": "completed",
            "SUCCESS": "completed",
            "AUTHORIZED": "completed",  # For T0/Terminal payments, AUTHORIZED is often enough to release goods
            "PENDING": "pending",
            "FAILED": "failed",
            "CANCELLED": "cancelled",
            "EXPIRED": "failed",
        }
        
        transaction_status = status_map.get(status, "pending")
        failure_reason = None
        
        if status in ["FAILED", "EXPIRED", "CANCELLED"]:
            failure_reason = payload.get("failureReason") or payload.get("message") or f"Payment {status}"
        
        # Update transaction in database
        result = await service.update_transaction_status(
            order_id=request_reference,
            status=transaction_status,
            failure_reason=failure_reason,
        )
        
        if result.get("success"):
            logger.info(f"Transaction {request_reference} updated with status {transaction_status}")
            return {"success": True, "message": "Webhook processed successfully"}
        else:
            logger.warning(f"Failed to update transaction {request_reference}: {result.get('error')}")
            # Still return 200 OK to prevent Maya from retrying
            return {"success": True, "message": "Webhook received"}
    
    except Exception as exc:
        logger.error(f"Error processing Maya webhook: {exc}")
        # Return 200 OK to prevent webhook retry
        return {"success": True, "message": "Webhook received"}


@router.post("/paymongo/payment-status")
async def paymongo_payment_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook endpoint for PayMongo payment status updates.
    PayMongo sends payment status notifications to this endpoint.
    """
    try:
        # Read request body
        body = await request.body()
        payload = json.loads(body)
        
        logger.info(f"PayMongo webhook received: {payload}")
        
        # PayMongo structure: { "data": { "attributes": {...}, ... } }
        data = payload.get("data", {})
        attributes = data.get("attributes", {})
        
        # Extract payment information
        checkout_id = attributes.get("checkout_session_id") or attributes.get("id")
        status = attributes.get("status", "").lower()
        reference = attributes.get("reference") or attributes.get("description", "")
        
        # Try to extract order ID from reference
        order_id = None
        if reference and "order-" in reference:
            order_id = reference.split("|")[0].strip()
        
        if not order_id:
            logger.warning(f"No order ID found in PayMongo webhook: {reference}")
            raise HTTPException(status_code=400, detail="Missing order reference")

        service = POSTerminalService(db)
        
        # Map PayMongo status to our status
        status_map = {
            "paid": "completed",
            "completed": "completed",
            "succeeded": "completed",
            "pending": "pending",
            "awaiting_payment": "pending",
            "failed": "failed",
            "cancelled": "cancelled",
        }
        
        transaction_status = status_map.get(status, "pending")
        failure_reason = None
        
        if status in ["failed", "cancelled"]:
            failure_reason = attributes.get("failure_message") or f"Payment {status}"
        
        # Update transaction
        result = await service.update_transaction_status(
            order_id=order_id,
            status=transaction_status,
            failure_reason=failure_reason,
        )
        
        if result.get("success"):
            logger.info(f"PayMongo transaction {order_id} updated with status {transaction_status}")
            return {"success": True, "message": "Webhook processed successfully"}
        else:
            logger.warning(f"Failed to update PayMongo transaction {order_id}: {result.get('error')}")
            return {"success": True, "message": "Webhook received"}
    
    except Exception as exc:
        logger.error(f"Error processing PayMongo webhook: {exc}")
        return {"success": True, "message": "Webhook received"}


@router.post("/test")
async def test_webhook(request: Request):
    """Test webhook endpoint."""
    body = await request.body()
    payload = json.loads(body)
    logger.info(f"Test webhook received: {payload}")
    return {"success": True, "received": payload}
