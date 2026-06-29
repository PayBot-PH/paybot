import logging
import time
import uuid
from typing import Any, Dict, Optional

from core.config import settings

logger = logging.getLogger(__name__)

OTP_STORE: Dict[str, Dict[str, Any]] = {}
OTP_EXPIRY_SECONDS = 300


def _current_timestamp() -> float:
    return time.time()


class OTPService:
    @staticmethod
    def _generate_code(digits: int = 6) -> str:
        return str(uuid.uuid4().int)[:digits].zfill(digits)

    @classmethod
    def create_terminal_challenge(
        cls,
        amount: float,
        description: str,
        customer_name: str,
        customer_email: str,
        mobile_number: str,
        terminal_id: str,
        channel_code: str,
        terminal_mode: str,
    ) -> Dict[str, Any]:
        otp_reference = f"otp-{uuid.uuid4().hex[:12]}"
        otp_code = cls._generate_code(6)
        now = _current_timestamp()
        OTP_STORE[otp_reference] = {
            "otp_code": otp_code,
            "payload": {
                "amount": amount,
                "description": description,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "mobile_number": mobile_number,
                "terminal_id": terminal_id,
                "channel_code": channel_code,
                "terminal_mode": terminal_mode,
            },
            "created_at": now,
            "expires_at": now + OTP_EXPIRY_SECONDS,
            "verified": False,
        }

        logger.info(
            "OTP challenge created: %s terminal_mode=%s mobile=%s description=%s",
            otp_reference,
            terminal_mode,
            mobile_number,
            description,
        )
        logger.info("OTP code for %s: %s", otp_reference, otp_code)

        response = {"otp_reference": otp_reference}
        if settings.debug:
            response["otp_code"] = otp_code
        return response

    @classmethod
    def verify_otp(cls, otp_reference: str, otp_code: str) -> Dict[str, Any]:
        challenge = OTP_STORE.get(otp_reference)
        if not challenge:
            return {"success": False, "error": "OTP reference not found"}

        if challenge["verified"]:
            return {"success": False, "error": "OTP has already been used"}

        if _current_timestamp() > challenge["expires_at"]:
            del OTP_STORE[otp_reference]
            return {"success": False, "error": "OTP has expired"}

        if str(otp_code).strip() != str(challenge["otp_code"]).strip():
            return {"success": False, "error": "OTP code is invalid"}

        challenge["verified"] = True
        return {"success": True, "payload": challenge["payload"]}
