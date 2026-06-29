#!/usr/bin/env bash
set -euo pipefail

if [ -z "${KEYSTORE_BASE64:-}" ]; then
  echo "KEYSTORE_BASE64 not set"
  exit 1
fi

echo "$KEYSTORE_BASE64" | base64 --decode > keystore.jks
echo "Wrote keystore.jks"
