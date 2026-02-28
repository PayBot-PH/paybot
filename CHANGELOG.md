# Changelog

All notable changes to PayBot are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-02-28

### Added

#### Frontend
- **Bot Introduction Page** (`/intro`) — Animated landing page showcasing bot capabilities before sign-in
  - Pulsing bot icon with ambient animated blobs
  - Animated feature ticker cycling through 8 capabilities every 2 seconds
  - Six staggered feature cards with fade/slide-in animations (Multi-Method Payments, Wallet & Disbursements, Real-time Alerts, USDT Send Requests, Reports & Analytics, Secure Telegram Auth)
  - Call-to-action buttons for **Get Started → `/login`** and **See all features → `/features`**
  - Authenticated users are automatically redirected to the dashboard
- `/intro` added to maintenance-mode exempt paths so the intro page is always accessible

#### Routing
- `Dashboard` unauthenticated state now redirects visitors to `/intro` instead of showing an inline sign-in prompt

[1.0.1]: https://github.com/csphi/paybot/compare/v1.0.0...v1.0.1

---

## [1.0.0] - 2026-02-22

### Added

#### Core Platform
- FastAPI backend with async SQLAlchemy and Alembic migrations
- React 18 + TypeScript + Vite admin dashboard
- SQLite (local) and PostgreSQL (production) support
- JWT authentication via Telegram Login Widget
- Role-based access control (admin/user)
- Server-Sent Events (SSE) for real-time dashboard updates
- Docker and Railway deployment support

#### Payment Collection (5 Methods via Xendit)
- **Invoices** — Generate professional invoices with custom amounts, descriptions, and customer details
- **QR Codes** — QRIS-compatible QR code payments for in-person transactions
- **Payment Links** — Shareable payment URLs for online collection
- **Virtual Accounts** — Bank transfer payments via BDO, BPI, UnionBank, RCBC, Metrobank, PNB, ChinaBank
- **E-Wallets** — Accept payments through GCash, GrabPay, and PayMaya

#### Wallet System
- Internal wallet with balance tracking per user
- Deposit, withdraw, and transfer between users
- Auto-credit on successful Xendit payment callbacks
- Full wallet transaction history with type filtering

#### Disbursements
- Send money to any Philippine bank account via Xendit Disbursement API
- Real-time disbursement status tracking
- Support for all major PH banks

#### Refunds
- Full and partial refund processing via Xendit
- Automatic wallet balance adjustment on refund
- Refund history and tracking

#### Subscriptions
- Create recurring billing plans (daily, weekly, monthly, yearly)
- Pause, resume, and cancel subscriptions
- Customer assignment and billing cycle tracking

#### Customer Management
- Full CRUD for customer profiles (name, email, phone, notes)
- Track cumulative payment history per customer
- Customer search and listing

#### Reports & Analytics
- Revenue reports by period (daily, weekly, monthly)
- Payment method breakdown with visual bars
- Status breakdown (paid, pending, expired, refunded)
- Success rate tracking
- Xendit account balance check
- Fee calculator for all payment methods

#### Telegram Bot (19 Commands)
- `/start` — Welcome message & quick menu
- `/help` — List all available commands
- `/pay` — Interactive payment menu
- `/invoice <amount> <desc>` — Create a payment invoice
- `/qr <amount> <desc>` — Generate QR code payment
- `/alipay <amount> <desc>` — Alipay QR payment
- `/link <amount> <desc>` — Create shareable payment link
- `/va <amount> <bank> <desc>` — Create virtual account
- `/ewallet <amount> <wallet> <phone>` — Charge e-wallet
- `/status <txn_id>` — Check payment status
- `/balance` — Check wallet balance
- `/send <amount> <user_id>` — Transfer to another user
- `/withdraw <amount>` — Withdraw from wallet
- `/disburse <amt> <bank> <acct> <name>` — Send money to bank
- `/refund <txn_id> <amount>` — Process a refund
- `/report [daily|weekly|monthly]` — View revenue summary
- `/fees <amount> <method>` — Calculate payment fees
- `/subscribe <plan> <amt> <interval>` — Create subscription
- `/remind <txn_id>` — Send payment reminder

#### Admin Dashboard Pages
- **Dashboard** (`/`) — Stats, wallet balance, recent transactions, quick actions
- **Wallet** (`/wallet`) — Balance management, deposit, withdraw, transfer
- **Payments Hub** (`/payments`) — Create payments via all 5 methods
- **Transactions** (`/transactions`) — Full history with search & filter
- **Money Management** (`/disbursements`) — Disbursements, refunds, subscriptions, customers
- **Reports** (`/reports`) — Revenue analytics, breakdowns, fee calculator
- **Bot Settings** (`/bot-settings`) — Configure Telegram bot and webhook

#### Demo & Seed Data
- Pre-loaded demo transactions (invoices, QR codes, payment links, virtual accounts, e-wallets)
- Demo wallet with ₱15,750.00 starting balance
- Sample customers with purchase history
- Example disbursements and active subscriptions
- Wallet transaction history for demo purposes

#### Infrastructure
- Auto-webhook registration on startup when `PYTHON_BACKEND_URL` is set
- Auto-register Telegram bot commands on startup
- Graceful startup/shutdown with lifespan context manager
- Structured logging with file + console handlers
- Path traversal protection for static file serving
- Input validation for all bot commands (negative/zero amounts rejected)
- Fallback plain-text message when Telegram HTML parse fails

### Security
- Telegram Login Widget HMAC-SHA256 hash verification
- JWT tokens with configurable expiry
- Path traversal attack prevention in static file serving
- Environment-based error detail exposure (full stack trace in dev, generic in prod)
- Admin ID allowlist for Telegram bot access

[1.0.0]: https://github.com/csphi/paybot/releases/tag/v1.0.0
