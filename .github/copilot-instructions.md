# Copilot Instructions for PayBot

## Project Overview

PayBot Philippines is a **Telegram Payment Bot** platform with a React admin dashboard. It integrates Xendit and PayMongo payment gateways for Philippine merchants.

## Tech Stack

### Backend (`backend/`)
- **Python 3.11** + **FastAPI** (async)
- **SQLAlchemy 2.0** (async) + **Alembic** migrations
- **pydantic-settings** for configuration (reads from `.env` and env vars)
- **SQLite** for local dev, **PostgreSQL** for production
- **JWT** authentication via Telegram Login Widget
- **pytest** for tests

### Frontend (`frontend/`)
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** (Radix UI primitives)
- **React Router v6**, **TanStack Query v5**, **React Hook Form** + **Zod**
- Package manager: **pnpm**

## Development Workflow

### Run locally
```bash
bash start_app_v2.sh   # starts both backend (port 8000) and frontend (port 5173)
```

### Backend tests
```bash
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v --tb=short
```

### Frontend build & lint
```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build          # outputs to frontend/dist/
pnpm lint           # eslint
```

### After any frontend changes — rebuild static assets
After modifying frontend source, rebuild and copy to `backend/static/` so the FastAPI server serves the updated UI:
```bash
cd frontend && pnpm build
cp -r dist/* ../backend/static/
```
The root `Dockerfile` uses `COPY . .` without a frontend build step, so committed `backend/static/` files are what gets served when using that image. Railway and Render use `backend/Dockerfile`, which includes a multi-stage frontend build and generates fresh assets automatically — no manual static copy needed for those platforms.

## Key Architectural Decisions

### Router auto-discovery
All FastAPI routers in `backend/routers/` are **automatically discovered and registered** via `include_routers_from_package()` in `main.py`. Any module with a `router` (or `admin_router`) variable that is an `APIRouter` instance is included automatically — no manual registration needed.

### Configuration (`backend/core/config.py`)
- Settings are declared as `pydantic-settings` fields on the `Settings` class.
- **Always add new env vars as explicit fields** (e.g., `my_new_key: str = ""`). Do not use `os.getenv()` directly for settings that may come from `.env` — this bypasses pydantic-settings validation and type coercion, and `.env` values are not visible to `os.getenv()`.
- The `__getattr__` fallback reads arbitrary env vars dynamically, but explicit fields are preferred.

### Database models
- All models live in `backend/models/` and inherit from `Base` in `backend/models/base.py`.
- After adding or changing a model, create an Alembic migration: `alembic revision --autogenerate -m "description"`.

### Frontend API calls
- All API requests go to the same origin (relative URLs like `/api/v1/...`).
- Auth token is stored in `localStorage` as `auth_token`.

## Conventions

### Python
- Use `async def` for all route handlers and service methods.
- Return `Dict[str, Any]` with `{"success": True, ...}` or `{"success": False, "error": "..."}` from service methods.
- Log with `logger = logging.getLogger(__name__)` at module level.
- Catch exceptions in route handlers and raise `HTTPException`.

### TypeScript / React
- Use **shadcn/ui** components from `@/components/ui/`.
- Follow the existing dark fintech color scheme: background `#0F172A`, cards `#1E293B`, accent `#3B82F6`.
- Use `useQuery` / `useMutation` from `@tanstack/react-query` for API calls.
- Form validation with `react-hook-form` + `zod` schemas.

## Payment Integrations

- **Xendit**: invoices, QR codes, payment links, virtual accounts, e-wallets (`backend/services/xendit_service.py`)
- **PayMongo**: credit cards, GCash, GrabPay, Maya (`backend/services/paymongo_service.py`)
- **Telegram Bot**: webhook-based command handler (`backend/routers/telegram.py`)

## Testing

- Backend tests are in `backend/tests/`.
- Use `TestClient` from FastAPI for integration tests.
- Set required env vars at the top of each test file (see `test_bot.py` for the pattern).
- Tests that call external APIs (`api.telegram.org`, `api.xendit.co`) must mock the HTTP client — the CI firewall blocks outbound connections.

## Environment Variables

Key variables (set in `.env` or as OS env vars):
- `TELEGRAM_BOT_TOKEN` — required for bot functionality
- `TELEGRAM_BOT_USERNAME` — required for the login widget
- `TELEGRAM_ADMIN_IDS` — comma-separated Telegram user IDs with admin access
- `XENDIT_SECRET_KEY` — Xendit API key
- `PAYMONGO_SECRET_KEY` / `PAYMONGO_PUBLIC_KEY` — PayMongo credentials
- `DATABASE_URL` — defaults to `sqlite+aiosqlite:///./paybot.db`
- `JWT_SECRET_KEY` — required for auth token signing
