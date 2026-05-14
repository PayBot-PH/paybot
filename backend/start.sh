#!/bin/bash
set -e

# Railway backend entrypoint

echo "Running database migrations..."
alembic upgrade head

echo "Starting FastAPI server..."
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-config /app/backend/uvicorn_logging.json
