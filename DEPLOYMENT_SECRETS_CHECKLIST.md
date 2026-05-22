# Deployment Secrets Checklist

This file lists the GitHub Actions Secrets and Variables referenced by the repository's workflows. Copy each required secret name into GitHub → Settings → Secrets and variables → Actions.

---

**Railway**
- Required Secrets:
  - RAILWAY_API_KEY (or RAILWAY_TOKEN)
  - RAILWAY_PROJECT_ID (or RAILWAY_SERVICE_ID / RAILWAY_SERVICE)
- Optional:
  - VITE_TURNSTILE_SITE_KEY
  - CF_API_TOKEN (Cloudflare purge)
  - CF_ZONE_ID

Notes: `RAILWAY_TOKEN` can be provided as a repository Secret or the workflow may read repository Variables fallback `vars.RAILWAY_TOKEN` / `vars.RAILWAY_SERVICE`.

---

**Cloud Run (GCP)**
- Required Secrets:
  - GCP_SA_KEY (JSON service account key, multiline)
  - GCP_PROJECT
  - CLOUD_RUN_SERVICE
  - CLOUD_RUN_REGION

Notes: `GCP_SA_KEY` must be the full JSON key content (multiline). Ensure `export_default_credentials: true` is allowed by the action.

---

**AWS (ECS / Fargate)**
- Required Secrets:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - DB_PASSWORD (used to render `DATABASE_URL` in the workflow)
- Application secrets injected into task definition (required/expected):
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_BOT_USERNAME
  - TELEGRAM_ADMIN_IDS
  - JWT_SECRET_KEY
  - ADMIN_USER_PASSWORD
  - XENDIT_SECRET_KEY (legacy / optional)
- Optional payment gateway secrets (only if you use them):
  - PAYMONGO_SECRET_KEY
  - PAYMONGO_PUBLIC_KEY
  - PAYMONGO_WEBHOOK_SECRET
  - PHOTONPAY_APP_ID
  - PHOTONPAY_APP_SECRET
  - PHOTONPAY_SITE_ID
  - TRANSFI_API_KEY
  - TRANSFI_WEBHOOK_SECRET

Notes: Some workflows also accept `DATABASE_URL` directly as a secret (Lightsail workflow). Confirm which deploy target you're using.

---

**EC2 (SSH-based deploy)**
- Required Secrets:
  - EC2_HOST
  - EC2_USER
  - EC2_SSH_KEY (PEM private key contents, multiline)
  - EC2_APP_DIR
- Also used: `GITHUB_TOKEN` (provided by Actions automatically) for GHCR auth in some steps.

---

**Lightsail**
- Required Secrets / Env:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - DATABASE_URL (optional; otherwise falls back to SQLite)
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_BOT_USERNAME
  - TELEGRAM_ADMIN_IDS
  - JWT_SECRET_KEY
  - ADMIN_USER_PASSWORD
  - XENDIT_SECRET_KEY (legacy / optional)
  - Optional payment gateway secrets same as AWS section above

---

**Additional / Generic secrets referenced**
- GITHUB_TOKEN (provided by Actions; used for GHCR login in some workflows)
- RAILWAY_SERVICE, RAILWAY_SERVICE_ID (repository Variables or Secrets used as service selectors)
- VITE_TURNSTILE_SITE_KEY
- CF_API_TOKEN and CF_ZONE_ID (Cloudflare purge)

---

Tips for adding secrets
- For multiline secrets (JSON keys, PEMs): paste the full contents, preserving newlines.
- For repository Variables vs Secrets: workflows sometimes fallback to `vars.*`; set both if you use Variables.
- To validate: go to Actions → select the workflow → Run workflow (manual) and watch logs for missing-secret warnings.

---

If you want, I can also:
- Produce a GitHub UI checklist (copy/paste friendly) for each secret.
- Create a `.github/ISSUE_TEMPLATE/deploy-checklist.md` with this checklist to track deployment readiness.

