import logging
from typing import Literal

logger = logging.getLogger(__name__)

class BotEvent:
    def __init__(self, platform: Literal['telegram', 'whatsapp', 'messenger'], user_id: str, message: str, raw_event: dict):
        self.platform = platform
        self.user_id = user_id
        self.message = message
        self.raw_event = raw_event

from core.database import DatabaseManager
from services.wallets import WalletsService
from sqlalchemy.ext.asyncio import AsyncSession

async def handle_bot_event(event: BotEvent):
    """
    Unified handler for bot events/commands across Telegram, WhatsApp, Messenger.
    Add business logic here (e.g., /start, /balance, /help, etc.)
    """
    # /start command
    if event.message.strip().lower() == "/start":
        return f"Welcome to PayBot PH! ({event.platform.title()})"

    # /balance command
    if event.message.strip().lower() == "/balance":
        # Use user_id as wallet user_id (platform-specific prefix)
        user_id = f"{event.platform[:2]}-{event.user_id}"
        try:
            # Get DB session
            dbm = DatabaseManager()
            await dbm.init_db()
            async with dbm.async_session_maker() as db:  # type: AsyncSession
                svc = WalletsService(db)
                # Default to PHP wallet
                wallet = await svc.get_by_field("user_id", user_id)
                if wallet:
                    balance = wallet.balance
                    currency = wallet.currency or "PHP"
                    return f"Your {currency} wallet balance: ₱{balance:,.2f}"
                else:
                    return "No wallet found. Please make a transaction first."
        except Exception as e:
            logger.error(f"/balance error: {e}")
            return "Could not fetch balance. Please try again later."

    # Default: echo
    return f"Echo: {event.message}"
