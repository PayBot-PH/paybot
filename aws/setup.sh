#!/usr/bin/env bash
# aws/setup.sh — One-command PayBot deployment to AWS ECS Fargate
#
# Provisions (or updates) the full stack:
#   CloudFormation infrastructure → IAM deploy user → Docker build →
#   ECR push → ECS task-definition → ECS service → Telegram webhook
#
# Usage:
#   ./aws/setup.sh [OPTIONS]
#
# Options:
#   --stack-name NAME        CloudFormation stack name          (default: paybot)
#   --region REGION          AWS region                         (default: us-east-1)
#   --env-name NAME          Resource name prefix               (default: paybot)
#   --db-password PASS       RDS master password                (auto-generated)
#   --db-instance CLASS      RDS instance class                 (default: db.t3.micro)
#   --telegram-token TOKEN   Telegram Bot Token                 (required)
#   --telegram-username USER Bot username without @             (required)
#   --telegram-admin-ids IDS Comma-separated Telegram user IDs (required)
#   --xendit-key KEY         Xendit secret key                  (required)
#   --jwt-secret SECRET      JWT secret                         (auto-generated)
#   --admin-password PASS    Admin dashboard password           (auto-generated)
#   --certificate-arn ARN    ACM certificate ARN for HTTPS      (optional)
#   --paymongo-secret KEY    PayMongo secret key                (optional)
#   --paymongo-public KEY    PayMongo public key                (optional)
#   --paymongo-webhook KEY   PayMongo webhook secret            (optional)
#   --photonpay-app-id ID    PhotonPay app ID                   (optional)
#   --photonpay-app-secret S PhotonPay app secret               (optional)
#   --photonpay-site-id ID   PhotonPay site ID                  (optional)
#   --transfi-api-key KEY    TransFi API key                    (optional)
#   --transfi-webhook KEY    TransFi webhook secret             (optional)
#   --github-repo OWNER/NAME Set GitHub Actions secrets via gh CLI (optional)
#   --skip-infra             Skip CloudFormation deploy (infra already exists)
#   --skip-iam               Skip IAM user creation
#   --skip-build             Skip Docker build/push (use :latest already in ECR)
#   -y / --yes               Non-interactive: accept all prompts
#   --help                   Show this help

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ ${RESET}$*"; }
success() { echo -e "${GREEN}✅ ${RESET}$*"; }
warn()    { echo -e "${YELLOW}⚠️  ${RESET}$*"; }
error()   { echo -e "${RED}❌ ${RESET}$*" >&2; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }
die()     { error "$*"; exit 1; }

# ── Script location (so we can reference sibling files regardless of CWD) ────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TASK_DEF_TEMPLATE="$SCRIPT_DIR/task-definition.json"
CF_TEMPLATE="$SCRIPT_DIR/cloudformation.yml"

# ── Defaults ─────────────────────────────────────────────────────────────────
STACK_NAME="paybot"
REGION="us-east-1"
ENV_NAME="paybot"
DB_INSTANCE="db.t3.micro"
CERTIFICATE_ARN=""
SKIP_INFRA=false
SKIP_IAM=false
SKIP_BUILD=false
YES=false

# Required secrets (empty = will prompt)
TELEGRAM_TOKEN=""
TELEGRAM_USERNAME=""
TELEGRAM_ADMIN_IDS=""
XENDIT_KEY=""

# Auto-generated if empty
DB_PASSWORD=""
JWT_SECRET=""
ADMIN_PASSWORD=""

# Optional payment secrets
PAYMONGO_SECRET=""
PAYMONGO_PUBLIC=""
PAYMONGO_WEBHOOK=""
PHOTONPAY_APP_ID=""
PHOTONPAY_APP_SECRET=""
PHOTONPAY_SITE_ID=""
TRANSFI_API_KEY=""
TRANSFI_WEBHOOK=""

