<p align="center">
  <img src="https://github.com/user-attachments/assets/3ff135b7-ed69-4b1b-889a-dbe0111de7dc" alt="PayBot Philippines" width="120" height="120" style="border-radius:24px;" />
</p>

<h1 align="center">PayBot Philippines</h1>
<p align="center"><strong>Your all-in-one Telegram Payment Platform for Philippine Merchants, Businesses & Individuals</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/PayBot-Admin%20Dashboard-2563EB?style=for-the-badge&logo=telegram&logoColor=white" alt="PayBot" />
  <img src="https://img.shields.io/badge/Payments-Xendit%20%7C%20PayMongo%20%7C%20PhotonPay-10B981?style=for-the-badge" alt="Payments" />
  <img src="https://img.shields.io/badge/Made%20for-Philippines-0EA5E9?style=for-the-badge" alt="Philippines" />
  <img src="https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-React%2018-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/Xendit-API-5C6BC0?style=flat-square" />
  <img src="https://img.shields.io/badge/PayMongo-API-E91E63?style=flat-square" />
  <img src="https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=flat-square&logo=telegram" />
</p>

---

## 🚀 What is PayBot?

**PayBot** is a full-featured **Telegram-based payment platform** that turns any Telegram bot into a powerful financial hub. Whether you run an **online store**, operate a **gaming or casino platform**, need a **personal digital wallet**, or want to offer **financial services to your customers** — PayBot handles it all directly through Telegram chats and a sleek admin web dashboard.

No complex integrations. No payment terminal. No bank queues.  
Just send a Telegram message and get paid — or pay someone — instantly. 💸

---

## 🏢 Built for Every Business Model

<table>
<tr>
<td align="center" width="180">

### 🛒 E-Commerce
Accept GCash, Maya, GrabPay, credit cards, and all PH bank transfers. Integrate payment links directly into your Shopify, WooCommerce, or custom store. Auto-notify customers when payment clears.

</td>
<td align="center" width="180">

### 🎰 Gaming & Casinos
Collect player deposits and disburse winnings in seconds. Support for Alipay & WeChat Pay for international players. Batch-disburse to hundreds of winners at once from one command.

</td>
<td align="center" width="180">

### 🏦 Personal Digital Bank
Send money to any PH bank, receive payments from clients, check your multi-currency balance (PHP/USD/USDT), and manage your finances — all without leaving Telegram.

</td>
</tr>
<tr>
<td align="center" width="180">

### 💼 Freelancers & Agencies
Create professional invoices in seconds. Share a payment link with clients. Get notified the moment you're paid. Run recurring billing for retainer clients automatically.

</td>
<td align="center" width="180">

### 🏪 Retail & F&B
Display a QR code at the counter — customers scan and pay with GCash, Maya, Alipay or WeChat in seconds. Settlement hits your wallet same day in USDT or PHP.

</td>
<td align="center" width="180">

### 💸 Remittance & Payroll
Disburse salaries or commissions to hundreds of employees simultaneously with a single batch disbursement command. Supports all major PH banks.

</td>
</tr>
</table>

---

## ✨ Core Capabilities

### 💳 Accept Payments — 7 Methods, 3 Gateways

| Method | Gateway | Details |
|--------|---------|---------|
| **Invoice** | Xendit | Professional invoices with auto-payment link, email & SMS |
| **QR Code (QRIS)** | Xendit | Dynamic QR for in-person or online collection |
| **Payment Link** | Xendit | Shareable URL — send via chat, email, or SMS |
| **Virtual Account** | Xendit | Bank transfer via BDO, BPI, UnionBank, RCBC, PNB, Metrobank, ChinaBank |
| **E-Wallets** | Xendit / PayMongo | GCash, GrabPay, PayMaya/Maya |
| **Alipay** | PayMongo / PhotonPay | For Chinese tourists & international buyers |
| **WeChat Pay** | PayMongo / PhotonPay | CNY payments with hosted checkout |

> **Fee-transparent:** Invoice 2.8% · QR 0.7% · E-wallet 2% · VA ₱25 flat · Disbursement ₱25 flat

---

### 💸 Send Money & Disbursements

- **Single Bank Payout** — `/disburse 5000 BPI 1234567890 Juan dela Cruz`
- **Peer-to-Peer Transfers** — send PHP or USD to any @username on the platform
- **Batch Disbursements** — pay dozens of recipients at once via the API
- **USDT Transfers** — send USDT to any TRC20 wallet address
- **Same-Day Settlement** — collections auto-convert and settle to your wallet in USDT at end of day

---

### 🆔 E-Wallet Accounts with Instant KYC

