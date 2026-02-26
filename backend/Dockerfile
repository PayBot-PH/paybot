# ── Stage 1: Build the React admin dashboard ────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Install pnpm
RUN npm install -g pnpm@8.10.0

# Install dependencies (leverages Docker layer cache when lockfile unchanged)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source and build for production
COPY frontend/ .
RUN pnpm run build

# ── Stage 2: Python / FastAPI backend with freshly built frontend ────────────
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

# Overwrite static directory with the freshly built frontend
COPY --from=frontend-builder /frontend/dist ./static

# Expose port 8000 (Railway will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Start the server (migrations are run via preDeployCommand in railway.toml)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