GITHUB_REPO=""

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --stack-name)         STACK_NAME="$2";          shift 2 ;;
    --region)             REGION="$2";               shift 2 ;;
    --env-name)           ENV_NAME="$2";             shift 2 ;;
    --db-password)        DB_PASSWORD="$2";          shift 2 ;;
    --db-instance)        DB_INSTANCE="$2";          shift 2 ;;
    --telegram-token)     TELEGRAM_TOKEN="$2";       shift 2 ;;
    --telegram-username)  TELEGRAM_USERNAME="$2";    shift 2 ;;
    --telegram-admin-ids) TELEGRAM_ADMIN_IDS="$2";  shift 2 ;;
    --xendit-key)         XENDIT_KEY="$2";           shift 2 ;;
    --jwt-secret)         JWT_SECRET="$2";           shift 2 ;;
    --admin-password)     ADMIN_PASSWORD="$2";       shift 2 ;;
    --certificate-arn)    CERTIFICATE_ARN="$2";      shift 2 ;;
    --paymongo-secret)    PAYMONGO_SECRET="$2";      shift 2 ;;
    --paymongo-public)    PAYMONGO_PUBLIC="$2";      shift 2 ;;
    --paymongo-webhook)   PAYMONGO_WEBHOOK="$2";     shift 2 ;;
    --photonpay-app-id)   PHOTONPAY_APP_ID="$2";     shift 2 ;;
    --photonpay-app-secret) PHOTONPAY_APP_SECRET="$2"; shift 2 ;;
    --photonpay-site-id)  PHOTONPAY_SITE_ID="$2";   shift 2 ;;
    --transfi-api-key)    TRANSFI_API_KEY="$2";      shift 2 ;;
    --transfi-webhook)    TRANSFI_WEBHOOK="$2";      shift 2 ;;
    --github-repo)        GITHUB_REPO="$2";          shift 2 ;;
    --skip-infra)         SKIP_INFRA=true;           shift ;;
    --skip-iam)           SKIP_IAM=true;             shift ;;
    --skip-build)         SKIP_BUILD=true;           shift ;;
    -y|--yes)             YES=true;                  shift ;;
    --help|-h)
      sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0 ;;
    *) die "Unknown option: $1. Run with --help for usage." ;;
  esac
done

# ── Helper: prompt for a value if not set ────────────────────────────────────
prompt_required() {
  local var_name="$1" prompt_text="$2" secret="${3:-false}"
  local current_val
  current_val="${!var_name}"
  if [[ -z "$current_val" ]]; then
    if $YES; then
      die "$var_name is required. Pass --$(echo "$var_name" | tr '[:upper:]_' '[:lower:]-') VALUE"
    fi
    if [[ "$secret" == "true" ]]; then
      read -rsp "  ${prompt_text}: " current_val; echo
    else
      read -rp  "  ${prompt_text}: " current_val
    fi
    [[ -z "$current_val" ]] && die "$var_name cannot be empty."
    printf -v "$var_name" '%s' "$current_val"
  fi
}

# ── Helper: generate a random secret ─────────────────────────────────────────
gen_secret() { openssl rand -hex 32; }

# ── Prerequisites check ───────────────────────────────────────────────────────
step "Checking prerequisites"

command -v aws   >/dev/null 2>&1 || die "AWS CLI not found. Install: https://aws.amazon.com/cli/"
command -v docker>/dev/null 2>&1 || die "Docker not found. Install: https://docs.docker.com/get-docker/"
command -v jq    >/dev/null 2>&1 || die "jq not found. Install: https://stedolan.github.io/jq/download/"

aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 \
  || die "AWS CLI is not authenticated. Run: aws configure"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
success "AWS account: $ACCOUNT_ID  region: $REGION"

# ── Collect required secrets ──────────────────────────────────────────────────
step "Collecting configuration"

echo "Required secrets (press Enter to type interactively):"
prompt_required TELEGRAM_TOKEN     "Telegram Bot Token (from @BotFather)"      true
prompt_required TELEGRAM_USERNAME  "Telegram Bot username (without @)"          false
prompt_required TELEGRAM_ADMIN_IDS "Telegram admin IDs (comma-separated)"       false
prompt_required XENDIT_KEY         "Xendit secret key"                           true

# Auto-generate secrets if not provided
[[ -z "$DB_PASSWORD"    ]] && DB_PASSWORD="$(gen_secret)"    && warn "DB password auto-generated."
[[ -z "$JWT_SECRET"     ]] && JWT_SECRET="$(gen_secret)"     && warn "JWT secret auto-generated."
[[ -z "$ADMIN_PASSWORD" ]] && ADMIN_PASSWORD="$(gen_secret)" && warn "Admin password auto-generated."