Create a **verified digital wallet** for your customers or staff directly through Telegram:

1. **Register** — `/register` starts the guided KYC/KYB flow
2. **Submit** — Name, email, phone, bank details, government ID photo
3. **Auto-approve** — Super admin reviews and approves via Telegram commands (`/kyb_approve`)
4. **Wallet activated** — Approved users get an instant PHP + USD wallet and can accept/send payments immediately

Each wallet supports:
- PHP (primary currency for PH collections)
- USD / USDT (TRC20 blockchain settlement)
- Full transaction history
- Top-up via invoice, crypto, or bank transfer
- Withdrawal to any PH bank

---

### 🏦 Be Your Own Bank

PayBot makes your Telegram bot a **complete financial institution** for your community:

| Feature | Command | Description |
|---------|---------|-------------|
| Check Balance | `/balance` | PHP wallet + transaction history |
| USD / USDT Balance | `/usdbalance` | USD balance & TRC20 address |
| Send PHP | `/send 500 @username` | Instant peer-to-peer transfer |
| Send USD | `/sendusd 100 @username` | USD transfers between users |
| Send USDT | `/sendusdt 50 TAddr…` | Blockchain USDT transfer |
| Top Up | `/topup` | Fund wallet via invoice or crypto |
| Withdraw | `/withdraw 2000` | Cash out to registered bank |
| Disburse | `/disburse 1000 BPI …` | Payout to any PH bank |

---

### 🔄 Subscriptions & Recurring Billing

Set up automatic billing for any interval:

```
/subscribe PremiumPlan 999 monthly
```

Supports `daily`, `weekly`, `monthly`, `yearly` plans — with pause, resume, and cancel controls from the dashboard.

---

### 📊 Real-Time Analytics & Reports

- Revenue reports: daily / weekly / monthly breakdown
- Payment method performance (Invoice vs QR vs E-Wallet vs VA)
- Success rate tracking and failed payment analysis
- Fee calculator for all payment methods
- Xendit & PayMongo live account balance check
- Export-ready data from the admin dashboard

---

### 🤖 Full Telegram Bot Features (35+ Commands)

Users never have to leave Telegram. The bot provides:

- **Interactive menus** with inline keyboards
- **Real-time payment notifications** (SSE-powered dashboard + bot alerts)
- **PIN-protected sessions** (4-6 digit PIN, 2-hour timeout, auto-lockout on 3 failures)
- **Multi-language support** (English & 中文 for Alipay/WeChat merchants)
- **Step-by-step wizards** — type any command alone and the bot guides you through each field

#### 🔐 Account & Session

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message, language selection & quick-action menu | `/start` |
| `/register` | Begin guided KYB/KYC wallet registration (name, email, phone, ID) | `/register` |
| `/login [PIN]` | Start a PIN-protected session (required for transfers) | `/login 1234` |
| `/setpin [PIN]` | Set or change your 4–6 digit session PIN | `/setpin 9876` |
| `/logout` | End current PIN session | `/logout` |
| `/help` | Show full command reference (bilingual EN/中文) | `/help` |

#### 💳 Accept Payments

| Command | Description | Example |
|---------|-------------|---------|
| `/pay` | Open the payment menu — lists all collection methods | `/pay` |
| `/invoice [amt] [desc]` | Create a Xendit invoice with auto-generated payment link | `/invoice 500 Monthly subscription` |
| `/qr [amt] [desc]` | Generate a dynamic QRIS QR code for in-person or online collection | `/qr 150 Coffee` |
| `/link [amt] [desc]` | Create a shareable Xendit payment link | `/link 1000 Freelance work` |
| `/va [amt] [bank]` | Create a virtual bank account (BDO, BPI, UnionBank, RCBC, PNB, etc.) | `/va 2500 BDO` |
| `/ewallet [amt] [provider]` | Charge a GCash, Maya, or GrabPay e-wallet | `/ewallet 300 GCASH` |
| `/alipay [amt] [desc]` | Generate an Alipay QR via PhotonPay (CNY accepted) | `/alipay 500 Coffee order` |
| `/wechat [amt] [desc]` | Generate a WeChat Pay QR via PhotonPay (CNY accepted) | `/wechat 300 Coffee order` |
| `/scanqr [qr] [amt]` | Scan & pay a merchant's QRPH QR code (send a photo or paste the QR string) | `/scanqr` |

#### 💰 PHP Wallet

