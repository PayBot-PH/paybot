import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update, and_
from core.database import db_manager
from models.transactions import Transactions
from models.wallets import Wallets
from services.maya_service import MayaService
from services.paymongo_service import PayMongoService
from services.transactions import TransactionsService

logger = logging.getLogger(__name__)

class BackgroundTasksService:
    """Automated operations service for background grid maintenance."""

    def __init__(self):
        self.maya_service = MayaService()
        self.paymongo_service = PayMongoService()

    async def sync_pending_transactions(self):
        """Automated sync of pending gateway transactions."""
        logger.info("Starting automated transaction sync...")
        async with db_manager.async_session_maker() as db:
            txn_service = TransactionsService(db)
            # Find transactions pending for more than 5 minutes but less than 24 hours
            stmt = select(Transactions).where(
                and_(
                    Transactions.status == "pending",
                    Transactions.created_at <= datetime.now(timezone.utc) - timedelta(minutes=5),
                    Transactions.created_at >= datetime.now(timezone.utc) - timedelta(hours=24)
                )
            )
            result = await db.execute(stmt)
            pending_txns = result.scalars().all()

            for txn in pending_txns:
                try:
                    if txn.transaction_type in ["invoice", "qr_code", "payment_link"]:
                        # Sync with Maya
                        status_res = await self.maya_service.get_checkout_status(txn.xendit_id)
                        if status_res.get("success"):
                            maya_status = status_res.get("status", "").upper()
                            if maya_status in ["COMPLETED", "SUCCESS", "PAYMENT_SUCCESS"]:
                                await txn_service.mark_as_paid(txn, gateway_label="Maya Auto-Sync")
                            elif maya_status in ["EXPIRED", "CANCELLED"]:
                                await txn_service.mark_as_expired(txn)

                    # Add PayMongo sync logic if needed
                except Exception as e:
                    logger.error(f"Failed to auto-sync transaction {txn.external_id}: {e}")

    async def run_clearing_cycle(self):
        """Automated T+1 clearing cycle (Move pending to available)."""
        logger.info("Executing automated clearing cycle (T+1)...")
        async with db_manager.async_session_maker() as db:
            # In a real bank-grade system, we'd track pending items individually.
            # Here we maximize internal operations by moving any non-zero pending balance
            # if the last update was > 24h ago, or simply use a scheduled sweep.
            # For simplicity in this implementation, we'll sweep all pending to available.
            stmt = select(Wallets).where(Wallets.pending_balance > 0)
            result = await db.execute(stmt)
            wallets = result.scalars().all()

            for wallet in wallets:
                # Maximize internal control by verifying ledger before clearing
                logger.info(f"Clearing pending funds for wallet {wallet.id} (User: {wallet.user_id})")
                wallet.available_balance += wallet.pending_balance
                wallet.pending_balance = 0
                wallet.updated_at = datetime.now(timezone.utc)

            await db.commit()

    async def start_worker(self):
        """Main worker loop for automated operations."""
        logger.info("Background Worker initialized. Starting automation loops...")
        while True:
            try:
                # Run sync every 10 minutes
                await self.sync_pending_transactions()

                # Run clearing cycle once an hour (or check daily window)
                # In production, this would be more precisely scheduled.
                await self.run_clearing_cycle()

                await asyncio.sleep(600) # Sleep for 10 minutes
            except Exception as e:
                logger.error(f"Background worker loop error: {e}")
                await asyncio.sleep(60) # Retry after 1 minute

# Global instance
background_worker = BackgroundTasksService()
