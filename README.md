# 🤖 PayBot — Telegram Bot & Xendit Payment Gateway Dashboard

A full-featured **payment management platform** that combines a **Telegram Bot** with an **Admin Dashboard** powered by **Xendit** payment gateway. Accept payments via invoices, QR codes, payment links, virtual accounts, and e-wallets — all manageable through Telegram commands or a sleek web interface.

![PayBot Dashboard](https://img.shields.io/badge/PayBot-Admin%20Dashboard-blue?style=for-the-badge&logo=telegram)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-React-blue?style=for-the-badge&logo=typescript)
![Python](https://img.shields.io/badge/Python-FastAPI-green?style=for-the-badge&logo=python)

---

## 🌐 Accessing the Dashboard

Open your browser to the URL that matches your environment:

| Environment | URL |
|-------------|-----|
| **Local dev** (Vite frontend dev server) | `http://localhost:3000` |
| **Local / Docker** (backend serves built UI) | `http://localhost:8000` |
| **Railway production** | `https://<your-project>.up.railway.app` |

> **Finding your Railway URL:** go to your Railway project → select the service → **Settings → Domains**. It looks like `https://paybot-production-xxxx.up.railway.app`.

### Dashboard Pages

| Page | Path | Description |
|------|------|-------------|
| Bot Intro | `/intro` | Animated introduction page showcasing bot capabilities |
| Dashboard | `/` | Stats, wallet balance, recent transactions |
| Wallet | `/wallet` | Balance management, top up, withdraw, disburse |
| Payments Hub | `/payments` | Create payments via all 7 methods |
| Create Payment | `/create-payment` | Invoice / QR / payment link form |
| Transactions | `/transactions` | Full history with search & filters |
| Money Management | `/disbursements` | Disbursements, refunds, subscriptions, customers |
| Reports | `/reports` | Revenue analytics and fee calculator |
| Bot Settings | `/bot-settings` | Test bot, set webhook, send test message |
| Admin Management | `/admin-management` | Add/remove admins, set permissions |
| Bot Messages | `/bot-messages` | Bot broadcast messages |
| Topup Requests | `/topup-requests` | Approve wallet top-up requests |
| USDT Send Requests | `/usdt-send-requests` | Manage USDT send requests |
| Features | `/features` | Public landing page |
| Policies | `/policies` | Terms of Service, Privacy Policy, Refund Policy |

---

## ✨ Features

### 💳 Payment Collection (7 Methods)
- **Invoices** — Generate professional invoices with custom amounts and customer details
- **QR Codes** — Create QRIS-compatible QR code payments for in-person transactions
- **Alipay QR** — Alipay-compatible QR via Xendit QRIS
- **Maya Checkout** — Maya payment via Security Bank Collect (SBC)
- **Payment Links** — Shareable payment URLs for online collection
- **Virtual Accounts** — Bank transfer payments via BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank
- **E-Wallets** — Accept payments through GCash, GrabPay, and PayMaya

### 💰 Wallet System
- Internal wallet with balance tracking
- **Top Up** via Xendit invoice (auto-credited on payment)
- Withdraw and transfer between users
- Auto-credit on successful payments
- Full transaction history with filtering

### 💸 Disbursements
- Send money to any Philippine bank account
- Track disbursement status in real-time
- Support for all major PH banks

### 🔄 Refunds
- Full and partial refund processing
- Automatic wallet balance adjustment
- Refund history and tracking

### 📅 Subscriptions
- Create recurring billing plans (daily, weekly, monthly, yearly)
- Pause, resume, and cancel subscriptions
- Customer assignment and billing cycle tracking

### 👥 Customer Management
- Full CRUD for customer profiles
- Track payment history per customer
- Notes and contact information

### 📊 Reports & Analytics
- Revenue reports (daily, weekly, monthly)
- Payment method breakdown with visual bars
- Status breakdown (paid, pending, expired, refunded)
- Success rate tracking
- Xendit account balance check
- Fee calculator for all payment methods

### 🤖 Telegram Bot (22 Commands)
- Full payment gateway accessible via chat commands
- Real-time payment notifications
- Interactive menus and inline keyboards
- Webhook-based for instant responses

### 🔐 Admin Management
- Role-based access control with per-admin permissions
- Only Telegram bot users can access the admin UI
- Add/remove admins and toggle permissions
- Contact support button linking to [@traxionpay](https://t.me/traxionpay)

### 🔔 Real-Time Notifications
- Server-Sent Events (SSE) for live dashboard updates
- Payment confirmation alerts
- Wallet transaction notifications

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| **Database** | PostgreSQL (production) / SQLite (local dev) |
| **Payments** | Xendit, PayMongo, PhotonPay, TransFi |
| **Bot** | Telegram Bot API |
| **Auth** | JWT (Telegram Login Widget) |
| **Real-time** | Server-Sent Events (SSE) |
| **Deployment** | Railway (Docker multi-stage build) |

---

## 🪟 Windows Local Quick Start

Run from the repository root in PowerShell:

```powershell
./setup_windows.ps1
./start_local_windows.ps1
```

What this does:
- Installs Python 3.11 and Node.js LTS via `winget` (user scope)
- Enables `pnpm` via Corepack
- Creates `backend/.env` and `frontend/.env` if missing
- Installs backend/frontend dependencies
- Starts backend (`:8000`) and frontend (`:3000`) in separate terminals

If PowerShell blocks script execution for the current terminal session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

---

## 📁 Project Structure

```
app/
├── Dockerfile                        # Docker container configuration
├── railway.json                      # Railway deployment config
├── runtime.txt                       # Python runtime version (3.11)
├── start.sh                          # Simple startup script
├── start_app_v2.sh                   # Advanced startup with auto port assignment
├── backend/                          # Python FastAPI Backend
│   ├── main.py                       # App entry point
│   ├── requirements.txt              # Python dependencies
│   ├── alembic/                      # Database migrations
│   ├── core/                         # Core config, database, auth
│   │   ├── config.py                 # Environment & settings
│   │   ├── database.py               # Async SQLAlchemy setup
│   │   └── auth.py                   # Authentication utilities
│   ├── models/                       # SQLAlchemy ORM models
│   │   ├── transactions.py           # Payment transactions
│   │   ├── wallets.py                # User wallets
│   │   ├── wallet_transactions.py    # Wallet transaction log
│   │   ├── customers.py              # Customer profiles
│   │   ├── disbursements.py          # Money-out records
│   │   ├── refunds.py                # Refund records
│   │   ├── subscriptions.py          # Recurring billing
│   │   ├── api_configs.py            # API key storage
│   │   ├── bot_settings.py           # Telegram bot config
│   │   └── bot_logs.py               # Bot activity logs
│   ├── routers/                      # API route handlers
│   │   ├── xendit.py                 # Xendit webhooks & payments
│   │   ├── gateway.py                # Full payment gateway API
│   │   ├── telegram.py               # Telegram webhook handler
│   │   └── events.py                 # SSE real-time events
│   └── services/                     # Business logic
│       ├── xendit_service.py         # Xendit API integration
│       ├── telegram_service.py       # Telegram Bot API client
│       └── event_bus.py              # In-memory event bus for SSE
│
├── frontend/                         # React + TypeScript Frontend
│   ├── index.html                    # HTML entry point
│   ├── package.json                  # Node dependencies
│   ├── vite.config.ts                # Vite configuration
│   ├── tailwind.config.ts            # Tailwind CSS config
│   └── src/
│       ├── main.tsx                  # React entry point
│       ├── App.tsx                   # Router & app shell
│       ├── contexts/AuthContext.tsx   # Auth state management
│       ├── hooks/usePaymentEvents.ts # SSE real-time hook
│       ├── lib/                      # Utilities (api, auth)
│       ├── pages/                    # All page components
│       └── components/ui/            # shadcn/ui components
│
└── README.md                         # This file
```

---

## 🔧 Post-Deployment Setup

After deploying, complete these steps to fully activate all features:

### 1. Set Up Telegram Webhook
- Open your deployed app's **Bot Settings** page
- Enter your Telegram Bot Token
- Set the webhook URL to: `https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook`
- Click **"Set Webhook"**

Or use the Telegram API directly:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook"}'
```

### 2. Set Up Xendit Webhook
1. Go to [Xendit Dashboard](https://dashboard.xendit.co) → **Settings** → **Webhooks**
2. Add webhook URL: `https://paybot-backend-production-84b2.up.railway.app/api/v1/xendit/webhook`
3. Select events: `invoices`, `qr_codes`, `payment_links`, `disbursements`

### 3. Set Up PayMongo Webhook
1. Go to [PayMongo Dashboard](https://dashboard.paymongo.com) → **Developers** → **Webhooks**
2. Click **Add Endpoint** and set URL: `https://paybot-backend-production-84b2.up.railway.app/api/v1/paymongo/webhook`
3. Select events:
   - `source.chargeable` (Alipay / WeChat Pay QR payments)
   - `checkout_session.payment.paid`
   - `checkout_session.payment.failed`
   - `payment.paid`
   - `payment.failed`
4. Copy the **Signing Secret** (starts with `whsk_`) and set it as `PAYMONGO_WEBHOOK_SECRET`
5. Set `PAYMONGO_MODE=test` for sandbox or `PAYMONGO_MODE=live` for production

#### PayMongo Top-Up Flow
1. User calls `POST /api/v1/paymongo/topup` (authenticated) with `amount` and optional `payment_method`
2. Backend creates a PayMongo Checkout Session (or Source for Alipay/WeChat) and returns a `checkout_url`
3. User completes payment on the PayMongo-hosted page
4. PayMongo delivers a signed webhook event to `/api/v1/paymongo/webhook`
5. Backend verifies the signature, checks idempotency, and credits the PHP wallet
6. Frontend receives a real-time wallet update via SSE (`/api/v1/events/stream`)

#### Local Development Notes
- In local/sandbox mode, PayMongo webhooks cannot reach `localhost`
- Use a tunnel (e.g. [ngrok](https://ngrok.com/): `ngrok http 8000`) and update the webhook URL in the PayMongo dashboard
- Set `PAYMONGO_MODE=test` and use test API keys from the PayMongo dashboard
- With `PAYMONGO_WEBHOOK_SECRET` unset, signature verification is skipped (dev-only)

### 4. Verify Everything Works
```bash
# Check backend health
curl https://paybot-backend-production-84b2.up.railway.app/health

# Check Telegram bot connection
curl https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/bot-info

# Check token configuration (debug)
curl https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/debug-token-check
```

---

## 🔑 Environment Variables Reference

### Required Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ | — |
| `XENDIT_SECRET_KEY` | Xendit API secret key | ✅ | — |
| `DATABASE_URL` | PostgreSQL connection string | ✅ | SQLite (local dev) |
| `JWT_SECRET_KEY` | Secret key for signing admin JWT tokens | ✅ | — |
| `ADMIN_USER_PASSWORD` | Password for admin dashboard login | ✅ | — |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram user IDs (or `@usernames`) with admin access | ✅ | — |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` — required for the Telegram Login Widget | — |
| `TELEGRAM_BOT_OWNER_ID` | Super-admin Telegram user ID (approves KYB registrations) | — |
| `PYTHON_BACKEND_URL` | Public backend URL — used for Telegram webhook auto-registration | Auto-detected |
| `ENVIRONMENT` | Application environment (`production` / `development`) | `development` |
| `PORT` | Server port | `8000` |
| `DEBUG` | Enable debug mode | `false` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | Empty (allows all) |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | JWT token expiry in minutes | `60` |

### PayMongo Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PAYMONGO_SECRET_KEY` | PayMongo secret API key | — |
| `PAYMONGO_PUBLIC_KEY` | PayMongo public API key | — |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret (`whsk_…`) | — |
| `PAYMONGO_MODE` | `test` (sandbox) or `live` (production) | `test` |

### PhotonPay Variables (Alipay / WeChat Pay)

| Variable | Description | Default |
|----------|-------------|---------|
| `PHOTONPAY_APP_ID` | PhotonPay App ID | — |
| `PHOTONPAY_APP_SECRET` | PhotonPay App Secret | — |
| `PHOTONPAY_SITE_ID` | PhotonPay Site ID (Collection → Site Management) | — |
| `PHOTONPAY_RSA_PRIVATE_KEY` | Merchant RSA private key (PKCS#8 PEM) for signing requests | — |
| `PHOTONPAY_RSA_PUBLIC_KEY` | PhotonPay platform RSA public key for webhook verification | — |
| `PHOTONPAY_MODE` | `production` or `sandbox` | `production` |

### TransFi Variables (Alipay / WeChat Pay)

| Variable | Description | Default |
|----------|-------------|---------|
| `TRANSFI_API_KEY` | TransFi Checkout API key | — |
| `TRANSFI_WEBHOOK_SECRET` | TransFi HMAC-SHA256 webhook secret | — |
| `TRANSFI_BASE_URL` | TransFi API base URL override | Auto (by mode) |
| `TRANSFI_MODE` | `production` or `sandbox` | `production` |

---

## 🤖 Telegram Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message & quick menu | `/start` |
| `/help` | Full command reference | `/help` |
| `/pay` | Interactive payment menu | `/pay` |
| `/invoice <amount> <desc>` | Create a payment invoice | `/invoice 500 Monthly subscription` |
| `/qr <amount> <desc>` | Generate QRIS QR code payment | `/qr 150 Coffee` |
| `/alipay <amount> <desc>` | Alipay-compatible QR via Xendit QRIS | `/alipay 500 Coffee order` |
| `/wechat <amount> <desc>` | Maya checkout via Security Bank Collect | `/wechat 500 Coffee order` |
| `/link <amount> <desc>` | Create shareable payment link | `/link 1000 Freelance work` |
| `/va <amount> <bank>` | Create virtual account | `/va 2500 BDO` |
| `/ewallet <amount> <provider>` | Charge e-wallet (GCASH, GRABPAY, PAYMAYA) | `/ewallet 300 GCASH` |
| `/disburse <amt> <bank> <acct> <name>` | Send money to bank account | `/disburse 1000 BPI 1234567890 Juan` |
| `/refund <id> <amount>` | Process a refund | `/refund inv-abc123 500` |
| `/status <id>` | Check payment status | `/status 42` |
| `/balance` | Check wallet balance & history | `/balance` |
| `/withdraw <amount>` | Withdraw from wallet | `/withdraw 500` |
| `/send <amount> <user>` | Transfer to another user | `/send 100 user123` |
| `/list` | List recent transactions | `/list` |
| `/cancel <id>` | Cancel a pending payment | `/cancel 42` |
| `/report [daily\|weekly\|monthly]` | View revenue summary | `/report weekly` |
| `/fees <amount> <method>` | Calculate payment fees | `/fees 1000 invoice` |
| `/subscribe <plan> <amt> <interval>` | Create subscription | `/subscribe Premium 999 monthly` |
| `/remind <id>` | Send payment reminder | `/remind 42` |

---

## 📱 Admin Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| **Bot Intro** | `/intro` | Animated landing page showcasing bot capabilities before sign-in |
| **Dashboard** | `/` | Overview with wallet balance, transaction stats, quick actions |
| **Wallet** | `/wallet` | Balance management, top up via Xendit, withdraw, disburse |
| **Payments Hub** | `/payments` | Create payments via Invoice, QR, Payment Link, VA, E-Wallet, Alipay, Maya |
| **Create Payment** | `/create-payment` | Quick payment creation form |
| **Transactions** | `/transactions` | Full transaction history with search & filter |
| **Money Management** | `/disbursements` | Disbursements, refunds, subscriptions, customers |
| **Reports** | `/reports` | Revenue analytics, breakdowns, fee calculator |
| **Bot Settings** | `/bot-settings` | Configure Telegram bot and webhook |
| **Admin Management** | `/admin-management` | Add/remove admins, set permissions |
| **Bot Messages** | `/bot-messages` | View and manage bot broadcast messages |
| **Topup Requests** | `/topup-requests` | Review and approve wallet top-up requests |
| **USDT Send Requests** | `/usdt-send-requests` | Manage USDT withdrawal/send requests |
| **Features** | `/features` | Public landing page showcasing platform features |
| **Policies** | `/policies` | Terms of Service, Privacy Policy, and Refund Policy |

---

## 🔗 API Endpoints

### Payment Gateway (`/api/v1/gateway/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/virtual-account` | Create virtual account payment |
| POST | `/ewallet-charge` | Create e-wallet charge |
| POST | `/disbursement` | Send money to bank account |
| GET | `/disbursements` | List all disbursements |
| POST | `/refund` | Process a refund |
| GET | `/refunds` | List all refunds |
| POST | `/subscription` | Create recurring subscription |
| GET | `/subscriptions` | List all subscriptions |
| PUT | `/subscription/{id}` | Update subscription status |
| POST | `/customer` | Add new customer |
| GET | `/customers` | List all customers |
| DELETE | `/customer/{id}` | Delete customer |
| POST | `/calculate-fees` | Calculate payment fees |
| GET | `/xendit-balance` | Check Xendit account balance |
| GET | `/reports` | Get revenue analytics |
| POST | `/send-reminder` | Send payment reminder |
| POST | `/expire-invoice/{id}` | Cancel pending invoice |
| GET | `/available-banks` | List supported banks |

### Xendit (`/api/v1/xendit/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create-invoice` | Create Xendit invoice |
| POST | `/create-qr-code` | Create QR code payment |
| POST | `/create-payment-link` | Create payment link |
| POST | `/webhook` | Receive Xendit payment callbacks |
| GET | `/transaction-stats` | Get transaction statistics |

### Telegram (`/api/v1/telegram/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook` | Receive Telegram updates |
| POST | `/set-webhook` | Register webhook URL |
| GET | `/bot-info` | Get bot connection status |
| GET | `/debug-token-check` | Debug token configuration |

---

## 🏦 Supported Banks (Philippines)

| Bank Code | Bank Name |
|-----------|-----------|
| BDO | Banco de Oro |
| BPI | Bank of the Philippine Islands |
| UNIONBANK | UnionBank of the Philippines |
| RCBC | Rizal Commercial Banking Corporation |
| CHINABANK | China Banking Corporation |
| PNB | Philippine National Bank |
| METROBANK | Metropolitan Bank & Trust |

## 📱 Supported E-Wallets

| Wallet | Code |
|--------|------|
| GCash | `GCASH` |
| GrabPay | `GRABPAY` |
| PayMaya / Maya | `PAYMAYA` |

---

## 🐛 Troubleshooting

### "No API Key detected" from Xendit
- Ensure `XENDIT_SECRET_KEY` is set in your environment variables
- On Railway: check the Variables tab in your service settings
- The backend has a fallback mechanism in `core/config.py` — verify the Settings class loads correctly

### "TELEGRAM_BOT_TOKEN is not configured"
- Ensure `TELEGRAM_BOT_TOKEN` is set in your environment variables
- Use the debug endpoint to verify: `GET /api/v1/telegram/debug-token-check`
- The backend falls back to hardcoded defaults in `core/config.py` if env vars are missing

### Bot shows "Not Connected" on Bot Settings page
- Verify the token is valid by calling: `https://api.telegram.org/bot<TOKEN>/getMe`
- Check if the `/api/v1/telegram/bot-info` endpoint returns successfully
- Ensure the backend server is running and accessible

### Database connection errors
- Verify `DATABASE_URL` is correctly formatted: `postgresql+asyncpg://user:pass@host:5432/dbname`
- Ensure the PostgreSQL server is accessible from your deployment
- Run migrations: `alembic upgrade head`

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

### Development Team

Special thanks to **Sir Den Russell "Camus" Leonardo** and the entire **DRL Solutions** team for their exceptional work on the bot development and payment integration features.

### Technologies & Platforms

- [Xendit](https://www.xendit.co/) — Payment gateway for Southeast Asia
- [Telegram Bot API](https://core.telegram.org/bots/api) — Bot platform
- [shadcn/ui](https://ui.shadcn.com/) — Beautiful UI components
- [Atoms Cloud](https://atoms.dev/) — Backend-as-a-Service platform
- [Railway](https://railway.app/) — Cloud deployment platform

---

<p align="center">
  Built with ❤️ for Philippine merchants and developers
</p>