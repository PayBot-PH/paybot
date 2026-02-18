#!/bin/bash

# Navigate to the backend directory
cd backend

# Start the FastAPI backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload