# Telegram Bot + Xendit Payment Admin Dashboard

## Design Guidelines

### Design References
- **Stripe Dashboard**: Clean, professional fintech UI
- **Telegram Web**: Modern messaging-inspired interface
- **Style**: Modern Dark Fintech + Professional Admin

### Color Palette
- Primary: #0F172A (Dark Navy - background)
- Secondary: #1E293B (Slate - cards/sections)
- Accent: #3B82F6 (Blue - CTAs and highlights)
- Success: #22C55E (Green - paid/active)
- Warning: #F59E0B (Amber - pending)
- Danger: #EF4444 (Red - errors/expired)
- Text: #F8FAFC (White), #94A3B8 (Slate Gray - secondary)

### Typography
- Headings: Inter font-weight 700
- Body: Inter font-weight 400
- Monospace: JetBrains Mono (for IDs, amounts)

### Key Component Styles
- Cards: Dark slate (#1E293B), border (#334155), 12px rounded
- Buttons: Blue (#3B82F6), white text, 8px rounded
- Tables: Striped rows, hover highlight
- Status badges: Colored pills (green=paid, amber=pending, red=expired)

### Images to Generate
1. hero-payment-dashboard.jpg - Modern fintech dashboard with payment analytics, dark theme
2. telegram-bot-illustration.jpg - Telegram bot with payment icons, modern illustration style
3. xendit-integration.jpg - Payment gateway integration concept, modern tech style
4. qr-code-payment.jpg - QR code payment concept with mobile phone, modern style

---

## Development Tasks

### Backend (4 files)
1. `backend/services/xendit_service.py` - Xendit API integration service (create invoice, QR code, payment link)
2. `backend/routers/xendit.py` - Xendit API routes (create-invoice, create-qr-code, create-payment-link, webhook, stats)
3. `backend/services/telegram_service.py` - Telegram Bot API service (send message, handle commands)
4. `backend/routers/telegram.py` - Telegram bot routes (setup-webhook, webhook handler, send-message, bot-info)

### Frontend (5 files)
5. `frontend/src/pages/Dashboard.tsx` - Main dashboard with stats, recent transactions, quick actions
6. `frontend/src/pages/Transactions.tsx` - Transaction list with filters, search, status badges
7. `frontend/src/pages/BotSettings.tsx` - Bot configuration, webhook setup, test message
8. `frontend/src/pages/CreatePayment.tsx` - Create invoice/QR/payment link form
9. `frontend/src/App.tsx` - Updated routing with all pages
10. `frontend/index.html` - Updated title

### Total: 8 code files (within limit)