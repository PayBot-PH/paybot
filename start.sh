#!/bin/bash
set -e

echo 'Installing Python dependencies...'
pip install -r backend/requirements.txt

echo 'Starting FastAPI application...'
cd backend
uvicorn main:app --host 0.0.0.0 --port $PORT