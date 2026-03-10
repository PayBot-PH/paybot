# Multi-stage build
# Stage 1: build the React admin dashboard from source
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.10.0

# Copy dependency manifests first for better layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Copy the full frontend source and build
COPY frontend/ ./
RUN pnpm run build

# -------------------------------------------------------------------
# Stage 2: Python backend
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

# Copy all backend source files (includes static/ with images/ and logos/)
COPY backend/ .

# Overlay the freshly built frontend assets on top of static/
# (assets/, index.html, favicon.svg, robots.txt, logos/ from the Vite build)
COPY --from=frontend-build /app/dist/ ./static/

# Expose port 8000 (Railway/Render will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Start the server (migrations run via preDeployCommand on Render/Railway)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
