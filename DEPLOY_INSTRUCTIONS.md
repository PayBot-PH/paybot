# Deployment Instructions and Next Steps

I ran local verification steps and prepared helper scripts; here's how to deploy.

## What I did locally
- Created `GITHUB_SECRETS_COPYPASTE.md` with a copy/paste checklist.
- Created helper scripts: `scripts/deploy_railway.sh` and `scripts/deploy_cloud_run.sh`.
- Ran backend tests: **169 passed, 6 skipped** (see backend pytest output in terminal).
- Verified frontend `dist/` exists (`frontend/dist/`).

## How to deploy via GitHub Actions (recommended)
1. Add the required secrets (use `GITHUB_SECRETS_COPYPASTE.md`): go to Settings → Secrets and variables → Actions in your GitHub repo and add the required secrets for your target (Railway / Cloud Run / AWS).
2. Push your changes to `main` or open a PR — workflows run on pushes and PRs to `main`.
3. Or manually trigger a workflow in the Actions tab: select `.github/workflows/deploy-railway.yml` (or `cloud-run-deploy.yml`) and click "Run workflow".

## How to deploy locally (if you prefer)
Railway (local):

```bash
# set env vars, e.g. in your shell
export RAILWAY_API_KEY="..."
export RAILWAY_PROJECT_ID="..."
# then run helper script
bash scripts/deploy_railway.sh
```

Cloud Run (local):

```bash
export GCP_PROJECT="..."
export CLOUD_RUN_SERVICE="..."
export CLOUD_RUN_REGION="..."
# ensure gcloud is authenticated
gcloud auth login
bash scripts/deploy_cloud_run.sh
```

## Why I couldn't deploy automatically from here
- Deployment requires private secrets (Railway/GCP/AWS keys) and authenticated CLIs. I don't have access to those credentials from this environment.

## Options I can do next (choose one)
- I can create a GitHub Issue template with the secret checklist so collaborators can fill it in.
- I can prepare a PR containing the scripts and checklist (already added files) and open it for review.
- If you provide temporary secrets (not recommended in chat), I can attempt a local deploy.
- Or you can add the secrets to GitHub and trigger the workflow; I can then monitor the run if you give me the run URL.

