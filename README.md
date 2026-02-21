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
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| **Database** | PostgreSQL (via Atoms Cloud / Supabase) |
| **Payments** | Xendit API (Philippines) |
| **Bot** | Telegram Bot API |
| **Auth** | Atoms Cloud OIDC / Supabase Auth |
| **Real-time** | Server-Sent Events (SSE) |
| **SDK** | @metagptx/web-sdk |

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

## 🚀 Deployment

### Option 1: Deploy on Railway (Recommended)

Railway provides the easiest deployment experience with automatic builds from your GitHub repository.

#### Prerequisites
- A [Railway](https://railway.app) account
- A GitHub repository with this project (e.g., `https://github.com/csphi/paybot`)
- Your API keys ready (Xendit, Telegram)

#### Step-by-Step

1. **Connect GitHub to Railway**
   - Go to [railway.app](https://railway.app) and sign in
   - Click **"New Project"** → **"Deploy from GitHub Repo"**
   - Select your `paybot` repository

2. **Add a PostgreSQL Database**
   - In your Railway project, click **"New"** → **"Database"** → **"PostgreSQL"**
   - Railway will automatically provide the `DATABASE_URL` environment variable

3. **Configure Environment Variables**
   - Go to your service → **"Variables"** tab
   - Add the following variables:

   | Variable | Value | Description |
   |----------|-------|-------------|
   | `XENDIT_SECRET_KEY` | `xnd_production_...` | Your Xendit API secret key |
   | `TELEGRAM_BOT_TOKEN` | `1234567890:AAE...` | Your Telegram bot token from @BotFather |
   | `DATABASE_URL` | *(auto-provided by Railway PostgreSQL)* | PostgreSQL connection string |
   | `PORT` | `8000` | Server port (Railway sets this automatically) |

4. **Deploy**
   - Railway will automatically build using the `Dockerfile` and deploy
   - The build process:
     - Installs Python 3.11 dependencies
     - Copies the project files
     - Starts the FastAPI server with uvicorn
   - Your app will be available at `https://your-app.up.railway.app`

5. **Set Up Custom Domain (Optional)**
   - Go to **Settings** → **Networking** → **Custom Domain**
   - Add your domain (e.g., `drl-developers.info`)
   - Update your DNS records as instructed by Railway

6. **Run Database Migrations**
   - Open the Railway terminal or connect via Railway CLI:
   ```bash
   railway run alembic upgrade head
   ```

#### Railway CLI Deployment (Alternative)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Deploy
railway up

# View logs
railway logs
```

---

### Option 2: Deploy with Docker

#### Prerequisites
- Docker installed on your server
- PostgreSQL database accessible
- Domain name (optional, for webhooks)

#### Step-by-Step

1. **Clone the repository**
   ```bash
   git clone https://github.com/csphi/paybot.git
   cd paybot
   ```

2. **Create a `.env` file in the `backend/` directory**
   ```bash
   cat > backend/.env << EOF
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   XENDIT_SECRET_KEY=your_xendit_secret_key_here
   DATABASE_URL=postgresql+asyncpg://user:password@host:5432/paybot
   EOF
   ```

3. **Build the Docker image**
   ```bash
   docker build -t paybot .
   ```

4. **Run the container**
   ```bash
   docker run -d \
     --name paybot \
     -p 8000:8000 \
     --env-file backend/.env \
     paybot
   ```

5. **Run database migrations**
   ```bash
   docker exec paybot python -m alembic upgrade head
   ```

6. **Verify the deployment**
   ```bash
   curl http://localhost:8000/health
   ```

#### Docker Compose (with PostgreSQL)

Create a `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: paybot
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_DB: paybot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://paybot:your_secure_password@db:5432/paybot
      TELEGRAM_BOT_TOKEN: your_telegram_bot_token_here
      XENDIT_SECRET_KEY: your_xendit_secret_key_here
      PORT: 8000
    depends_on:
      - db

volumes:
  postgres_data:
```

Then run:
```bash
docker-compose up -d
docker-compose exec app python -m alembic upgrade head
```

---

### Option 3: Deploy on a VPS (Manual)

#### Prerequisites
- Ubuntu 20.04+ or similar Linux server
- Python 3.11+
- Node.js 18+ & pnpm
- PostgreSQL 15+
- Nginx (for reverse proxy)
- Domain name with SSL (for webhooks)

#### Step-by-Step

1. **Clone the repository**
   ```bash
   git clone https://github.com/csphi/paybot.git
   cd paybot
   ```

2. **Set up the backend**
   ```bash
   cd backend

   # Create virtual environment
   python3.11 -m venv venv
   source venv/bin/activate

   # Install dependencies
   pip install -r requirements.txt

   # Create .env file
   cat > .env << EOF
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   XENDIT_SECRET_KEY=your_xendit_secret_key_here
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/paybot
   EOF

   # Run database migrations
   alembic upgrade head

   # Test the server
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. **Build the frontend**
   ```bash
   cd ../frontend

   # Install dependencies
   pnpm install

   # Build for production
   pnpm run build
   ```

4. **Set up systemd service**
   ```bash
   sudo cat > /etc/systemd/system/paybot.service << EOF
   [Unit]
   Description=PayBot FastAPI Application
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/paybot/backend
   Environment=PATH=/opt/paybot/backend/venv/bin
   ExecStart=/opt/paybot/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable paybot
   sudo systemctl start paybot
   ```

5. **Configure Nginx reverse proxy**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Frontend static files
       location / {
           root /opt/paybot/frontend/dist;
           try_files $uri $uri/ /index.html;
       }

       # Backend API proxy
       location /api/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Health check
       location /health {
           proxy_pass http://127.0.0.1:8000;
       }

       # SSE events (disable buffering)
       location /api/v1/events/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Connection '';
           proxy_http_version 1.1;
           chunked_transfer_encoding off;
           proxy_buffering off;
           proxy_cache off;
       }
   }
   ```

6. **Enable SSL with Let's Encrypt**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

### Option 4: Deploy on Atoms Platform

If you built this project on [Atoms](https://atoms.dev/), deployment is one click:

1. Click the **"Publish"** button in the App Viewer
2. Edit the URL if desired
3. Click **Publish** — your app is live!

The Atoms platform handles:
- Frontend build and hosting
- Backend deployment with FastAPI
- Database provisioning (Atoms Cloud)
- SSL certificates
- Environment variable management

---

## 🔧 Post-Deployment Setup

After deploying, complete these steps to fully activate all features:

### 1. Set Up Telegram Webhook
- Open your deployed app's **Bot Settings** page
- Enter your Telegram Bot Token
- Set the webhook URL to: `https://your-domain.com/api/v1/telegram/webhook`
- Click **"Set Webhook"**

