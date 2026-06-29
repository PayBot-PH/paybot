# Industrial Terminal Node Signing & Distribution

This guide details the cryptographic signing protocols for the xend industrial Android terminal nodes.

## 🔐 Institutional Signing Setup

1. **Hardware Security Module (HSM) / Key Generation**:
   Generate an institutional-grade release keystore for production nodes:

   ```bash
   keytool -genkeypair -v \
     -keystore paybot-mainnet-key.keystore \
     -alias industrial-node \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Secure Vault Injection**:
   Encode the keystore as base64 for secure storage in the institutional vault (GitHub Secrets):

   ```bash
   base64 -w0 paybot-mainnet-key.keystore > keystore.base64
   ```

3. **Node Distribution Secrets**:
   Configure the following in the production vault:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

## 📟 Industrial Node Capabilities
- **Ultra T+0 Settlement Grid**: Verified hardware nodes process Maya/Security Bank payments with immediate liquidation.
- **Dynamic Industrial QR**: Real-time generation of interoperable QRPH codes for universal customer acceptance.
- **Hardware-Level Reconciliation**: Autonomous payment detection protocols for ultra-low latency clearing.

## 🏗️ Production Compliance
- The build pipeline utilizes `v1.2.4-stable` industrial libraries.
- The resulting `app-release.apk` is verified against the `PB-2024-05` compliance seed.
- **Crucial**: Institutional keys must NEVER be stored in the source grid.

---
*© 2024 xend Infrastructure Engineering*
