#!/bin/sh
set -euo pipefail

# backend/entrypoint.sh
# Waits for the database to become reachable (when DATABASE_URL is a TCP URL),
# runs alembic migrations with retries, then execs uvicorn so signals are handled
# correctly by the container runtime.

echo "[entrypoint] starting"

# If DATABASE_URL is empty or appears to be sqlite, skip waiting
DB_URL=${DATABASE_URL:-}
if [ -z "$DB_URL" ] || echo "$DB_URL" | grep -q '^sqlite'; then
  echo "[entrypoint] no remote database to wait for (sqlite or DATABASE_URL unset)"
else
  echo "[entrypoint] waiting for database to become available..."
  python - <<'PY'
import os, time, socket
from urllib.parse import urlparse

db_url = os.environ.get('DATABASE_URL', '')
if not db_url:
    print('No DATABASE_URL; skipping wait')
    raise SystemExit(0)

u = urlparse(db_url)
host = u.hostname
port = u.port
scheme = (u.scheme or '').lower()
# default postgres port
if port is None and scheme.startswith('postgres'):
    port = 5432

if not host or not port:
    print('Could not determine host/port from DATABASE_URL; skipping wait')
    raise SystemExit(0)

print(f'Attempting TCP connect to {host}:{port}')
max_tries = int(os.environ.get('DB_WAIT_MAX_TRIES', '60'))
for i in range(max_tries):
    try:
        sock = socket.create_connection((host, port), timeout=5)
        sock.close()
        print('\nDatabase reachable')
        raise SystemExit(0)
    except Exception:
        print('.', end='', flush=True)
        time.sleep(1)
print('\nTimed out waiting for database')
raise SystemExit(1)
PY
fi

# Run alembic migrations with a few retries but don't loop forever
MIGRATION_MAX_RETRIES=${MIGRATION_MAX_RETRIES:-3}
RETRY_DELAY=${MIGRATION_RETRY_DELAY:-5}

i=0
while [ "$i" -lt "$MIGRATION_MAX_RETRIES" ]; do
  i=$((i+1))
  echo "[entrypoint] running migrations (attempt $i of $MIGRATION_MAX_RETRIES)"
  if alembic upgrade head; then
    echo "[entrypoint] migrations applied"
    break
  else
    echo "[entrypoint] alembic attempt $i failed"
    if [ "$i" -lt "$MIGRATION_MAX_RETRIES" ]; then
      echo "[entrypoint] retrying in ${RETRY_DELAY}s..."
      sleep ${RETRY_DELAY}
    fi
  fi
done

# Start the app
echo "[entrypoint] starting uvicorn"
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info
