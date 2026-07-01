# Xend API Documentation Guide

## 1) Overview

Xend exposes a REST API under `/api/v1` for Telegram authentication, payment processing, KYB/KYC onboarding, wallet operations, team management, POS terminals, and developer tooling.

- Base URL (local): `http://localhost:8000`
- API root: `/api/v1`
- OpenAPI JSON: `/openapi.json`
- Interactive docs: `/docs`
- Alternative docs: `/redoc`

This guide is written for backend engineers, frontend developers, and integration teams.

## 2) Authentication

### 2.1 Telegram Login Widget

Endpoint:
- `POST /api/v1/auth/telegram-login-widget`

Purpose:
- Verifies Telegram widget payload signature.
- Issues app JWT token.

Request body (example):
```json
{
  "id": 123456789,
  "auth_date": 1762000000,
  "first_name": "Jane",
  "username": "jane_admin",
  "hash": "telegram_signature_hash"
}
```

Response (example):
```json
{
  "token": "<jwt>",
  "user": {
    "id": "123456789",
    "email": "jane_admin@telegram.local",
    "role": "admin",
    "permissions": {
      "is_super_admin": false,
      "can_manage_bot": true
    }
  }
}
```

### 2.2 Current User

Endpoint:
- `GET /api/v1/auth/me`

Header:
- `Authorization: Bearer <jwt>`

Returns authenticated user profile, permissions, and organization scope.

### 2.3 Permission Model

Permission flags are returned in `user.permissions` and used by backend guards:

- `is_super_admin`
- `can_manage_payments`
- `can_manage_disbursements`
- `can_view_reports`
- `can_manage_wallet`
- `can_manage_transactions`
- `can_manage_bot`
- `can_approve_topups`
- `can_manage_team`

## 3) Authorization and Role Scope

### 3.1 Team and Organization Roles

Main role templates:
- `super_admin`
- `owner`
- `admin`
- `editor`
- `viewer`
- `developer`
- `approver`

Notes:
- `super_admin` is global.
- `owner` is organization-scoped and intended for organization ownership.
- Organization admins cannot assign `super_admin` or `owner`.

### 3.2 Key Guards in Current API

- Bot settings: super-admin only.
- Admin API key management (`/api/v1/admin/api-keys`): super-admin only.
- Developer API config management (`/api/v1/entities/api_configs`): developer or super admin.
- Team invitation routes: requires team management capability.

## 4) Standard Request and Response Patterns

### 4.1 Success

- 200 for read/update operations
- 201 for create operations
- 204 for successful delete without body

### 4.2 Error Shape

FastAPI-style errors typically return:
```json
{
  "detail": "Human readable reason"
}
```

Common status codes:
- `400` validation or business rule violation
- `401` missing or invalid authentication
- `403` authenticated but not authorized
- `404` resource not found
- `409` conflict/uniqueness issues
- `500` unexpected server error

## 5) Endpoint Catalog by Domain

### 5.1 Health

- `GET /health`
- `GET /api/v1/health`
- `GET /api/v1/health/db`

### 5.2 Authentication and Session

- `/api/v1/auth/*`

Typical operations:
- login widget verification
- token issuance
- current user profile

### 5.3 KYB and KYC

- `/api/v1/kyb/*`
- `/api/v1/kyc/*`

Typical operations:
- submit records
- list review queue
- approve/reject

### 5.4 Team and Roles

- `/api/v1/team/*`
- `/api/v1/roles/*`
- `/api/v1/admin-users/*`

Typical operations:
- invite users
- list invitations and team members
- manage admin users and role templates

### 5.5 Wallet and Topups

- `/api/v1/wallet/*`
- `/api/v1/topup/*`
- `/api/v1/bank-deposits/*`
- `/api/v1/admin/wallets/*`

Typical operations:
- wallet balances
- topup requests
- bank deposit tracking
- admin wallet actions

### 5.6 Payments and Gateways

- `/api/v1/xend/*`
- `/api/v1/maya/*`
- `/api/v1/paymongo/*`
- `/api/v1/photonpay/*`
- `/api/v1/gateway/*`
- `/api/v1/transfi/*`

Typical operations:
- invoice creation
- payment links
- QR-based payment flows
- provider-specific integrations

