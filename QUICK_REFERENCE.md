# xend Wallet Enhancements - Quick Reference

## 🚀 Quick Start

### 1. Apply Migration
```bash
cd backend
python -m alembic upgrade head
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure SMS (Optional)
```bash
# Semaphore (recommended for Philippines)
export SMS_PROVIDER=semaphore
export SEMAPHORE_API_KEY=your_key_here

# Or Twilio
export SMS_PROVIDER=twilio
export TWILIO_ACCOUNT_SID=...
export TWILIO_AUTH_TOKEN=...
export TWILIO_PHONE_NUMBER=...
```

### 4. Start Backend
```bash
python -m uvicorn main:app --reload
```

---

## 📱 SMS Notifications

### Configuration
```python
# core/config.py
SMS_PROVIDER = "semaphore"  # or "twilio"
SEMAPHORE_API_KEY = "..."
SMS_ENABLE_NOTIFICATIONS = True
SMS_MAX_RETRIES = 3
SMS_RETRY_DELAY_MS = 1000
```

### Usage
```python
from services.notification_service import SMSService

# Send custom SMS
await SMSService.send_sms("+639171234567", "Your message")

# Notify user of successful transfer
await SMSService.notify_user_of_successful_transfer(
    mobile_number="+639171234567",
    amount=1000.00,
    recipient="@username",
    reference_id="trf-12345"
)

# Notify of disbursement
await SMSService.notify_user_of_disbursement(
    mobile_number="+639171234567",
    amount=5000.00,
    bank_name="BDO",
    account_name="John Doe",
    reference_id="disb-12345",
    status="completed"
)
```

---

## 🔐 Admin Wallet Operations

### Endpoints

#### Get Wallet Analytics
```bash
curl -X GET http://localhost:8000/api/v1/admin/wallets/user/123456/analytics \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
{
  "user_id": "123456",
  "wallets": [
    {
      "id": 1,
      "currency": "PHP",
      "balance": 10000.00,
      "available_balance": 10000.00,
      "pending_balance": 0.00,
      "total_credits": 50000.00,
      "total_debits": 40000.00,
      "transaction_count": 25,
      "is_frozen": false,
      "last_activity": "2026-06-06T02:30:00Z"
    }
  ],
  "recent_transactions": [...]
}
```

#### Freeze Wallet
```bash
curl -X POST http://localhost:8000/api/v1/admin/wallets/freeze \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123456",
    "reason": "Suspicious activity detected"
  }'
```

#### Unfreeze Wallet
```bash
curl -X POST http://localhost:8000/api/v1/admin/wallets/unfreeze?user_id=123456 \
  -H "Authorization: Bearer TOKEN"
```

#### Reconcile Wallet
```bash
curl -X POST http://localhost:8000/api/v1/admin/wallets/reconcile \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "123456",
    "currency": "PHP"
  }'
```

#### Batch Credit Wallets
```bash
curl -X POST http://localhost:8000/api/v1/admin/wallets/batch-credit \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "user_id": "111",
        "amount": 100.00,
        "currency": "PHP",
        "note": "Promo credit"
      },
      {
        "user_id": "222",
        "amount": 50.00,
        "currency": "PHP",
        "note": "Referral bonus"
      }
    ]
  }'
```

#### List Frozen Wallets
```bash
curl -X GET "http://localhost:8000/api/v1/admin/wallets/list-frozen?skip=0&limit=20" \
  -H "Authorization: Bearer TOKEN"
```

---

## 💸 Settlement Management

### Create Settlement Batch
```bash
curl -X POST http://localhost:8000/api/v1/entities/disbursements/admin/settlement/batch \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": ["111", "222", "333"],
    "bank_code": "bdo",
    "priority": "high"
  }'
```

### Mark Batch Completed
```bash
curl -X POST http://localhost:8000/api/v1/entities/disbursements/admin/settlement/batch-12345/complete \
  -H "Authorization: Bearer TOKEN"
```

### Get Settlement Statistics
```bash
curl -X GET http://localhost:8000/api/v1/entities/disbursements/admin/settlement/stats \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
{
  "today": {
    "count": 15,
    "total_amount": 50000.00,
    "total_fees": 500.00
  },
  "week": {
    "count": 105,
    "total_amount": 350000.00,
    "total_fees": 3500.00
  },
  "pending": {
    "count": 8,
    "total_amount": 25000.00
  },
  "failed": {
    "count": 2,
    "total_amount": 5000.00
  }
}
```

---

## 🛠️ Service Layer

### Wallet Service
```python
from services.wallets import WalletsService
from sqlalchemy.ext.asyncio import AsyncSession

service = WalletsService(db: AsyncSession)

# Freeze wallet
await service.freeze_wallet("user_id", "reason")

# Unfreeze wallet
await service.unfreeze_wallet("user_id")

# Get analytics
analytics = await service.get_wallet_analytics("user_id")

# Reconcile balance
result = await service.reconcile_wallet("user_id", "PHP")

# Batch credit wallets
results = await service.batch_credit_wallets([
    {"user_id": "111", "amount": 100.00, "currency": "PHP"},
    {"user_id": "222", "amount": 50.00, "currency": "PHP"},
], admin_id="admin_user_id")

# Update analytics
await service.update_wallet_analytics(wallet_id, amount, is_credit=True)
```

### Disbursement Service
```python
from services.disbursements import DisbursementsService

service = DisbursementsService(db)

# Calculate fee
fee = await service.calculate_fee(5000.00, "bdo", "batch")

# Create settlement batch
batch = await service.create_settlement_batch(
    user_ids=["111", "222"],
    bank_code="bdo",
    priority="high"
)

# Mark completed
await service.mark_settlement_completed(batch_id)

