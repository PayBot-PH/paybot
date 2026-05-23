# PayBot Production Deployment Checklist

## Pre-Flight Requirements

Before accepting real card payments on your Telegram Bot or Mini App, ensure the following are completed:

### 1. **IP Whitelisting**
   - Navigate to **Maya Business Manager (MBM) → Developer Settings**
   - Whitelist the public IP address of your production server (DigitalOcean/AWS/etc.)
   - Maya will **reject** disbursement API calls from unknown IPs
   - Test: `curl -I https://pg.maya.ph` from your server to verify connectivity

### 2. **Webhook Registration**
   - In MBM dashboard, configure your webhook URL:
     - Example: `https://api.yourdomain.com/api/v1/webhooks/maya/payment`
   - Test webhook delivery in MBM sandbox environment first
   - Verify `MAYA_WEBHOOK_SECRET` is correctly configured in `.env.production`
   - Implement webhook signature verification (currently noted as TODO in code)

### 3. **Maya Unified Transfer (FAPI Security)**
   - Confirm your account is provisioned for **standard API key access** for disbursements
   - If Maya enforces their newer **Unified Transfer API**, you must:
     - Swap the Basic Auth header for OAuth 2.0 Client Credential token
     - Implement JWS (JSON Web Signature) request signing
     - Refer to Maya's latest BSP compliance documentation

### 4. **Database Setup**
   - Provision a PostgreSQL 13+ instance in your production environment
   - Create the database: `paybot_prod`
   - Run migrations:
     ```bash
     npx knex migrate:latest --env production
     ```
   - Verify tables created: `wallets`, `transactions`, `withdrawals`
   - Enable SSL connections for production databases

### 5. **Environment Configuration**
   - Copy `.env.production` and update with **actual** credentials:
     - `DATABASE_URL`: Your PostgreSQL connection string
     - `MAYA_SECRET_KEY`: Live Maya API key (starts with `sk-live-`)
     - `MAYA_WEBHOOK_SECRET`: Webhook signing secret from MBM
   - Use a secure secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   - **Never commit `.env.production` to version control**

### 6. **Security Hardening**
   - [ ] Enable HTTPS/TLS on all endpoints (HTTP → HTTPS redirect)
   - [ ] Implement rate limiting on `/api/v1/wallet/withdraw` endpoint
   - [ ] Add request validation middleware
   - [ ] Implement API key authentication for non-webhook endpoints
   - [ ] Enable CORS only for your Telegram Bot/Mini App domain
   - [ ] Implement webhook signature verification using `MAYA_WEBHOOK_SECRET`
   - [ ] Log all transactions to immutable ledger for audit trails
   - [ ] Encrypt sensitive data in `metadata` field

### 7. **Monitoring & Alerts**
   - [ ] Set up database connection pool monitoring
   - [ ] Alert on failed transactions
   - [ ] Monitor cron job execution (T+1 settlement sweep at 5 AM)
   - [ ] Set up log aggregation (CloudWatch, DataDog, etc.)
   - [ ] Monitor webhook delivery failures

### 8. **Testing Before Go-Live**
   - [ ] Test Maya sandbox environment first
   - [ ] Verify transaction locking with concurrent requests
   - [ ] Test rollback scenarios (insufficient balance, API failures)
   - [ ] Verify T+1 settlement cron job runs correctly
   - [ ] Load test with 100+ concurrent withdrawal requests
   - [ ] Test webhook idempotency (redelivery scenarios)

### 9. **Compliance & Documentation**
   - [ ] Ensure BSP compliance for payment processing
   - [ ] Document all transaction types and settlement rules
   - [ ] Maintain audit logs for regulatory review
   - [ ] Implement proper error handling and logging

### 10. **Post-Deployment**
   - [ ] Monitor first 24 hours of live transactions closely
   - [ ] Have on-call support team ready
   - [ ] Verify daily settlement sweep completes successfully
   - [ ] Perform full reconciliation of balance vs. transaction ledger

---

## Database Tables Overview

### `wallets`
Stores merchant/user account balances with settlement tracking.
- `available_balance`: Funds ready to withdraw (instant QR + settled cards)
- `pending_balance`: T+1 card deposits awaiting settlement

### `transactions`
Immutable ledger of all financial movements for audit compliance.
- Every debit/credit is logged
- Cannot be modified (append-only)

### `withdrawals`
Tracks InstaPay disbursement requests and status.

---

## Key Production Features

✅ **Transaction Locks**: `FOR UPDATE` prevents race conditions
✅ **Double-Entry Ledger**: Immutable transaction log for compliance
✅ **Automatic Rollback**: Failed API calls rollback balance deductions
✅ **T+1 Settlement**: Daily cron job clears pending card balances
✅ **Centavo Precision**: All amounts stored as integers to avoid floating-point errors
✅ **Connection Pooling**: Min 2, Max 10 connections for optimal performance

---

## Troubleshooting

**Webhook not received?**
- Verify IP is whitelisted in MBM
- Check firewall allows inbound on port 5000 (or your configured PORT)
- Verify webhook URL is reachable from Maya's infrastructure

**Withdrawals failing?**
- Check `available_balance` > requested amount
- Verify bank code and account number are valid
- Review Maya API error in CloudWatch logs

**Transaction lock timeouts?**
- Check for long-running queries blocking the wallet row
- Increase pool size if under heavy load
- Review database indices on `user_id` and `id`

---

## Additional Resources

- Maya API Documentation: https://docs.maya.ph
- Knex.js Transactions: http://knexjs.org/#Transactions
- PostgreSQL Locking: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE
