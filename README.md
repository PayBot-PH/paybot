<p align="center">
  <img src="https://github.com/user-attachments/assets/3ff135b7-ed69-4b1b-889a-dbe0111de7dc" alt="PayBot Philippines" width="120" height="120" style="border-radius:24px;" />
</p>

<h1 align="center">PayBot Philippines</h1>
<p align="center"><strong>Enterprise-Grade Telegram Payment Platform for PH Merchants</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production--Live-success?style=for-the-badge&logo=statuspage" alt="Status: Production/Live" />
  <img src="https://img.shields.io/badge/Payments-Maya%20Business%20%7C%20PayMongo%20%7C%20PhotonPay-10B981?style=for-the-badge" alt="Payments" />
  <img src="https://img.shields.io/badge/Made%20for-Philippines-0EA5E9?style=for-the-badge" alt="Philippines" />
  <img src="https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-React%2018-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Python-FastAPI-009688?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/Maya%20Business-API-5D2E91?style=flat-square" />
  <img src="https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=flat-square&logo=telegram" />
</p>

---

## 🚀 Overview

**PayBot Philippines** is a robust, production-ready Telegram-based payment platform designed to transform any Telegram bot into a high-performance financial hub. It enables merchants to accept card payments, e-wallets, and bank transfers with enterprise-level security and real-time dashboard analytics.

The system is fully integrated with **Maya Business API**, **PayMongo**, and **PhotonPay**, offering seamless collection and disbursement capabilities tailored for the Philippine market.

---

## 🏗️ Production Architecture

PayBot is built with a modular, scalable architecture:

- **Backend**: Python FastAPI with SQLAlchemy ORM and PostgreSQL.
- **Frontend**: React 18 + Tailwind CSS + Shadcn UI.
- **Mobile**: React Native Android App for POS Terminals.
- **Infrastructure**: Optimized for **Railway** deployment with Docker support.

---

## ✨ Key Features (Live Ready)

### 💳 POS Terminal System (Android)
- **Direct Card Acceptance**: Process Visa, Mastercard, JCB, and AMEX via Maya Business.
- **T0 Instant Settlement**: Priority routing for immediate fund availability.
- **Dynamic QRPH**: Real-time generation of QRPH-compliant codes for customer scanning.
- **Operator PIN**: Secure 4-digit PIN locking for terminal operators.

### 💸 Multi-Gateway Payments
- **Maya Business**: Native card processing and Maya QR.
- **PayMongo**: GCash, GrabPay, and multi-method checkout sessions.
- **PhotonPay**: Specialized Alipay and WeChat Pay collection for international trade.

### 🏦 Digital Wallet Ecosystem
- **Instant KYB/KYC**: Guided registration flow via Telegram.
- **Multi-Currency**: Manage PHP, USD, and USDT (TRC20) in a single interface.
- **Peer-to-Peer**: Zero-fee instant transfers between platform users.
- **Auto-Sync**: Real-time balance updates across bot, mobile, and dashboard.

---

## 🔐 Security & Compliance

- **Enterprise Security**: JWT-based authentication with device binding.
- **Data Isolation**: Multi-tenant architecture ensuring users only access their own data.
- **Webhook Integrity**: HMAC-SHA256 and RSA-SHA256 signature verification for all payment callbacks.
- **Financial Grade**: integer-based centavo precision for all monetary calculations.

---

## 🌐 Deployment Status

| Service | Environment | Endpoint |
|---------|-------------|----------|
| **Admin Dashboard** | Production | `https://telegram.drl-developers.info` |
| **Backend API** | Production | `https://telegram.drl-developers.info/api/v1` |
| **Telegram Bot** | Live | [@QRPHBOT](https://t.me/QRPHBOT) |
| **Android APK** | Live | `paybot-pos-terminal-live.apk` |

---

## ⚙️ Quick Start (Production)

### Backend Setup
1. Configure `.env.production` with your live API keys (Maya, PayMongo, PhotonPay).
2. Set `ENVIRONMENT=production` and `MAYA_BUSINESS_MODE=live`.
3. Deploy to Railway or your preferred cloud provider.

### Mobile POS Setup
1. Update `mobile/android/src/Config.ts` with your production API URL.
2. Build the production APK:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./build_apk.ps1
   ```
3. Distribute the `app-release.apk` to your terminal devices.

---

## 📄 Documentation

- [Backend Documentation](backend/README.md)
- [POS Terminal System Guide](POS_TERMINAL_README.md)
- [Deployment Checklist](PRODUCTION_CHECKLIST.md)
- [Mobile Android Guide](mobile/android/README.md)

---

## 🙏 Credits & Acknowledgments

Developed by **Sir Den Russell "Camus" Leonardo** and the **DRL Solutions** team.

**Powered by:**
[Maya Business](https://www.maya.ph/business) · [PayMongo](https://www.paymongo.com/) · [PhotonPay](https://www.photonpay.com/) · [Telegram](https://core.telegram.org/)

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/3ff135b7-ed69-4b1b-889a-dbe0111de7dc" alt="PayBot" width="60" style="border-radius:12px;" />
  <br/>
  <strong>PayBot Philippines</strong> — Building the future of PH social commerce.
</p>
