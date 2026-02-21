# ── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install pnpm (matches packageManager field in package.json)
RUN npm install -g pnpm@8.10.0

# Install dependencies (cached layer)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY frontend/ .
RUN pnpm run build

# ── Stage 2: Python / FastAPI backend ──────────────────────────────────────
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

# Copy built frontend dist into backend/static so FastAPI can serve it
COPY --from=frontend-builder /app/frontend/dist ./static

# Expose port 8000 (Railway will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Run migrations and start the server
CMD ["bash", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
