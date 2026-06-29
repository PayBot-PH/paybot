#!/usr/bin/env bash
set -euo pipefail

PROJ_ID="${RAILWAY_PROJECT_ID:-}"
SERVICE="paybot"
ENVIRONMENT="production"
LINES=200
FOLLOW=false
BUILD=false
HEALTH=false
HTTP=false
LATEST=false
URL=""

usage() {
  cat <<EOF
Usage: bash scripts/railway-monitor.sh [options]

Options:
  -p, --project <PROJECT_ID>    Railway project ID (or set RAILWAY_PROJECT_ID)
  -s, --service <SERVICE>       Railway service name or ID (default: paybot)
  -e, --environment <ENV>       Railway environment (default: production)
  -l, --lines <LINES>           Number of log lines to show (default: 200)
  -f, --follow                  Follow logs in real time
  -b, --build                   Show build logs instead of runtime logs
  --http                        Show HTTP request logs instead of app logs
  --latest                      Use logs from the latest deployment
  --health <URL>                Check the service health endpoint after logs
  -h, --help                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--project)
      PROJ_ID="$2"
      shift 2
      ;;
    -s|--service)
      SERVICE="$2"
      shift 2
      ;;
    -e|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -l|--lines)
      LINES="$2"
      shift 2
      ;;
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    -b|--build)
      BUILD=true
      shift
      ;;
    --health)
      HEALTH=true
      URL="$2"
      shift 2
      ;;
    --http)
      HTTP=true
      shift
      ;;
    --latest)
      LATEST=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
 done

if [[ -z "$PROJ_ID" ]]; then
  echo "ERROR: Railway project ID is required."
  echo "Set RAILWAY_PROJECT_ID or pass --project <PROJECT_ID>."
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "ERROR: Railway CLI is not installed. Install with: npm install -g @railway/cli"
  exit 1
fi

LOG_ARGS=(--project "$PROJ_ID" --service "$SERVICE" --environment "$ENVIRONMENT" --lines "$LINES")
if [[ "$BUILD" == true ]]; then
  LOG_ARGS+=(--build)
fi
if [[ "$FOLLOW" == true ]]; then
  LOG_ARGS+=(-f)
fi
if [[ "$HTTP" == true ]]; then
  LOG_ARGS+=(--http)
fi
if [[ "$LATEST" == true ]]; then
  LOG_ARGS+=(--latest)
fi

echo "Running Railway logs for service '$SERVICE' in project '$PROJ_ID' environment '$ENVIRONMENT'..."
railway logs "${LOG_ARGS[@]}"

if [[ "$HEALTH" == true ]]; then
  if [[ -z "$URL" ]]; then
    echo "ERROR: Health endpoint URL not provided. Use --health <URL>."
    exit 1
  fi
  echo "\nChecking health endpoint: $URL"
  if command -v curl >/dev/null 2>&1; then
    curl -I -m 15 "$URL"
  else
    echo "ERROR: curl is required for health checks."
    exit 1
  fi
fi
