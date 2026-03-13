# ── Stage 1: Build the React frontend ───────────────────────────────────────
FROM node:20-alpine AS frontend-builder

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
FROM python:3.11-slim

WORKDIR /app/backend

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
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

# Start the server — attempt migrations first (non-fatal), then start uvicorn
CMD ["sh", "-c", "alembic upgrade head || echo 'Alembic migration failed, continuing...' ; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
