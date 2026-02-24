# ── Single stage: Python / FastAPI backend with pre-built frontend ──────────
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

# Copy all backend source files (includes pre-built frontend in backend/static/)
COPY backend/ .

# Expose port 8000 (Railway will use $PORT environment variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Run migrations and start the server
CMD ["bash", "-c", "alembic upgrade head 2>&1; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