Or use the Telegram API directly:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/api/v1/telegram/webhook"}'
```

### 2. Set Up Xendit Webhook
1. Go to [Xendit Dashboard](https://dashboard.xendit.co) → **Settings** → **Webhooks**
2. Add webhook URL: `https://your-domain.com/api/v1/xendit/webhook`
3. Select events: `invoices`, `qr_codes`, `payment_links`, `disbursements`

### 3. Verify Everything Works
```bash
# Check backend health
curl https://your-domain.com/health

# Check Telegram bot connection
curl https://your-domain.com/api/v1/telegram/bot-info

# Check token configuration (debug)
curl https://your-domain.com/api/v1/telegram/debug-token-check
```

---

## 🔑 Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ | — |
| `XENDIT_SECRET_KEY` | Xendit API secret key | ✅ | — |
| `DATABASE_URL` | PostgreSQL connection string | ✅ | — |
| `PORT` | Server port | ❌ | `8000` |
| `DEBUG` | Enable debug mode | ❌ | `false` |
| `SUPABASE_URL` | Supabase project URL (if using Supabase) | ❌ | — |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (if using Supabase) | ❌ | — |

---

## 🤖 Telegram Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message & quick menu | `/start` |
| `/help` | List all available commands | `/help` |
| `/pay` | Interactive payment menu | `/pay` |
| `/invoice <amount> <desc>` | Create a payment invoice | `/invoice 500 Lunch payment` |
| `/qr <amount> <desc>` | Generate QR code payment | `/qr 150 Coffee` |
| `/link <amount> <desc>` | Create shareable payment link | `/link 1000 Freelance work` |
| `/va <amount> <bank> <desc>` | Create virtual account | `/va 2500 BDO Tuition fee` |
| `/ewallet <amount> <wallet> <phone>` | Charge e-wallet | `/ewallet 300 GCASH 09171234567` |
| `/status <txn_id>` | Check payment status | `/status 42` |
| `/balance` | Check wallet balance | `/balance` |
| `/send <amount> <user_id>` | Transfer to another user | `/send 100 user123` |
| `/withdraw <amount>` | Withdraw from wallet | `/withdraw 500` |
| `/disburse <amt> <bank> <acct> <name>` | Send money to bank | `/disburse 1000 BPI 1234567890 Juan` |
| `/refund <txn_id> <amount>` | Process a refund | `/refund 42 250` |
| `/report` | View revenue summary | `/report` |
| `/fees <amount> <method>` | Calculate payment fees | `/fees 1000 invoice` |
| `/subscribe <plan> <amt> <interval>` | Create subscription | `/subscribe Premium 999 monthly` |
| `/remind <txn_id>` | Send payment reminder | `/remind 42` |

---

## 📱 Admin Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Overview with wallet balance, transaction stats, quick actions |
| **Wallet** | `/wallet` | Balance management, deposit, withdraw, transfer |
| **Payments Hub** | `/payments` | Create payments via 5 methods |
| **Transactions** | `/transactions` | Full transaction history with search & filter |
| **Money Management** | `/disbursements` | Disbursements, refunds, subscriptions, customers |
| **Reports** | `/reports` | Revenue analytics, breakdowns, fee calculator |
| **Bot Settings** | `/bot-settings` | Configure Telegram bot and webhook |

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