# PayBot Admin Dashboard

The primary web interface for merchants and administrators to manage the PayBot ecosystem.

## 🚀 Features

- **Real-time Analytics**: Live sales tracking and successful payment metrics.
- **Wallet Management**: Visual oversight of PHP/USD balances and TRC20 addresses.
- **Terminal Control**: Remote management and assignment of POS hardware.
- **KYB/KYC Review**: Approval interface for new merchant registrations.
- **Payment Tools**: Generate invoices, links, and QR codes directly from the browser.

## 🛠 Tech Stack

- **React 18** with **Vite** for fast development.
- **TypeScript** for type-safe data handling.
- **Tailwind CSS** & **Shadcn UI** for a modern, responsive interface.
- **Axios** for backend communication.

## 📁 Project Structure

- `src/pages`: Dashboard views (Transactions, Wallets, Settings, etc.)
- `src/components`: Reusable UI elements and Layout wrapper.
- `src/lib`: API client setup and utility functions.
- `src/contexts`: Authentication and Theme state management.

## ⚙️ Development & Build

### Local Development
```bash
pnpm install
pnpm run dev
```

### Production Build
```bash
pnpm run build
```
The output will be in the `dist/` directory, which is served by the backend in production mode.

---
*Developed by DRL Solutions*