# ── Save generated secrets to a local .env file ───────────────────────────────
ENV_FILE="$REPO_ROOT/.env.aws"
cat > "$ENV_FILE" <<EOF
# Auto-generated by aws/setup.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Keep this file secure — it contains production secrets.
STACK_NAME=$STACK_NAME
AWS_REGION=$REGION
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET_KEY=$JWT_SECRET
ADMIN_USER_PASSWORD=$ADMIN_PASSWORD
TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN
TELEGRAM_BOT_USERNAME=$TELEGRAM_USERNAME
TELEGRAM_ADMIN_IDS=$TELEGRAM_ADMIN_IDS
XENDIT_SECRET_KEY=$XENDIT_KEY
PAYMONGO_SECRET_KEY=$PAYMONGO_SECRET
PAYMONGO_PUBLIC_KEY=$PAYMONGO_PUBLIC
PAYMONGO_WEBHOOK_SECRET=$PAYMONGO_WEBHOOK
PHOTONPAY_APP_ID=$PHOTONPAY_APP_ID
PHOTONPAY_APP_SECRET=$PHOTONPAY_APP_SECRET
PHOTONPAY_SITE_ID=$PHOTONPAY_SITE_ID
TRANSFI_API_KEY=$TRANSFI_API_KEY
TRANSFI_WEBHOOK_SECRET=$TRANSFI_WEBHOOK
EOF
chmod 600 "$ENV_FILE"
info "Secrets saved to $ENV_FILE (chmod 600)"

# ── Step 1: Deploy CloudFormation infrastructure ──────────────────────────────
if $SKIP_INFRA; then
  warn "Skipping CloudFormation deploy (--skip-infra)."
else
  step "Step 1/6 — Deploying CloudFormation infrastructure stack"
  info "Stack name: $STACK_NAME  (this takes 10-15 minutes on first run)"

  PARAM_OVERRIDES=(
    "EnvironmentName=$ENV_NAME"
    "DBPassword=$DB_PASSWORD"
    "DBInstanceClass=$DB_INSTANCE"
  )
  [[ -n "$CERTIFICATE_ARN" ]] && PARAM_OVERRIDES+=("CertificateArn=$CERTIFICATE_ARN")

  aws cloudformation deploy \
    --stack-name    "$STACK_NAME" \
    --template-file "$CF_TEMPLATE" \
    --capabilities  CAPABILITY_NAMED_IAM \
    --region        "$REGION" \
    --parameter-overrides "${PARAM_OVERRIDES[@]}"

  success "CloudFormation stack deployed."
fi

# ── Read stack outputs ────────────────────────────────────────────────────────
step "Reading CloudFormation stack outputs"

cf_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region     "$REGION" \
    --query      "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output     text
}

ECR_URI=$(cf_output ECRRepositoryURI)
CLUSTER=$(cf_output ECSClusterName)
EXEC_ROLE=$(cf_output ECSExecutionRoleArn)
TASK_ROLE=$(cf_output ECSTaskRoleArn)
SUBNET1=$(cf_output PublicSubnet1Id)
SUBNET2=$(cf_output PublicSubnet2Id)
SG=$(cf_output ECSSecurityGroupId)
TG_ARN=$(cf_output TargetGroupArn)
DB_ENDPOINT=$(cf_output DBEndpoint)
ALB_DNS=$(cf_output LoadBalancerDNS)
LOG_GROUP=$(cf_output LogGroupName)

[[ -z "$ECR_URI" || -z "$CLUSTER" ]] \
  && die "Could not read stack outputs. Is the stack '$STACK_NAME' fully deployed?"

success "Stack outputs read."
info "ALB DNS: $ALB_DNS"

# ── Step 2: Create IAM deploy user ───────────────────────────────────────────
if $SKIP_IAM; then
  warn "Skipping IAM user creation (--skip-iam)."
else
  step "Step 2/6 — Creating IAM deploy user (paybot-github-actions)"

  if aws iam get-user --user-name paybot-github-actions --region "$REGION" >/dev/null 2>&1; then
    info "IAM user paybot-github-actions already exists — skipping creation."
  else
    aws iam create-user --user-name paybot-github-actions --region "$REGION"

    for policy in \
        arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser \
        arn:aws:iam::aws:policy/AmazonECS_FullAccess \
        arn:aws:iam::aws:policy/CloudFormationReadOnlyAccess; do
      aws iam attach-user-policy \
        --user-name  paybot-github-actions \
        --policy-arn "$policy" \
        --region     "$REGION"
    done

    KEY_JSON=$(aws iam create-access-key --user-name paybot-github-actions --region "$REGION")
    IAM_KEY_ID=$(echo "$KEY_JSON"     | jq -r '.AccessKey.AccessKeyId')
    IAM_KEY_SECRET=$(echo "$KEY_JSON" | jq -r '.AccessKey.SecretAccessKey')

    # Append to .env.aws
    cat >> "$ENV_FILE" <<EOF
