# Multi-Currency & Exchange Rate Enhancement Guide

Complete guide for xend's multi-currency wallet system with real-time exchange rates, conversions, and admin controls.

## Table of Contents

1. [Overview](#overview)
2. [Installation & Setup](#installation--setup)
3. [Configuration](#configuration)
4. [Features](#features)
5. [API Reference](#api-reference)
6. [Admin Operations](#admin-operations)
7. [Developer Guide](#developer-guide)
8. [Troubleshooting](#troubleshooting)

## Overview

xend now supports real-time multi-currency wallets with:

- **Live Exchange Rates**: Fetch rates from CoinGecko API with intelligent caching
- **Currency Conversion**: Atomic wallet-to-wallet conversions with fee calculation
- **Admin Controls**: Override rates for special situations, set expiration times
- **Rate History**: Track all rates over time for analytics and audits
- **Volatility Analytics**: Calculate min, max, average, and standard deviation

### Supported Currencies

- PHP (Philippine Peso) - Primary
- USD (US Dollar)
- EUR (Euro)
- GBP (British Pound)
- SGD (Singapore Dollar)

## Installation & Setup

### 1. Apply Database Migration

```bash
cd backend
alembic upgrade head
```

This creates:
- `exchange_rate_history` table (rate tracking)
- `exchange_rate_override` table (admin overrides)
- `currency_conversion` table (conversion records)
- `conversion_count` column on `wallets` table

### 2. Install Dependencies

All dependencies already in `requirements.txt`:
- `httpx` - For async HTTP requests (CoinGecko API)
- `sqlalchemy` - For async ORM
- `alembic` - For migrations

### 3. Import New Models

Add to your imports when needed:

```python
from models.exchange_rate_history import ExchangeRateHistory
from models.exchange_rate_override import ExchangeRateOverride
from models.currency_conversion import CurrencyConversion
from services.currency_service import CurrencyService
```

### 4. Router Registration

The new `admin_exchange_rates.py` router is auto-discovered by `include_routers_from_package()` in `main.py`. No manual registration needed.

The conversion endpoints in `wallet.py` are already integrated.

## Configuration

No environment variables required (uses defaults). Optional customization in `core/config.py`:

```python
# Supported currencies (in CurrencyService)
SUPPORTED_CURRENCIES = ["PHP", "USD", "EUR", "GBP", "SGD"]

# Default conversion fee (1%)
DEFAULT_CONVERSION_FEE = 0.01

# Exchange rate cache TTL (5 minutes)
CACHE_TTL_SECONDS = 300
```

### API Providers

**Primary**: CoinGecko (free, 10-50 calls/min)
```
https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=php,usd,eur,gbp,sgd
```

**Fallback**: Would be Yahoo Finance (requires implementation)

## Features

### 1. Real-Time Exchange Rates

- Fetch current rates from CoinGecko
- 5-minute in-memory caching
- Support for multiple currency pairs
- Graceful fallback to logging if API unavailable

### 2. Currency Conversion

- Atomic wallet operations with row-level locking
- Automatic fee calculation (1% default)
- Locked 30-second rate quotes
- SMS notifications (optional)
- Transaction logging

### 3. Admin Rate Management

- Override rates for special situations
- Set expiration times (auto-expire after 24h if not specified)
- View all active overrides
- Track reasons and creating admin
- Full audit trail

### 4. Rate History & Analytics

- Track every rate fetch automatically
- Query historical rates by currency pair and date
- Calculate volatility (standard deviation)
- Min/max/average rates over configurable period
- 90-day history retention

## API Reference

### User Endpoints

#### Get Exchange Rates
```
GET /api/v1/wallet/rates
```

Returns all supported currency pairs and current rates.

**Response**:
```json
{
  "rates": {
    "USDT_PHP": 56.75,
    "USD_EUR": 0.92
  },
  "supported_currencies": ["PHP", "USD", "EUR", "GBP", "SGD"]
}
```

#### Get Conversion Quote
```
POST /api/v1/wallet/conversion-quote
```

Get a locked rate quote for 30 seconds before executing conversion.

**Request**:
```json
{
  "from_currency": "USD",
  "to_currency": "PHP",
  "from_amount": 100.0
}
```

**Response**:
```json
{
  "from_amount": 100.0,
  "to_amount": 5675.00,
  "rate": 56.75,
  "fee_amount": 56.75,
  "fee_rate": 0.01,
  "expires_at": 1717636561.234
}
```

#### Execute Conversion
```
POST /api/v1/wallet/convert
```

Convert funds from one currency wallet to another (atomic).

**Request**:
```json
{
  "from_currency": "USD",
  "to_currency": "PHP",
  "from_amount": 100.0
}
```

**Response**:
```json
{
  "success": true,
  "message": "Conversion successful: 100.0 USD → 5618.25 PHP",
  "conversion_id": 42,
  "from_amount": 100.0,
  "to_amount": 5618.25,
  "rate": 56.75,
  "fee_amount": 56.75
}
```

#### Get All Wallet Balances
```
GET /api/v1/wallet/balances
```

Get all user wallets with conversion counts.

**Response**:
```json
{
  "wallets": [
    {
      "id": 1,
      "currency": "PHP",
      "balance": 50000.0,
      "available_balance": 50000.0,
      "pending_balance": 0.0,
      "conversions": 5
    },
    {
      "id": 2,
      "currency": "USD",
      "balance": 1000.0,
      "available_balance": 1000.0,
      "pending_balance": 0.0,
      "conversions": 2
    }
  ],
  "total_net_worth": null,
  "primary_currency": "PHP"
}
```

### Admin Endpoints

All require `is_super_admin` permission.

#### Get Rate Statistics
```
GET /api/v1/admin/exchange-rates/stats?currency_pair=USD_PHP&days=7
```

Get volatility, min/max, trends for a currency pair.

**Response**:
```json
{
  "currency_pair": "USD_PHP",
  "current": 56.75,
  "min": 55.20,
  "max": 57.50,
  "avg": 56.40,
  "volatility": 0.85,
  "data_points": 150
}
```

#### List Rate Overrides
```
GET /api/v1/admin/exchange-rates/?currency_pair=USD_PHP&skip=0&limit=10
```

List all active (non-expired) rate overrides.

**Response**:
```json
[
  {
    "id": 1,
    "currency_pair": "USD_PHP",
    "override_rate": 60.0,
    "reason": "Market volatility adjustment",
    "created_by": "admin_user_123",
    "expires_at": "2026-06-07T03:30:00+00:00",
    "created_at": "2026-06-06T03:30:00+00:00"
  }
]
```

#### Create Rate Override
```
POST /api/v1/admin/exchange-rates/override
```

Set a temporary rate override for special situations.

**Request**:
```json
{
  "currency_pair": "USD_PHP",
  "override_rate": 60.0,
  "reason": "Market volatility - temporary adjustment",
  "expires_at": "2026-06-07T03:30:00+00:00"
}
```

Default expiration: 24 hours if not specified.

**Response**: 201 Created with override object

#### Delete Rate Override
```
DELETE /api/v1/admin/exchange-rates/override/{override_id}
```

Remove an active rate override.

**Response**: 204 No Content

#### Get Rate History
```
GET /api/v1/admin/exchange-rates/history?currency_pair=USD_PHP&days=7&skip=0&limit=50
```

Query historical rates for charting and analysis.

**Response**:
```json
[
  {
    "id": 100,
    "currency_pair": "USD_PHP",
    "rate": 56.75,
    "provider": "coingecko",
    "source": "system",
    "recorded_at": "2026-06-06T03:15:00+00:00",
    "created_at": "2026-06-06T03:15:00+00:00"
  }
]
```

#### Get Supported Currencies
```
GET /api/v1/admin/exchange-rates/supported
```

List all supported currencies and count.

**Response**:
```json
{
  "currencies": ["EUR", "GBP", "PHP", "SGD", "USD"],
  "total": 5
}
```

## Admin Operations

### Scenario: Market Volatility Response

During extreme volatility, admin can override rates:

```bash
curl -X POST http://localhost:8000/api/v1/admin/exchange-rates/override \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currency_pair": "USD_PHP",
    "override_rate": 60.0,
    "reason": "Flash crash recovery - temporary 5% adjustment",
    "expires_at": "2026-06-06T06:30:00+00:00"
  }'
```

All conversions during this period will use 60.0 instead of market rate.

### Scenario: Rate Analysis

Get 30-day volatility analysis:

```bash
curl http://localhost:8000/api/v1/admin/exchange-rates/stats \
  ?currency_pair=USD_PHP&days=30 \
  -H "Authorization: Bearer $TOKEN"
```

Response shows trend, volatility (std dev), and extremes for decision-making.

## Developer Guide

### Using CurrencyService

```python
from services.currency_service import CurrencyService

service = CurrencyService(db)

# Get quote
quote = await service.get_conversion_quote(
    wallet_id=1,
    from_currency="USD",
    to_currency="PHP",
    from_amount=100.0
)

# Convert
conversion = await service.convert_currency(
    from_wallet=wallet1,
    to_wallet=wallet2,
    from_amount=100.0,
    user_id="user_123",
    mobile_number="+639171234567"  # Optional for SMS
)

# Set override
override = await service.set_rate_override(
    currency_pair="USD_PHP",
    override_rate=60.0,
    reason="Testing",
    created_by="admin_123",
    expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
)

# Get stats
stats = await service.get_rate_stats("USD_PHP", days=7)
print(f"Volatility: {stats['volatility']}")
```

### Using Exchange Rate Service

```python
from services import exchange_rate_service

# Get single rate
rate = await exchange_rate_service.get_rate("USD_PHP")

# Get all rates in one call
rates = await exchange_rate_service.get_all_supported_rates()

# Check cache status
cached_rate, is_cached = exchange_rate_service.get_cache_status_for_pair("USD_PHP")

# Clear cache (testing only)
exchange_rate_service.clear_cache()
```

### Creating Conversion Transactions

```python
from models.wallet_transactions import Wallet_transactions
from datetime import datetime, timezone

now = datetime.now(timezone.utc)
txn = Wallet_transactions(
    user_id=user_id,
    wallet_id=wallet.id,
    transaction_type="conversion_out",
    amount=-from_amount,
    balance_before=before_balance,
    balance_after=after_balance,
    reference_id=f"conv-{conversion.id}",
    status="completed",
    created_at=now,
)
db.add(txn)
await db.commit()
```

## Troubleshooting

### Issue: "Cannot get rate for USD_PHP"

**Cause**: Network unavailable or API rate limit exceeded

**Solution**:
1. Check network connectivity: `curl https://api.coingecko.com/api/v3/ping`
2. Check logs for CoinGecko errors
3. Set manual rate override while investigating

### Issue: Conversion fails with "Insufficient balance"

**Cause**: User's source wallet doesn't have enough available balance

**Solution**:
1. Check `available_balance` vs `pending_balance`
2. Wait for pending transactions to clear
3. Check for frozen wallets (`is_frozen` column)

### Issue: Override rate not being used

**Cause**: Override expired or not set correctly

**Solution**:
1. Check override `expires_at` timestamp
2. Verify currency pair format matches (e.g., "USD_PHP" not "USD-PHP")
3. Ensure admin has `is_super_admin` permission

### Issue: Slow conversion quotes

**Cause**: Cache expired, fetching live rates

**Solution**:
1. Normal (first quote per 5 min cache period)
2. Check network latency to CoinGecko
3. Consider pre-warming cache on app startup

### Issue: Database migration fails

**Cause**: Schema already exists or SQLite compatibility

**Solution**:
```bash
# Check existing schema
alembic current

# Rollback if needed
alembic downgrade -1

# Retry
alembic upgrade head
```

## Performance Considerations

### Rate Caching

- 5-minute in-memory cache per currency pair
- Reduces CoinGecko API calls by ~99%
- Cache auto-expires; queries trigger refresh if needed

### Database Indices

- `idx_xrate_history_pair` - Fast history queries by currency
- `idx_xrate_history_pair_date` - Fast range queries for analytics
- `idx_xrate_override_pair` - Fast active override lookups
- `idx_conversion_wallet` - Fast conversion history per wallet
- `idx_conversion_status` - Fast status filtering

### Async Operations

- All DB queries use async/await
- SMS notifications fire asynchronously (don't block conversions)
- Rate fetches are async HTTP calls

## Security Notes

1. **Rate Override Audit Trail**
   - All overrides logged with admin ID and timestamp
   - Reason field captures justification
   - Automatic expiration prevents permanent manipulation

2. **Atomic Conversions**
   - Row-level locking prevents race conditions
   - All-or-nothing: either both wallets update or transaction rolls back
   - Prevents duplicate conversions or balance corruption

3. **Permission Checks**
   - Admin endpoints require `is_super_admin` permission
   - User endpoints check `current_user.id` ownership
   - No cross-user wallet access possible

4. **Rate Provider Security**
   - Uses public CoinGecko API (no API key exposure)
   - HTTPS-only connections
   - Timeout: 10 seconds prevents hanging

## Testing

```bash
# Run multi-currency test suite
pytest backend/tests/test_multi_currency.py -v

# Test specific feature
pytest backend/tests/test_multi_currency.py::test_conversion_quote -v

# With coverage
pytest backend/tests/test_multi_currency.py --cov=services.currency_service --cov-report=html
```

## Next Steps

After deploying multi-currency support:

1. Monitor rate fetch performance in logs
2. Verify SMS notifications deliver (if enabled)
3. Test admin override during market volatility
4. Collect rate history for 1 week before analytics
5. Set up dashboard charts using rate history API
