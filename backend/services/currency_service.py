import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.wallets import Wallets
from models.currency_conversion import CurrencyConversion
from models.exchange_rate_history import ExchangeRateHistory
from models.exchange_rate_override import ExchangeRateOverride
from models.wallet_transactions import Wallet_transactions
from services import exchange_rate_service
from services.notification_service import SMSService

logger = logging.getLogger(__name__)

# Default conversion fee (1%)
DEFAULT_CONVERSION_FEE = 0.01

# Supported currencies
SUPPORTED_CURRENCIES = ["PHP", "USD", "EUR", "GBP", "SGD"]


class CurrencyService:
    """Service for multi-currency wallet operations with exchange rate management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_conversion_quote(
        self,
        wallet_id: int,
        from_currency: str,
        to_currency: str,
        from_amount: float,
    ) -> Dict[str, float]:
        """Get a conversion quote with a locked rate (valid for 30 seconds).
        
        Args:
            wallet_id: Source wallet ID
            from_currency: Source currency (e.g., "USD")
            to_currency: Target currency (e.g., "PHP")
            from_amount: Amount to convert
        
        Returns:
            Dict with: from_amount, to_amount, rate, fee_amount, fee_rate, expires_at
        """
        if from_currency == to_currency:
            return {
                "from_amount": from_amount,
                "to_amount": from_amount,
                "rate": 1.0,
                "fee_amount": 0.0,
                "fee_rate": 0.0,
                "expires_at": datetime.now(timezone.utc),
            }

        # Get current rate
        pair = f"{from_currency}_{to_currency}"
        try:
            rate = await exchange_rate_service.get_rate(pair)
        except RuntimeError:
            raise ValueError(f"Cannot get rate for {pair}")

        # Check for admin override
        override = await self._get_active_override(pair)
        if override:
            rate = override.override_rate
            logger.info(f"Using overridden rate for {pair}: {rate}")

        # Calculate conversion
        fee_rate = DEFAULT_CONVERSION_FEE
        pre_fee_amount = from_amount * rate
        fee_amount = pre_fee_amount * fee_rate
        to_amount = pre_fee_amount - fee_amount

        return {
            "from_amount": from_amount,
            "to_amount": round(to_amount, 2),
            "rate": round(rate, 6),
            "fee_amount": round(fee_amount, 2),
            "fee_rate": fee_rate,
            "expires_at": datetime.now(timezone.utc).timestamp() + 30,
        }

    async def convert_currency(
        self,
        from_wallet: Wallets,
        to_wallet: Wallets,
        from_amount: float,
        user_id: str,
        mobile_number: Optional[str] = None,
    ) -> CurrencyConversion:
        """Convert funds between two currency wallets (atomic operation).
        
        Args:
            from_wallet: Source wallet (already locked)
            to_wallet: Target wallet (already locked)
            from_amount: Amount to convert (from source currency)
            user_id: User ID for audit trail
            mobile_number: Optional phone number for SMS notification
        
        Returns:
            CurrencyConversion record
        
        Raises:
            ValueError: If wallets are same currency or insufficient balance
        """
        from_currency = from_wallet.currency
        to_currency = to_wallet.currency

        if from_currency == to_currency:
            raise ValueError("Source and target currencies must be different")

        if from_wallet.available_balance < from_amount:
            raise ValueError(
                f"Insufficient balance: {from_wallet.available_balance} < {from_amount}"
            )

        # Get current rate
        pair = f"{from_currency}_{to_currency}"
        try:
            rate = await exchange_rate_service.get_rate(pair)
        except RuntimeError as e:
            raise ValueError(f"Cannot get exchange rate: {e}")

        # Check for admin override
        override = await self._get_active_override(pair)
        if override:
            rate = override.override_rate

        # Calculate amounts
        fee_rate = DEFAULT_CONVERSION_FEE
        pre_fee_amount = from_amount * rate
        fee_amount = pre_fee_amount * fee_rate
        to_amount = pre_fee_amount - fee_amount

        # Update source wallet
        from_wallet.balance = round(from_wallet.balance - from_amount, 2)
        from_wallet.available_balance = round(
            from_wallet.available_balance - from_amount, 2
        )
        from_wallet.total_debits = round(from_wallet.total_debits + from_amount, 2)
        from_wallet.transaction_count += 1
        from_wallet.conversion_count += 1
        from_wallet.last_activity = datetime.now(timezone.utc)

        # Update target wallet
        to_wallet.balance = round(to_wallet.balance + to_amount, 2)
        to_wallet.available_balance = round(to_wallet.available_balance + to_amount, 2)
        to_wallet.total_credits = round(to_wallet.total_credits + to_amount, 2)
        to_wallet.transaction_count += 1
        to_wallet.conversion_count += 1
        to_wallet.last_activity = datetime.now(timezone.utc)

        # Create conversion record
        now = datetime.now(timezone.utc)
        conversion = CurrencyConversion(
            wallet_id=from_wallet.id,
            user_id=user_id,
            from_currency=from_currency,
            to_currency=to_currency,
            from_amount=from_amount,
            to_amount=round(to_amount, 2),
            rate_applied=round(rate, 6),
            conversion_fee_rate=fee_rate,
            conversion_fee_amount=round(fee_amount, 2),
            status="completed",
            created_at=now,
            updated_at=now,
        )

        self.db.add(conversion)
        await self.db.flush()

        # Track rate in history
        await self._record_rate_history(pair, rate, "system")

        # Send SMS notification
        if mobile_number:
            try:
                message = (
                    f"Currency conversion confirmed: {from_amount} {from_currency} → "
                    f"{to_amount} {to_currency} at rate {rate:.4f}. "
                    f"Fee: {fee_amount} {to_currency}."
                )
                await SMSService.send_sms(mobile_number, message)
            except Exception as e:
                logger.error(f"Failed to send conversion SMS: {e}")

        logger.info(
            f"Converted {from_amount} {from_currency} → {to_amount} "
            f"{to_currency} for user {user_id}"
        )

        return conversion

    async def set_rate_override(
        self,
        currency_pair: str,
        override_rate: float,
        reason: str,
        created_by: str,
        expires_at: Optional[datetime] = None,
    ) -> ExchangeRateOverride:
        """Set an admin override for an exchange rate.
        
        Args:
            currency_pair: Currency pair (e.g., "USDT_PHP")
            override_rate: Override rate to use
            reason: Reason for override
            created_by: Admin user ID
            expires_at: Optional expiration time
        
        Returns:
            ExchangeRateOverride record
        """
        now = datetime.now(timezone.utc)
        override = ExchangeRateOverride(
            currency_pair=currency_pair,
            override_rate=override_rate,
            reason=reason,
            created_by=created_by,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        self.db.add(override)
        await self.db.flush()

        logger.info(
            f"Rate override set for {currency_pair}: {override_rate} "
            f"(reason: {reason})"
        )

        # Record in history
        await self._record_rate_history(
            currency_pair, override_rate, f"admin_override:{reason}"
        )

        return override

    async def remove_rate_override(self, override_id: int) -> None:
        """Remove a rate override by ID.
        
        Args:
            override_id: Override record ID
        """
        query = select(ExchangeRateOverride).where(
            ExchangeRateOverride.id == override_id
        )
        result = await self.db.execute(query)
        override = result.scalar_one_or_none()

        if not override:
            raise ValueError(f"Override not found: {override_id}")

        await self.db.delete(override)
        logger.info(f"Removed rate override: {override_id}")

    async def get_rate_stats(
        self, currency_pair: str, days: int = 7
    ) -> Dict[str, float]:
        """Get exchange rate statistics for a currency pair.
        
        Args:
            currency_pair: Currency pair (e.g., "USDT_PHP")
            days: Number of days to analyze
        
        Returns:
            Dict with: current, min, max, avg, volatility (std dev)
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=days)

        query = select(ExchangeRateHistory).where(
            and_(
                ExchangeRateHistory.currency_pair == currency_pair,
                ExchangeRateHistory.recorded_at >= cutoff_time,
            )
        ).order_by(ExchangeRateHistory.recorded_at)

        result = await self.db.execute(query)
        records = result.scalars().all()

        if not records:
            try:
                current = await exchange_rate_service.get_rate(currency_pair)
            except RuntimeError:
                current = 0.0

            return {
                "current": current,
                "min": current,
                "max": current,
                "avg": current,
                "volatility": 0.0,
                "data_points": 0,
            }

        rates = [r.rate for r in records]
        current_rate = rates[-1] if rates else 0.0

        avg_rate = sum(rates) / len(rates) if rates else 0.0

        # Calculate standard deviation (volatility)
        variance = (
            sum((r - avg_rate) ** 2 for r in rates) / len(rates) if rates else 0.0
        )
        volatility = variance ** 0.5

        return {
            "current": round(current_rate, 6),
            "min": round(min(rates), 6),
            "max": round(max(rates), 6),
            "avg": round(avg_rate, 6),
            "volatility": round(volatility, 6),
            "data_points": len(rates),
        }

    async def get_supported_currencies(self) -> List[str]:
        """Get list of supported currencies."""
        return SUPPORTED_CURRENCIES

    async def _get_active_override(
        self, currency_pair: str
    ) -> Optional[ExchangeRateOverride]:
        """Get active (non-expired) override for a currency pair."""
        now = datetime.now(timezone.utc)
        query = select(ExchangeRateOverride).where(
            and_(
                ExchangeRateOverride.currency_pair == currency_pair,
                ExchangeRateOverride.expires_at > now,
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _record_rate_history(
        self, currency_pair: str, rate: float, source: str
    ) -> None:
        """Record rate in history for analytics."""
        try:
            now = datetime.now(timezone.utc)
            history = ExchangeRateHistory(
                currency_pair=currency_pair,
                rate=rate,
                provider="system",
                source=source,
                recorded_at=now,
                created_at=now,
                updated_at=now,
            )
            self.db.add(history)
            await self.db.flush()
        except Exception as e:
            logger.error(f"Failed to record rate history: {e}")