AWS_ACCESS_KEY_ID=$IAM_KEY_ID
AWS_SECRET_ACCESS_KEY=$IAM_KEY_SECRET
EOF

    success "IAM user created. Access keys appended to $ENV_FILE."
  fi
fi

# ── Step 3: Build & push Docker image ────────────────────────────────────────
if $SKIP_BUILD; then
  warn "Skipping Docker build (--skip-build). Using :latest in ECR."
  IMAGE_URI="${ECR_URI}:latest"
else
  step "Step 3/6 — Building & pushing Docker image to ECR"

  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ECR_URI"

  IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)"
  IMAGE_URI="${ECR_URI}:${IMAGE_TAG}"

  docker build -t "$IMAGE_URI" -t "${ECR_URI}:latest" "$REPO_ROOT"
  docker push "$IMAGE_URI"
  docker push "${ECR_URI}:latest"

  success "Image pushed: $IMAGE_URI"
fi

# ── Step 4: Render & register ECS task definition ────────────────────────────
step "Step 4/6 — Rendering ECS task definition"

DB_URL="postgresql+asyncpg://paybot:${DB_PASSWORD}@${DB_ENDPOINT}:5432/paybot"
BACKEND_URL="http://${ALB_DNS}"

ENV_JSON=$(jq -n \
  --arg db_url         "$DB_URL" \
  --arg tg_token       "$TELEGRAM_TOKEN" \
  --arg tg_username    "$TELEGRAM_USERNAME" \
  --arg tg_admins      "$TELEGRAM_ADMIN_IDS" \
  --arg xendit_key     "$XENDIT_KEY" \
  --arg jwt_key        "$JWT_SECRET" \
  --arg admin_pw       "$ADMIN_PASSWORD" \
  --arg backend_url    "$BACKEND_URL" \
  --arg pm_secret      "$PAYMONGO_SECRET" \
  --arg pm_public      "$PAYMONGO_PUBLIC" \
  --arg pm_webhook     "$PAYMONGO_WEBHOOK" \
  --arg pp_app_id      "$PHOTONPAY_APP_ID" \
  --arg pp_app_secret  "$PHOTONPAY_APP_SECRET" \
  --arg pp_site_id     "$PHOTONPAY_SITE_ID" \
  --arg tf_api_key     "$TRANSFI_API_KEY" \
  --arg tf_webhook     "$TRANSFI_WEBHOOK" \
  '[
    {"name":"DATABASE_URL",          "value":$db_url},
    {"name":"TELEGRAM_BOT_TOKEN",    "value":$tg_token},
    {"name":"TELEGRAM_BOT_USERNAME", "value":$tg_username},
    {"name":"TELEGRAM_ADMIN_IDS",    "value":$tg_admins},
    {"name":"XENDIT_SECRET_KEY",     "value":$xendit_key},
    {"name":"JWT_SECRET_KEY",        "value":$jwt_key},
    {"name":"ADMIN_USER_PASSWORD",   "value":$admin_pw},
    {"name":"PYTHON_BACKEND_URL",    "value":$backend_url},
    {"name":"ENVIRONMENT",           "value":"production"},
    {"name":"PORT",                  "value":"8000"}
  ]
  + (if $pm_secret    != "" then [{"name":"PAYMONGO_SECRET_KEY",    "value":$pm_secret}]    else [] end)
  + (if $pm_public    != "" then [{"name":"PAYMONGO_PUBLIC_KEY",    "value":$pm_public}]    else [] end)
  + (if $pm_webhook   != "" then [{"name":"PAYMONGO_WEBHOOK_SECRET","value":$pm_webhook}]   else [] end)
  + (if $pp_app_id    != "" then [{"name":"PHOTONPAY_APP_ID",       "value":$pp_app_id}]    else [] end)
  + (if $pp_app_secret!= "" then [{"name":"PHOTONPAY_APP_SECRET",   "value":$pp_app_secret}] else [] end)
  + (if $pp_site_id   != "" then [{"name":"PHOTONPAY_SITE_ID",      "value":$pp_site_id}]   else [] end)
  + (if $tf_api_key   != "" then [{"name":"TRANSFI_API_KEY",        "value":$tf_api_key}]   else [] end)
  + (if $tf_webhook   != "" then [{"name":"TRANSFI_WEBHOOK_SECRET", "value":$tf_webhook}]   else [] end)')

