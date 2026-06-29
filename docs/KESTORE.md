Keystore generation and GitHub Secrets

This document describes how to generate an Android keystore for signing the APK and how to add the necessary GitHub secrets for CI.

1) Generate keystore locally (Linux/macOS/WSL)

```bash
# run from repo root
bash scripts/generate_keystore.sh
```

The script will create `mobile/keystore.jks` and `mobile/keystore.jks.base64`.

2) Add GitHub secrets

- `KEYSTORE_BASE64`: contents of `mobile/keystore.jks.base64`
- `KEYSTORE_PASSWORD`: the keystore password used when generating
- `KEY_PASSWORD`: the key password used when generating
- `KEY_ALIAS`: the key alias (default `paybot`)

Use the GitHub web UI or `gh` CLI to add secrets.

3) Local testing

For local testing (do not commit), create `mobile/gradle.properties` with:

```
STORE_FILE=mobile/keystore.jks
STORE_PASSWORD=your_store_password
KEY_ALIAS=your_alias
KEY_PASSWORD=your_key_password
```

4) Re-run CI

After adding the secrets, trigger the Android workflow in `.github/workflows/android-release.yml` or `android-build.yml` to produce a signed APK.

Security note: Never commit passwords or keystore files to a public repo. The script writes a local keystore only; the base64 blob should be added to GitHub Secrets.
