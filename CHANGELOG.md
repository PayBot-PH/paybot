# Changelog

All notable changes to PayBot are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-02-22

### 🎉 First Stable Release

This is the first stable, production-ready release of **PayBot** — a Telegram Bot and Admin Dashboard powered by the Xendit payment gateway.

### Added

#### 🤖 Telegram Bot (19 Commands)
- `/start` — Welcome message and quick action menu
- `/help` — List all available commands
- `/pay` — Interactive payment menu with inline keyboard
- `/invoice <amount> <desc>` — Create a Xendit invoice
- `/qr <amount> <desc>` — Generate a QRIS QR-code payment
- `/alipay <amount> <desc>` — Alipay QR payment
- `/link <amount> <desc>` — Create a shareable payment link
- `/va <amount> <bank> <desc>` — Create a virtual account (BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank)
- `/ewallet <amount> <wallet> <phone>` — Charge GCash, GrabPay, or PayMaya
- `/disburse <amount> <bank> <account> <name>` — Send money to a bank account
- `/refund <txn_id> <amount>` — Process a full or partial refund
- `/status <txn_id>` — Check real-time payment status
- `/balance` — View wallet balance
- `/send <amount> <user_id>` — Transfer to another user
- `/withdraw <amount>` — Withdraw from wallet
- `/report [daily|weekly|monthly]` — Revenue summary
- `/fees <amount> <method>` — Calculate payment fees
- `/subscribe <plan> <amount> <interval>` — Create a recurring subscription
- `/remind <txn_id>` — Send a payment reminder

#### 💳 Payment Methods
- Xendit invoice payments
- QRIS / Alipay QR code payments
- Shareable payment links
- Virtual accounts (7 Philippine banks)
- E-wallets (GCash, GrabPay, PayMaya)

#### 💰 Wallet System
- Per-user wallet with balance tracking
- Deposit, withdraw, and peer-to-peer transfer
- Auto-credit on successful Xendit payment callbacks
- Full transaction history

#### 💸 Disbursements & Refunds
- Bank disbursements to all major Philippine banks
- Full and partial refund processing with wallet adjustment

#### 📅 Subscriptions & Customers
- Recurring billing plans (daily / weekly / monthly / yearly)
- Pause, resume, and cancel subscriptions
- Full customer CRUD with payment history

#### 📊 Reports & Analytics
- Revenue reports with daily / weekly / monthly breakdowns
- Payment method and status breakdowns
- Xendit balance check
- Fee calculator

#### 🖥 Admin Dashboard (React + TypeScript)
- **Dashboard** (`/`) — Stats, wallet balance, recent transactions
- **Wallet** (`/wallet`) — Balance management
- **Payments Hub** (`/payments`) — Create payments via 5 methods
- **Transactions** (`/transactions`) — Full history with search & filter
- **Money Management** (`/disbursements`) — Disbursements, refunds, subscriptions, customers
- **Reports** (`/reports`) — Revenue analytics
- **Bot Settings** (`/bot-settings`) — Configure Telegram bot and webhook
- Telegram Widget sign-in with JWT authentication

#### 🔔 Real-Time Updates
- Server-Sent Events (SSE) for live dashboard updates
- Payment confirmation and wallet notifications

#### ⚙️ Infrastructure
- FastAPI + SQLAlchemy (async) backend
- Alembic database migrations (runs automatically on startup)
- PostgreSQL in production; SQLite for local/testing
- Multi-stage Docker build (frontend assets bundled into backend image)
- Railway deployment support with `railway.toml`
- GitHub Actions CI (backend tests + frontend build/lint on every push and PR)
- Secure JWT-based admin authentication
- Admin-only Telegram widget login
- Input validation on all bot commands (negative/zero amounts, missing args)

### Security
- Admin dashboard access is restricted to whitelisted Telegram user IDs (`TELEGRAM_ADMIN_IDS`)
- All API stats/events endpoints require a valid JWT
- Telegram webhook bot commands respond to any user but only expose public payment actions
- Path traversal guard on SPA static file serving

---

## [Unreleased]

_Nothing yet._

[1.0.0]: https://github.com/csphi/paybot/releases/tag/v1.0.0
