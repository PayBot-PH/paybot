#!/usr/bin/env bash
set -euo pipefail

# Local helper to build and push image to Google Cloud Build and deploy to Cloud Run.
# Requirements: gcloud CLI authenticated, project set, and service account key in GCP_SA_KEY env if using JSON.

if [ -z "${GCP_PROJECT:-}" ]; then
  echo "GCP_PROJECT is not set. Export it and retry."
  exit 1
fi
if [ -z "${CLOUD_RUN_SERVICE:-}" ]; then
  echo "CLOUD_RUN_SERVICE is not set. Export it and retry."
  exit 1
fi
if [ -z "${CLOUD_RUN_REGION:-}" ]; then
  echo "CLOUD_RUN_REGION is not set. Export it and retry."
  exit 1
fi

# Build frontend and upload artifact
( cd frontend && pnpm install --frozen-lockfile && pnpm run build )

# Copy static to backend
rm -rf backend/static/* || true
mkdir -p backend/static
cp -r frontend/dist/* backend/static/

# Build image using gcloud builds
IMAGE_NAME="gcr.io/${GCP_PROJECT}/paybot:$(git rev-parse --short HEAD)"

gcloud builds submit --tag "${IMAGE_NAME}"

gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --image "${IMAGE_NAME}" \
  --region "${CLOUD_RUN_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --min-instances=1

echo "Deployed ${IMAGE_NAME} to Cloud Run service ${CLOUD_RUN_SERVICE} in ${CLOUD_RUN_REGION}"
