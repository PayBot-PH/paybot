# Changelog

All notable changes to PayBot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-22

### Added

#### 🤖 Telegram Bot (19 Commands)
- `/start` — Welcome message & interactive quick menu
- `/help` — Full command reference
- `/pay` — Interactive payment method selector
- `/invoice <amount> <desc>` — Create a Xendit invoice
- `/qr <amount> <desc>` — Generate a QRIS QR code payment
- `/alipay <amount> <desc>` — Create an Alipay QR payment
- `/link <amount> <desc>` — Create a shareable payment link
- `/va <amount> <bank> <desc>` — Create a virtual account (BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank)
- `/ewallet <amount> <wallet> <phone>` — Charge GCash, GrabPay, or PayMaya
- `/status <txn_id>` — Check payment status
- `/balance` — Check wallet balance
- `/send <amount> <user_id>` — Transfer funds to another user
- `/withdraw <amount>` — Withdraw from wallet
- `/disburse <amt> <bank> <acct> <name>` — Send money to a bank account
- `/refund <txn_id> <amount>` — Process a full or partial refund
- `/report [daily|weekly|monthly]` — Revenue summary
- `/fees <amount> <method>` — Fee calculator
- `/subscribe <plan> <amt> <interval>` — Create a recurring subscription
- `/remind <txn_id>` — Send a payment reminder

#### 💳 Payment Methods (via Xendit)
- Invoice payments
- QR code (QRIS & Alipay)
- Shareable payment links
- Virtual accounts — BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank
- E-wallets — GCash, GrabPay, PayMaya

#### 💰 Wallet System
- Internal wallet with balance tracking per user
- Deposit, withdraw, and peer-to-peer transfer
- Auto-credit on successful Xendit webhook events
- Full transaction history with filtering

#### 💸 Disbursements
- Send money to any supported Philippine bank account
- Real-time disbursement status tracking

#### 🔄 Refunds
- Full and partial refund processing via Xendit
- Automatic wallet balance adjustment on refund
- Refund history and tracking

#### 📅 Subscriptions
- Create recurring billing plans (daily / weekly / monthly / yearly)
- Pause, resume, and cancel subscriptions

#### 👥 Customer Management
- Full CRUD for customer profiles
- Per-customer payment history
- Notes and contact information

#### 📊 Reports & Analytics
- Revenue reports (daily, weekly, monthly)
- Payment-method breakdown
- Status breakdown (paid / pending / expired / refunded)
- Success-rate tracking
- Xendit account balance check
- Fee calculator for all payment methods

#### 🖥️ Admin Dashboard (React + TypeScript)
- **Dashboard** — Wallet balance, transaction stats, quick actions, SSE live updates
- **Wallet** — Balance management, deposit, withdraw, transfer
- **Payments Hub** — Create payments via all 5 methods
- **Transactions** — Full history with search and filters
- **Money Management** — Disbursements, refunds, subscriptions, and customers
- **Reports** — Revenue analytics, breakdowns, fee calculator
- **Bot Settings** — Configure Telegram bot token and webhook URL

#### 🔔 Real-Time Notifications
- Server-Sent Events (SSE) for live dashboard updates
- Payment confirmation and wallet transaction alerts

#### 🔐 Authentication
- Telegram Login Widget — secure HMAC-SHA256 hash verification
- JWT-based session tokens
- Admin user role enforcement

#### 🛠️ Infrastructure
- FastAPI backend with async SQLAlchemy and Alembic migrations
- SQLite (development) / PostgreSQL (production) support
- Docker & Docker Compose support
- Railway one-click deployment
- Automatic Telegram webhook + bot-command registration on startup
- Mock data initialisation for local development
- CI pipeline: backend pytest suite + frontend Vite build + ESLint

[1.0.0]: https://github.com/csphi/paybot/releases/tag/v1.0.0
