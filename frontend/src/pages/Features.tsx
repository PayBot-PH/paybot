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
} from 'lucide-react';

// ── Mock Telegram Chat ──────────────────────────────────────────────
function TelegramMockup() {
  const messages = [
    { from: 'user', text: '/balance' },
    {
      from: 'bot',
      text: '💰 Wallet Balance\n\nAvailable: ₱ 12,500.00\nPending: ₱ 1,200.00\n\nUse /withdraw to cash out.',
    },
    { from: 'user', text: '/invoice 1500 Web design deposit' },
    {
      from: 'bot',
      text: '✅ Invoice Created!\n\nAmount: ₱ 1,500.00\nDesc: Web design deposit\n\n🔗 Pay Now: https://invoice.xendit.co/...',
    },
  ];

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/40 shadow-2xl bg-[#17212b] w-full max-w-xs mx-auto">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#232e3c] border-b border-slate-600/30">
        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">PayBot</p>
          <p className="text-emerald-400 text-[10px]">● online</p>
        </div>
      </div>
      {/* messages */}
      <div className="px-3 py-3 space-y-2 min-h-[200px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-xl px-3 py-2 max-w-[85%] text-[11px] leading-relaxed whitespace-pre-line ${
                m.from === 'user'
                  ? 'bg-[#2b5278] text-white rounded-br-sm'
                  : 'bg-[#182533] text-slate-200 rounded-bl-sm border border-slate-600/20'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {/* input bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#232e3c] border-t border-slate-600/30">
        <div className="flex-1 bg-[#17212b] rounded-full px-3 py-1.5 text-slate-500 text-[11px]">
          Type a command...
        </div>
        <div className="h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <Send className="h-3 w-3 text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Mock Dashboard ──────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-600/40 shadow-2xl bg-[#0F172A] w-full max-w-sm mx-auto text-[10px]">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F172A] border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-blue-600 rounded flex items-center justify-center">
            <Bot className="h-3 w-3 text-white" />
          </div>
          <span className="text-white font-bold text-xs">PayBot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-400 text-[9px]">● Live</span>
        </div>
      </div>
      {/* body */}
      <div className="p-3 space-y-2">
        {/* stat cards */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Wallet', value: '₱ 12,500', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Revenue', value: '₱ 48,200', color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Transactions', value: '124', color: 'text-purple-400', bg: 'bg-purple-500/10' },
            { label: 'Pending', value: '8', color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-lg p-2`}>
              <p className="text-slate-400 leading-none mb-1">{s.label}</p>
              <p className={`${s.color} font-bold text-xs`}>{s.value}</p>
            </div>
          ))}
        </div>
        {/* recent txns */}
        <div className="bg-slate-800/50 rounded-lg p-2">
          <p className="text-slate-400 mb-1.5">Recent Transactions</p>
          {[
            { name: 'Invoice #42', amt: '+₱1,500', color: 'text-emerald-400' },
            { name: 'Disburse BPI', amt: '-₱500', color: 'text-red-400' },
            { name: 'QR Payment', amt: '+₱250', color: 'text-emerald-400' },
          ].map((t) => (
            <div key={t.name} className="flex justify-between py-0.5">
              <span className="text-slate-300">{t.name}</span>
              <span className={t.color}>{t.amt}</span>
            </div>
          ))}
        </div>
        {/* nav bar */}
        <div className="flex justify-around pt-1 border-t border-slate-700/40">
          {[BarChart3, Wallet, CreditCard, FileText, PieChart].map((Icon, i) => (
            <div key={i} className={`p-1.5 rounded ${i === 0 ? 'bg-blue-600/20' : ''}`}>
              <Icon className={`h-3 w-3 ${i === 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature card ────────────────────────────────────────────────────
function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 flex gap-3 hover:border-slate-600/60 transition-colors">
      <div className={`p-2 rounded-lg ${color} shrink-0 h-fit`}>{icon}</div>
      <div>
        <p className="text-white font-medium text-sm mb-1">{title}</p>
        <p className="text-slate-400 text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
export default function Features() {
  const botFeatures = [
    {
      icon: <Receipt className="h-4 w-4 text-blue-400" />,
      title: 'Invoice & Payment Links',
      description: 'Generate invoices and shareable payment links instantly with a single command.',
      color: 'bg-blue-500/10',
    },
    {
      icon: <QrCode className="h-4 w-4 text-purple-400" />,
      title: 'QR Code Payments',
      description: 'Create QRIS and Alipay-compatible QR codes for in-person and online payments.',
      color: 'bg-purple-500/10',
    },
    {
      icon: <Banknote className="h-4 w-4 text-emerald-400" />,
      title: 'Virtual Accounts',
      description: 'Accept bank transfers via BDO, BPI, UnionBank, RCBC, Metrobank, PNB, and more.',
      color: 'bg-emerald-500/10',
    },
    {
      icon: <Smartphone className="h-4 w-4 text-sky-400" />,
      title: 'E-Wallet Payments',
      description: 'Collect GCash, GrabPay, and Maya payments directly through the bot.',
      color: 'bg-sky-500/10',
    },
    {
      icon: <Send className="h-4 w-4 text-amber-400" />,
      title: 'Disbursements',
      description: 'Send money to any Philippine bank account with /disburse.',
      color: 'bg-amber-500/10',
    },
    {
      icon: <RefreshCw className="h-4 w-4 text-rose-400" />,
      title: 'Refunds',
      description: 'Process full or partial refunds for any transaction in seconds.',
      color: 'bg-rose-500/10',
    },
    {
      icon: <Wallet className="h-4 w-4 text-teal-400" />,
      title: 'Wallet & Transfers',
      description: 'Check balance, top up, withdraw, and transfer funds to other users.',
      color: 'bg-teal-500/10',
    },
    {
      icon: <Bell className="h-4 w-4 text-orange-400" />,
      title: 'Real-Time Notifications',
      description: 'Instant Telegram alerts when payments are received or status changes.',
      color: 'bg-orange-500/10',
    },
  ];

  const adminFeatures = [
    {
      icon: <BarChart3 className="h-4 w-4 text-blue-400" />,
      title: 'Live Dashboard',
      description: 'Real-time overview of wallet balance, revenue, and transaction stats with live SSE updates.',
      color: 'bg-blue-500/10',
    },
    {
      icon: <Wallet className="h-4 w-4 text-emerald-400" />,
      title: 'Wallet Management',
      description: 'Top up via Xendit invoice, withdraw to bank, or disburse funds — all from one screen.',
      color: 'bg-emerald-500/10',
    },
    {
      icon: <CreditCard className="h-4 w-4 text-purple-400" />,
      title: 'Payments Hub',
      description: 'Create payments via 7 methods: Invoice, QR, Alipay, Maya, Payment Link, VA, E-Wallet.',
      color: 'bg-purple-500/10',
    },
    {
      icon: <FileText className="h-4 w-4 text-sky-400" />,
      title: 'Transaction History',
      description: 'Full searchable and filterable transaction log with status tracking.',
      color: 'bg-sky-500/10',
    },
    {
      icon: <Building2 className="h-4 w-4 text-amber-400" />,
      title: 'Money Management',
      description: 'Manage disbursements, refunds, subscriptions, and customer profiles in one place.',
      color: 'bg-amber-500/10',
    },
    {
      icon: <PieChart className="h-4 w-4 text-rose-400" />,
      title: 'Reports & Analytics',
      description: 'Revenue breakdowns, payment method analysis, success rates, and fee calculator.',
      color: 'bg-rose-500/10',
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-violet-400" />,
      title: 'Admin Management',
      description: 'Role-based access control. Super admin can add admins and assign granular permissions.',
      color: 'bg-violet-500/10',
    },
    {
      icon: <Users className="h-4 w-4 text-teal-400" />,
      title: 'Telegram-Only Auth',
      description: 'Secure login — only verified Telegram users authorized by DRL Solutions can access the UI.',
      color: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-[#0F172A]/90 backdrop-blur border-b border-slate-700/40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white">PayBot</span>
            <span className="text-slate-500 text-xs ml-1">by DRL Solutions</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://t.me/traxionpay"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-slate-400 hover:text-sky-400 text-sm transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Support
            </a>
            <Link
              to="/login"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              Sign In
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-300 text-xs font-medium mb-6">
          <Zap className="h-3.5 w-3.5" />
          Telegram Bot + Admin Dashboard · Powered by Xendit
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-4">
          Accept Payments via{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">
            Telegram
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
          PayBot by <strong className="text-white">DRL Solutions</strong> lets you collect
          payments, manage your wallet, and disburse funds — all through Telegram commands or a
          sleek web dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Access Admin Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://t.me/traxionpay"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm border border-slate-700"
          >
            <MessageCircle className="h-4 w-4 text-sky-400" />
            Contact Support
          </a>
        </div>
      </section>

      {/* Mockups */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="text-center mb-2">
              <span className="bg-blue-500/10 text-blue-300 text-xs font-medium px-3 py-1 rounded-full border border-blue-500/20">
                Telegram Bot
              </span>
            </div>
            <TelegramMockup />
            <p className="text-slate-500 text-xs text-center">22 bot commands · instant notifications</p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="text-center mb-2">
              <span className="bg-purple-500/10 text-purple-300 text-xs font-medium px-3 py-1 rounded-full border border-purple-500/20">
                Admin Dashboard
              </span>
            </div>
            <DashboardMockup />
            <p className="text-slate-500 text-xs text-center">9 pages · real-time updates · mobile-friendly</p>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-y border-slate-700/40 bg-slate-800/20">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { icon: <Lock className="h-5 w-5 text-emerald-400 mx-auto mb-1" />, label: 'Telegram Auth Only', sub: 'Secure by design' },
              { icon: <Zap className="h-5 w-5 text-amber-400 mx-auto mb-1" />, label: 'Powered by Xendit', sub: 'PH payment gateway' },
              { icon: <Monitor className="h-5 w-5 text-blue-400 mx-auto mb-1" />, label: 'Mobile Friendly', sub: 'Works on any device' },
              { icon: <CheckCircle2 className="h-5 w-5 text-sky-400 mx-auto mb-1" />, label: '7 Payment Methods', sub: 'VA, QR, eWallet & more' },
            ].map((b) => (
              <div key={b.label} className="py-2">
                {b.icon}
                <p className="text-white text-sm font-medium">{b.label}</p>
                <p className="text-slate-400 text-xs">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bot features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-300 text-xs font-medium mb-4">
            <Bot className="h-3.5 w-3.5" />
            Telegram Bot
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Everything via Telegram</h2>
          <p className="text-slate-400 mt-2 max-w-xl mx-auto text-sm">
            22 commands covering the full payment lifecycle — no app install required.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {botFeatures.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* Admin UI features */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 text-purple-300 text-xs font-medium mb-4">
            <Monitor className="h-3.5 w-3.5" />
            Admin Dashboard
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Powerful Web Dashboard</h2>
          <p className="text-slate-400 mt-2 max-w-xl mx-auto text-sm">
            A full admin portal accessible only to authorized Telegram accounts.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {adminFeatures.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="bg-gradient-to-br from-blue-900/40 to-slate-800/60 border border-blue-700/30 rounded-2xl p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Sign in with your authorized Telegram account to access the PayBot admin dashboard.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Sign in with Telegram
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-slate-500 text-xs">
            Need access?{' '}
            <a
              href="https://t.me/traxionpay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300"
            >
              Contact @traxionpay
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/40 py-6 text-center text-slate-500 text-xs space-x-4">
        <span>© {new Date().getFullYear()} DRL Solutions. All rights reserved.</span>
        <Link to="/policies" className="hover:text-sky-400 transition-colors">Policies</Link>
        <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 transition-colors">Support</a>
      </footer>
    </div>
  );
}