RENDERED_TASK_DEF=$(jq \
  --arg image     "$IMAGE_URI" \
  --arg exec_role "$EXEC_ROLE" \
  --arg task_role "$TASK_ROLE" \
  --arg log_group "$LOG_GROUP" \
  --arg region    "$REGION" \
  --argjson env   "$ENV_JSON" \
  '.containerDefinitions[0].image = $image
   | .containerDefinitions[0].environment = $env
   | .containerDefinitions[0].logConfiguration.options."awslogs-group" = $log_group
   | .containerDefinitions[0].logConfiguration.options."awslogs-region" = $region
   | .executionRoleArn = $exec_role
   | .taskRoleArn = $task_role' \
  "$TASK_DEF_TEMPLATE")

TASK_DEF_ARN=$(echo "$RENDERED_TASK_DEF" \
  | aws ecs register-task-definition \
      --cli-input-json file:///dev/stdin \
      --region "$REGION" \
      --query  'taskDefinition.taskDefinitionArn' \
      --output text)

success "Task definition registered: $TASK_DEF_ARN"

# ── Step 5: Create or update ECS service ─────────────────────────────────────
step "Step 5/6 — Creating / updating ECS service"

ECS_SERVICE="paybot-service"
CONTAINER_NAME="paybot"

SERVICE_STATUS=$(aws ecs describe-services \
  --cluster  "$CLUSTER" \
  --services "$ECS_SERVICE" \
  --region   "$REGION" \
  --query    'services[0].status' \
  --output   text 2>/dev/null || echo "MISSING")

if [[ "$SERVICE_STATUS" == "ACTIVE" ]]; then
  info "Updating existing ECS service…"
  aws ecs update-service \
    --cluster         "$CLUSTER" \
    --service         "$ECS_SERVICE" \
    --task-definition "$TASK_DEF_ARN" \
    --force-new-deployment \
    --region          "$REGION" \
    >/dev/null
else
  info "Creating new ECS service…"
  aws ecs create-service \
    --cluster              "$CLUSTER" \
    --service-name         "$ECS_SERVICE" \
    --task-definition      "$TASK_DEF_ARN" \
    --desired-count        1 \
    --launch-type          FARGATE \
    --network-configuration \
      "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$SG],assignPublicIp=ENABLED}" \
    --load-balancers \
      "targetGroupArn=$TG_ARN,containerName=$CONTAINER_NAME,containerPort=8000" \
    --health-check-grace-period-seconds 120 \
    --deployment-configuration \
      "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100" \
    --region "$REGION" \
    >/dev/null
fi

# ── Step 6: Wait for service stability ───────────────────────────────────────
step "Step 6/6 — Waiting for service to stabilise (up to 10 min)"

aws ecs wait services-stable \
  --cluster  "$CLUSTER" \
  --services "$ECS_SERVICE" \
  --region   "$REGION"

success "ECS service is stable."

# ── Register Telegram webhook ─────────────────────────────────────────────────
info "Registering Telegram webhook…"
# Use HTTPS when a certificate was provided, otherwise HTTP with a clear warning.
if [[ -n "$CERTIFICATE_ARN" ]]; then
  WEBHOOK_URL="https://${ALB_DNS}/api/v1/telegram/webhook"
else
  WEBHOOK_URL="http://${ALB_DNS}/api/v1/telegram/webhook"
  warn "Webhook registered over HTTP. Add HTTPS (--certificate-arn) before going to production."
fi
# Pass the token via POST body to avoid exposing it in the process list.
TG_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  --data-urlencode "url=${WEBHOOK_URL}")
if echo "$TG_RESPONSE" | jq -e '.ok == true' >/dev/null 2>&1; then
  success "Telegram webhook registered → $WEBHOOK_URL"
else
  warn "Telegram webhook registration may have failed. Response: $TG_RESPONSE"
  warn "Register manually after deploy — see DEPLOYMENT.md § Step 5."
fi

