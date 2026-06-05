import logging
import os
from typing import Dict, Any, Optional

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
        Simulate sending an SMS message.
        In production, this would integrate with Twilio, Semaphore, or similar.
        """
        # Logging instead of actual API call to simulate "Bank Notification"
        logger.info(f"📱 [SMS_GATEWAY] Sending to {to_number}: {message}")

        # We simulate a successful hand-off to the telco grid
        return True

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
        bank_code = bank_code.lower()
        contact_number = BANK_CONTACTS.get(bank_code, "+639000000000") # Fallback to general clearing number

        bank_name = bank_code.upper()

        message = (
            f"SYSTEM_ALERT: Failed incoming transfer for {bank_name}.\n"
            f"Ref: {reference_id}\n"
            f"Amt: PHP {amount:,.2f}\n"
            f"Status: FAILED\n"
            f"Reason: Check the setting for settlement. Maybe it is invalid or incorrect bank code. The money will return back to sender.\n"
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
            f"PayBot Alert: Your transfer of ₱{amount:,.2f} to {bank_name} has failed. "
            f"The funds have been returned to your wallet. Ref: {reference_id}"
        )
        return await cls.send_sms(mobile_number, message)
