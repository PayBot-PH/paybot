# ── Stage 1: Build the React frontend ───────────────────────────────────────
FROM cgr.dev/chainguard/node:latest-dev AS frontend-builder

USER root

WORKDIR /app/frontend

# Enable and pin the exact pnpm version declared in package.json
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

# Install dependencies first (cached layer)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the frontend source and build
COPY frontend/ .
RUN pnpm build

# ── Stage 2: Python backend ──────────────────────────────────────────────────
FROM python:3.11-alpine3.21

WORKDIR /app/backend

# Install system dependencies
RUN apk add --no-cache \
    build-base \
    postgresql-client \
    zbar \
    libffi-dev \
    openssl-dev

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

# Start the server — attempt migrations with a 60s timeout (non-fatal), then start uvicorn
CMD ["sh", "-c", "timeout 60 alembic upgrade head || echo 'Alembic migration timed out or failed, continuing...' ; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info --no-access-log"]