### 5.7 Events and Webhooks

- `/api/v1/events/*`
- `/api/v1/webhooks/*`
- `/api/v1/telegram/webhook*`

Typical operations:
- event simulation
- incoming webhook handling
- Telegram bot webhook info and control

### 5.8 Entity CRUD APIs

- `/api/v1/entities/customers`
- `/api/v1/entities/transactions`
- `/api/v1/entities/disbursements`
- `/api/v1/entities/refunds`
- `/api/v1/entities/subscriptions`
- `/api/v1/entities/wallets`
- `/api/v1/entities/wallet_transactions`
- `/api/v1/entities/bot_logs`
- `/api/v1/entities/bot_settings`
- `/api/v1/entities/api_configs`

Most entity routes support:
- list with pagination
- get by ID
- create
- update
- delete
- batch create/update/delete for selected entities

## 6) Developer API Key Management (Scoped Keys)

### 6.1 Recommended Model

Generate API keys with explicit scope metadata:

- key config entry: `payment_api_key_<tag>_<timestamp>`
- scope metadata: `payment_api_key_<tag>_<timestamp>_scopes`
- issue timestamp metadata: `payment_api_key_<tag>_<timestamp>_issued_at`

All three are stored in `/api/v1/entities/api_configs`.

### 6.2 Allowed Scope Values

Scope metadata keys ending in `_scopes` accept comma-separated values from:

- `payments:read`
- `payments:write`
- `customers:read`
- `customers:write`
- `disbursements:read`
- `disbursements:write`
- `wallet:read`
- `wallet:write`
- `webhooks:read`
- `webhooks:manage`

Backend behavior:
- rejects unknown scopes with `400`
- deduplicates and sorts valid scopes before persistence

### 6.3 Example: Create Scoped API Key Metadata

Endpoint:
- `POST /api/v1/entities/api_configs/batch`

Request example:
```json
{
  "items": [
    {
      "service_name": "paymongo",
      "config_key": "payment_api_key_prpwhr_20260701090000",
      "config_value": "paymongo_live_prpwhr_7f0d...",
      "is_active": true
    },
    {
      "service_name": "paymongo",
      "config_key": "payment_api_key_prpwhr_20260701090000_scopes",
      "config_value": "payments:read,payments:write,webhooks:read",
      "is_active": true
    },
    {
      "service_name": "paymongo",
      "config_key": "payment_api_key_prpwhr_20260701090000_issued_at",
      "config_value": "2026-07-01T09:00:00.000Z",
      "is_active": true
    }
  ]
}
```

### 6.4 Direct Payment API Authentication with X-API-Key

Payment endpoints now accept either:

- `Authorization: Bearer <jwt>`
- `X-API-Key: <generated_payment_api_key>`

Scope requirements:

- Write operations (`create-invoice`, `create-payment-link`, `create-qr-code`, `pay-qrph`) require `payments:write`.
- Read operations (`transaction-stats`) require `payments:read` (or `payments:write`).

If scope is missing, API returns `403` with a scope error.

Example using API key:

```bash
curl -X POST "http://localhost:8000/api/v1/xend/create-invoice" \
  -H "X-API-Key: <generated_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1500,
    "description": "Order #WEB-10001",
    "merchant_name": "My Website Store",
    "descriptor": "MYSHOP",
    "payment_methods": ["gcash", "maya"]
  }'
```

## 7) Team Invitation Flows

### 7.1 Invite Team Member

Endpoint:
- `POST /api/v1/team/invite`

Example body:
```json
{
  "email": "owner@merchant.com",
  "role": "owner",
  "organization_name": "Merchant One Inc",
  "notes": "Initial owner setup"
}
```

Behavior:
- super admin can provide org name/id when inviting owner.
- organization admins are restricted from owner/super_admin assignment.

### 7.2 List Invitations

Endpoint:
- `GET /api/v1/team/invitations`

Returns invitation records including:
- role
- status
- organization_id
- organization_name

## 8) Webhook and Callback Testing

### 8.1 Runtime webhook info

Endpoint:
- `GET /api/v1/telegram/webhook-info`

Use to inspect registration status, pending updates, and last error.

### 8.2 Event simulation

Endpoint:
- `POST /api/v1/events/simulate`

Purpose:
- triggers callback/event flows in controlled testing.

