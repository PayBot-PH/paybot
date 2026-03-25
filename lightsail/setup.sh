#!/usr/bin/env bash
# lightsail/setup.sh
#
# One-time script that provisions the AWS Lightsail Container Service (and
# optionally a Lightsail Managed Database) for PayBot.
#
# Run this ONCE before the first GitHub Actions deployment.
# After the service exists, all subsequent deploys are handled automatically
# by .github/workflows/deploy-lightsail.yml.
#
# Usage:
#   AWS_REGION=ap-southeast-1 \
#   LIGHTSAIL_SERVICE_NAME=paybot \
#   LIGHTSAIL_POWER=micro \
#   bash lightsail/setup.sh
#
#   # With a managed PostgreSQL database:
#   CREATE_DB=true DB_PASSWORD=<strong-password> bash lightsail/setup.sh
#
# Power / price options:
#   nano  — 512 MB RAM, 0.25 vCPU  ~$7/month
#   micro — 1 GB RAM,  0.5 vCPU   ~$10/month  ← recommended default
#   small — 2 GB RAM,  1 vCPU     ~$25/month
#
# Prerequisites: AWS CLI configured with permissions to create Lightsail
# container services and (optionally) relational databases.

set -euo pipefail

SERVICE_NAME="${LIGHTSAIL_SERVICE_NAME:-paybot}"
POWER="${LIGHTSAIL_POWER:-micro}"
SCALE="${LIGHTSAIL_SCALE:-1}"
REGION="${AWS_REGION:-us-east-1}"
CREATE_DB="${CREATE_DB:-false}"

export AWS_DEFAULT_REGION="$REGION"

echo "=== PayBot — Lightsail setup ==="
echo "  Service : $SERVICE_NAME"
echo "  Power   : $POWER"
echo "  Scale   : $SCALE"
echo "  Region  : $REGION"
echo ""

# ── 1. Create the container service ─────────────────────────────────────────

if aws lightsail get-container-services --service-name "$SERVICE_NAME" \
     --query 'containerServices[0].containerServiceName' \
     --output text 2>/dev/null | grep -q "$SERVICE_NAME"; then
  echo "ℹ️  Container service '$SERVICE_NAME' already exists — skipping creation."
else
  echo "Creating container service…"
  aws lightsail create-container-service \
    --service-name "$SERVICE_NAME" \
    --power "$POWER" \
    --scale "$SCALE"
  echo "Container service created."
fi

# ── 2. Wait until the service is READY ──────────────────────────────────────

echo "Waiting for container service to become READY…"
for i in $(seq 1 30); do
  STATE=$(aws lightsail get-container-services \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].state' \
    --output text)
  if [ "$STATE" = "READY" ] || [ "$STATE" = "RUNNING" ]; then
    SERVICE_URL=$(aws lightsail get-container-services \
      --service-name "$SERVICE_NAME" \
      --query 'containerServices[0].url' \
      --output text)
    echo "✅ Container service is $STATE"
    echo "🌐 Service URL: $SERVICE_URL"
    break
  fi
  echo "  State: $STATE (attempt $i/30) — waiting 10 s…"
  sleep 10
done

# ── 3. (Optional) Create a managed PostgreSQL database ──────────────────────

if [ "$CREATE_DB" = "true" ]; then
  DB_NAME="${SERVICE_NAME}-db"
  DB_USER="paybot"
  DB_PASSWORD="${DB_PASSWORD:-}"

  if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)
    echo "⚠️  No DB_PASSWORD provided — generated a random password."
  fi

  if aws lightsail get-relational-database --relational-database-name "$DB_NAME" \
       --query 'relationalDatabase.name' \
       --output text 2>/dev/null | grep -q "$DB_NAME"; then
    echo "ℹ️  Managed database '$DB_NAME' already exists — skipping creation."
  else
    echo "Creating managed PostgreSQL database…"
    aws lightsail create-relational-database \
      --relational-database-name "$DB_NAME" \
      --availability-zone "${REGION}a" \
      --relational-database-bundle-id micro_2_0 \
      --relational-database-blueprint-id postgres_16 \
      --master-database-name paybot \
      --master-username "$DB_USER" \
      --master-user-password "$DB_PASSWORD" \
      --no-publicly-accessible
    echo "Managed database creation started (takes ~5–10 min to become AVAILABLE)."
  fi

  echo ""
  echo "=== Database credentials — save these now! ==="
  echo "  Name     : $DB_NAME"
  echo "  Username : $DB_USER"
  echo "  Password : $DB_PASSWORD"
  echo ""
  echo "Once the database is AVAILABLE, retrieve the endpoint with:"
  echo "  aws lightsail get-relational-database --relational-database-name $DB_NAME \\"
  echo "    --query 'relationalDatabase.masterEndpoint.address' --output text"
  echo ""
  echo "Then set DATABASE_URL in your GitHub secrets as:"
  echo "  postgresql+asyncpg://$DB_USER:<password>@<endpoint>:5432/paybot?ssl=prefer"
fi

# ── 4. Summary ───────────────────────────────────────────────────────────────

echo ""
echo "=== Next steps ==="
echo ""
echo "1. Add the following GitHub Actions repository secrets (Settings → Secrets):"
echo "   AWS_ACCESS_KEY_ID        — IAM user access key"
echo "   AWS_SECRET_ACCESS_KEY    — IAM user secret key"
echo "   TELEGRAM_BOT_TOKEN       — from @BotFather"
echo "   TELEGRAM_ADMIN_IDS       — comma-separated Telegram user IDs"
echo "   JWT_SECRET_KEY           — long random string"
echo "   ADMIN_USER_PASSWORD      — dashboard admin password"
echo "   XENDIT_SECRET_KEY        — Xendit secret key"
echo "   DATABASE_URL             — PostgreSQL URL or leave unset for SQLite"
echo "   PYTHON_BACKEND_URL       — the Service URL printed above (e.g. https://...)"
echo ""
echo "2. Add the following GitHub Actions repository variable (Settings → Variables):"
echo "   LIGHTSAIL_SERVICE_NAME=$SERVICE_NAME"
echo "   AWS_REGION=$REGION"
echo ""
echo "3. Push to main (or trigger the workflow manually) to deploy."
echo ""
echo "See DEPLOYMENT.md → 'AWS Deployment (Lightsail)' for the full guide."
