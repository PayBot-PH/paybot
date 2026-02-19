# PayBot Railway Deployment Guide

This guide will walk you through deploying the PayBot application to Railway with PostgreSQL database and Supabase authentication integration.

## Prerequisites

- A GitHub account with access to the PayBot repository
- A Railway account (sign up at https://railway.app)
- A Supabase account (sign up at https://supabase.com)
- A Xendit account for payment processing
- A Telegram Bot Token (create via [@BotFather](https://t.me/botfather))

## Table of Contents

1. [Railway Setup](#1-railway-setup)
2. [Environment Variables Setup](#2-environment-variables-setup)
3. [Database Migration](#3-database-migration)
4. [Supabase Configuration](#4-supabase-configuration)
5. [Webhook Configuration](#5-webhook-configuration)
6. [Post-Deployment Steps](#6-post-deployment-steps)
7. [Troubleshooting](#7-troubleshooting)

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
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |

#### Optional Variables:

| Variable Name | Description | Default Value |
|--------------|-------------|---------------|
| `ENVIRONMENT` | Application environment | `production` |
| `DEBUG` | Enable debug mode | `false` |
| `PORT` | Server port (auto-set by Railway) | `8000` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | Empty (allows all) |

#### Example ALLOWED_ORIGINS:
```
ALLOWED_ORIGINS=https://your-frontend.railway.app,http://localhost:3000
```

### 2.2 Frontend Environment Variables (if deploying frontend)

If you're deploying the frontend separately:

1. Create a new service for the frontend
2. Add the following environment variables:

| Variable Name | Description | Example Value |
|--------------|-------------|---------------|
| `VITE_API_URL` | Backend API URL | `https://your-backend.railway.app` |
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |

---

## 3. Database Migration

### Automatic Migrations

Database migrations run **automatically** on each deployment via the start command in `railway.toml`:

```bash
alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT
```

This ensures your database schema is always up-to-date.

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

---

## 4. Supabase Configuration

### 4.1 Get Supabase Credentials

1. Log in to [Supabase](https://supabase.com)
2. Select or create your project
3. Go to **Settings** → **API**
4. Copy the following values:

   - **Project URL**: Found under "Project URL" (e.g., `https://xxxxx.supabase.co`)
   - **Anon Key**: Found under "Project API keys" → "anon public"
   - **Service Role Key**: Found under "Project API keys" → "service_role" (keep this secret!)

### 4.2 Configure Supabase Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Configure your desired authentication providers (Email, Google, GitHub, etc.)
3. Add your Railway backend URL to the **Site URL** and **Redirect URLs**:
   - Site URL: `https://your-backend.railway.app`
   - Redirect URLs: `https://your-backend.railway.app/auth/callback`

### 4.3 Add Environment Variables

Add the Supabase credentials to your Railway backend service as described in section 2.1.

---

## 5. Webhook Configuration

After deployment, you need to configure webhooks for external services.

### 5.1 Get Your Backend URL

1. Go to your Railway backend service
2. Click on the **"Settings"** tab
3. Find the **"Public Networking"** section
4. Copy your **Railway domain** (e.g., `https://your-backend.railway.app`)

### 5.2 Xendit Webhook Setup

1. Log in to your [Xendit Dashboard](https://dashboard.xendit.co)
2. Go to **Settings** → **Webhooks**
3. Add a new webhook URL:
   ```
   https://your-backend.railway.app/webhooks/xendit
   ```
4. Select the events you want to receive:
   - `payment.succeeded`
   - `payment.failed`
   - `invoice.paid`
   - `invoice.expired`

5. Save the webhook configuration

### 5.3 Telegram Webhook Setup

Set up the Telegram webhook using the Telegram Bot API:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-backend.railway.app/webhooks/telegram"
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
   curl https://your-backend.railway.app/webhooks/telegram
   ```
3. Delete and reset the webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" -d "url=https://your-backend.railway.app/webhooks/telegram"
   ```

#### Supabase Authentication Issues

**Solution**:
1. Verify all three Supabase environment variables are set correctly
2. Check Site URL in Supabase dashboard matches your backend URL
3. Ensure redirect URLs include your backend callback endpoint

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Alembic Documentation](https://alembic.sqlalchemy.org)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Supabase Documentation](https://supabase.com/docs)
- [Xendit API Documentation](https://developers.xendit.co)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## Support

If you encounter any issues:

1. Check the [Railway logs](#66-monitor-logs) for detailed error messages
2. Review the [Troubleshooting](#7-troubleshooting) section
3. Consult the official documentation links above
4. Open an issue on the GitHub repository

---

## Summary

You should now have:

✅ Backend service running on Railway  
✅ PostgreSQL database provisioned and connected  
✅ Database migrations running automatically  
✅ Environment variables configured  
✅ Supabase authentication integrated  
✅ Webhooks configured for Xendit and Telegram  
✅ Health checks passing  
✅ Logs accessible for monitoring  

Your PayBot application is now successfully deployed on Railway! 🚀
