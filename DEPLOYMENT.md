# PayBot Deployment Guide

This guide covers deploying PayBot on **Railway** (primary) and **AWS ECS Fargate** (alternative).

## Prerequisites

- A GitHub account with access to the PayBot repository
- A Xendit account for payment processing
- A Telegram Bot Token (create via [@BotFather](https://t.me/botfather))
- For Railway: a [Railway](https://railway.app) account
- For AWS: an AWS account and the [AWS CLI](https://aws.amazon.com/cli/) installed

## Table of Contents

### Railway (primary)
1. [Railway Setup](#1-railway-setup)
2. [Environment Variables Setup](#2-environment-variables-setup)
3. [GitHub Actions Secrets Setup](#3-github-actions-secrets-setup)
4. [Database Migration](#4-database-migration)
5. [Webhook Configuration](#5-webhook-configuration)
6. [Post-Deployment Steps](#6-post-deployment-steps)
7. [Troubleshooting](#7-troubleshooting)

### AWS (alternative)
- [AWS Deployment (ECS Fargate)](#aws-deployment-ecs-fargate)

---

## 1. Railway Setup

### 1.1 Create a New Railway Project

1. Log in to [Railway](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authenticate with GitHub if prompted
5. Select the `PayBot-PH/paybot` repository
6. Railway will detect the `railway.toml` configuration automatically

### 1.2 Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"**
3. Choose **"PostgreSQL"**
4. Railway will automatically provision a PostgreSQL database
5. The `DATABASE_URL` environment variable will be automatically added to your backend service

### 1.3 Configure Services

Railway will automatically create services based on your `railway.toml` configuration:

- **Backend Service**: Runs the FastAPI application (with the React admin UI served as static files)
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
| `PYTHON_BACKEND_URL` | Your Railway backend public URL (for Telegram webhook) | `https://paybot-backend-production-84b2.up.railway.app` |
| `JWT_SECRET_KEY` | Secret key for signing JWT tokens | Run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER_PASSWORD` | Password for admin dashboard login | `your_secure_password` |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram numeric IDs or `@usernames` allowed as admin | Find your numeric ID via [@userinfobot](https://t.me/userinfobot); use `@username` format if you prefer (e.g. `@yourname,123456789`) |

#### Optional Variables:

| Variable Name | Description | Default Value |
|--------------|-------------|---------------|
| `ENVIRONMENT` | Application environment | `production` |
| `DEBUG` | Enable debug mode | `false` |
| `PORT` | Server port (auto-set by Railway) | `8000` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | Empty (allows all) |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | JWT token expiry in minutes | `60` |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` — required for the Telegram Login Widget | — |
| `TELEGRAM_BOT_OWNER_ID` | Super-admin Telegram user ID (approves KYB registrations) | — |

#### Payment Gateway Secrets (add the ones you need):

| Variable | Description |
|----------|-------------|
| `PAYMONGO_SECRET_KEY` | PayMongo secret key (cards, GCash, GrabPay, Maya, Alipay, WeChat via PayMongo) |
| `PAYMONGO_PUBLIC_KEY` | PayMongo public key |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret for signature verification |
| `PAYMONGO_MODE` | PayMongo mode (`live` or `test`) |
| `PHOTONPAY_APP_ID` | PhotonPay App ID (Alipay / WeChat Pay via PhotonPay) |
| `PHOTONPAY_APP_SECRET` | PhotonPay App Secret |
| `PHOTONPAY_SITE_ID` | PhotonPay Site ID (Collection → Site Management) |
| `PHOTONPAY_RSA_PRIVATE_KEY` | Merchant RSA private key (PKCS#8 PEM) for signing requests |
| `PHOTONPAY_RSA_PUBLIC_KEY` | PhotonPay platform RSA public key for webhook verification |
| `TRANSFI_API_KEY` | TransFi Checkout API key (Alipay / WeChat Pay via TransFi) |
| `TRANSFI_WEBHOOK_SECRET` | TransFi HMAC-SHA256 webhook secret |
| `TRANSFI_BASE_URL` | TransFi API base URL |

#### Example ALLOWED_ORIGINS:
```
ALLOWED_ORIGINS=https://paybot-backend-production-84b2.up.railway.app,http://localhost:3000
```

### 2.2 Frontend Environment Variables

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

> **Note:** If either `RAILWAY_TOKEN` or `RAILWAY_SERVICE` is missing or empty, the deployment step will be skipped with a warning message pointing to this guide. To find your service name, open your Railway project dashboard and note the name shown on the service card.

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

---

## 5. Webhook Configuration

After deployment, you need to configure webhooks for external services.

### 5.1 Get Your Backend URL

1. Go to your Railway backend service
2. Click on the **"Settings"** tab
3. Find the **"Public Networking"** section
4. Copy your **Railway domain** (e.g., `https://paybot-backend-production-84b2.up.railway.app`)

### 5.2 Xendit Webhook Setup

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

### 5.3 PayMongo Webhook Setup

1. Log in to [PayMongo Dashboard](https://dashboard.paymongo.com) → **Developers → Webhooks**
2. Create a webhook pointing to:
   ```
   https://paybot-backend-production-84b2.up.railway.app/api/v1/paymongo/webhook
   ```
3. Enable events: `source.chargeable`, `checkout_session.payment.paid`, `checkout_session.payment.failed`, `payment.paid`, `payment.failed`
4. Copy the **signing secret** → set as `PAYMONGO_WEBHOOK_SECRET`

### 5.4 TransFi Webhook Setup

1. Log in to your [TransFi Checkout dashboard](https://checkout-dashboard.transfi.com)
2. Go to **Settings** → **Integration** (or **Webhooks**)
3. Add a new webhook URL:
   ```
   https://<your-railway-domain>/api/v1/transfi/webhook
   ```
4. Copy the **webhook secret** and set it as `TRANSFI_WEBHOOK_SECRET` in your environment variables.
5. Save the webhook configuration.

### 5.5 Telegram Webhook Setup

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

## 6. Post-Deployment Steps

### 6.1 Verify Backend is Running

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

### 6.2 Verify Frontend is Running

Open your Railway backend URL in a browser:
```
https://paybot-backend-production-84b2.up.railway.app
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

- [Railway Documentation](https://docs.railway.app)
- [Alembic Documentation](https://alembic.sqlalchemy.org)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Xendit API Documentation](https://developers.xendit.co)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

## Support

If you encounter any issues:

1. Check the service logs (Railway: **Deployments** tab) for detailed error messages
2. Review the [Troubleshooting](#7-troubleshooting) section
3. Consult the official documentation links above
4. Open an issue on the GitHub repository

---

## Summary

You should now have PayBot running on Railway:

✅ Backend service running and healthy  
✅ PostgreSQL database provisioned and connected  
✅ Database migrations applied automatically on every deploy  
✅ Environment variables and secrets configured  
✅ JWT authentication configured for admin dashboard  
✅ Webhooks configured for Xendit, PayMongo, and Telegram  
✅ Health checks passing  
✅ Logs accessible for monitoring  

Your PayBot application is now successfully deployed! 🚀

---

## AWS Deployment (ECS Fargate)

This guide provisions PayBot on AWS using **ECS Fargate** (containerised, serverless compute) with **RDS PostgreSQL** behind an **Application Load Balancer**.  The deployment is fully automated through GitHub Actions.

### Architecture overview

```
Internet → ALB (port 80 / 443)
             └─► ECS Fargate task (port 8000, public subnet)
                   └─► RDS PostgreSQL (private subnet)
```

All resources live in a dedicated VPC.  ECS tasks are placed in public subnets with public IPs so they can reach ECR, Telegram, Xendit, and PayMongo without a NAT Gateway (which saves cost).  RDS is placed in private subnets and is only reachable from within the VPC.

### Prerequisites

- An AWS account with permissions to create CloudFormation stacks, IAM roles, ECS, RDS, ECR, and ALB resources
- AWS CLI installed locally (`aws --version`)
- Docker installed locally (for the first manual image push, optional)
- GitHub repository access to add Secrets and Variables

### Step 1 — Deploy the CloudFormation infrastructure stack

The `aws/cloudformation.yml` template creates everything except the ECS service (which is managed by the GitHub Actions deploy workflow).

```bash
aws cloudformation deploy \
  --stack-name paybot \
  --template-file aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      EnvironmentName=paybot \
      DBPassword=<strong-random-password> \
      DBInstanceClass=db.t3.micro \
      CertificateArn=<your-acm-arn-or-leave-empty>
```

> ⏱ The stack takes 10–15 minutes to provision (RDS is the slowest resource).

After the stack is created, note the outputs — you will need them for GitHub secrets:

```bash
aws cloudformation describe-stacks \
  --stack-name paybot \
  --query 'Stacks[0].Outputs' \
  --output table
```

Key outputs:
| Output key | How it is used |
|---|---|
| `LoadBalancerDNS` | Your app's public URL; also set as `PYTHON_BACKEND_URL` |
| `DBEndpoint` | RDS hostname; used to build `DATABASE_URL` |
| `ECRRepositoryURI` | Push your Docker image here |

### Step 2 — Create an IAM user for GitHub Actions

Create a least-privilege IAM user that GitHub Actions will use to deploy:

```bash
# Create the user
aws iam create-user --user-name paybot-github-actions

# Attach a policy granting ECR push + ECS deploy + CloudFormation read access
aws iam attach-user-policy \
  --user-name paybot-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam attach-user-policy \
  --user-name paybot-github-actions \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

aws iam attach-user-policy \
  --user-name paybot-github-actions \
  --policy-arn arn:aws:iam::aws:policy/CloudFormationReadOnlyAccess

# Generate access keys
aws iam create-access-key --user-name paybot-github-actions
```

Save the `AccessKeyId` and `SecretAccessKey` — you will add them as GitHub Secrets below.

### Step 3 — Configure GitHub repository secrets

Go to **Settings → Secrets and variables → Actions** in your GitHub repository and add:

#### Required secrets

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key ID (from Step 2) |
| `AWS_SECRET_ACCESS_KEY` | IAM secret access key (from Step 2) |
| `DB_PASSWORD` | Same password passed to CloudFormation in Step 1 |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | Bot username (without `@`) |
| `TELEGRAM_ADMIN_IDS` | Comma-separated Telegram user IDs |
| `XENDIT_SECRET_KEY` | Xendit API secret key |
| `JWT_SECRET_KEY` | Run: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER_PASSWORD` | Password for the admin dashboard |

#### Optional secrets (add the ones you need)

| Secret name | Purpose |
|---|---|
| `PAYMONGO_SECRET_KEY` | PayMongo (cards, GCash, GrabPay, Maya) |
| `PAYMONGO_PUBLIC_KEY` | PayMongo public key |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook verification |
| `PHOTONPAY_APP_ID` | PhotonPay (Alipay / WeChat) |
| `PHOTONPAY_APP_SECRET` | PhotonPay app secret |
| `PHOTONPAY_SITE_ID` | PhotonPay site ID |
| `TRANSFI_API_KEY` | TransFi (alternative Alipay / WeChat) |
| `TRANSFI_WEBHOOK_SECRET` | TransFi webhook verification |

#### Repository variables (optional overrides)

| Variable name | Default | Purpose |
|---|---|---|
| `AWS_REGION` | `us-east-1` | AWS region where the stack was deployed |
| `AWS_CF_STACK_NAME` | `paybot` | CloudFormation stack name from Step 1 |

### Step 4 — Trigger the first deploy

Push a commit to `main` (or run the workflow manually via **Actions → Deploy to AWS → Run workflow**).

The workflow will:
1. Run backend tests
2. Build the Docker image and push it to ECR
3. Render the ECS task definition with your secrets
4. Register the task definition with ECS
5. Create the ECS service on first run (subsequent runs update it)
6. Wait for the service to stabilise

### Step 5 — Configure webhooks

After the first successful deploy, configure each payment gateway webhook to point to your ALB DNS name (from the `LoadBalancerDNS` CloudFormation output):

```
Xendit webhook:   http://<ALB-DNS>/api/v1/xendit/webhook
PayMongo webhook: http://<ALB-DNS>/api/v1/paymongo/webhook
Telegram webhook: http://<ALB-DNS>/api/v1/telegram/webhook
```

To register the Telegram webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=http://<ALB-DNS>/api/v1/telegram/webhook"
```

### Step 6 — (Recommended) Add HTTPS

1. Request a certificate in **AWS Certificate Manager (ACM)** for your domain
2. Update the CloudFormation stack with the certificate ARN:

```bash
aws cloudformation deploy \
  --stack-name paybot \
  --template-file aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      EnvironmentName=paybot \
      DBPassword=<same-as-before> \
      CertificateArn=arn:aws:acm:<region>:<account>:certificate/<id>
```

3. Create a CNAME or alias record in Route 53 (or your DNS provider) pointing your domain to the ALB DNS name.
4. Update `PYTHON_BACKEND_URL` in GitHub Secrets to use your `https://` domain, then redeploy.

### Monitoring & Logs

View container logs in the AWS Console:

**CloudWatch → Log groups → /ecs/paybot**

Or via CLI:

```bash
aws logs tail /ecs/paybot --follow
```

View ECS service events:

```bash
aws ecs describe-services \
  --cluster paybot-cluster \
  --services paybot-service \
  --query 'services[0].events[:10]'
```

### Scaling

To run more tasks for higher availability, update the service desired count:

```bash
aws ecs update-service \
  --cluster paybot-cluster \
  --service paybot-service \
  --desired-count 2
```

### Teardown

To delete all AWS resources:

```bash
# Delete the ECS service first
aws ecs update-service --cluster paybot-cluster --service paybot-service --desired-count 0
aws ecs delete-service --cluster paybot-cluster --service paybot-service

# Then delete the CloudFormation stack
# (RDS will create a final snapshot before deletion)
aws cloudformation delete-stack --stack-name paybot
```

### Cost estimate

With default settings (`db.t3.micro`, 1 Fargate task at 0.5 vCPU / 1 GB):

| Resource | Approx. monthly cost (us-east-1) |
|---|---|
| ECS Fargate (0.5 vCPU, 1 GB, 24/7) | ~$29 |
| RDS db.t3.micro (gp2 20 GB) | ~$15 |
| Application Load Balancer | ~$16 |
| ECR storage (< 1 GB) | < $0.10 |
| CloudWatch Logs | < $1 |
| **Total** | **~$61 / month** |

> 💡 Use **FARGATE_SPOT** to reduce compute costs by up to 70%.
> In `aws/task-definition.json` keep `"requiresCompatibilities": ["FARGATE"]` but add a
> `"capacityProviderStrategy"` to the `create-service` command in the workflow:
>
> ```bash
> --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1
> ```
>
> Remove the `--launch-type FARGATE` flag when using capacity provider strategy.
