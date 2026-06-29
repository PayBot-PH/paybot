#!/usr/bin/env bash
set -euo pipefail

# generate_keystore.sh
# Generates an Android keystore at mobile/keystore.jks, writes a base64 file,
# and prints GitHub-secret commands you can run locally to set secrets.

OUT_DIR="mobile"
KEYSTORE_PATH="$OUT_DIR/keystore.jks"
BASE64_PATH="$OUT_DIR/keystore.jks.base64"

KEY_ALIAS="paybot"
KEYSTORE_PASSWORD="changeit"
KEY_PASSWORD="changeit"
VALIDITY_DAYS=10000

usage(){
  cat <<EOF
Usage: $0 [--alias NAME] [--storepass PASS] [--keypass PASS] [--out DIR]

Generates a keystore and prints a base64 blob and sample GitHub secret commands.
Defaults:
  alias: $KEY_ALIAS
  storepass: $KEYSTORE_PASSWORD
  keypass: $KEY_PASSWORD
  out dir: $OUT_DIR
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --alias) KEY_ALIAS="$2"; shift 2;;
    --storepass) KEYSTORE_PASSWORD="$2"; shift 2;;
    --keypass) KEY_PASSWORD="$2"; shift 2;;
    --out) OUT_DIR="$2"; KEYSTORE_PATH="$OUT_DIR/keystore.jks"; BASE64_PATH="$OUT_DIR/keystore.jks.base64"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 2;;
  esac
done

mkdir -p "$OUT_DIR"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install JDK or run this in WSL/macOS with keytool available." >&2
  exit 1
fi

echo "Generating keystore: $KEYSTORE_PATH"
keytool -genkeypair \
  -alias "$KEY_ALIAS" \
  -keyalg RSA -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=PayBot, OU=Dev, O=PayBot, L=Manila, ST=Metro, C=PH"

if ! command -v base64 >/dev/null 2>&1; then
  # fallback to openssl
  if command -v openssl >/dev/null 2>&1; then
    openssl base64 -A -in "$KEYSTORE_PATH" -out "$BASE64_PATH"
  else
    echo "base64 utility not found and openssl not found. Cannot create base64 blob." >&2
    exit 1
  fi
else
  base64 -w0 "$KEYSTORE_PATH" > "$BASE64_PATH"
fi

echo
echo "Keystore generated: $KEYSTORE_PATH"
echo "Base64 blob written: $BASE64_PATH"
echo
echo "Add the following secrets to your GitHub repository (via web UI or 'gh secret set')"
echo
echo "SECRET: KEYSTORE_BASE64"
echo "VALUE: (contents of $BASE64_PATH)"
echo
echo "Example using gh CLI (will prompt for the secret value):"
echo "  gh secret set KEYSTORE_BASE64 --body \""
echo "  $(sed -n '1,3p' "$BASE64_PATH")... (truncated)" 2>/dev/null || true
echo
echo "Also add these secrets (use your chosen passwords/alias):"
echo "  gh secret set KEYSTORE_PASSWORD --body '$KEYSTORE_PASSWORD'"
echo "  gh secret set KEY_PASSWORD --body '$KEY_PASSWORD'"
echo "  gh secret set KEY_ALIAS --body '$KEY_ALIAS'"
echo
echo "For local testing, create mobile/gradle.properties with the following content (DO NOT commit):"
cat <<EOF
STORE_FILE=$KEYSTORE_PATH
STORE_PASSWORD=$KEYSTORE_PASSWORD
KEY_ALIAS=$KEY_ALIAS
KEY_PASSWORD=$KEY_PASSWORD
EOF

echo
echo "Script complete. After adding secrets, re-run the GitHub Actions workflow to produce a signed APK."
