#!/usr/bin/env bash
set -euo pipefail

# Local helper to deploy to Railway using the Railway CLI.
# Requirements: `npm i -g @railway/cli` and environment variables set.

if [ -z "${RAILWAY_PROJECT_ID:-}" ]; then
  echo "RAILWAY_PROJECT_ID is not set. Export it and retry."
  exit 1
fi
if [ -z "${RAILWAY_TOKEN:-}" ] && [ -z "${RAILWAY_API_KEY:-}" ]; then
  echo "Set either RAILWAY_TOKEN or RAILWAY_API_KEY and retry."
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

if [ -n "${RAILWAY_TOKEN:-}" ]; then
  echo "Using RAILWAY_TOKEN for CI authentication."
else
  echo "Opening browser login for Railway CLI..."
  echo "Complete the login prompt in your browser, then press Enter to continue."
  railway login
  read -r _
fi

echo "Deploying to Railway project $RAILWAY_PROJECT_ID..."
if [ -n "${RAILWAY_TOKEN:-}" ]; then
  railway up --ci --project "$RAILWAY_PROJECT_ID" --environment production --detach --yes
else
  railway up --project "$RAILWAY_PROJECT_ID" --environment production --detach --yes
fi

echo "Done."