# ── Optional: set GitHub Actions secrets ─────────────────────────────────────
if [[ -n "$GITHUB_REPO" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    step "Setting GitHub Actions secrets on $GITHUB_REPO"

    set_secret() { gh secret set "$1" --body "$2" --repo "$GITHUB_REPO" 2>/dev/null && info "  Set $1"; }
    set_var()    { gh variable set "$1" --body "$2" --repo "$GITHUB_REPO" 2>/dev/null && info "  Set variable $1"; }

    set_secret AWS_ACCESS_KEY_ID       "${IAM_KEY_ID:-}"
    set_secret AWS_SECRET_ACCESS_KEY   "${IAM_KEY_SECRET:-}"
    set_secret DB_PASSWORD             "$DB_PASSWORD"
    set_secret TELEGRAM_BOT_TOKEN      "$TELEGRAM_TOKEN"
    set_secret TELEGRAM_BOT_USERNAME   "$TELEGRAM_USERNAME"
    set_secret TELEGRAM_ADMIN_IDS      "$TELEGRAM_ADMIN_IDS"
    set_secret XENDIT_SECRET_KEY       "$XENDIT_KEY"
    set_secret JWT_SECRET_KEY          "$JWT_SECRET"
    set_secret ADMIN_USER_PASSWORD     "$ADMIN_PASSWORD"
    [[ -n "$PAYMONGO_SECRET"  ]] && set_secret PAYMONGO_SECRET_KEY    "$PAYMONGO_SECRET"
    [[ -n "$PAYMONGO_PUBLIC"  ]] && set_secret PAYMONGO_PUBLIC_KEY    "$PAYMONGO_PUBLIC"
    [[ -n "$PAYMONGO_WEBHOOK" ]] && set_secret PAYMONGO_WEBHOOK_SECRET "$PAYMONGO_WEBHOOK"
    [[ -n "$PHOTONPAY_APP_ID" ]] && set_secret PHOTONPAY_APP_ID       "$PHOTONPAY_APP_ID"
    [[ -n "$PHOTONPAY_APP_SECRET" ]] && set_secret PHOTONPAY_APP_SECRET "$PHOTONPAY_APP_SECRET"
    [[ -n "$PHOTONPAY_SITE_ID"    ]] && set_secret PHOTONPAY_SITE_ID   "$PHOTONPAY_SITE_ID"
    [[ -n "$TRANSFI_API_KEY"  ]] && set_secret TRANSFI_API_KEY        "$TRANSFI_API_KEY"
    [[ -n "$TRANSFI_WEBHOOK"  ]] && set_secret TRANSFI_WEBHOOK_SECRET "$TRANSFI_WEBHOOK"

    set_var AWS_REGION        "$REGION"
    set_var AWS_CF_STACK_NAME "$STACK_NAME"

    success "GitHub secrets set. Future pushes to main will auto-deploy via GitHub Actions."
  else
    warn "gh CLI not authenticated — skipping GitHub secrets."
    warn "Install gh: https://cli.github.com  then run: gh auth login"
  fi
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║         🎉  PayBot deployed successfully!            ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BOLD}App URL:${RESET}         http://${ALB_DNS}"
echo -e "${BOLD}Admin dashboard:${RESET} http://${ALB_DNS}/admin"
echo -e "${BOLD}Health check:${RESET}    http://${ALB_DNS}/health"
echo ""
echo -e "${BOLD}Webhook endpoints:${RESET}"
echo "  Telegram:  http://${ALB_DNS}/api/v1/telegram/webhook"
echo "  Xendit:    http://${ALB_DNS}/api/v1/xendit/webhook"
echo "  PayMongo:  http://${ALB_DNS}/api/v1/paymongo/webhook"
echo ""
echo -e "${BOLD}Logs:${RESET}            aws logs tail ${LOG_GROUP} --follow --region ${REGION}"
echo ""
echo -e "${BOLD}Generated secrets saved to:${RESET} $ENV_FILE"
echo ""
echo -e "${YELLOW}Next steps:${RESET}"
echo "  1. Configure Xendit webhook → https://dashboard.xendit.co (Settings → Webhooks)"
if [[ -n "$PAYMONGO_SECRET" ]]; then
  echo "  2. Configure PayMongo webhook → https://dashboard.paymongo.com (Developers → Webhooks)"
fi
echo "  3. (Optional) Add HTTPS — see DEPLOYMENT.md § Step 6"
echo "  4. (Optional) Set AWS_CF_STACK_NAME repo variable to enable CI/CD auto-deploys"
