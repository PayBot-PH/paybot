# PayBot Deployment Guide

This guide covers deploying PayBot on **Render** or **Railway** with a managed PostgreSQL database.

> **Recommended platform: Render.** The `render.yaml` file at the root of the repository provides a one-click Blueprint deploy that provisions the web service and a PostgreSQL database together, with automatic migrations on every push to `main`.

## Prerequisites

- A GitHub account with access to the PayBot repository
- A [Render](https://render.com) **or** [Railway](https://railway.app) account
- A Xendit account for payment processing
- A Telegram Bot Token (create via [@BotFather](https://t.me/botfather))

## Table of Contents

### Render (Recommended)
1. [Render Setup](#1-render-setup)
2. [Render Environment Variables](#2-render-environment-variables)
3. [Render Webhooks & Post-deploy Checks](#3-render-webhooks--post-deploy-checks)
4. [Render GitHub Actions Integration](#4-render-github-actions-integration)

### Railway
5. [Railway Setup](#5-railway-setup)
6. [Environment Variables Setup](#6-environment-variables-setup)
7. [GitHub Actions Secrets Setup](#7-github-actions-secrets-setup)
8. [Database Migration](#8-database-migration)
9. [Webhook Configuration](#9-webhook-configuration)
10. [Post-Deployment Steps](#10-post-deployment-steps)

### General
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Render Setup

[Render](https://render.com) is the recommended deployment platform. The `render.yaml` file at the repository root defines a **Blueprint** — a declarative spec that Render uses to create all services (web app + PostgreSQL database) in one step.

### 1.1 One-Click Blueprint Deploy

1. Log in to [Render](https://render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub account and select the `csphi/paybot` repository
4. Render reads `render.yaml` and displays a preview of what will be created:
   - **paybot-backend** — Web service (Docker, FastAPI + React admin UI, `starter` plan)
   - **paybot-db** — Managed PostgreSQL 15 (`starter` plan, Oregon region)
5. Click **"Apply"**

Render will:
- Build the Docker image from `backend/Dockerfile` (multi-stage: Node → Python)
- Provision a PostgreSQL database and inject `DATABASE_URL` automatically
- Run `alembic upgrade head` before going live (the `preDeployCommand`)
- Expose the service on a public `*.onrender.com` URL
- Set up auto-deploy: every push to `main` triggers a new build

### 1.2 Service & Database Plans

The `render.yaml` uses `starter` plan for both the web service and the database:

| Resource | Plan | Cost | Notes |
|----------|------|------|-------|
| Web service | `starter` | see [render.com/pricing](https://render.com/pricing) | Always-on, 512 MB RAM, shared CPU |
| PostgreSQL | `starter` | see [render.com/pricing](https://render.com/pricing) | 1 GB storage, no 90-day expiration |

> **Free-tier option:** You can change both plans to `free` for initial testing. Free web services spin down after 15 minutes of inactivity (cold-start delay ~30 s) and the free database expires after **90 days**. Upgrade to `starter` before going to production.

---

## 2. Render Environment Variables

After the Blueprint deploy, some secrets must be filled in manually (they are marked `sync: false` in `render.yaml` and are never auto-populated). Go to the **paybot-backend** service → **Environment** tab.

### 2.1 Required Secrets

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | [@BotFather](https://t.me/botfather) → `/newbot` |
| `XENDIT_SECRET_KEY` | Xendit API secret key | [Xendit Dashboard](https://dashboard.xendit.co) → Settings → API Keys |
| `JWT_SECRET_KEY` | Random 32-byte hex string | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER_PASSWORD` | Password for the admin dashboard | Choose a strong password |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram numeric IDs or `@usernames` allowed as admin | Find your numeric ID via [@userinfobot](https://t.me/userinfobot); use `@username` format if you prefer (e.g. `@yourname,123456789`) |

### 2.2 Optional but Recommended

| Variable | Description | Default |
|----------|-------------|---------|
| `PYTHON_BACKEND_URL` | Your Render public URL — **optional**: the app auto-detects `RENDER_EXTERNAL_URL`. Set only for custom domains (e.g. `https://paybot.example.com`). | Auto-detected |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` — required for the Telegram Login Widget | — |
| `TELEGRAM_BOT_OWNER_ID` | Super-admin Telegram user ID (approves KYB registrations) | — |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins, e.g. `https://paybot.onrender.com` | Allows all |

### 2.3 Payment Gateway Secrets (add the ones you need)

| Variable | Description |
|----------|-------------|
| `PAYMONGO_SECRET_KEY` | PayMongo secret key (cards, GCash, GrabPay, Maya, Alipay, WeChat via PayMongo) |
| `PAYMONGO_PUBLIC_KEY` | PayMongo public key |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret for signature verification |
| `PHOTONPAY_APP_ID` | PhotonPay App ID (Alipay / WeChat Pay via PhotonPay) |
| `PHOTONPAY_APP_SECRET` | PhotonPay App Secret |
| `PHOTONPAY_SITE_ID` | PhotonPay Site ID (Collection → Site Management) |
| `PHOTONPAY_RSA_PRIVATE_KEY` | Merchant RSA private key (PKCS#8 PEM) for signing requests |
| `PHOTONPAY_RSA_PUBLIC_KEY` | PhotonPay platform RSA public key for webhook verification |
| `TRANSFI_API_KEY` | TransFi Checkout API key (Alipay / WeChat Pay via TransFi) |
| `TRANSFI_WEBHOOK_SECRET` | TransFi HMAC-SHA256 webhook secret |

### 2.4 Pre-configured Defaults (no action needed)

These are set in `render.yaml` and work out-of-the-box:

| Variable | Value | Description |
|----------|-------|-------------|
| `ENVIRONMENT` | `production` | Enables production error handling |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | `60` | JWT token expiry |
| `PAYMONGO_MODE` | `live` | PayMongo live mode |
| `PHOTONPAY_MODE` | `production` | PhotonPay production API |
| `PHOTONPAY_ALIPAY_METHOD` | `Alipay` | PayMongo Alipay method string |
| `PHOTONPAY_WECHAT_METHOD` | `WeChat` | PhotonPay WeChat method string |
| `PHOTONPAY_WEBHOOK_VERIFY_REQUIRED` | `true` | Enforce webhook signature checks |
| `TRANSFI_MODE` | `production` | TransFi production API |

---

## 3. Render Webhooks & Post-deploy Checks

### 3.1 Get Your Render Public URL

1. Open the **paybot-backend** service in Render
2. The URL is shown at the top of the dashboard (e.g. `https://paybot-backend.onrender.com`)
3. Optionally add a **custom domain** under **Settings → Custom Domains**

### 3.2 Verify the Deployment

```bash
curl https://paybot-backend.onrender.com/health
# Expected: {"status":"healthy"}
```

Open `https://paybot-backend.onrender.com` in a browser to view the React admin dashboard.

### 3.3 Xendit Webhook

1. Log in to [Xendit Dashboard](https://dashboard.xendit.co) → **Settings → Webhooks**
2. Add a new webhook URL:
   ```
   https://paybot-backend.onrender.com/api/v1/xendit/webhook
   ```
3. Enable events: `payment.succeeded`, `payment.failed`, `invoice.paid`, `invoice.expired`

### 3.4 PayMongo Webhook

1. Log in to [PayMongo Dashboard](https://dashboard.paymongo.com) → **Developers → Webhooks**
2. Create a webhook pointing to:
   ```
   https://paybot-backend.onrender.com/api/v1/paymongo/webhook
   ```
3. Enable events: `source.chargeable`, `checkout_session.payment.paid`, `checkout_session.payment.failed`, `payment.paid`, `payment.failed`
4. Copy the **signing secret** → set as `PAYMONGO_WEBHOOK_SECRET`

### 3.5 Telegram Webhook

The Telegram webhook is **automatically registered** on startup when `PYTHON_BACKEND_URL` is set (or when `RENDER_EXTERNAL_URL` is detected). To register or verify it manually:

```bash
# Register
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://paybot-backend.onrender.com/api/v1/telegram/webhook"}'

# Verify
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 3.6 TransFi Webhook (if using TransFi)

1. Log in to the [TransFi dashboard](https://checkout-dashboard.transfi.com) → **Settings → Integration**
2. Add webhook URL: `https://paybot-backend.onrender.com/api/v1/transfi/webhook`
3. Copy the webhook secret → set as `TRANSFI_WEBHOOK_SECRET`

---

## 4. Render GitHub Actions Integration

Pushing to `main` automatically triggers a Render rebuild (configured via `autoDeploy: true` in `render.yaml`). You can also wire up the GitHub Actions workflow for an explicit redeploy notification.

### 4.1 Get the Render Deploy Hook URL

1. Open the **paybot-backend** service in Render
2. Go to **Settings → Deploy Hook**
3. Copy the URL (looks like `https://api.render.com/deploy/srv-<id>?key=<key>`)

### 4.2 Add as a GitHub Secret

1. GitHub repository → **Settings → Environments → production**
2. Add secret: `RENDER_DEPLOY_HOOK_URL` = the URL copied above

The `deploy.yml` workflow will POST to this URL after every successful test run on `main`.

---

## 5. Railway Setup

### 5.1 Create a New Railway Project

1. Log in to [Railway](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authenticate with GitHub if prompted
5. Select the `csphi/paybot` repository
6. Railway will detect the `railway.toml` configuration automatically

### 5.2 Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"**
3. Choose **"PostgreSQL"**
4. Railway will automatically provision a PostgreSQL database
5. The `DATABASE_URL` environment variable will be automatically added to your backend service

### 5.3 Configure Services

Railway will automatically create services based on your `railway.toml` configuration:

- **Backend Service**: Runs the FastAPI application
- **Database**: PostgreSQL database

### 5.4 Get the DATABASE_URL

1. Click on the **PostgreSQL** service in your Railway project
2. Go to the **"Variables"** tab
3. Copy the `DATABASE_URL` value (it should look like: `postgresql://user:password@host:port/database`)
4. This URL is automatically injected into your backend service

---

## 6. Environment Variables Setup

### 6.1 Backend Environment Variables

1. Click on your **Backend Service** in Railway
2. Go to the **"Variables"** tab
3. Add the following environment variables:

#### Required Variables:

| Variable Name | Description | Example Value |
|--------------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-added by Railway) | `postgresql://user:pass@host:5432/db` |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `XENDIT_SECRET_KEY` | Your Xendit API secret key | `xnd_production_...` |
| `PYTHON_BACKEND_URL` | Your Railway backend public URL (for Telegram webhook) | `https://paybot-backend-production-84b2.up.railway.app` |
| `JWT_SECRET_KEY` | Secret key for signing JWT tokens | Run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER_PASSWORD` | Password for admin dashboard login | `your_secure_password` |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram user IDs allowed as admin | `123456789,987654321` |

#### Optional Variables:

| Variable Name | Description | Default Value |
|--------------|-------------|---------------|
| `ENVIRONMENT` | Application environment | `production` |
| `DEBUG` | Enable debug mode | `false` |
| `PORT` | Server port (auto-set by Railway) | `8000` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | Empty (allows all) |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | JWT token expiry in minutes | `60` |

#### Example ALLOWED_ORIGINS:
```
ALLOWED_ORIGINS=https://paybot-backend-production-84b2.up.railway.app,http://localhost:3000
```

### 6.2 Frontend Environment Variables (if deploying frontend separately)

The frontend is served directly by the backend as a static SPA, so no separate frontend deployment is needed. All requests to `/api/...` are handled by the backend, and the React app is served from the same URL.

---

## 7. GitHub Actions Secrets Setup

The GitHub Actions deployment workflow (`deploy.yml`) deploys to Railway automatically on every push to `main`. It requires a Railway project token configured as a GitHub secret.

### 7.1 Generate a Railway Project Token

A **project token** is a scoped token that grants access only to a specific Railway project and environment. This is the recommended token type for CI/CD.

1. Log in to [Railway](https://railway.app)
2. Open your project
3. Go to **Project Settings** → **Tokens**
4. Click **"New Token"**
5. Give it a name (e.g., `github-actions`) and select the **production** environment
6. Copy the generated token

### 7.2 Add the Secrets as GitHub Secrets

The workflow uses the `production` environment in GitHub Actions. You can add secrets either at the repository level or the environment level:

**Option A – Repository environment secrets (recommended):**

1. Go to your GitHub repository → **Settings** → **Environments**
2. Click on **"production"** (create it if it doesn't exist)
3. Under **"Environment secrets"**, click **"Add secret"**
4. Add each required secret (see table below)
5. Click **"Add secret"**

**Option B – Repository-level secrets:**

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add each required secret (see table below)

**Required secrets:**

| Secret Name | Description |
|-------------|-------------|
| `RAILWAY_TOKEN` | Railway project token (see [step 7.1](#71-generate-a-railway-project-token)) |
| `RAILWAY_SERVICE` | Exact name of the Railway service to deploy (e.g. `backend`) |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook URL (see [Section 4](#4-render-github-actions-integration)) |

> **Note:** If either `RAILWAY_TOKEN` or `RAILWAY_SERVICE` is missing or empty, the deployment step will be skipped with a warning message pointing to this guide. To find your service name, open your Railway project dashboard and note the name shown on the service card.

---

### 7.3 Render Deploy Hook (optional)

If you also want GitHub Actions to automatically redeploy your Render service on every push to `main`, see [Section 4](#4-render-github-actions-integration) for instructions on getting the deploy hook URL and adding `RENDER_DEPLOY_HOOK_URL` as a GitHub secret.

> **Note:** If `RENDER_DEPLOY_HOOK_URL` is not set, the Render deploy step is silently skipped — no errors, just a warning. This lets you use Railway-only or Render-only without changing the workflow.

---

## 8. Database Migration

### Automatic Migrations

Database migrations run **automatically** on each deployment via the pre-deploy command in `railway.toml`:

```bash
alembic upgrade head
```

This runs as a `preDeployCommand` — Railway executes the migration in a one-off container *before* promoting the new deployment live. If the migration fails, the deployment is rolled back and the previous version keeps serving traffic. This prevents broken schema from reaching the running app.

### Manual Migration (if needed)

If you need to run migrations manually:

1. Install the Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Link to your project:
   ```bash
   railway link
   ```

3. Run migrations:
   ```bash
   railway run alembic upgrade head
   ```

### Verify Migrations

To check the current migration status:

```bash
railway run alembic current
```

To see migration history:

```bash
railway run alembic history
```

## 9. Webhook Configuration

After deployment, you need to configure webhooks for external services.

### 9.1 Get Your Backend URL

1. Go to your Railway backend service
2. Click on the **"Settings"** tab
3. Find the **"Public Networking"** section
4. Copy your **Railway domain** (e.g., `https://paybot-backend-production-84b2.up.railway.app`)

### 9.2 Xendit Webhook Setup

1. Log in to your [Xendit Dashboard](https://dashboard.xendit.co)
2. Go to **Settings** → **Webhooks**
3. Add a new webhook URL:
   ```
   https://paybot-backend-production-84b2.up.railway.app/api/v1/xendit/webhook
   ```
4. Select the events you want to receive:
   - `payment.succeeded`
   - `payment.failed`
   - `invoice.paid`
   - `invoice.expired`

5. Save the webhook configuration

### 9.2b TransFi Webhook Setup

1. Log in to your [TransFi Checkout dashboard](https://checkout-dashboard.transfi.com)
2. Go to **Settings** → **Integration** (or **Webhooks**)
3. Add a new webhook URL:
   ```
   https://<your-domain>/api/v1/transfi/webhook
   ```
4. Copy the **webhook secret** and set it as `TRANSFI_WEBHOOK_SECRET` in your environment variables.
5. Save the webhook configuration.

### 9.3 Telegram Webhook Setup

The Telegram webhook is automatically registered on startup when `PYTHON_BACKEND_URL` is set. To set it up manually:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook"
  }'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and update the URL with your Railway backend domain.

To verify the webhook is set:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

---

## 10. Post-Deployment Steps

### 10.1 Verify Backend is Running

Check the health endpoint:

```bash
curl https://paybot-backend-production-84b2.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy"
}
```

### 10.2 Verify Frontend is Running

Open your frontend URL in a browser:
```
https://paybot-backend-production-84b2.up.railway.app
```

### 10.3 Check Database Connection

1. Go to your Railway project dashboard
2. Click on the backend service
3. Click on **"Deployments"** tab
4. Click on the latest deployment
5. Check the logs for any database connection errors

You should see logs indicating successful database connection:
```
Database connection initialized successfully
Tables initialized successfully
```

### 10.4 Test Telegram Bot

1. Open Telegram and find your bot
2. Send `/start` command
3. Verify the bot responds correctly

### 10.5 Test Payment Functionality

1. Create a test payment through your application
2. Check the Xendit dashboard to verify the payment was created
3. Verify webhook events are being received by checking Railway logs

### 10.6 Monitor Logs

To view real-time logs:

1. Go to your Railway project
2. Click on the backend service
3. Click on **"Deployments"**
4. Select the active deployment
5. View the logs in real-time

Or use the Railway CLI:

```bash
railway logs
```

---

## 11. Troubleshooting

### Common Issues

#### Invalid or Missing RAILWAY_TOKEN

**Error**: `Invalid RAILWAY_TOKEN. Please check that it is valid and has access to the resource you're trying to use.`

**Solution**:
1. Generate a Railway project token: **Project Settings** → **Tokens** → **New Token** (select the **production** environment)
2. Add it as a GitHub secret named `RAILWAY_TOKEN` (see [GitHub Actions Secrets Setup](#7-github-actions-secrets-setup) for detailed instructions)
3. Verify the secret is added to the correct scope: the deploy workflow uses the `production` environment, so the secret should be an **environment secret** under the `production` environment, or a **repository secret**
4. If the token was previously set but is now expired or revoked, generate a new token and update the secret

#### Multiple Services Found / Missing RAILWAY_SERVICE

**Error**: `Multiple services found. Please specify a service via the --service flag.`

**Solution**:
1. Find your Railway service name by opening your Railway project dashboard and noting the name on the service card (e.g. `backend`)
2. Add it as a GitHub secret named `RAILWAY_SERVICE` (see [GitHub Actions Secrets Setup](#7-github-actions-secrets-setup))
3. If `RAILWAY_SERVICE` is missing or empty, the deploy step will be skipped with a warning rather than failing the workflow

#### Database Connection Errors

**Error**: `Failed to initialize database`

**Solution**:
1. Verify `DATABASE_URL` is set correctly in environment variables
2. Check PostgreSQL service is running in Railway
3. Ensure the database URL format is: `postgresql://user:password@host:port/database`

#### Migration Failures

**Error**: `alembic.util.exc.CommandError: Can't locate revision identified by`

**Solution**:
1. Check if migrations are in sync:
   ```bash
   railway run alembic current
   ```
2. If needed, reset to head:
   ```bash
   railway run alembic stamp head
   railway run alembic upgrade head
   ```

#### CORS Errors

**Error**: `Access to fetch at 'https://backend...' from origin 'https://frontend...' has been blocked by CORS policy`

**Solution**:
1. Add your frontend URL to `ALLOWED_ORIGINS` environment variable:
   ```
   ALLOWED_ORIGINS=https://paybot-backend-production-84b2.up.railway.app,http://localhost:3000
   ```

#### Port Binding Issues

**Error**: `Address already in use`

**Solution**:
Railway automatically sets the `PORT` environment variable. Ensure your application uses `$PORT`:
```python
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

#### Telegram Webhook Not Receiving Updates

**Solution**:
1. Verify webhook is set correctly:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
   ```
2. Check if the URL is accessible:
   ```bash
   curl https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook
   ```
3. Delete and reset the webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" -d "url=https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook"
   ```

#### Admin Login Issues

**Error**: `Telegram admin authentication is not configured` (500 error on login)

**Solution**:
1. Set `ADMIN_USER_PASSWORD` environment variable
2. Set `TELEGRAM_ADMIN_IDS` to your Telegram numeric user ID (find it via [@userinfobot](https://t.me/userinfobot))
3. Set `JWT_SECRET_KEY` to a secure random string

---

## Additional Resources

- [Render Documentation](https://docs.render.com)
- [Railway Documentation](https://docs.railway.app)
- [Alembic Documentation](https://alembic.sqlalchemy.org)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Xendit API Documentation](https://developers.xendit.co)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## Support

If you encounter any issues:

1. Check the service logs (Render: **Logs** tab; Railway: **Deployments** tab) for detailed error messages
2. Review the [Troubleshooting](#11-troubleshooting) section
3. Consult the official documentation links above
4. Open an issue on the GitHub repository

---

## Summary

You should now have PayBot running on Render (or Railway):

✅ Backend service running and healthy  
✅ PostgreSQL database provisioned and connected  
✅ Database migrations applied automatically on every deploy  
✅ Environment variables and secrets configured  
✅ JWT authentication configured for admin dashboard  
✅ Webhooks configured for Xendit, PayMongo, and Telegram  
✅ Health checks passing  
✅ Logs accessible for monitoring  

Your PayBot application is now successfully deployed! 🚀
