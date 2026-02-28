import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  BarChart3,
  Wallet,
  CreditCard,
  FileText,
  Building2,
  PieChart,
  ShieldCheck,
  MessageCircle,
  QrCode,
  Banknote,
  Send,
  RefreshCw,
  Bell,
  Users,
  Receipt,
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Monitor,
  Zap,
  Lock,
  ChevronRight,
  Star,
  Play,
  ChevronLeft,
  X,
} from 'lucide-react';

/* ─── Screenshot gallery ─────────────────────────────────────── */
function PaymentsHubMockup() {
  const methods = [
    { label: 'Invoice', color: 'text-blue-400', dot: 'bg-blue-500' },
    { label: 'QR Code', color: 'text-purple-400', dot: 'bg-purple-500' },
    { label: 'Alipay QR', color: 'text-red-400', dot: 'bg-red-500' },
    { label: 'Payment Link', color: 'text-cyan-400', dot: 'bg-cyan-500' },
    { label: 'Virtual Account', color: 'text-amber-400', dot: 'bg-amber-500' },
    { label: 'Maya', color: 'text-emerald-400', dot: 'bg-emerald-500' },
    { label: 'E-Wallet', color: 'text-rose-400', dot: 'bg-rose-500' },
  ];
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/30 shadow-2xl bg-[#0F172A] w-full text-[10px]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F172A] border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-blue-600 rounded flex items-center justify-center">
            <CreditCard className="h-3 w-3 text-white" />
          </div>
          <span className="text-white font-bold text-xs">Payments Hub</span>
        </div>
        <span className="text-blue-400 text-[9px] bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">7 Methods</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-slate-400 text-[9px] font-medium uppercase tracking-wider mb-2">Select Payment Method</p>
        <div className="grid grid-cols-2 gap-1.5">
          {methods.map((m) => (
            <div key={m.label} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/30 rounded-lg p-2">
              <span className={`h-2 w-2 rounded-full ${m.dot} shrink-0`}></span>
              <span className={`${m.color} font-medium`}>{m.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 bg-slate-800/40 rounded-lg p-2 border border-slate-700/30">
          <p className="text-slate-400 mb-1.5">Amount (PHP)</p>
          <div className="bg-[#0F172A] rounded px-2 py-1 text-emerald-400 font-mono font-bold">₱ 1,500.00</div>
        </div>
        <div className="bg-blue-600 rounded-lg py-1.5 text-center text-white font-semibold text-[10px]">Create Payment</div>
      </div>
    </div>
  );
}

function TransactionsMockup() {
  const txns = [
    { type: 'Invoice', id: '#INV-042', amt: '+₱1,500', status: 'paid', statusColor: 'text-emerald-400 bg-emerald-500/10' },
    { type: 'QR Code', id: '#QR-019', amt: '+₱250', status: 'paid', statusColor: 'text-emerald-400 bg-emerald-500/10' },
    { type: 'Disburse', id: '#DIS-007', amt: '-₱500', status: 'sent', statusColor: 'text-blue-400 bg-blue-500/10' },
    { type: 'VA BPI', id: '#VA-031', amt: '+₱3,000', status: 'pending', statusColor: 'text-amber-400 bg-amber-500/10' },
    { type: 'Maya', id: '#MY-055', amt: '+₱800', status: 'paid', statusColor: 'text-emerald-400 bg-emerald-500/10' },
  ];
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/30 shadow-2xl bg-[#0F172A] w-full text-[10px]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F172A] border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-purple-600 rounded flex items-center justify-center">
            <Receipt className="h-3 w-3 text-white" />
          </div>
          <span className="text-white font-bold text-xs">Transactions</span>
        </div>
        <span className="text-slate-400 text-[9px]">124 total</span>
      </div>
      <div className="p-3">
        <div className="bg-slate-800/40 rounded-lg px-2 py-1 mb-2 flex items-center gap-1.5 border border-slate-700/30">
          <span className="text-slate-500">🔍</span>
          <span className="text-slate-500">Search transactions...</span>
        </div>
        <div className="space-y-1">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-1 border-b border-slate-700/20 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-slate-300">{t.type}</span>
                <span className="text-slate-600">{t.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono ${t.amt.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>{t.amt}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${t.statusColor}`}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const screenshots = [
  { id: 'telegram', label: 'Telegram Bot', badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20', component: 'telegram', caption: '22 bot commands · instant payment notifications' },
  { id: 'dashboard', label: 'Admin Dashboard', badge: 'bg-purple-500/10 text-purple-300 border-purple-500/20', component: 'dashboard', caption: '9 pages · real-time updates · mobile-friendly' },
  { id: 'payments', label: 'Payments Hub', badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20', component: 'payments', caption: '7 payment methods · invoice, QR, VA, e-wallet & more' },
  { id: 'transactions', label: 'Transactions', badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20', component: 'transactions', caption: 'Full searchable & filterable transaction history' },
];

function ScreenshotViewer() {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const prev = () => setActive((a) => (a - 1 + screenshots.length) % screenshots.length);
  const next = () => setActive((a) => (a + 1) % screenshots.length);

  const renderMockup = (id: string) => {
    if (id === 'telegram') return <TelegramMockup />;
    if (id === 'dashboard') return <DashboardMockup />;
    if (id === 'payments') return <PaymentsHubMockup />;
    return <TransactionsMockup />;
  };

  const current = screenshots[active];

  return (
    <div>
      {/* Tab row */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {screenshots.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              i === active ? s.badge : 'bg-slate-800/40 text-slate-500 border-slate-700/40 hover:border-slate-600/60'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Active screenshot */}
      <div className="relative max-w-sm mx-auto">
        {/* Previous / Next arrows */}
        <button
          onClick={prev}
          className="absolute -left-10 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-800/80 border border-slate-700/40 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-all z-10"
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={next}
          className="absolute -right-10 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-800/80 border border-slate-700/40 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-all z-10"
          aria-label="Next screenshot"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Screenshot frame */}
        <div
          className="cursor-zoom-in group relative"
          onClick={() => setLightbox(active)}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
            <span className="text-white text-xs font-medium bg-black/50 px-3 py-1 rounded-full">Click to enlarge</span>
          </div>
          {renderMockup(current.id)}
        </div>

        <p className="text-slate-500 text-xs text-center mt-3">{current.caption}</p>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {screenshots.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-blue-500' : 'w-1.5 bg-slate-600'}`}
              aria-label={`Go to screenshot ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            onClick={() => setLightbox(null)}
            aria-label="Close lightbox"
          >
            <X className="h-4 w-4" />
          </button>
          <div
            className="w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {renderMockup(screenshots[lightbox].id)}
            <p className="text-slate-400 text-xs text-center mt-3">{screenshots[lightbox].caption}</p>
          </div>
        </div>
      )}
    </div>
  );
}
/* ─────────────────────────────────────────────────────────────── */

function TelegramMockup() {
  const messages = [
    { from: 'user', text: '/balance' },
    { from: 'bot', text: '💰 Wallet Balance\n\nAvailable: ₱ 12,500.00\nPending: ₱ 1,200.00\n\nUse /withdraw to cash out.' },
    { from: 'user', text: '/invoice 1500 Web design deposit' },
    { from: 'bot', text: '✅ Invoice Created!\n\nAmount: ₱ 1,500.00\nDesc: Web design deposit\n\n🔗 Pay Now: invoice.xendit.co/...' },
    { from: 'user', text: '/alipay 500 Product sale' },
    { from: 'bot', text: '✅ Alipay QR Ready!\n\n💰 ₱500.00\n📱 Scan QR with Alipay' },
  ];
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/30 shadow-2xl bg-[#17212b] w-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#232e3c] border-b border-slate-600/20">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold">PayBot</p>
          <p className="text-emerald-400 text-[10px] flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>online</p>
        </div>
      </div>
      <div className="px-3 py-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-xl px-3 py-2 max-w-[85%] text-[11px] leading-relaxed whitespace-pre-line ${
              m.from === 'user' ? 'bg-[#2b5278] text-white rounded-br-sm' : 'bg-[#182533] text-slate-200 rounded-bl-sm border border-slate-600/20'
            }`}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-[#232e3c] border-t border-slate-600/20">
        <div className="flex-1 bg-[#17212b] rounded-full px-3 py-1.5 text-slate-500 text-[11px]">Type a command...</div>
        <div className="h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <Send className="h-3 w-3 text-white" />
        </div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/30 shadow-2xl bg-[#0F172A] w-full text-[10px]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F172A] border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-blue-600 rounded flex items-center justify-center">
            <Bot className="h-3 w-3 text-white" />
          </div>
          <span className="text-white font-bold text-xs">PayBot</span>
        </div>
        <span className="text-emerald-400 text-[9px] flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>Live</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Wallet', value: '₱12,500', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border border-emerald-500/20' },
            { label: 'Revenue', value: '₱48,200', color: 'text-blue-400', bg: 'bg-blue-500/10 border border-blue-500/20' },
            { label: 'Transactions', value: '124', color: 'text-purple-400', bg: 'bg-purple-500/10 border border-purple-500/20' },
            { label: 'Pending', value: '8', color: 'text-amber-400', bg: 'bg-amber-500/10 border border-amber-500/20' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-lg p-2`}>
              <p className="text-slate-400 mb-0.5">{s.label}</p>
              <p className={`${s.color} font-bold text-xs`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/30">
          <p className="text-slate-400 mb-1.5 font-medium">Recent Transactions</p>
          {[
            { name: 'Invoice #42', amt: '+₱1,500', color: 'text-emerald-400' },
            { name: 'Disburse BPI', amt: '-₱500', color: 'text-red-400' },
            { name: 'QR Payment', amt: '+₱250', color: 'text-emerald-400' },
          ].map((t) => (
            <div key={t.name} className="flex justify-between py-0.5 border-b border-slate-700/20 last:border-0">
              <span className="text-slate-300">{t.name}</span>
              <span className={`font-medium ${t.color}`}>{t.amt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }: { icon: React.ReactNode; title: string; description: string; color: string }) {
  return (
    <div className="group bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex gap-3 hover:border-slate-600/70 hover:bg-slate-800/70 transition-all duration-200">
      <div className={`p-2 rounded-lg ${color} shrink-0 h-fit`}>{icon}</div>
      <div>
        <p className="text-white font-medium text-sm mb-1">{title}</p>
        <p className="text-slate-400 text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function Features() {
  const botFeatures = [
    { icon: <Receipt className="h-4 w-4 text-blue-400" />, title: 'Invoice & Payment Links', description: 'Generate invoices and shareable payment links instantly with a single command.', color: 'bg-blue-500/10' },
    { icon: <QrCode className="h-4 w-4 text-purple-400" />, title: 'QR Code Payments', description: 'Create QRIS and Alipay-compatible QR codes for in-person and online payments.', color: 'bg-purple-500/10' },
    { icon: <Banknote className="h-4 w-4 text-emerald-400" />, title: 'Virtual Accounts', description: 'Accept bank transfers via BDO, BPI, UnionBank, RCBC, Metrobank, PNB, and more.', color: 'bg-emerald-500/10' },
    { icon: <Smartphone className="h-4 w-4 text-sky-400" />, title: 'E-Wallet Payments', description: 'Collect GCash, GrabPay, and Maya payments directly through the bot.', color: 'bg-sky-500/10' },
    { icon: <Send className="h-4 w-4 text-amber-400" />, title: 'Disbursements', description: 'Send money to any Philippine bank account with /disburse.', color: 'bg-amber-500/10' },
    { icon: <RefreshCw className="h-4 w-4 text-rose-400" />, title: 'Refunds', description: 'Process full or partial refunds for any transaction in seconds.', color: 'bg-rose-500/10' },
    { icon: <Wallet className="h-4 w-4 text-teal-400" />, title: 'Wallet & Transfers', description: 'Check balance, top up, withdraw, and transfer funds to other users.', color: 'bg-teal-500/10' },
    { icon: <Bell className="h-4 w-4 text-orange-400" />, title: 'Real-Time Notifications', description: 'Instant Telegram alerts when payments are received or status changes.', color: 'bg-orange-500/10' },
  ];

  const adminFeatures = [
    { icon: <BarChart3 className="h-4 w-4 text-blue-400" />, title: 'Live Dashboard', description: 'Real-time overview of wallet balance, revenue, and transaction stats with live SSE updates.', color: 'bg-blue-500/10' },
    { icon: <Wallet className="h-4 w-4 text-emerald-400" />, title: 'Wallet Management', description: 'Top up via Xendit invoice, withdraw to bank, or disburse funds — all from one screen.', color: 'bg-emerald-500/10' },
    { icon: <CreditCard className="h-4 w-4 text-purple-400" />, title: 'Payments Hub', description: 'Create payments via 7 methods: Invoice, QR, Alipay, Maya, Payment Link, VA, E-Wallet.', color: 'bg-purple-500/10' },
    { icon: <FileText className="h-4 w-4 text-sky-400" />, title: 'Transaction History', description: 'Full searchable and filterable transaction log with status tracking.', color: 'bg-sky-500/10' },
    { icon: <Building2 className="h-4 w-4 text-amber-400" />, title: 'Money Management', description: 'Manage disbursements, refunds, subscriptions, and customer profiles in one place.', color: 'bg-amber-500/10' },
    { icon: <PieChart className="h-4 w-4 text-rose-400" />, title: 'Reports & Analytics', description: 'Revenue breakdowns, payment method analysis, success rates, and fee calculator.', color: 'bg-rose-500/10' },
    { icon: <ShieldCheck className="h-4 w-4 text-violet-400" />, title: 'Admin Management', description: 'Role-based access control with per-admin permissions for secure team management.', color: 'bg-violet-500/10' },
    { icon: <Users className="h-4 w-4 text-teal-400" />, title: 'Telegram-Only Auth', description: 'Secure login — only verified Telegram users authorized by DRL Solutions can access the UI.', color: 'bg-teal-500/10' },
  ];

  const [videoLoaded, setVideoLoaded] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/8 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-[#0A0F1E]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">PayBot</span>
              <span className="text-slate-500 text-xs ml-1.5">by DRL Solutions</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-slate-400 hover:text-sky-400 text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-sky-500/10">
              <MessageCircle className="h-4 w-4" /> Support
            </a>
            <Link to="/login"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-blue-500/20">
              Sign In <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-300 text-xs font-medium mb-8">
          <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
          Telegram-native payment operations · Powered by Xendit &amp; Maya
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-5">
          Collect Payments<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-400">
            via Telegram
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          PayBot by <strong className="text-white font-semibold">DRL Solutions</strong> lets you accept payments,
          manage your wallet, send disbursements, and generate QR codes — all through simple bot commands or a sleek admin dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/login"
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-blue-500/25 text-sm">
            Access Admin Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-sm">
            <MessageCircle className="h-4 w-4 text-sky-400" /> Contact Support
          </a>
        </div>
      </section>

      {/* Screenshots Gallery */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-slate-500/10 border border-slate-500/20 rounded-full px-4 py-1.5 text-slate-300 text-xs font-semibold mb-4 uppercase tracking-wider">
            <Monitor className="h-3.5 w-3.5" /> Screenshots
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">See it in Action</h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Browse the bot interface and admin dashboard screenshots below.
          </p>
        </div>
        <ScreenshotViewer />
      </section>

      {/* Demo Video */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-full px-4 py-1.5 text-rose-300 text-xs font-semibold mb-4 uppercase tracking-wider">
            <Play className="h-3.5 w-3.5 fill-rose-300" /> Demo Video
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">Watch a Demo</h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            See how PayBot handles real payments end-to-end in under 3 minutes.
          </p>
        </div>
        <div className="max-w-3xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-slate-600/30 shadow-2xl bg-[#0F172A] aspect-video flex items-center justify-center group">
            {/* Autoplay demo video */}
            <video
              autoPlay
              muted
              loop
              playsInline
              aria-label="PayBot demonstration video"
              onCanPlay={() => setVideoLoaded(true)}
              onError={() => setVideoLoaded(false)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
              src="/demo.mp4"
            />
            {/* Fallback placeholder shown while video is loading or unavailable */}
            {!videoLoaded && (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0F172A] to-slate-900" />
                {/* Grid lines for depth */}
                <div className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                  }}
                />
                {/* Bot icon + text */}
                <div className="relative flex flex-col items-center gap-4 text-center px-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/40">
                    <Bot className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">PayBot Demo</p>
                    <p className="text-slate-400 text-sm mt-1">Full walkthrough · Payments · Dashboard · Commands</p>
                  </div>
                  <a
                    href="https://t.me/traxionpay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
                  >
                    <MessageCircle className="h-4 w-4 text-sky-400" /> Request a Live Demo
                  </a>
                </div>
              </>
            )}
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="h-20 w-20 rounded-full bg-blue-600/30 backdrop-blur-sm border border-blue-400/30 flex items-center justify-center">
                <Play className="h-8 w-8 text-white fill-white ml-1" />
              </div>
            </div>
          </div>
          <p className="text-slate-500 text-xs text-center mt-3">
            Video demo coming soon · Contact <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" aria-label="Contact traxionpay on Telegram" className="text-sky-400 hover:text-sky-300 transition-colors">@traxionpay</a> for a live walkthrough
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: <Lock className="h-5 w-5 text-emerald-400 mx-auto mb-2" />, label: 'Telegram Auth Only', sub: 'Secure by design' },
              { icon: <Zap className="h-5 w-5 text-amber-400 mx-auto mb-2" />, label: 'Xendit + Maya', sub: 'PH payment gateways' },
              { icon: <Monitor className="h-5 w-5 text-blue-400 mx-auto mb-2" />, label: 'Mobile Friendly', sub: 'Works on any device' },
              { icon: <CheckCircle2 className="h-5 w-5 text-sky-400 mx-auto mb-2" />, label: '7 Payment Methods', sub: 'VA, QR, eWallet & more' },
            ].map((b) => (
              <div key={b.label} className="py-2">
                {b.icon}
                <p className="text-white text-sm font-semibold">{b.label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bot features */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-300 text-xs font-semibold mb-4 uppercase tracking-wider">
            <Bot className="h-3.5 w-3.5" /> Telegram Bot
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">Everything via Telegram</h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            22 commands covering the full payment lifecycle — no app install required.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {botFeatures.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* Admin features */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 text-purple-300 text-xs font-semibold mb-4 uppercase tracking-wider">
            <Monitor className="h-3.5 w-3.5" /> Admin Dashboard
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">Powerful Web Dashboard</h2>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            A full admin portal accessible only to authorized Telegram accounts.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {adminFeatures.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/50 via-slate-800/60 to-purple-900/30 border border-blue-700/30 rounded-3xl p-10 md:p-16 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="h-14 w-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-blue-500/30">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Ready to get started?</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Sign in with your authorized Telegram account to access the PayBot admin dashboard.
            </p>
            <Link to="/login"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-blue-500/25">
              Sign in with Telegram <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-5 text-slate-500 text-sm">
              Need access?{' '}
              <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 transition-colors">
                Contact @traxionpay
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-slate-500 text-xs space-x-4">
        <span>© {new Date().getFullYear()} DRL Solutions. All rights reserved.</span>
        <Link to="/policies" className="hover:text-sky-400 transition-colors">Policies</Link>
        <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 transition-colors">Support</a>
      </footer>
    </div>
  );
}

