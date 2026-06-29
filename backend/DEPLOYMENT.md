Deployment notes
----------------

1) Alembic migration

- After pulling these changes, run the alembic migration to add the unique index:

```bash
cd backend
alembic upgrade head
```

- If your production DB contains duplicate `(service_name, config_key)` rows, the migration attempts to deduplicate by keeping the row with the highest `id`. Review and back up your DB before running migrations.

2) MASK_KEY env var

- The `config_value` field is now encrypted at rest using `core.mask_crypto`. Set a strong `MASK_KEY` in your environment for production, e.g.:

```bash
export MASK_KEY="$(openssl rand -base64 32)"
```

Without `MASK_KEY`, the code falls back to an internal key (not secure). Keep `MASK_KEY` secret and rotate as needed.

3) Running tests and CI

- A GitHub Actions workflow `.github/workflows/ci.yml` is included to build the frontend and run backend tests on PRs and pushes to `main`.

4) Post-deploy verification

- After deploying and running migrations, verify the admin API keys list in the Admin UI and confirm that values are masked.
