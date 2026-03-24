#!/usr/bin/env bash
# PayBot — First-time AWS EC2 instance setup script
#
# Run this ONCE on a fresh Ubuntu 22.04 / Amazon Linux 2023 instance:
#
#   curl -fsSL https://raw.githubusercontent.com/PayBot-PH/paybot/main/deploy/ec2-setup.sh | bash
#
# Or copy and run manually:
#   chmod +x ec2-setup.sh && sudo ./ec2-setup.sh
#
# What this script does:
#   1. Installs Docker Engine + Docker Compose plugin
#   2. Adds the current user to the docker group
#   3. Creates the app directory at /opt/paybot
#   4. Creates the nginx ssl directory
#   5. Creates a template backend/.env file (you MUST edit this before starting)
#   6. Enables and starts Docker on boot
#
# After running this script:
#   1. Edit /opt/paybot/backend/.env with your secrets
#   2. Place SSL certificates in /opt/paybot/nginx/ssl/ (see nginx/nginx.conf)
#   3. Trigger a deployment via GitHub Actions (push to main)
#      OR pull and start manually:
#        cd /opt/paybot
#        docker compose up -d
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/paybot}"
APP_USER="${SUDO_USER:-ubuntu}"

echo "==> PayBot EC2 setup — app directory: ${APP_DIR}"

# ── Detect OS ────────────────────────────────────────────────────────────────
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID}"
else
  OS_ID="unknown"
fi

# ── Install Docker ────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  echo "==> Docker already installed ($(docker --version))"
else
  echo "==> Installing Docker..."
  case "${OS_ID}" in
    ubuntu|debian)
      apt-get update -q
      apt-get install -y -q ca-certificates curl gnupg lsb-release
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -q
      apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    amzn)
      dnf install -y docker
      # Install docker compose v2 plugin for Amazon Linux
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      ;;
    *)
      echo "ERROR: Unsupported OS '${OS_ID}'. Install Docker manually: https://docs.docker.com/engine/install/"
      exit 1
      ;;
  esac
fi

# ── Enable & start Docker ─────────────────────────────────────────────────────
systemctl enable docker
systemctl start docker
echo "==> Docker service enabled and started"

# ── Add user to docker group ──────────────────────────────────────────────────
if id "${APP_USER}" &>/dev/null && ! groups "${APP_USER}" | grep -q docker; then
  usermod -aG docker "${APP_USER}"
  echo "==> Added '${APP_USER}' to the docker group (re-login required)"
fi

# ── Create app directory structure ───────────────────────────────────────────
mkdir -p "${APP_DIR}/backend"
mkdir -p "${APP_DIR}/nginx/ssl"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
echo "==> Created app directory: ${APP_DIR}"

# ── Create template .env (only if it doesn't exist) ──────────────────────────
ENV_FILE="${APP_DIR}/backend/.env"
if [ ! -f "${ENV_FILE}" ]; then
  # Generate secure random secrets at setup time
  GENERATED_DB_PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"
  GENERATED_JWT_KEY="$(openssl rand -hex 32)"

  cat > "${ENV_FILE}" <<EOF
# ── PayBot — Production Environment ──────────────────────────────────────────
# Edit this file with your actual secrets before starting the application.

# PostgreSQL password (must match POSTGRES_PASSWORD in docker-compose.ec2.yml)
POSTGRES_PASSWORD=${GENERATED_DB_PASS}

# App database URL (auto-wired by docker-compose.ec2.yml — do not change)
DATABASE_URL=postgresql+asyncpg://paybot:${GENERATED_DB_PASS}@db:5432/paybot

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_ADMIN_IDS=123456789

# JWT secret — auto-generated
JWT_SECRET_KEY=${GENERATED_JWT_KEY}

# Xendit (optional — remove if not using)
XENDIT_SECRET_KEY=your_xendit_secret_key

# PayMongo (optional — remove if not using)
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_WEBHOOK_SECRET=whsk_...
PAYMONGO_MODE=live

# Environment
ENVIRONMENT=production
EOF
  chmod 600 "${ENV_FILE}"
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  echo "==> Created ${ENV_FILE} with auto-generated DB password and JWT key"
  echo "    IMPORTANT: Set TELEGRAM_BOT_TOKEN and other required values before starting!"
else
  echo "==> ${ENV_FILE} already exists — skipping"
fi

# ── Configure firewall (ufw) if available ─────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   comment "SSH"   2>/dev/null || true
  ufw allow 80/tcp   comment "HTTP"  2>/dev/null || true
  ufw allow 443/tcp  comment "HTTPS" 2>/dev/null || true
  echo "==> UFW rules added for SSH (22), HTTP (80), HTTPS (443)"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  PayBot EC2 setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit secrets:  sudo nano ${ENV_FILE}"
echo "  2. Add SSL certs: sudo cp fullchain.pem ${APP_DIR}/nginx/ssl/"
echo "                    sudo cp privkey.pem   ${APP_DIR}/nginx/ssl/"
echo "  3. Push to main branch to trigger the deploy-ec2 GitHub Actions workflow."
echo "     Or start manually:"
echo "       cd ${APP_DIR} && docker compose up -d"
echo "════════════════════════════════════════════════════════════"
