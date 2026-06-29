# xend Deployment Guide

## Table of Contents
1. [AWS Elastic Beanstalk Deployment](#aws-elastic-beanstalk-deployment)
2. [Android APK Build](#android-apk-build)
3. [Environment Variables](#environment-variables)
4. [Troubleshooting](#troubleshooting)

---

## AWS Elastic Beanstalk Deployment

### Prerequisites

1. **AWS Account** with permissions for:
   - EC2
   - Elastic Beanstalk
   - ECR (Elastic Container Registry)
   - RDS (for PostgreSQL)
   - IAM

2. **Install AWS CLI**
   ```bash
   pip install awscli --upgrade
   ```

3. **Install EB CLI**
   ```bash
   pip install awsebcli --upgrade
   ```

4. **Configure AWS Credentials**
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, region (ap-southeast-1), and output format (json)
   ```

### Step 1: Initial Setup

1. **Initialize EB Application** (first time only)
   ```bash
   eb init -p docker paybot --region ap-southeast-1
   ```

2. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name paybot --region ap-southeast-1
   ```

3. **Get your AWS Account ID**
   ```bash
   aws sts get-caller-identity --query Account --output text
   ```

### Step 2: Prepare Environment Variables

Create or update `.env` in the repository root with your credentials:

```bash
# AWS Configuration
export AWS_ACCOUNT_ID="your-12-digit-account-id"
export AWS_REGION="ap-southeast-1"
export EB_APP_NAME="paybot"
export EB_ENV_NAME="paybot-production"

# Frontend
export VITE_TURNSTILE_SITE_KEY="your-turnstile-site-key"
export VITE_TELEGRAM_BOT_USERNAME="your_bot_username"

# Backend - Payment Services
export XENDIT_SECRET_KEY="your-xendit-secret"
export PAYMONGO_SECRET_KEY="your-paymongo-secret"
export PAYMONGO_PUBLIC_KEY="your-paymongo-public"
export PAYMONGO_WEBHOOK_SECRET="your-webhook-secret"

# Backend - Telegram
export TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
export TELEGRAM_ADMIN_IDS="@username,123456789"

# Backend - Security
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")

# Backend - PhotonPay (if using)
export PHOTONPAY_APP_ID="your-app-id"
export PHOTONPAY_APP_SECRET="your-app-secret"
export PHOTONPAY_SITE_ID="your-site-id"

# Backend - Database (PostgreSQL recommended for production)
# AWS RDS PostgreSQL connection string
export DATABASE_URL="postgresql://username:password@paybot-db.xxxxx.ap-southeast-1.rds.amazonaws.com:5432/paybot"

# Backend - URL Configuration
export PYTHON_BACKEND_URL="https://paybot-eb-domain.elasticbeanstalk.com"
export ALLOWED_ORIGINS="https://paybot-eb-domain.elasticbeanstalk.com,http://localhost:3000"
```

### Step 3: Deploy to Elastic Beanstalk

1. **Make the deployment script executable**
   ```bash
   chmod +x deploy-eb.sh
   ```

2. **Load environment variables**
   ```bash
   source .env
   ```

3. **Run the deployment script**
   ```bash
   ./deploy-eb.sh
   ```

4. **Monitor deployment**
   ```bash
   # Check status
   eb status
   
   # View logs
   eb logs --all --stream
   
   # SSH into instance
   eb ssh
   ```

### Step 4: Configure RDS Database (Optional but Recommended)

For production, use Amazon RDS instead of SQLite:

1. **Create RDS PostgreSQL Instance**
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier paybot-db \
     --db-instance-class db.t3.micro \
     --engine postgres \
     --master-username postgres \
     --master-user-password "strong-password" \
     --allocated-storage 20 \
     --publicly-accessible \
     --region ap-southeast-1
   ```

2. **Wait for creation** (5-10 minutes), then get the endpoint
   ```bash
   aws rds describe-db-instances --db-instance-identifier paybot-db \
     --query 'DBInstances[0].Endpoint.Address' --output text
   ```

3. **Update DATABASE_URL in EB environment**
   ```bash
   eb setenv DATABASE_URL="postgresql://postgres:password@paybot-db.xxxxx.rds.amazonaws.com:5432/paybot"
   ```

### Step 5: Set Up SSL Certificate (Recommended)

1. **Request certificate in AWS Certificate Manager**
   ```bash
   aws acm request-certificate \
     --domain-name paybot.your-domain.com \
     --validation-method DNS \
     --region ap-southeast-1
   ```

2. **Complete DNS validation** in your domain registrar

3. **Attach to EB environment** via AWS Console or CLI

---

## Android APK Build

### Prerequisites

1. **Node.js** >= 20.19.4
   ```bash
   node --version  # should be v20.19.4 or higher
   ```

2. **JDK 17** (required for React Native 0.72+)

   **macOS (Homebrew):**
   ```bash
   brew install openjdk@17
   export JAVA_HOME=$(/usr/libexec/java_home -v 17)
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt-get install openjdk-17-jdk
   export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
   ```

   **Windows:**
   - Download from [oracle.com](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html)
   - Or install via: `choco install openjdk17`

3. **Android SDK** (via Android Studio)
   - Install Android Studio
   - Open SDK Manager (Tools → SDK Manager)
   - Install Android SDK API 33+
   - Install Android Build Tools 33.0.0+

4. **Gradle** (comes with React Native)

### Step 1: Generate Signing Keystore

Run this once to create your release signing key:

```bash
cd mobile/android/app

keytool -genkey -v \
  -keystore paybot-release-key.keystore \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias paybot \
  -keypass your-key-password \
  -storepass your-keystore-password

# Keep this file safe! Add to .gitignore
cd ../../..
echo "mobile/android/app/paybot-release-key.keystore" >> .gitignore
```

**IMPORTANT:** Back up this keystore file securely. Losing it means you can't update your app on Google Play.

### Step 2: Set Up Environment Variables

```bash
export KEYSTORE_PASSWORD="your-keystore-password"
export KEY_ALIAS="paybot"
export KEY_PASSWORD="your-key-password"
```

Or create `mobile/.env.build`:
```bash
KEYSTORE_PASSWORD=your-keystore-password
KEY_ALIAS=paybot
KEY_PASSWORD=your-key-password
```

### Step 3: Install Dependencies

```bash
cd mobile
npm install
# or
pnpm install
```

### Step 4: Build APK

**Release APK (for Google Play):**
```bash
chmod +x build-apk.sh
./build-apk.sh
```

Output: `mobile/android/app/build/outputs/apk/release/app-release.apk`

**Debug APK (for testing):**
```bash
cd mobile/android
./gradlew assembleDebug
cd ../..
```

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Step 5: Install on Device

**Test Release APK:**
```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

**Test Debug APK:**
```bash
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 6: Upload to Google Play Store

1. **Build App Bundle** (recommended format for Play Store)
   ```bash
   chmod +x mobile/release-to-playstore.sh
   ./mobile/release-to-playstore.sh
   ```

   Output: `mobile/android/app/build/outputs/bundle/release/app-release.aab`

2. **Log in to Google Play Console**
   - Go to https://play.google.com/console
   - Select xend app

3. **Create Release**
   - Go to Release → Production
   - Click "Create Release"
   - Upload the AAB file
   - Review store listing
   - Submit for review

---

## Environment Variables

### Backend (.env)

| Variable | Required | Purpose |
|----------|----------|----------|
| `DATABASE_URL` | Yes | Database connection (SQLite or PostgreSQL) |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_ADMIN_IDS` | Yes | Admin user IDs for dashboard access |
| `JWT_SECRET_KEY` | Yes | JWT secret for authentication |
| `XENDIT_SECRET_KEY` | Yes | Xendit payment gateway API key |
| `PAYMONGO_SECRET_KEY` | Yes | PayMongo API secret key |
| `PAYMONGO_PUBLIC_KEY` | Yes | PayMongo public key |
| `PYTHON_BACKEND_URL` | Yes | Backend URL for webhooks |
| `ENVIRONMENT` | Yes | Set to `production` |
| `LOG_LEVEL` | No | Logging level (default: `info`) |

### Frontend (.env or via build args)

| Variable | Required | Purpose |
|----------|----------|----------|
| `VITE_API_URL` | Yes | Backend API URL |
| `VITE_TELEGRAM_BOT_USERNAME` | Yes | Telegram bot username |
| `VITE_TURNSTILE_SITE_KEY` | No | Cloudflare Turnstile site key |

### Mobile (app.config.json)

| Variable | Purpose |
|----------|----------|
| `apiBaseUrl` | Backend API endpoint |
| `telegramBotUsername` | Telegram bot for login |
| `version` | App version |
| `buildNumber` | Build number for Play Store |

---

## Troubleshooting

### Elastic Beanstalk Issues

**Deployment stuck or slow:**
```bash
eb abort
eb deploy --verbose
```

**Check logs:**
```bash
eb logs --all --stream
# or
eb ssh
tail -f /var/log/eb-activity.log
```

**Environment issues:**
```bash
eb health --refresh
eb config  # Edit configuration
```

**Database connection errors:**
```bash
# Check RDS security group
aws rds describe-db-instances --db-instance-identifier paybot-db

# Test connection locally
psql postgresql://username:password@endpoint:5432/paybot
```

### Android Build Issues

**Gradle daemon issues:**
```bash
cd mobile/android
./gradlew --stop
./gradlew clean
./gradlew assembleRelease
```

**Java version mismatch:**
```bash
echo $JAVA_HOME
java -version  # Should show version 17
```

**Dependencies not found:**
```bash
cd mobile
npm install --frozen-lockfile
cd android
./gradlew --refresh-dependencies
```

**Keystore password errors:**
```bash
# Verify keystore validity
keytool -list -v -keystore android/app/paybot-release-key.keystore
```

**APK not signed:**
```bash
# Verify APK signature
jarsigner -verify -verbose android/app/build/outputs/apk/release/app-release.apk
```

### Common Errors

| Error | Solution |
|-------|----------|
| `no space left on device` | Clean EB instance cache: `eb ssh`, `sudo rm -rf /var/cache/*` |
| `Database connection refused` | Check RDS security group allows EB instance |
| `CORS errors` | Update `ALLOWED_ORIGINS` env var |
| `Telegram webhook failed` | Ensure `PYTHON_BACKEND_URL` is publicly accessible |
| `Signing certificate not recognized` | Re-generate keystore with correct password |

---

## Monitoring & Maintenance

### EB Monitoring

```bash
# CPU, memory, network stats
eb health

# View custom metrics
aws cloudwatch list-metrics --namespace AWS/ElasticBeanstalk

# Create alarms
aws cloudwatch put-metric-alarm \
  --alarm-name paybot-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --namespace AWS/ElasticBeanstalk \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

### Railway Monitoring

If you deploy xend to Railway, use Railway CLI logs and helper scripts to monitor production.

```bash
export RAILWAY_PROJECT_ID="your_project_id"
railway logs --project "$RAILWAY_PROJECT_ID" --service paybot --environment production --follow
railway logs --project "$RAILWAY_PROJECT_ID" --service paybot --environment production --http --lines 100
bash scripts/railway-monitor.sh --project "$RAILWAY_PROJECT_ID" --follow
bash scripts/railway-monitor.sh --project "$RAILWAY_PROJECT_ID" --latest --follow
```

Use `--health` after monitoring to validate the backend health endpoint:

```bash
bash scripts/railway-monitor.sh --project "$RAILWAY_PROJECT_ID" --health "https://mayaproduction.up.railway.app/health"
```

### Database Backups

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier paybot-db \
  --db-snapshot-identifier paybot-snapshot-$(date +%Y%m%d)

# List snapshots
aws rds describe-db-snapshots --db-instance-identifier paybot-db
```

### View Logs

```bash
# Stream logs
eb logs --stream

# Download logs
eb logs

# SSH and check app logs
eb ssh
tail -f /var/log/eb-docker/eb-engine.log
```

---

## Rollback

```bash
# Show deployment history
eb appversion

# Rollback to previous version
eb abort  # Cancel current deployment
# or
eb config  # Change EnvironmentVersion

# Manually rollback
aws elasticbeanstalk update-environment \
  --application-name paybot \
  --environment-name paybot-production \
  --version-label previous-version-label
```

---

## Next Steps

1. ✅ Deploy backend to EB
2. ✅ Set up RDS PostgreSQL
3. ✅ Configure domain & SSL
4. ✅ Build and test Android APK
5. ✅ Submit app to Google Play
6. ✅ Monitor logs and metrics
7. ✅ Set up CI/CD pipeline (GitHub Actions)

For more help, check AWS docs: https://docs.aws.amazon.com/elasticbeanstalk/
