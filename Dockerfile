# ── Stage 1: Build the React frontend ───────────────────────────────────────
FROM cgr.dev/chainguard/node:latest-dev AS frontend-builder

USER root

WORKDIR /app/frontend

ARG VITE_TURNSTILE_SITE_KEY=""
ARG VITE_TELEGRAM_BOT_USERNAME=""
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}

# Warning if turnstile key is missing (CAPTCHA will not work)
RUN if [ -z "$VITE_TURNSTILE_SITE_KEY" ]; then echo "WARNING: VITE_TURNSTILE_SITE_KEY build arg is not set. CAPTCHA features will be disabled."; fi

# Enable and pin the exact pnpm version declared in package.json
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

# Install dependencies first (cached layer)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the frontend source and build
COPY frontend/ .
RUN pnpm build

# ── Stage 2: Python backend ──────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app/backend

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    zbar-tools \
    libffi-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file and install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source files
COPY backend/ .

# Copy the freshly built frontend assets into the static directory
COPY --from=frontend-builder /app/frontend/dist/ ./static/

# Expose port 8000 (Railway will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
ENV LOG_LEVEL=info

# Start the server — attempt migrations with a 35s timeout (non-fatal), then start uvicorn.
# The asyncpg connection timeout in alembic/env.py is 30 s, so 35 s is enough headroom.
# `exec` replaces the shell with uvicorn so that uvicorn becomes PID 1 and receives
# SIGTERM directly from the container runtime for graceful shutdown.
CMD ["sh", "-c", "timeout 35 alembic upgrade head || echo 'Alembic migration timed out or failed, continuing...' ; exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info --no-access-log --log-config /app/backend/uvicorn_logging.json"]
