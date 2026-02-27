# ── Stage 1: Build the React frontend ───────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install pnpm
RUN npm install -g pnpm@8.10.0

# Install dependencies (uses lockfile for reproducible builds)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source and build
COPY frontend/ .
RUN pnpm run build

# ── Stage 2: Python / FastAPI backend with built frontend ────────────────────
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

# Copy the built frontend from stage 1 into backend/static/
COPY --from=frontend-builder /app/frontend/dist ./static

# Expose port 8000 (Railway will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Start the server (migrations are run via preDeployCommand in railway.toml)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
