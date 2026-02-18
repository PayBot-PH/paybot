# 🤖 PayBot — Telegram Bot & Xendit Payment Gateway Dashboard

A full-featured **payment management platform** that combines a **Telegram Bot** with an **Admin Dashboard** powered by **Xendit** payment gateway. Accept payments via invoices, QR codes, payment links, virtual accounts, and e-wallets — all manageable through Telegram commands or a sleek web interface.

![PayBot Dashboard](https://img.shields.io/badge/PayBot-Admin%20Dashboard-blue?style=for-the-badge&logo=telegram)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-React-blue?style=for-the-badge&logo=typescript)
![Python](https://img.shields.io/badge/Python-FastAPI-green?style=for-the-badge&logo=python)

---

## ✨ Features

### 💳 Payment Collection (5 Methods)
- **Invoices** — Generate professional invoices with custom amounts, descriptions, and customer details
- **QR Codes** — Create QRIS-compatible QR code payments for in-person transactions
- **Payment Links** — Shareable payment URLs for online collection
- **Virtual Accounts** — Bank transfer payments via BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank
- **E-Wallets** — Accept payments through GCash, GrabPay, and PayMaya

### 💰 Wallet System
- Internal wallet with balance tracking
- Deposit, withdraw, and transfer between users
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

### 🤖 Telegram Bot (17 Commands)
- Full payment gateway accessible via chat commands
- Real-time payment notifications
- Interactive menus and inline keyboards
- Webhook-based for instant responses

### 🔔 Real-Time Notifications
- Server-Sent Events (SSE) for live dashboard updates
- Payment confirmation alerts
- Wallet transaction notifications

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Python, FastAPI, SQLAlchemy (async), Alembic |
| **Database** | PostgreSQL (via Atoms Cloud / Supabase) |
| **Payments** | Xendit API (Philippines) |
| **Bot** | Telegram Bot API |
| **Auth** | Atoms Cloud OIDC / Supabase Auth |
| **Real-time** | Server-Sent Events (SSE) |
| **SDK** | @metagptx/web-sdk |

---

## 📁 Project Structure

```
app/
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
│   │   └── events.py                 # SSE real-time events (if custom)
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
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Router & app shell
│   │   ├── index.css                 # Global styles
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx        # Auth state management
│   │   ├── hooks/
│   │   │   └── usePaymentEvents.ts   # SSE real-time hook
│   │   ├── lib/
│   │   │   ├── api.ts                # Web SDK client
│   │   │   ├── auth.ts               # Auth utilities
│   │   │   └── utils.ts              # Utility functions
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx         # Main dashboard with stats
│   │   │   ├── Wallet.tsx            # Wallet management
│   │   │   ├── Transactions.tsx      # Transaction history
│   │   │   ├── CreatePayment.tsx     # Legacy payment creation
│   │   │   ├── PaymentsHub.tsx       # Full payments hub (5 methods)
│   │   │   ├── DisbursementsPage.tsx # Disbursements, refunds, subs, customers
│   │   │   ├── ReportsPage.tsx       # Analytics & reports
│   │   │   ├── BotSettings.tsx       # Telegram bot configuration
│   │   │   ├── AuthCallback.tsx      # OAuth callback handler
│   │   │   └── AuthError.tsx         # Auth error page
│   │   └── components/ui/            # shadcn/ui components
│   └── public/                       # Static assets
│
└── README.md                         # This file
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+ & pnpm
- Python 3.10+
- PostgreSQL database (Atoms Cloud or Supabase)
- Xendit account (Philippine market)
- Telegram Bot (via @BotFather)

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `XENDIT_SECRET_KEY` | Xendit API secret key | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ |

### Backend Setup

```bash
cd app/backend

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
cd app/frontend

# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build
```

---

## 🤖 Telegram Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message & quick menu | `/start` |
| `/help` | List all available commands | `/help` |
| `/pay` | Interactive payment menu | `/pay` |
| `/invoice <amount> <description>` | Create a payment invoice | `/invoice 500 Lunch payment` |
| `/qr <amount> <description>` | Generate QR code payment | `/qr 150 Coffee` |
| `/link <amount> <description>` | Create shareable payment link | `/link 1000 Freelance work` |
| `/va <amount> <bank> <description>` | Create virtual account | `/va 2500 BDO Tuition fee` |
| `/ewallet <amount> <wallet> <phone>` | Charge e-wallet | `/ewallet 300 GCASH 09171234567` |
| `/status <transaction_id>` | Check payment status | `/status 42` |
| `/balance` | Check wallet balance | `/balance` |
| `/send <amount> <user_id>` | Transfer to another user | `/send 100 user123` |
| `/withdraw <amount>` | Withdraw from wallet | `/withdraw 500` |
| `/disburse <amount> <bank> <account> <name>` | Send money to bank | `/disburse 1000 BPI 1234567890 Juan` |
| `/refund <txn_id> <amount>` | Process a refund | `/refund 42 250` |
| `/report` | View revenue summary | `/report` |
| `/fees <amount> <method>` | Calculate payment fees | `/fees 1000 invoice` |
| `/subscribe <plan> <amount> <interval>` | Create subscription | `/subscribe Premium 999 monthly` |
| `/remind <txn_id>` | Send payment reminder | `/remind 42` |

---

## 📱 Admin Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Overview with wallet balance, transaction stats, quick actions, real-time indicator |
| **Wallet** | `/wallet` | Balance management, deposit, withdraw, transfer, transaction history |
| **Payments Hub** | `/payments` | Create payments via 5 methods (Invoice, QR, Link, VA, E-Wallet) |
| **Transactions** | `/transactions` | Full transaction history with search, filter, and status tracking |
| **Money Management** | `/disbursements` | Disbursements, refunds, subscriptions, and customer management |
| **Reports** | `/reports` | Revenue analytics, breakdowns, success rates, fee calculator |
| **Bot Settings** | `/bot-settings` | Configure Telegram bot token, webhook URL, and test connection |

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

### Xendit Webhooks (`/api/v1/xendit/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create-invoice` | Create Xendit invoice |
| POST | `/create-qr` | Create QR code payment |
| POST | `/create-payment-link` | Create payment link |
| POST | `/webhook` | Receive Xendit payment callbacks |
| GET | `/transactions` | List transactions |
| GET | `/transaction-stats` | Get transaction statistics |

### Telegram (`/api/v1/telegram/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook` | Receive Telegram updates |
| POST | `/set-webhook` | Register webhook URL with Telegram |

---

## 🔧 Webhook Setup

### Xendit Webhook
1. Go to [Xendit Dashboard](https://dashboard.xendit.co) → Settings → Webhooks
2. Add your webhook URL: `https://your-domain.com/api/v1/xendit/webhook`
3. Select events: `invoices`, `qr_codes`, `payment_links`

### Telegram Webhook
1. Open the Bot Settings page in the admin dashboard
2. Enter your Telegram Bot Token
3. Enter your webhook URL: `https://your-domain.com/api/v1/telegram/webhook`
4. Click "Set Webhook" — the bot will start receiving messages

---

## 🎨 Screenshots

| Dashboard | Payments Hub | Reports |
|-----------|-------------|---------|
| ![Dashboard](docs/dashboard.png) | ![Payments](docs/payments.png) | ![Reports](docs/reports.png) |

| Wallet | Disbursements | Bot Settings |
|--------|--------------|-------------|
| ![Wallet](docs/wallet.png) | ![Disbursements](docs/disbursements.png) | ![Bot](docs/bot.png) |

> *Screenshots are placeholders — deploy the app to see the full UI!*

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

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Xendit](https://www.xendit.co/) — Payment gateway for Southeast Asia
- [Telegram Bot API](https://core.telegram.org/bots/api) — Bot platform
- [shadcn/ui](https://ui.shadcn.com/) — Beautiful UI components
- [Atoms Cloud](https://atoms.dev/) — Backend-as-a-Service platform

---

<p align="center">
  Built with ❤️ for Philippine merchants and developers
</p>