## 9) API Versioning and Compatibility

Current convention:
- versioned base path `/api/v1`

Recommendations for future changes:
- add new fields in a backward-compatible way
- avoid removing fields in-place
- introduce `/api/v2` for breaking changes

## 10) Operational and Security Guidance

- Always send JWT over HTTPS only.
- Do not expose full secret key values in logs or client analytics.
- Rotate scoped keys regularly and deactivate unused keys.
- Use least privilege: assign only scopes needed for each integration.
- Monitor webhook delivery errors and replay safely.

## 11) Quick Start Checklist for Integrators

1. Obtain JWT via Telegram login widget.
2. Fetch user profile with `/api/v1/auth/me` and verify permissions.
3. Create or retrieve scoped API key metadata under `/api/v1/entities/api_configs`.
4. Register callback/webhook URL config.
5. Trigger a test event via `/api/v1/events/simulate`.
6. Validate webhook receipt and signature handling in your integration.
7. Move to production with key rotation and monitoring enabled.

## 12) Troubleshooting

- `401 Unauthorized`: check bearer token presence, validity, and expiration.
- `403 Forbidden`: verify role and permission flags.
- `400 Invalid API key scopes`: only allowed scope names can be stored in `*_scopes` configs.
- webhook not firing: verify callback URL, network access, and event simulation payload.

## 13) Source of Truth

- Runtime OpenAPI schema: `/openapi.json`
- Swagger UI: `/docs`
- Router implementations: `backend/routers/*`
- This guide: `docs/API_DOCUMENTATION_GUIDE.md`

## 14) Complete Website Integration Flow

This section is the practical, end-to-end reference for integrating xend payment channels into your website.

### 14.1 Integration Architecture

1. Merchant backend authenticates to xend (JWT).
2. Merchant backend creates checkout resource (invoice, payment link, or QR).
3. Merchant frontend redirects user to returned hosted checkout URL or renders QR.
4. Merchant backend receives payment status updates through webhook/callback.
5. Merchant backend updates order state and returns status to website frontend.

### 14.2 Payment Resource Endpoints

All routes below require bearer token authentication.

- `POST /api/v1/xend/create-invoice`
- `POST /api/v1/xend/create-payment-link`
- `POST /api/v1/xend/create-qr-code`
- `GET /api/v1/xend/payment-methods`
- `GET /api/v1/xend/transaction-stats`

### 14.3 Create Invoice Example

Request:
```bash
curl -X POST "http://localhost:8000/api/v1/xend/create-invoice" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1500,
    "description": "Order #WEB-10001",
    "descriptor": "MYSHOP",
    "merchant_name": "My Shop PH",
    "customer_name": "Juan Dela Cruz",
    "customer_email": "juan@example.com",
    "external_id": "order-web-10001",
    "payment_methods": ["gcash", "maya", "visa"]
  }'
```

Successful response shape:
```json
{
  "success": true,
  "message": "xend invoice created",
  "data": {
    "transaction_id": 123,
    "external_id": "order-web-10001",
    "checkout_url": "https://...",
    "invoice_url": "https://...",
    "amount": 1500,
    "payment_methods": ["gcash", "maya", "visa"],
    "merchant_name": "My Shop PH",
    "descriptor": "MYSHOP",
    "applied_description": "MYSHOP | Order #WEB-10001",
    "gateway": "xend"
  }
}
```

### 14.4 Create Payment Link Example

```bash
curl -X POST "http://localhost:8000/api/v1/xend/create-payment-link" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2499,
    "description": "Subscription Plan A",
    "descriptor": "MYSUB",
    "merchant_name": "My Subscriptions",
    "external_id": "sub-2026-07-001",
    "payment_methods": ["gcash", "card"]
  }'
```

### 14.5 Create QR Payment Example

```bash
curl -X POST "http://localhost:8000/api/v1/xend/create-qr-code" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 799,
    "description": "QR Checkout Order #A10",
    "merchant_name": "QR Merchant",
    "external_id": "qr-a10",
    "payment_methods": ["qrph"]
  }'
```

Use `data.qr_image_url` from response to render QR in your checkout UI.

## 15) Web Frontend Integration Example

### 15.1 Server-side create checkout (Node/Express)

