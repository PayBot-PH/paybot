# PayBot Backend (Production)

The core API engine for the PayBot Philippines ecosystem, powered by FastAPI and PostgreSQL.

## 🚀 Features

- **Multi-Gateway Integration**: Seamless support for Maya Business, PayMongo, and PhotonPay.
- **POS Terminal Engine**: Backend services for managing virtual and physical POS devices.
- **Event Bus System**: Real-time event synchronization using SSE and internal listeners.
- **Wallet Infrastructure**: Multi-currency ledger system (PHP/USD/USDT) with atomic transactions.
- **Security Hardened**: JWT authentication, device binding, and webhook signature verification.

## 📁 Project Structure

```
backend/
├── main.py                # FastAPI entry point & lifespan management
├── core/
│   ├── config.py          # Pydantic settings & ENV management
│   └── database.py        # SQLAlchemy async engine & session manager
├── models/                # Database ORM models
├── routers/               # API endpoints (versioned v1)
├── services/              # Business logic (Payment Gateways, POS, Wallets)
├── schemas/               # Pydantic request/response validation
├── alembic/               # Database migrations
└── dependencies/          # Shared dependencies (Auth, DB)
```

## 🛠 Setup & Deployment

### 1. Environment Configuration
Create a `.env` file based on `.env.example`. For production, ensure all keys are provided:

```env
ENVIRONMENT=production
MAYA_BUSINESS_MODE=live
DATABASE_URL=postgresql+asyncpg://...
TELEGRAM_BOT_TOKEN=...
```

### 2. Manual Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Railway Deployment
The backend is optimized for **Railway**. Simply push to the `main` branch to trigger the automatic deployment via GitHub Actions.

## 🧪 Testing
```bash
pytest tests/ -v
```

## 🔌 API Documentation
Once running, interactive docs are available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---
*Developed by DRL Solutions*
