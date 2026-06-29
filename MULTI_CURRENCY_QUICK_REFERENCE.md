# Multi-Currency Quick Reference

Fast lookup guide for multi-currency API endpoints and code patterns.

## API Endpoints Quick Lookup

### User Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/wallet/rates` | GET | Get all supported currencies & rates |
| `/api/v1/wallet/conversion-quote` | POST | Get locked rate quote (30 sec) |
| `/api/v1/wallet/convert` | POST | Execute conversion (atomic) |
| `/api/v1/wallet/balances` | GET | Get all wallets with conversion counts |

### Admin Endpoints (require `is_super_admin`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/exchange-rates/stats` | GET | Get rate volatility, min/max |
| `/api/v1/admin/exchange-rates/` | GET | List active rate overrides |
| `/api/v1/admin/exchange-rates/override` | POST | Create rate override |
| `/api/v1/admin/exchange-rates/override/{id}` | DELETE | Remove override |
| `/api/v1/admin/exchange-rates/history` | GET | Query historical rates |
| `/api/v1/admin/exchange-rates/supported` | GET | List supported currencies |

## Code Examples

### Get Exchange Rates

```python
from services import exchange_rate_service

# Single pair
rate = await exchange_rate_service.get_rate("USD_PHP")
# Returns: 56.75

# All pairs
rates = await exchange_rate_service.get_all_supported_rates()
# Returns: {"USDT_PHP": 56.75, "USDT_USD": 1.0, ...}

# Check cache
cached_rate, is_cached = exchange_rate_service.get_cache_status_for_pair("USD_PHP")
```

### Get Conversion Quote

```python
from services.currency_service import CurrencyService

service = CurrencyService(db)

quote = await service.get_conversion_quote(
    wallet_id=1,
    from_currency="USD",
    to_currency="PHP",
    from_amount=100.0
)

# quote = {
#   "from_amount": 100.0,
#   "to_amount": 5675.00,
#   "rate": 56.75,
#   "fee_amount": 56.75,
#   "fee_rate": 0.01,
#   "expires_at": 1717636561.234
# }
```

### Execute Conversion

```python
from services.wallets import WalletsService
from services.currency_service import CurrencyService

wallet_svc = WalletsService(db)
currency_svc = CurrencyService(db)

# Get wallets with locks
from_wallet = await wallet_svc.get_or_create_wallet("user_123", "USD", lock=True)
to_wallet = await wallet_svc.get_or_create_wallet("user_123", "PHP", lock=True)

# Convert
conversion = await currency_svc.convert_currency(
    from_wallet=from_wallet,
    to_wallet=to_wallet,
    from_amount=100.0,
    user_id="user_123",
    mobile_number="+639171234567"  # Optional
)

await db.commit()

# conversion.to_amount = 5618.25
# conversion.rate_applied = 56.75
```

### Set Rate Override

```python
from datetime import datetime, timedelta, timezone

service = CurrencyService(db)

override = await service.set_rate_override(
    currency_pair="USD_PHP",
    override_rate=60.0,
    reason="Market volatility adjustment",
    created_by="admin_user_123",
    expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
)

await db.commit()
```

### Get Rate Statistics

```python
service = CurrencyService(db)

stats = await service.get_rate_stats("USD_PHP", days=7)

# stats = {
#   "current": 56.75,
#   "min": 55.20,
#   "max": 57.50,
#   "avg": 56.40,
#   "volatility": 0.85,
#   "data_points": 150
# }
```

## cURL Examples

### Get Rates (User)

```bash
curl http://localhost:8000/api/v1/wallet/rates \
  -H "Authorization: Bearer $TOKEN"
```

### Get Conversion Quote (User)

```bash
curl -X POST http://localhost:8000/api/v1/wallet/conversion-quote \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_currency": "USD",
    "to_currency": "PHP",
    "from_amount": 100.0
  }'
```

### Execute Conversion (User)

```bash
curl -X POST http://localhost:8000/api/v1/wallet/convert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from_currency": "USD",
    "to_currency": "PHP",
    "from_amount": 100.0
  }'
```

### Get Rate Statistics (Admin)

```bash
curl "http://localhost:8000/api/v1/admin/exchange-rates/stats?currency_pair=USD_PHP&days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Create Rate Override (Admin)

```bash
curl -X POST http://localhost:8000/api/v1/admin/exchange-rates/override \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currency_pair": "USD_PHP",
    "override_rate": 60.0,
    "reason": "Flash crash recovery",
    "expires_at": "2026-06-07T03:30:00Z"
  }'
```

### List Rate Overrides (Admin)

```bash
curl "http://localhost:8000/api/v1/admin/exchange-rates/?currency_pair=USD_PHP" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Get Rate History (Admin)

```bash
curl "http://localhost:8000/api/v1/admin/exchange-rates/history?currency_pair=USD_PHP&days=7&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Database Models

### ExchangeRateHistory
```python
from models.exchange_rate_history import ExchangeRateHistory

# Fields
id: int
currency_pair: str  # e.g., "USD_PHP"
rate: float  # e.g., 56.75
provider: str  # "coingecko", "yahoo_finance", "system"
source: str  # Context (e.g., "admin_override:reason")
recorded_at: datetime  # When rate was recorded
created_at: datetime
updated_at: datetime
```

### ExchangeRateOverride
```python
from models.exchange_rate_override import ExchangeRateOverride