```javascript
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

app.post('/checkout/create', async (req, res) => {
  const response = await fetch('http://localhost:8000/api/v1/xend/create-invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PAYBOT_JWT}`,
    },
    body: JSON.stringify({
      amount: req.body.amount,
      description: `Order #${req.body.orderId}`,
      external_id: req.body.orderId,
      merchant_name: 'My Website Store',
      payment_methods: ['gcash', 'maya', 'visa'],
    }),
  });

  const payload = await response.json();
  if (!payload.success) {
    return res.status(400).json({ error: payload.message || 'Checkout creation failed' });
  }

  return res.json({
    orderId: req.body.orderId,
    checkoutUrl: payload.data.checkout_url,
    externalId: payload.data.external_id,
  });
});
```

### 15.2 Frontend redirect pattern

```javascript
async function startCheckout(orderId, amount) {
  const res = await fetch('/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amount }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to start checkout');

  window.location.href = data.checkoutUrl;
}
```

## 16) Webhook Integration Guide

### 16.1 Callback configuration storage

Store callback URL(s) using developer API configs under keys like:
- `callback_url`
- `webhook_url`

Use:
- `POST /api/v1/entities/api_configs`
- `GET /api/v1/entities/api_configs?reveal=true`

### 16.2 Simulate payment event for local testing

```bash
curl -X POST "http://localhost:8000/api/v1/events/simulate" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_type": "invoice",
    "amount": 1500,
    "status": "paid",
    "description": "Order #WEB-10001"
  }'
```

### 16.3 Recommended webhook handler behavior

1. Validate payload schema and event type.
2. Enforce idempotency by external transaction ID.
3. Accept only legal status transitions, for example `pending -> paid`.
4. Persist raw webhook payload for audit trail.
5. Respond quickly with HTTP 200 and process heavy tasks asynchronously.

## 17) Scoped API Key Design for Website Integrations

### 17.1 Suggested scope presets

- Read-only dashboard integration:
  - `payments:read`
  - `customers:read`
  - `wallet:read`
  - `webhooks:read`

- Standard checkout integration:
  - `payments:read`
  - `payments:write`
  - `customers:read`
  - `webhooks:manage`

- Back-office full integration:
  - all allowed scopes

### 17.2 Rotation strategy

1. Create new scoped key metadata entry.
2. Deploy new key to merchant backend environment variables.
3. Verify successful traffic with new key.
4. Deactivate old key (`is_active=false`) and later delete it.

## 18) Integration Readiness Checklist

1. JWT acquisition flow is implemented and tested.
2. Payment creation endpoint returns usable checkout URL.
3. Frontend redirect/QR flow works in staging.
4. Callback URL is reachable from xend environment.
5. Event simulation confirms your webhook pipeline.
6. Status reconciliation and idempotency are in place.
7. API key rotation runbook is documented internally.

## 19) Downloadable Postman Collection

Use the prebuilt Postman collection for faster integration and QA validation.

Download/import file:
- [docs/postman/Xend_Integration.postman_collection.json](docs/postman/Xend_Integration.postman_collection.json)

Included folders:
- `Auth`
- `Developer API Configs`
- `xend Payments`
- `Webhook Testing`

### 19.1 Quick Import Steps

1. Open Postman.
2. Click `Import`.
3. Select [docs/postman/Xend_Integration.postman_collection.json](docs/postman/Xend_Integration.postman_collection.json).
4. Set collection variables:
  - `base_url` (for example `http://localhost:8000`)
  - `jwt_token`
  - `service_name`
  - `api_key_config`
  - `generated_api_key`

### 19.2 Recommended Run Order

1. `Auth / Get Current User`
2. `Developer API Configs / Create Scoped API Key + Metadata (Batch)`
3. `Developer API Configs / List API Configs (Reveal)`
4. `xend Payments / Get Supported Payment Methods`
5. `xend Payments / Create Invoice` or `Create Payment Link` or `Create QR Code`
6. `Webhook Testing / Simulate Payment Event`
7. `Webhook Testing / Get Webhook Runtime Status`

### 19.3 Notes

- Keep `jwt_token` and generated key values out of shared screenshots and logs.
- Use separate Postman environments for local, staging, and production.
- Rotate keys periodically and disable unused key configs.