| Command | Description | Example |
|---------|-------------|---------|
| `/balance` | View PHP wallet balance, USD balance & recent transaction history | `/balance` |
| `/topup [amt]` | Top up your PHP wallet by sending USDT TRC20 (auto-converted at live rate) | `/topup 100` |
| `/deposit` | Submit a bank or e-wallet transfer deposit for manual admin approval | `/deposit` |
| `/send [amt] [to]` | Send PHP instantly to another PayBot user by @username or Telegram ID | `/send 100 @maria` |
| `/withdraw [amt]` | Withdraw PHP to your registered bank account | `/withdraw 500` |

#### 💵 USD / USDT Wallet

| Command | Description | Example |
|---------|-------------|---------|
| `/usdbalance` | View USD balance, TRC20 deposit address & transaction history | `/usdbalance` |
| `/sendusdt [amt] [address]` | Send USDT to any TRC20 (TRON) wallet address | `/sendusdt 20 TAddr…` |
| `/sendusd [amt] [@user]` | Send USD to another PayBot user | `/sendusd 50 @pedro` |

#### 💸 Send Money & Disbursements

| Command | Description | Example |
|---------|-------------|---------|
| `/disburse [amt] [bank] [acct] [name]` | Bank payout to any PH bank account (same-day settlement) | `/disburse 1000 BPI 1234567890 Juan dela Cruz` |
| `/refund [id] [amt]` | Issue a full or partial refund on a completed payment | `/refund inv-abc 500` |

#### 📊 Reports & Tools

| Command | Description | Example |
|---------|-------------|---------|
| `/status [id]` | Check the status of a payment (or list recent payments if no ID given) | `/status 42` |
| `/list` | Show the last 5 transactions with amounts and status | `/list` |
| `/report [daily\|weekly\|monthly]` | Generate a revenue report for the chosen period | `/report weekly` |
| `/fees [amt] [method]` | Calculate the exact fee for a payment amount and method | `/fees 1000 invoice` |
| `/subscribe [amt] [plan]` | Create a recurring billing subscription | `/subscribe 999 monthly` |
| `/cancel [id]` | Cancel a pending payment or active subscription | `/cancel inv-abc` |
| `/remind [id]` | Send a payment reminder to the payer | `/remind inv-abc` |

#### 🛡️ Admin Commands (Super Admin only)

| Command | Description | Example |
|---------|-------------|---------|
| `/kyb_list` | List all pending KYB/KYC wallet registration requests | `/kyb_list` |
| `/kyb_approve <chat_id>` | Approve a wallet registration and activate the account | `/kyb_approve 123456789` |
| `/kyb_reject <chat_id> <reason>` | Reject a registration with a reason sent to the applicant | `/kyb_reject 123456789 Incomplete ID` |

---

## 🖥️ Admin Dashboard

A full-featured web dashboard for managing everything visually:

| Page | Route | What you can do |
|------|-------|----------------|
| **Dashboard** | `/` | Live stats, wallet balance, quick-create payments |
| **Wallet** | `/wallet` | Multi-currency balance, top up, withdraw, disburse |
| **Payments Hub** | `/payments` | Create via Invoice, QR, Link, VA, E-wallet, Alipay, WeChat |
| **Transactions** | `/transactions` | Full history — search, filter, export |
| **Disbursements** | `/disbursements` | Money-out, refunds, subscriptions, customers |
| **Reports** | `/reports` | Revenue analytics, fee calculator, balance check |
| **KYB Approvals** | `/kyb-registrations` | Review & approve wallet registrations |
| **KYC Approvals** | `/kyc-verifications` | Identity verification management |
| **Topup Requests** | `/topup-requests` | Approve USDT/crypto top-up requests |
| **USDT Requests** | `/usdt-send-requests` | Manage outgoing USDT sends |
| **Bot Settings** | `/bot-settings` | Configure webhook, test messages |
| **Admin Management** | `/admin-management` | Add/remove admins, set per-admin permissions |
| **Bot Messages** | `/bot-messages` | Broadcast messages to users |
| **Features** | `/features` | Public landing page |
| **Pricing** | `/pricing` | Public pricing page |

---

## 🌐 Accessing the Dashboard

| Environment | URL |
|-------------|-----|
| **Local dev** (Vite dev server) | `http://localhost:3000` |
| **Local / Docker** (backend serves built UI) | `http://localhost:8000` |
| **AWS Lightsail** | `https://<service>.cs.amazonlightsail.com` |

---

## 🔐 Security & Compliance