# Fields
id: int
currency_pair: str  # e.g., "USD_PHP"
override_rate: float  # Manual override rate
reason: str  # Why override was set
created_by: str  # Admin user ID
expires_at: datetime  # When override expires
created_at: datetime
updated_at: datetime
```

### CurrencyConversion
```python
from models.currency_conversion import CurrencyConversion

# Fields
id: int
wallet_id: int  # Source wallet
user_id: str  # For audit
from_currency: str  # Source currency
to_currency: str  # Target currency
from_amount: float  # Amount converted from
to_amount: float  # Amount converted to
rate_applied: float  # Conversion rate used
conversion_fee_rate: float  # Fee percentage (default 0.01)
conversion_fee_amount: float  # Fee deducted
status: str  # "completed", "failed", "pending"
failure_reason: str  # If failed
reference_id: str  # External reference
created_at: datetime
updated_at: datetime
```

### Wallets (Updated)
```python
from models.wallets import Wallets

# New field
conversion_count: int  # Number of conversions performed
```

## Constants

```python
from services.currency_service import CurrencyService

# Supported currencies
CurrencyService.SUPPORTED_CURRENCIES
# ["PHP", "USD", "EUR", "GBP", "SGD"]

# Default conversion fee (1%)
CurrencyService.DEFAULT_CONVERSION_FEE
# 0.01

# Cache TTL (from exchange_rate_service)
from services.exchange_rate_service import CACHE_TTL_SECONDS
# 300 (5 minutes)
```

## Common Patterns

### Pattern 1: Safe Currency Conversion Flow

```python
async def safe_convert(user_id: str, from_curr: str, to_curr: str, amount: float):
    wallet_svc = WalletsService(db)
    currency_svc = CurrencyService(db)
    
    try:
        # 1. Get locked wallets
        from_wallet = await wallet_svc.get_or_create_wallet(user_id, from_curr, lock=True)
        to_wallet = await wallet_svc.get_or_create_wallet(user_id, to_curr, lock=True)
        
        # 2. Get quote first
        quote = await currency_svc.get_conversion_quote(
            from_wallet.id, from_curr, to_curr, amount
        )
        
        # 3. Verify user accepts rate
        # (In API, user already approved in request)
        
        # 4. Execute conversion
        conversion = await currency_svc.convert_currency(
            from_wallet, to_wallet, amount, user_id
        )
        
        await db.commit()
        return {"success": True, "conversion_id": conversion.id}
        
    except ValueError as e:
        await db.rollback()
        return {"success": False, "error": str(e)}
```

### Pattern 2: Rate Override for Market Events

```python
async def respond_to_volatility(currency_pair: str, adjusted_rate: float, reason: str):
    service = CurrencyService(db)
    
    # Remove existing override
    query = select(ExchangeRateOverride).where(
        ExchangeRateOverride.currency_pair == currency_pair,
        ExchangeRateOverride.expires_at > datetime.now(timezone.utc)
    )
    result = await db.execute(query)
    old_override = result.scalar_one_or_none()
    if old_override:
        await service.remove_rate_override(old_override.id)
    
    # Set new override
    override = await service.set_rate_override(
        currency_pair,
        adjusted_rate,
        reason,
        created_by="system_admin",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)
    )
    
    await db.commit()
```

### Pattern 3: Rate Volatility Alert

```python
async def check_volatility_alert(currency_pair: str):
    service = CurrencyService(db)
    
    stats = await service.get_rate_stats(currency_pair, days=7)
    
    if stats["volatility"] > 2.0:  # High volatility threshold
        logger.warning(f"High volatility detected: {stats['volatility']}")
        # Send alert to admins
        await send_admin_notification(
            f"High volatility on {currency_pair}: {stats['volatility']:.2f}"
        )
```

## Testing

```bash
# Run all multi-currency tests
pytest backend/tests/test_multi_currency.py -v

# Run specific test
pytest backend/tests/test_multi_currency.py::test_conversion_fee_calculation -v

# With logging
pytest backend/tests/test_multi_currency.py -v -s

# Coverage report
pytest backend/tests/test_multi_currency.py --cov=services.currency_service
```

## Troubleshooting Commands

```bash
# Check exchange rate cache status
python -c "from services import exchange_rate_service; print(exchange_rate_service.get_cache_status_for_pair('USD_PHP'))"

# Clear cache
python -c "from services import exchange_rate_service; exchange_rate_service.clear_cache()"

# Check active overrides (using DB)
sqlite3 paybot.db "SELECT * FROM exchange_rate_override WHERE expires_at > datetime('now')"

# View recent rates
sqlite3 paybot.db "SELECT * FROM exchange_rate_history ORDER BY recorded_at DESC LIMIT 10"

# Check conversion history for user
sqlite3 paybot.db "SELECT * FROM currency_conversion WHERE user_id='user_id' ORDER BY created_at DESC"
```

## Performance Tips

1. **Cache Warm-up**: Call `get_all_supported_rates()` on app startup to populate cache
2. **Batch Queries**: Use `get_rate_stats()` with wider date range to reduce queries
3. **Avoid Frequent Rate Fetches**: Quote expires in 30 sec; encourage users to convert soon after quote
4. **Monitor Rate History Size**: Implement cleanup for 90+ day old records if needed

## Migration Check

```bash
# Verify migration applied
alembic current
# Should show: s3t4u5v6w7x8

# List all migrations
alembic history

# Rollback if needed
alembic downgrade s3t4u5v6w7x8
```