# Get statistics
stats = await service.get_settlement_stats()
```

### SMS Service
```python
from services.notification_service import SMSService

# Send custom SMS
await SMSService.send_sms("+639171234567", "Your message")

# Transfer notification
await SMSService.notify_user_of_successful_transfer(
    mobile_number, amount, recipient, reference_id
)

# Disbursement notification
await SMSService.notify_user_of_disbursement(
    mobile_number, amount, bank_name, account_name, 
    reference_id, status
)

# Top-up notification
await SMSService.notify_user_of_topup(
    mobile_number, amount, currency, reference_id
)

# Bank failure notification
await SMSService.notify_bank_of_failure(
    bank_code, amount, reference_id, error_detail
)
```

---

## 📊 Models

### Wallets
```python
from models.wallets import Wallets

# New columns
wallet.is_frozen          # Boolean - Freeze status
wallet.freeze_reason      # String - Reason
wallet.total_credits      # Float - Cumulative credits
wallet.total_debits       # Float - Cumulative debits
wallet.transaction_count  # Integer - Total transactions
wallet.last_activity      # DateTime - Last transaction
```

### Disbursements
```python
from models.disbursements import Disbursements

# New columns
disbursement.settlement_batch_id   # String - Batch ID
disbursement.settlement_priority   # String - Priority level
disbursement.processing_fee        # Float - Fee charged
disbursement.net_amount            # Float - Amount after fees
disbursement.scheduled_at          # DateTime - Scheduled time
disbursement.processed_at          # DateTime - Processing start
disbursement.completed_at          # DateTime - Settlement time
disbursement.failure_reason        # String - Error detail
disbursement.retry_count           # Integer - Retry attempts
```

---

## 🧪 Testing

### Run All Wallet Enhancement Tests
```bash
cd backend
pytest tests/test_wallet_enhancements.py -v
```

### Run Specific Test Class
```bash
pytest tests/test_wallet_enhancements.py::TestSMSNotifications -v
pytest tests/test_wallet_enhancements.py::TestWalletModels -v
pytest tests/test_wallet_enhancements.py::TestAdminWalletRouter -v
```

### Run with Coverage
```bash
pytest tests/test_wallet_enhancements.py --cov=services --cov=routers
```

---

## 🔍 Debugging

### Enable SMS Logging
```python
# In core/config.py
settings.debug = True
```

### Check SMS Configuration
```bash
curl http://localhost:8000/api/v1/health
# Check logs for SMS provider status
```

### Test SMS Send
```python
# In Python shell
import asyncio
from services.notification_service import SMSService

asyncio.run(SMSService.send_sms("+639171234567", "Test message"))
```

### Check Wallet Status
```bash
curl http://localhost:8000/api/v1/admin/wallets/user/123456/analytics \
  -H "Authorization: Bearer TOKEN"
```

---

## ⚠️ Important Notes

1. **SMS Notifications are Non-Blocking**: SMS sends fire-and-forget. Check logs for delivery status.

2. **Admin Endpoints Require `is_super_admin=true`**: Verify user permissions before testing.

3. **Mobile Numbers in E.164 Format**: Always use `+country_code` format (e.g., `+639171234567`).

4. **Fee Calculations**: Based on bank and transaction type:
   - BDO/BPI: 1%
   - GCash/Maya: 0.5%
   - MetroBank/Security Bank/UnionBank: 1.5%
   - Batch discount: -0.3%

5. **Wallet Freeze**: Prevents ALL transactions (transfers, withdrawals, payments).

6. **Reconciliation**: Detects balance mismatches and auto-corrects if difference > ₱0.01.

---

## 📚 Documentation

- **Full Guide**: `WALLET_ENHANCEMENTS_README.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **API Docs**: `http://localhost:8000/docs`

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| SMS not sending | Check `SMS_ENABLE_NOTIFICATIONS=true` and API key configured |
| Admin endpoints return 403 | Verify `is_super_admin=true` on user |
| Wallet balance mismatch | Run reconciliation: `POST /api/v1/admin/wallets/reconcile` |
| Migration fails | Ensure database is accessible: `python -m alembic current` |
| Imports fail | Run `pip install -r requirements.txt` |

---

## 💡 Best Practices

1. **Always check SMS logs** for delivery failures
2. **Use batch operations** for multiple wallet updates
3. **Reconcile wallets** periodically to detect issues
4. **Set SMS retry limit** in configuration (default: 3)
5. **Monitor settlement stats** for payment health
6. **Freeze wallets** before investigating suspicious activity
7. **Test SMS** with non-production numbers first

---

## 🎯 Common Use Cases

### Add Promotional Credit
```python
await service.batch_credit_wallets([
    {"user_id": user_id, "amount": 100, "note": "Promo credit"}
], admin_id=admin_id)
```

### Investigate Suspicious Activity
```python
# Get analytics
analytics = await service.get_wallet_analytics(user_id)
# Freeze wallet
await service.freeze_wallet(user_id, "Suspicious activity detected")
# Review transactions before unfreezing
```

### Process Batch Settlement
```python
# Create batch
batch = await service.create_settlement_batch(
    user_ids=[...], bank_code="bdo"
)
# After clearing with bank
await service.mark_settlement_completed(batch['batch_id'])
```

### Send Transfer Notification
```python
asyncio.create_task(
    SMSService.notify_user_of_successful_transfer(
        mobile_number, amount, recipient, reference_id
    )
)
```

---

## 📞 Support

For issues or questions:
1. Check `WALLET_ENHANCEMENTS_README.md` troubleshooting section
2. Review logs: `tail -f app.log | grep SMS`
3. Run tests: `pytest tests/test_wallet_enhancements.py -v`
4. Check database: `sqlite3 paybot.db ".schema wallets"`

---

**Last Updated**: 2026-06-06
**Version**: 1.0.0
