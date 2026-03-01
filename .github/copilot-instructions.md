# Copilot Instructions for PayBot

## Project Overview

PayBot is a full-featured payment management platform that combines a **Telegram Bot** with an **Admin Dashboard** backed by the **Xendit** (and **PayMongo**) payment gateways. The repository has two main sub-projects:

- **`backend/`** — Python 3.11 / FastAPI REST API + Telegram webhook handler
- **`frontend/`** — React 18 / TypeScript / Vite admin dashboard (shadcn/ui + Tailwind CSS)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, react-router-dom v6 |
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL (asyncpg); SQLite (aiosqlite) used in tests |
| Payments | Xendit API, PayMongo API |
| Bot | Telegram Bot API (webhook-based) |
| Auth | JWT via python-jose; Atoms Cloud / Supabase OIDC |
| Real-time | Server-Sent Events (SSE via sse-starlette) |
| Package manager | `pnpm` (frontend), `pip` (backend) |

---

## Repository Structure

```
paybot/
├── .github/
│   ├── copilot-instructions.md   # This file
│   └── workflows/
│       ├── ci.yml                # Backend tests + frontend build/lint
│       ├── deploy.yml
│       └── release.yml
├── backend/                      # FastAPI application
│   ├── main.py                   # App entry point; auto-discovers routers
│   ├── requirements.txt          # Python dependencies
│   ├── alembic/                  # DB migrations
│   ├── core/                     # Config, database, auth utilities
│   ├── models/                   # SQLAlchemy ORM models
│   ├── routers/                  # Auto-discovered APIRouter modules
│   ├── schemas/                  # Pydantic request/response schemas
│   ├── services/                 # Business logic (xendit, telegram, etc.)
│   └── tests/                    # pytest test suite
├── frontend/                     # React SPA
│   ├── src/
│   │   ├── api/                  # API client functions
│   │   ├── components/           # Reusable UI components
│   │   ├── contexts/             # React contexts (AuthContext, etc.)
│   │   ├── hooks/                # Custom hooks
│   │   ├── lib/                  # Utilities (api helpers, auth)
│   │   └── pages/                # Page-level React components
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile                    # Multi-stage build (frontend → backend/static/)
├── docker-compose.yml
└── README.md
```

---

## Development Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
# Copy and configure environment variables
cp .env.example .env
# Run with hot-reload
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev   # starts Vite dev server on :3000
```

### Environment Variables

Key backend variables (see `backend/.env.example` and `backend/core/config.py`):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token from @BotFather |
| `XENDIT_SECRET_KEY` | ✅ | Xendit API secret key |
| `PAYMONGO_SECRET_KEY` | ❌ | PayMongo secret key |
| `PAYMONGO_WEBHOOK_SECRET` | ❌ | PayMongo webhook signing secret |
| `ENVIRONMENT` | ❌ | `dev` or `prod` (controls error verbosity); defaults to `prod` for error responses |
| `BACKEND_URL` | ❌ | Public URL used to auto-register Telegram webhook |

---

## Running Tests

### Backend (pytest)

```bash
cd backend
python -m pytest tests/ -v --tb=short
```

Tests use `aiosqlite` (in-memory SQLite) so no external database is needed. Mark async tests with `@pytest.mark.asyncio`.

### Frontend (ESLint)

```bash
cd frontend
pnpm lint       # ESLint
pnpm build      # TypeScript type-check + Vite build
```

---

## Backend Conventions

- **Routers are auto-discovered**: Any module under `backend/routers/` that exposes a module-level `router` or `admin_router` variable (an `APIRouter` instance) is automatically included in the app. No manual registration in `main.py` is needed.
- **Async everywhere**: Use `async def` for all route handlers and service methods. Database access uses `AsyncSession`.
- **Pydantic v2**: Use `model_config = ConfigDict(...)` instead of the inner `class Config`.
- **Settings**: Use `from core.config import settings` to access environment variables. Never import `os.environ` directly in application code.
- **Auth dependency**: Protected routes use `Depends(get_current_user)` from `core/auth.py`.
- **Error handling**: Raise `HTTPException` for expected errors. Unexpected exceptions are caught by the global handler in `main.py`.

## Frontend Conventions

- **TypeScript strict mode** is enabled — all new code must be fully typed.
- **shadcn/ui components** live in `src/components/ui/`. Prefer these over raw HTML elements.
- **API calls** go through helpers in `src/api/` or `src/lib/api.ts`. Never call `fetch` directly in page components.
- **Routing**: React Router v6 (`react-router-dom`). Routes are declared in `src/App.tsx`.
- **State management**: TanStack Query (`@tanstack/react-query`) for server state; React Context for global client state.
- **Styling**: Tailwind CSS utility classes only. No custom CSS files except `index.css` for global resets.

---

## Key Architecture Notes

- The FastAPI backend serves the built React SPA from `backend/static/` in production (populated by the Docker multi-stage build). Route priority is enforced by registration order in `main.py`: API routers are included first via `include_routers_from_package()`, and the SPA catch-all (`GET /{full_path:path}`) is registered last, so `/api/v1/...` routes always take precedence.
- Real-time dashboard updates are delivered via SSE at `/api/v1/events/stream` using `services/event_bus.py`.
- Database migrations are managed with **Alembic** (`alembic upgrade head`).
- The Telegram bot is fully webhook-based. Webhook URL auto-registration happens on startup if `BACKEND_URL` is set and is not localhost.