| Feature | Details |
|---------|---------|
| **Authentication** | Telegram Login Widget with HMAC-SHA256 verification |
| **Session Security** | JWT tokens + PIN-based bot sessions (4-6 digits) |
| **Account Lockout** | 3 failed PIN attempts → 15-min lockout |
| **Role-Based Access** | 8 permission flags per admin user |
| **Webhook Verification** | HMAC-SHA256 (PayMongo) · RSA-SHA256 (PhotonPay) |
| **Data Security** | SQLAlchemy ORM (injection-safe) · Path traversal prevention |
| **KYC / KYB** | Government ID + selfie verification before wallet activation |
| **BSP Regulated** | Operating under Bangko Sentral ng Pilipinas guidelines |
| **PCI DSS** | PCI-compliant payment processing via Xendit & PayMongo |

---

## 🏦 Supported Banks (Philippines)

| Code | Bank |
|------|------|
| `BDO` | Banco de Oro |
| `BPI` | Bank of the Philippine Islands |
| `UNIONBANK` | UnionBank of the Philippines |
| `RCBC` | Rizal Commercial Banking Corporation |
| `CHINABANK` | China Banking Corporation |
| `PNB` | Philippine National Bank |
| `METROBANK` | Metropolitan Bank & Trust |

## 📱 Supported E-Wallets

| Wallet | Code |
|--------|------|
| GCash | `GCASH` |
| GrabPay | `GRABPAY` |
| PayMaya / Maya | `PAYMAYA` |

---

## ⚡ Quick Start

### Windows

```powershell
./setup_windows.ps1
./start_local_windows.ps1
```

### Linux / macOS

```bash
bash start_app_v2.sh   # starts backend (:8000) and frontend (:5173)
```

### Docker

```bash
docker build -t paybot .
docker run -p 8000:8000 --env-file .env paybot
```

---

## ☁️ Deploy on AWS Lightsail

AWS Lightsail Container Service is the recommended production deployment — it handles HTTPS, load balancing, and a built-in container registry automatically.  Cost starts at **~$10/month** (micro, 1 GB RAM).

### Step 1 — Provision the container service

```bash
# Clone the repo, then run the one-time setup script
AWS_REGION=ap-southeast-1 \
LIGHTSAIL_SERVICE_NAME=paybot \
LIGHTSAIL_POWER=micro \
bash lightsail/setup.sh
```

Add `CREATE_DB=true DB_PASSWORD=<password>` to also provision a managed PostgreSQL database (~$15/month extra, recommended for production).

### Step 2 — Configure GitHub secrets & variables

In **Settings → Secrets and variables → Actions** add:

| Type | Name | Value |
|------|------|-------|
| Variable | `LIGHTSAIL_SERVICE_NAME` | `paybot` |
| Variable | `AWS_REGION` | e.g. `ap-southeast-1` |
| Secret | `AWS_ACCESS_KEY_ID` | IAM access key |
| Secret | `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| Secret | `TELEGRAM_BOT_TOKEN` | From @BotFather |
| Secret | `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram user IDs |
| Secret | `JWT_SECRET_KEY` | `openssl rand -hex 32` |
| Secret | `ADMIN_USER_PASSWORD` | Dashboard password |
| Secret | `XENDIT_SECRET_KEY` | Xendit secret key |
| Secret | `DATABASE_URL` | PostgreSQL URL (or omit for SQLite) |
| Secret | `PYTHON_BACKEND_URL` | Lightsail service URL from Step 1 |

### Step 3 — Deploy

Push to `main` (or trigger manually via **Actions → Deploy to AWS Lightsail**).  The workflow builds the Docker image, pushes it, and deploys — all automatically.

> 📖 See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete guide including custom domains, scaling, and webhook configuration.

---

## 📁 Project Structure

```
paybot/
├── Dockerfile                        # Container config (multi-stage: React + Python)
├── lightsail/                        # AWS Lightsail deployment helpers
│   └── setup.sh                      # One-time infrastructure provisioning script
├── start_app_v2.sh                   # Local startup script
├── backend/                          # Python FastAPI backend
│   ├── main.py                       # App entry point (auto-discovers routers)
│   ├── requirements.txt              # Python dependencies
│   ├── alembic/                      # Database migrations
│   ├── core/                         # Config, DB, auth utilities
│   ├── models/                       # SQLAlchemy ORM models
│   ├── routers/                      # Auto-discovered API routes
│   ├── services/                     # Xendit, PayMongo, PhotonPay, Telegram
│   └── static/                       # Compiled React frontend
└── frontend/                         # React + TypeScript frontend
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── pages/                    # All dashboard pages
        ├── components/               # UI components (shadcn/ui)
        ├── contexts/                 # Auth, theme state
        └── lib/                      # API client, brand config
```

---

## 🔧 Post-Deployment Setup

