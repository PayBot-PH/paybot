#!/bin/bash
set -e

# Railway backend entrypoint

echo "Running database migrations..."
# Attempt migrations with a 35s timeout (non-fatal)
timeout 35 alembic upgrade head || echo "Alembic migration timed out or failed, continuing..."

echo "Starting FastAPI server..."
# Using exec ensures that uvicorn receives signals (like SIGTERM) directly.
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info --no-access-log --log-config /app/backend/uvicorn_logging.json
