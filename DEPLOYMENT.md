# PayBot Deployment Guide

This guide covers deploying PayBot on **Railway** or **Render** with a PostgreSQL database.

## Prerequisites

- A GitHub account with access to the PayBot repository
- A [Railway](https://railway.app) **or** [Render](https://render.com) account
- A Xendit account for payment processing
- A Telegram Bot Token (create via [@BotFather](https://t.me/botfather))

## Table of Contents

### Railway
1. [Railway Setup](#1-railway-setup)
2. [Environment Variables Setup](#2-environment-variables-setup)
3. [GitHub Actions Secrets Setup](#3-github-actions-secrets-setup)
4. [Database Migration](#4-database-migration)
5. [Webhook Configuration](#5-webhook-configuration)
6. [Post-Deployment Steps](#6-post-deployment-steps)

### Render
7. [Troubleshooting](#7-troubleshooting)
8. [Render Setup](#8-render-setup)

---

## 1. Railway Setup

### 1.1 Create a New Railway Project

1. Log in to [Railway](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authenticate with GitHub if prompted
5. Select the `csphi/paybot` repository
6. Railway will detect the `railway.toml` configuration automatically

### 1.2 Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"**
3. Choose **"PostgreSQL"**
4. Railway will automatically provision a PostgreSQL database
5. The `DATABASE_URL` environment variable will be automatically added to your backend service

### 1.3 Configure Services

Railway will automatically create services based on your `railway.toml` configuration:

- **Backend Service**: Runs the FastAPI application
- **Database**: PostgreSQL database

### 1.4 Get the DATABASE_URL

1. Click on the **PostgreSQL** service in your Railway project
2. Go to the **"Variables"** tab
3. Copy the `DATABASE_URL` value (it should look like: `postgresql://user:password@host:port/database`)
4. This URL is automatically injected into your backend service

---

## 2. Environment Variables Setup

### 2.1 Backend Environment Variables

1. Click on your **Backend Service** in Railway
2. Go to the **"Variables"** tab
3. Add the following environment variables:

#### Required Variables:

| Variable Name | Description | Example Value |
|--------------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-added by Railway) | `postgresql://user:pass@host:5432/db` |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `XENDIT_SECRET_KEY` | Your Xendit API secret key | `xnd_production_...` |
| `PYTHON_BACKEND_URL` | Your Railway backend public URL (for Telegram webhook) | `https://your-backend.railway.app` |
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
ALLOWED_ORIGINS=https://your-frontend.railway.app,http://localhost:3000
```

### 2.2 Frontend Environment Variables (if deploying frontend separately)

The frontend is served directly by the backend as a static SPA, so no separate frontend deployment is needed. All requests to `/api/...` are handled by the backend, and the React app is served from the same URL.

---

## 3. GitHub Actions Secrets Setup

The GitHub Actions deployment workflow (`deploy.yml`) deploys to Railway automatically on every push to `main`. It requires a Railway project token configured as a GitHub secret.

### 3.1 Generate a Railway Project Token

A **project token** is a scoped token that grants access only to a specific Railway project and environment. This is the recommended token type for CI/CD.

1. Log in to [Railway](https://railway.app)
2. Open your project
3. Go to **Project Settings** → **Tokens**
4. Click **"New Token"**
5. Give it a name (e.g., `github-actions`) and select the **production** environment
6. Copy the generated token

### 3.2 Add the Secrets as GitHub Secrets

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
| `RAILWAY_TOKEN` | Railway project token (see [step 3.1](#31-generate-a-railway-project-token)) |
| `RAILWAY_SERVICE` | Exact name of the Railway service to deploy (e.g. `backend`) |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook URL (see [step 3.3](#33-render-deploy-hook-optional)) |

> **Note:** If either `RAILWAY_TOKEN` or `RAILWAY_SERVICE` is missing or empty, the deployment step will be skipped with a warning message pointing to this guide. To find your service name, open your Railway project dashboard and note the name shown on the service card.

---

### 3.3 Render Deploy Hook (optional)

If you also want GitHub Actions to automatically redeploy your Render service on every push to `main`, add a Render deploy hook URL as a GitHub secret named `RENDER_DEPLOY_HOOK_URL`.

**How to get the deploy hook URL:**

1. Log in to [Render](https://render.com)
2. Open your **paybot-backend** service
3. Go to **Settings** → **Deploy Hook**
4. Copy the hook URL (it looks like `https://api.render.com/deploy/srv-<id>?key=<key>`)

**Add it as a GitHub secret:**

1. Go to your GitHub repository → **Settings** → **Environments** → **production**
2. Under **"Environment secrets"**, click **"Add secret"**
3. Name: `RENDER_DEPLOY_HOOK_URL`, Value: the URL you copied above

> **Note:** If `RENDER_DEPLOY_HOOK_URL` is not set, the Render deploy step is silently skipped — no errors, just a warning. This lets you use Railway-only or Render-only without changing the workflow.

---

## 4. Database Migration

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

## 5. Webhook Configuration

After deployment, you need to configure webhooks for external services.

### 4.1 Get Your Backend URL

1. Go to your Railway backend service
2. Click on the **"Settings"** tab
3. Find the **"Public Networking"** section
4. Copy your **Railway domain** (e.g., `https://your-backend.railway.app`)

### 4.2 Xendit Webhook Setup

1. Log in to your [Xendit Dashboard](https://dashboard.xendit.co)
2. Go to **Settings** → **Webhooks**
3. Add a new webhook URL:
   ```
   https://your-backend.railway.app/api/v1/xendit/webhook
   ```
4. Select the events you want to receive:
   - `payment.succeeded`
   - `payment.failed`
   - `invoice.paid`
   - `invoice.expired`

5. Save the webhook configuration

### 4.3 Telegram Webhook Setup

The Telegram webhook is automatically registered on startup when `PYTHON_BACKEND_URL` is set. To set it up manually:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-backend.railway.app/api/v1/telegram/webhook"
  }'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and update the URL with your Railway backend domain.

To verify the webhook is set:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

---

## 6. Post-Deployment Steps

### 6.1 Verify Backend is Running

Check the health endpoint:

```bash
curl https://your-backend.railway.app/health
```

Expected response:
```json
{
  "status": "healthy"
}
```

### 6.2 Verify Frontend is Running (if deployed)

Open your frontend URL in a browser:
```
https://your-frontend.railway.app
```

### 6.3 Check Database Connection

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

### 6.4 Test Telegram Bot

1. Open Telegram and find your bot
2. Send `/start` command
3. Verify the bot responds correctly

### 6.5 Test Payment Functionality

1. Create a test payment through your application
2. Check the Xendit dashboard to verify the payment was created
3. Verify webhook events are being received by checking Railway logs

### 6.6 Monitor Logs

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

## 7. Troubleshooting

### Common Issues

#### Invalid or Missing RAILWAY_TOKEN

**Error**: `Invalid RAILWAY_TOKEN. Please check that it is valid and has access to the resource you're trying to use.`

**Solution**:
1. Generate a Railway project token: **Project Settings** → **Tokens** → **New Token** (select the **production** environment)
2. Add it as a GitHub secret named `RAILWAY_TOKEN` (see [GitHub Actions Secrets Setup](#3-github-actions-secrets-setup) for detailed instructions)
3. Verify the secret is added to the correct scope: the deploy workflow uses the `production` environment, so the secret should be an **environment secret** under the `production` environment, or a **repository secret**
4. If the token was previously set but is now expired or revoked, generate a new token and update the secret

#### Multiple Services Found / Missing RAILWAY_SERVICE

**Error**: `Multiple services found. Please specify a service via the --service flag.`

**Solution**:
1. Find your Railway service name by opening your Railway project dashboard and noting the name on the service card (e.g. `backend`)
2. Add it as a GitHub secret named `RAILWAY_SERVICE` (see [GitHub Actions Secrets Setup](#3-github-actions-secrets-setup))
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
   ALLOWED_ORIGINS=https://your-frontend.railway.app,http://localhost:3000
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
   curl https://your-backend.railway.app/api/v1/telegram/webhook
   ```
3. Delete and reset the webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" -d "url=https://your-backend.railway.app/api/v1/telegram/webhook"
   ```

#### Admin Login Issues

**Error**: `Telegram admin authentication is not configured` (500 error on login)

**Solution**:
1. Set `ADMIN_USER_PASSWORD` environment variable
2. Set `TELEGRAM_ADMIN_IDS` to your Telegram numeric user ID (find it via [@userinfobot](https://t.me/userinfobot))
3. Set `JWT_SECRET_KEY` to a secure random string

---

## 8. Render Setup

[Render](https://render.com) is an alternative cloud platform that can host the PayBot backend and a managed PostgreSQL database. The `render.yaml` file at the root of the repository defines everything Render needs to provision your services automatically.

### 8.1 One-click Deploy

1. Log in to [Render](https://render.com)
2. Click **"New"** → **"Blueprint"**
3. Connect your GitHub account and select the `csphi/paybot` repository
4. Render detects `render.yaml` and shows a preview of the services it will create:
   - **paybot-backend** – Web service (Docker, FastAPI)
   - **paybot-db** – Managed PostgreSQL database
5. Click **"Apply"**

Render will build the Docker image defined in `backend/Dockerfile`, provision a free-tier PostgreSQL database, and wire `DATABASE_URL` automatically.

### 8.2 Set Required Environment Variables

After the initial deploy, go to the **paybot-backend** service → **Environment** tab and add the following secrets (marked `sync: false` in `render.yaml`, so they are never auto-populated):

| Variable | Description |
|----------|-------------|
| `PYTHON_BACKEND_URL` | Your Render public URL, e.g. `https://paybot-backend.onrender.com` — **optional**: Render automatically sets `RENDER_EXTERNAL_URL`, which the app uses as a fallback when `PYTHON_BACKEND_URL` is not provided |
| `TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_BOT_USERNAME` | Your bot's username without `@`, e.g. `mypaybot` (used by Telegram Login Widget) |
| `XENDIT_SECRET_KEY` | Xendit API secret key |
| `JWT_SECRET_KEY` | Random secret – run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER_PASSWORD` | Password for the admin dashboard |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram numeric user IDs or `@usernames` allowed as admin |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins (optional) |

The following variables are pre-configured with sensible defaults in `render.yaml` and do not need to be set manually unless you want to override them:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | `60` | JWT token expiry in minutes |
| `ENVIRONMENT` | `production` | Application environment |

### 8.3 Run Database Migrations

Database migrations run **automatically** on each Render deployment via the `preDeployCommand` in `render.yaml`:

```bash
alembic upgrade head
```

This runs in the deployed container (at `/app/backend`) before the new version goes live. If the migration fails, Render aborts the deploy and keeps the previous version running.

### 8.4 Configure Webhooks

Follow the same steps as [Section 5](#5-webhook-configuration) in the Railway guide, substituting your Render URL (e.g. `https://paybot-backend.onrender.com`) for `https://your-backend.railway.app`.

### 8.5 Verify the Deployment

```bash
curl https://paybot-backend.onrender.com/health
```

Expected response:
```json
{"status": "healthy"}
```

> **Note on free-tier cold starts:** Render's free plan spins down idle services after 15 minutes of inactivity. The first request after a cold start may take up to 30 seconds. Upgrade to a paid plan to keep the service always-on.

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://docs.render.com)
- [Alembic Documentation](https://alembic.sqlalchemy.org)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Xendit API Documentation](https://developers.xendit.co)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## Support

If you encounter any issues:

1. Check the service logs (Railway: **Deployments** tab; Render: **Logs** tab) for detailed error messages
2. Review the [Troubleshooting](#7-troubleshooting) section
3. Consult the official documentation links above
4. Open an issue on the GitHub repository

---

## Summary

You should now have PayBot running on either Railway or Render:

✅ Backend service running on Railway or Render  
✅ PostgreSQL database provisioned and connected  
✅ Database migrations applied  
✅ Environment variables configured  
✅ JWT authentication configured for admin dashboard  
✅ Webhooks configured for Xendit and Telegram  
✅ Health checks passing  
✅ Logs accessible for monitoring  

Your PayBot application is now successfully deployed! 🚀