### 1. Set Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d '{"url":"https://your-domain.com/api/v1/telegram/webhook"}'
```

Or use the **Bot Settings** page in the dashboard.

### 2. Set Xendit Webhook

In [Xendit Dashboard](https://dashboard.xendit.co) → **Settings → Webhooks**:

```
https://your-domain.com/api/v1/xendit/webhook
```

Events: `invoices`, `qr_codes`, `payment_links`, `disbursements`

### 3. Set PayMongo Webhook

In [PayMongo Dashboard](https://dashboard.paymongo.com) → **Developers → Webhooks**:

```
https://your-domain.com/api/v1/paymongo/webhook
```

Events: `source.chargeable`, `checkout_session.payment.paid`, `payment.paid`

Copy the `whsk_…` signing secret → set as `PAYMONGO_WEBHOOK_SECRET`.

### 4. Verify Deployment

```bash
curl https://your-domain.com/health
curl https://your-domain.com/api/v1/telegram/bot-info
```

---

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | ✅ |
| `TELEGRAM_BOT_USERNAME` | Bot username (without @) | ✅ |
| `TELEGRAM_ADMIN_IDS` | Comma-separated super-admin Telegram IDs | ✅ |
| `JWT_SECRET_KEY` | Secret key for JWT signing | ✅ |
| `XENDIT_SECRET_KEY` | Xendit API secret key | ✅ |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host/db` | ✅ |
| `PAYMONGO_SECRET_KEY` | PayMongo secret API key | ❌ |
| `PAYMONGO_PUBLIC_KEY` | PayMongo public API key | ❌ |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret (`whsk_…`) | ❌ |
| `PAYMONGO_MODE` | `test` or `live` | ❌ |
| `PHOTONPAY_APP_ID` | PhotonPay app ID | ❌ |
| `PHOTONPAY_APP_SECRET` | PhotonPay RSA private key | ❌ |
| `PORT` | Server port (default `8000`) | ❌ |

---

## 🔗 Key API Endpoints

### Payment Gateway (`/api/v1/gateway/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/virtual-account` | Create virtual account |
| POST | `/ewallet-charge` | Charge e-wallet |
| POST | `/disbursement` | Send money to bank |
| GET | `/disbursements` | List disbursements |
| POST | `/refund` | Process refund |
| GET | `/refunds` | List refunds |
| POST | `/subscription` | Create subscription |
| GET | `/subscriptions` | List subscriptions |
| POST | `/customer` | Add customer |
| GET | `/customers` | List customers |
| POST | `/calculate-fees` | Fee calculator |
| GET | `/xendit-balance` | Live Xendit balance |
| GET | `/reports` | Revenue analytics |

### Xendit (`/api/v1/xendit/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create-invoice` | Create invoice |
| POST | `/create-qr-code` | QRIS QR code |
| POST | `/create-payment-link` | Payment link |
| POST | `/webhook` | Payment callbacks |
| GET | `/transaction-stats` | Statistics |

### Telegram (`/api/v1/telegram/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook` | Receive bot updates |
| POST | `/set-webhook` | Register webhook |
| GET | `/bot-info` | Bot status |

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "No API Key detected" | Set `XENDIT_SECRET_KEY` in Lightsail secrets / environment variables |
| "TELEGRAM_BOT_TOKEN is not configured" | Set `TELEGRAM_BOT_TOKEN`; check via `GET /api/v1/telegram/debug-token-check` |
| Bot shows "Not Connected" | Verify token: `https://api.telegram.org/bot<TOKEN>/getMe` |
| Database errors | Check `DATABASE_URL` format: `postgresql+asyncpg://user:pass@host:5432/db`; run `alembic upgrade head` |
| PayMongo webhooks not received | Use [ngrok](https://ngrok.com/) locally: `ngrok http 8000` and update PayMongo webhook URL |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Special thanks to **Sir Den Russell "Camus" Leonardo** and the **DRL Solutions** team for their exceptional work on bot development and payment integration.

**Powered by:**
[Xendit](https://www.xendit.co/) · [PayMongo](https://www.paymongo.com/) · [Telegram Bot API](https://core.telegram.org/bots/api) · [AWS Lightsail](https://aws.amazon.com/lightsail/) · [shadcn/ui](https://ui.shadcn.com/)

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/3ff135b7-ed69-4b1b-889a-dbe0111de7dc" alt="PayBot" width="60" style="border-radius:12px;" />
  <br/>
  <strong>PayBot Philippines</strong> — Built with ❤️ for Philippine merchants, businesses, and developers
  <br/>
  <a href="https://t.me/traxionpay">@traxionpay</a> · <a href="https://t.me/traxionpay">Support</a>
</p>
