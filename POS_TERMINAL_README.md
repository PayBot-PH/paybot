# Virtual POS Terminal System (Production)

PayBot's production-ready POS terminal engine enabling merchants to accept real-money payments via Cards, QRPH, and E-Wallets.

## 🌟 Production Features

### For Merchants
- **Terminal Provisioning**: One-click request for a virtual or physical POS device.
- **Immediate Settlement (T0)**: Funds are available in your wallet as soon as the customer pays.
- **Card Processing**: Native integration with Maya Business for Visa, MC, JCB, and AMEX.
- **Dashboard Visibility**: Track live sales and customer activity in real-time.

### For Administrators
- **Device Management**: Remote assignment and authorization of terminal hardware.
- **Transaction Audit**: Full ledger of every terminal sale with gateway reference IDs.
- **Remote Lock/Deactivate**: Instantly disable compromised or inactive terminals.

## 🛠 Integration Architecture

### 1. Payment Flow
- **Creation**: Mobile app sends request to `/api/v1/pos-terminals/{id}/transactions`.
- **Gateway**: Backend selects best path (Maya Card API, Maya QR, or PayMongo).
- **Checkout**: Customer scans QR or uses secure Webview for card entry.
- **Completion**: Gateway webhook notifies backend; Event Bus syncs to dashboard.

### 2. Security Model
- **Device ID Binding**: Sessions are tied to the `X-Device-ID` header.
- **Admin Elevation**: `admin@paybot.local` has Super Admin rights to manage all hardware.
- **PIN Lock**: Operator-level protection for terminal access.

## 🚀 Live Configuration

Ensure the following variables are set for production:

```env
MAYA_BUSINESS_MODE=live
MAYA_BUSINESS_API_KEY=pk-y7C...
MAYA_BUSINESS_SECRET_KEY=sk-iuh...
MAYA_BUSINESS_BASE_URL=https://api.paymaya.com
```

## 📱 Mobile App (Android)
The mobile app is located in `mobile/android/`. It communicates with the backend using the production URL configured in `src/Config.ts`.

### Quick Install
1. Download `paybot-pos-terminal-live.apk`.
2. Login with your merchant credentials.
3. If not yet assigned, contact your Super Admin with the Device ID shown on screen.

---
*Developed by DRL Solutions for the Philippine Market*
