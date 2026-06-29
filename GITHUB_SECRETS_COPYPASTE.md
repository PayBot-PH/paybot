# GitHub Actions Secrets — Copy/Paste Checklist

Paste each value into **Settings → Secrets and variables → Actions** as a new secret.

---

# Railway

RAILWAY_API_KEY=
RAILWAY_PROJECT_ID=
VITE_TURNSTILE_SITE_KEY= (optional)
CF_API_TOKEN= (optional)
CF_ZONE_ID= (optional)

---

# Cloud Run (GCP)

GCP_SA_KEY= (paste full JSON service account key)
GCP_PROJECT=
CLOUD_RUN_SERVICE=
CLOUD_RUN_REGION=

---

# AWS (ECS / Fargate / Lightsail)

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
DB_PASSWORD=
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_ADMIN_IDS=
JWT_SECRET_KEY=
ADMIN_USER_PASSWORD=
XENDIT_SECRET_KEY= (legacy/optional)
PAYMONGO_SECRET_KEY= (optional)
PAYMONGO_PUBLIC_KEY= (optional)
PAYMONGO_WEBHOOK_SECRET= (optional)
PHOTONPAY_APP_ID= (optional)
PHOTONPAY_APP_SECRET=d45dcc80d0f9f9f9a63c5d0b0bf9f9f9eeb5eef9
PHOTONPAY_SITE_ID= (optional)
TRANSFI_API_KEY= (optional)
TRANSFI_WEBHOOK_SECRET= (optional)

---

# EC2 deploy

EC2_HOST=
EC2_USER=
EC2_SSH_KEY= (paste PEM private key contents)
EC2_APP_DIR=

---

# Generic

GITHUB_TOKEN= (provided by Actions)
RAILWAY_TOKEN= (alternate to RAILWAY_API_KEY)
RAILWAY_SERVICE=
RAILWAY_SERVICE_ID=
CF_API_TOKEN=
CF_ZONE_ID=

# Notes

- For multiline secrets (JSON, PEM), paste the exact content preserving newlines.
- If you use GitHub repository Variables (`Settings → Secrets and variables → Actions → Variables`),
  set `RAILWAY_SERVICE` or other gating variables there as needed.
- After adding secrets, run the appropriate workflow manually from Actions to verify.
