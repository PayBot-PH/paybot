#!/usr/bin/env bash
set -euo pipefail

# Local helper to deploy to Railway using the Railway CLI.
# Requirements: `npm i -g @railway/cli` and environment variables set.

if [ -z "${RAILWAY_API_KEY:-}" ]; then
  echo "RAILWAY_API_KEY is not set. Export it and retry."
  exit 1
fi
if [ -z "${RAILWAY_PROJECT_ID:-}" ]; then
  echo "RAILWAY_PROJECT_ID is not set. Export it and retry."
  exit 1
fi

echo "Building frontend..."
( cd frontend && pnpm install --frozen-lockfile && pnpm run build )

echo "Copying frontend/dist to backend/static..."
rm -rf backend/static/* || true
mkdir -p backend/static
cp -r frontend/dist/* backend/static/

echo "Logging into Railway CLI..."
npm install -g @railway/cli >/dev/null
railway login --apiKey "$RAILWAY_API_KEY"

echo "Deploying to Railway project $RAILWAY_PROJECT_ID..."
railway up --projectId "$RAILWAY_PROJECT_ID" --environment production --detach --yes

echo "Done."
