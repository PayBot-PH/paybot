# Deploying PayBot to Railway

This document explains how to deploy the PayBot application to Railway using GitHub Actions.

Prerequisites
- A Railway account and an existing Railway Project (create one at https://railway.app).
- A Railway API Key with permissions to deploy to the project.
- The repository pushed to GitHub (this repo).

Setup
1. In your GitHub repository, go to Settings → Secrets → Actions and add the following secrets:
   - `RAILWAY_API_KEY` — your Railway API key
   - `RAILWAY_PROJECT_ID` — the Railway project id (you can find this in the Railway project settings or `railway status`)

2. The repository already includes a workflow: `.github/workflows/deploy-railway.yml` which builds and deploys the app.

How the workflow works
- On `push` to `main` or when manually triggered, the workflow builds the Docker image (backend/Dockerfile is used when building locally; the workflow builds from repository root), installs the Railway CLI, logs in, and runs `railway up` to deploy the project to the `production` environment.

Manual deployment (local)
If you prefer to deploy from your machine instead of GitHub Actions:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login with API key
railway login --apiKey YOUR_API_KEY

# Deploy (from repo root)
railway up --projectId YOUR_PROJECT_ID --environment production --detach --yes
```

Notes & troubleshooting
- If the GitHub Action fails with permission errors, ensure the `RAILWAY_API_KEY` is correct and has the right scopes.
- The action builds with Docker; if Railway needs to build the frontend differently, adjust the Dockerfile or CI build steps.
- For secure rollout, consider adding environment variables (DB, secrets) in Railway project settings.
