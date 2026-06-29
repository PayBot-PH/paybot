import logging
import os
import asyncio
from typing import Dict, Any, Optional
import httpx

from core.config import settings

logger = logging.getLogger(__name__)

# Mock bank contact directory for SMS notifications
# In a real system, these would be fetched from a secure bank-partner database
BANK_CONTACTS = {
    "gcash": "+639171234567",
    "maya": "+639187654321",
    "bdo": "+639190000001",
    "bpi": "+639190000002",
    "metrobank": "+639190000003",
    "security_bank": "+639190000004",
    "unionbank": "+639190000005",
}

class SMSService:
    """Service to handle SMS notifications to banks and users."""

    @staticmethod
    async def send_sms(to_number: str, message: str) -> bool:
        """
        Send an SMS message via configured gateway (Semaphore or Twilio).
        Falls back to logging if no provider is configured.
        """
        if not settings.sms_enable_notifications:
            logger.warning(f"SMS notifications disabled. Would send to {to_number}: {message}")
            return False

        # Try the configured provider
        provider = settings.sms_provider.lower()
        
        if provider == "semaphore":
            return await SMSService._send_via_semaphore(to_number, message)
        elif provider == "twilio":
            return await SMSService._send_via_twilio(to_number, message)
        else:
            logger.warning(f"Unknown SMS provider: {provider}. Falling back to logging.")
            logger.info(f"📱 [SMS_GATEWAY] Sending to {to_number}: {message}")
            return False

    @staticmethod
    async def _send_via_semaphore(to_number: str, message: str) -> bool:
        """Send SMS via Semaphore (popular in Philippines)."""
        if not settings.semaphore_api_key:
            logger.warning("SEMAPHORE_API_KEY not configured. Falling back to logging.")
            logger.info(f"📱 [SMS_SEMAPHORE_FALLBACK] Sending to {to_number}: {message}")
            return False

        try:
            payload = {
                "apikey": settings.semaphore_api_key,
                "number": to_number,
                "message": message,
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{settings.semaphore_api_url}/messages",
                    data=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        msg_id = data[0].get("message_id", "unknown")
                        logger.info(f"✅ [SMS_SEMAPHORE] Message sent to {to_number} (ID: {msg_id})")
                        return True
                    elif isinstance(data, dict) and data.get("message_id"):
                        logger.info(f"✅ [SMS_SEMAPHORE] Message sent to {to_number} (ID: {data['message_id']})")
                        return True
                
                logger.error(f"❌ [SMS_SEMAPHORE] Failed to send SMS to {to_number}: {response.status_code} {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ [SMS_SEMAPHORE] Exception sending SMS to {to_number}: {str(e)}")
            return False

    @staticmethod
    async def _send_via_twilio(to_number: str, message: str) -> bool:
        """Send SMS via Twilio (fallback provider)."""
        if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_phone_number:
            logger.warning("Twilio credentials not fully configured. Falling back to logging.")
            logger.info(f"📱 [SMS_TWILIO_FALLBACK] Sending to {to_number}: {message}")
            return False

        try:
            import base64
            
            # Twilio auth
            auth_string = f"{settings.twilio_account_sid}:{settings.twilio_auth_token}"
            auth_b64 = base64.b64encode(auth_string.encode()).decode()
            
            payload = {
                "From": settings.twilio_phone_number,
                "To": to_number,
                "Body": message,
            }
            
            headers = {
                "Authorization": f"Basic {auth_b64}",
                "Content-Type": "application/x-www-form-urlencoded",
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
                    data=payload,
                    headers=headers
                )
                
                if response.status_code in (200, 201):
                    data = response.json()
                    msg_id = data.get("sid", "unknown")
                    logger.info(f"✅ [SMS_TWILIO] Message sent to {to_number} (ID: {msg_id})")
                    return True
                
                logger.error(f"❌ [SMS_TWILIO] Failed to send SMS to {to_number}: {response.status_code} {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ [SMS_TWILIO] Exception sending SMS to {to_number}: {str(e)}")
            return False

    @classmethod
    async def notify_bank_of_failure(
        cls,
        bank_code: str,
        amount: float,
        reference_id: str,
        error_detail: str
    ) -> bool:
        """
        Notify the bank via text message about a failed incoming transfer attempt.
        This triggers the bank's own internal failure handling to notify the user.
        """
        bank_code = (bank_code or "system").lower()
        contact_number = BANK_CONTACTS.get(bank_code, "+639000000000")  # Fallback to general clearing number

        bank_name = bank_code.upper()

        message = (
            f"SYSTEM_ALERT: Failed transfer for {bank_name}.\n"
            f"Ref: {reference_id}\n"
            f"Amt: PHP {amount:,.2f}\n"
            f"Status: FAILED\n"
            f"Reason: {error_detail}\n"
            f"Note: The funds will be returned to the sender. Please check settlement settings.\n"
            f"Action: Please notify the receiving customer of the failed deposit."
        )

        return await cls.send_sms(contact_number, message)

    @classmethod
    async def notify_user_of_failed_transfer(
        cls,
        mobile_number: str,
        amount: float,
        bank_name: str,
        reference_id: str
    ) -> bool:
        """
        Direct notification to the user about a failed transfer.
        """
        message = (
            f"xend Alert: Your transfer of ₱{amount:,.2f} to {bank_name} has failed. "
            f"The funds have been returned to your wallet. Ref: {reference_id}"
        )
        return await cls.send_sms(mobile_number, message)

    @classmethod
    async def notify_user_of_successful_transfer(
        cls,
        mobile_number: str,
        amount: float,
        recipient: str,
        reference_id: str
    ) -> bool:
        """
        Notification to the user about a successful transfer.
        """
        message = (
            f"xend: Successfully transferred ₱{amount:,.2f} to {recipient}. "
            f"Ref: {reference_id}"
        )
        return await cls.send_sms(mobile_number, message)

    @classmethod
    async def notify_user_of_disbursement(
        cls,
        mobile_number: str,
        amount: float,
        bank_name: str,
        account_name: str,
        reference_id: str,
        status: str
    ) -> bool:
        """
        Notification to the user about a disbursement (payout).
        """
        status_text = "pending" if status == "pending" else "completed"
        message = (
            f"xend: Disbursement of ₱{amount:,.2f} to {account_name} ({bank_name}) "
            f"is {status_text}. Ref: {reference_id}"
        )
        return await cls.send_sms(mobile_number, message)

    @classmethod
    async def notify_user_of_topup(
        cls,
        mobile_number: str,
        amount: float,
        currency: str,
        reference_id: str
    ) -> bool:
        """
        Notification to the user about a wallet top-up.
        """
        message = (
            f"xend: Your wallet has been credited with {currency} {amount:,.2f}. "
            f"Ref: {reference_id}"
        )
        return await cls.send_sms(mobile_number, message)
