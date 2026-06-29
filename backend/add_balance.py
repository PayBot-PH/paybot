import asyncio
import logging
from sqlalchemy import select
from core.database import db_manager
from models.wallets import Wallets
from models.wallet_transactions import Wallet_transactions
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def add_balance():
    user_id = "8135505065"
    amount = 55000.0

    await db_manager.init_db()
    async with db_manager.async_session_maker() as db:
        # Check PHP wallet
        result = await db.execute(
            select(Wallets).where(Wallets.user_id == user_id, Wallets.currency == "PHP")
        )
        wallet = result.scalar_one_or_none()

        now = datetime.utcnow()
        if not wallet:
            logger.info("Wallet not found, creating one...")
            wallet = Wallets(
                user_id=user_id,
                balance=amount,
                currency="PHP",
                created_at=now,
                updated_at=now,
            )
            db.add(wallet)
            await db.flush()
            balance_before = 0.0
        else:
            logger.info(f"Found wallet with current balance: {wallet.balance}")
            balance_before = float(wallet.balance)
            wallet.balance = balance_before + amount
            wallet.updated_at = now

        # Record transaction
        txn = Wallet_transactions(
            user_id=user_id,
            wallet_id=wallet.id,
            transaction_type="admin_credit",
            amount=amount,
            balance_before=balance_before,
            balance_after=wallet.balance,
            note="Manual credit by admin",
            status="completed",
            reference_id=f"manual-{int(now.timestamp())}",
            created_at=now,
        )
        db.add(txn)
        await db.commit()

        # Trigger bot notification
        from services.event_bus import event_bus
        await event_bus.emit("wallet_update", {
            "user_id": user_id,
            "wallet_id": wallet.id,
            "balance": wallet.balance,
            "currency": "PHP",
            "transaction_type": "admin_credit",
            "amount": amount,
            "transaction_id": txn.id,
            "note": "Manual credit by admin"
        })

        logger.info(f"Successfully added {amount} PHP to user {user_id}. New balance: {wallet.balance}")

    await db_manager.close_db()

if __name__ == "__main__":
    asyncio.run(add_balance())
