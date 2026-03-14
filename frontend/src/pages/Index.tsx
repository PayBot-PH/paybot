import { Link } from 'react-router-dom';
import {
  Bot,
  BarChart3,
  Wallet,
  CreditCard,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Globe,
  Lock,
  Banknote,
  Send,
  QrCode,
  Receipt,
  Building2,
  ChevronRight,
  Star,
} from 'lucide-react';
import { APP_NAME, APP_TAGLINE, SUPPORT_URL, COMPANY_NAME } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

/* ─── Stat card ─────────────────────────────────────────────────── */
function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm">
      <span className="text-3xl sm:text-4xl font-extrabold text-white">{value}</span>
      <span className="mt-1 text-sm font-semibold text-blue-400">{label}</span>
      {sub && <span className="mt-0.5 text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

/* ─── Feature card ───────────────────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  iconColor,
  iconBg,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white mb-1.5">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─── Step card ──────────────────────────────────────────────────── */
function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/30">
        {step}
      </div>
      <div className="pt-0.5">
        <h4 className="text-base font-semibold text-white mb-1">{title}</h4>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─── Payment method pill ────────────────────────────────────────── */
function PaymentPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

/* ─── Trust badge ────────────────────────────────────────────────── */
function TrustBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Icon className="h-4 w-4 text-teal-400 shrink-0" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

const FEATURES = [
  {
    icon: CreditCard,
    title: 'Multi-Method Payments',
    description:
      'Accept invoices, QR codes, Alipay, WeChat Pay, Maya, GCash, GrabPay, and all major Philippine virtual accounts in a single platform.',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: Wallet,
    title: 'Unified Wallet',
    description:
      'Centralise all incoming funds in one wallet. Top up, disburse, and settle in USDT same day — no manual bank transfers needed.',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Send,
    title: 'Instant Disbursements',
    description:
      'Pay partners, suppliers, and employees directly from the dashboard. Supports local bank transfers and crypto settlement.',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description:
      'Live charts, revenue breakdowns, and transaction summaries give you complete visibility over your financial flows.',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Bot,
    title: 'Telegram-Powered Bot',
    description:
      'Receive instant payment alerts, trigger payment links, and manage operations directly from Telegram — no app installation needed.',
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance & KYC',
    description:
      'Built-in KYB/KYC workflows, BSP-regulated rails, PCI-DSS compliance, and end-to-end TLS encryption keep your business protected.',
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: QrCode,
    title: 'QRPH Support',
    description:
      'Generate and scan Philippine QR Ph codes natively. Let customers pay by scanning — zero friction at the point of sale.',
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Globe,
    title: 'Cross-Border Ready',
    description:
      'Accept payments from Alipay and WeChat wallets with automatic forex conversion and USDT settlement for international merchants.',
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10 border-violet-500/20',
  },
];

const STEPS = [
  {
    step: '1',
    title: 'Connect Your Bot',
    description:
      'Register with your Telegram account in seconds. No lengthy onboarding — your admin dashboard is ready immediately.',
  },
  {
    step: '2',
    title: 'Choose Payment Methods',
    description:
      'Enable the payment channels your customers use: QR codes, e-wallets, virtual accounts, payment links, and more.',
  },
  {
    step: '3',
    title: 'Start Accepting Payments',
    description:
      'Share payment links or QR codes. Funds arrive in your wallet instantly and alerts reach you on Telegram in real time.',
  },
  {
    step: '4',
    title: 'Settle & Grow',
    description:
      'Disburse to suppliers, review analytics, and reinvest — all from one unified dashboard built for financial scale.',
  },
];

const PAYMENT_METHODS = [
  { label: 'Alipay', color: 'border-blue-500/30 text-blue-300 bg-blue-500/10' },
  { label: 'WeChat Pay', color: 'border-green-500/30 text-green-300 bg-green-500/10' },
  { label: 'GCash', color: 'border-sky-500/30 text-sky-300 bg-sky-500/10' },
  { label: 'Maya', color: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' },
  { label: 'GrabPay', color: 'border-lime-500/30 text-lime-300 bg-lime-500/10' },
  { label: 'BPI', color: 'border-red-500/30 text-red-300 bg-red-500/10' },
  { label: 'BDO', color: 'border-amber-500/30 text-amber-300 bg-amber-500/10' },
  { label: 'UnionBank', color: 'border-orange-500/30 text-orange-300 bg-orange-500/10' },
  { label: 'Metrobank', color: 'border-purple-500/30 text-purple-300 bg-purple-500/10' },
  { label: 'QR Ph', color: 'border-slate-500/30 text-slate-300 bg-slate-500/10' },
  { label: 'USDT', color: 'border-teal-500/30 text-teal-300 bg-teal-500/10' },
  { label: '+100 Banks', color: 'border-white/10 text-slate-400 bg-white/[0.03]' },
];

/* ─── Page ───────────────────────────────────────────────────────── */
export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-[#040C18] text-white antialiased">

      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-blue-700/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-20 h-[400px] w-[400px] rounded-full bg-indigo-700/8 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-teal-700/6 blur-[90px]" />
      </div>

      {/* ════════════════════ NAV ════════════════════ */}
      <header className="relative z-10 border-b border-white/[0.05] bg-[#040C18]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
          {/* Brand */}
          <Link to="/home" className="flex items-center gap-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-white leading-tight">{APP_NAME}</p>
              <p className="text-[10px] text-slate-500">{APP_TAGLINE}</p>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {[
              { label: 'Features', to: '/features' },
              { label: 'Pricing', to: '/pricing' },
              { label: 'Policies', to: '/policies' },
            ].map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* CTA buttons */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors shadow-lg shadow-blue-600/25"
            >
              Get Started
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ════════════════════ HERO ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-20 text-center">

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-semibold text-blue-300 tracking-wide">
            Philippine Financial Infrastructure · Powered by Telegram
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight max-w-4xl mx-auto">
          The Modern Payment Platform for{' '}
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
            Philippine Businesses
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Accept Alipay, WeChat Pay, GCash, Maya, and every major Philippine bank. Disburse,
          settle in USDT, and manage your entire financial operation from one dashboard — right
          inside Telegram.
        </p>

        {/* CTA group */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-7 py-3.5 text-base font-bold text-white transition-colors shadow-xl shadow-blue-600/30"
          >
            Start for Free
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            to="/features"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.07] px-7 py-3.5 text-base font-semibold text-slate-200 transition-all"
          >
            Explore Features
          </Link>
        </div>

        {/* Trust line */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <TrustBadge icon={ShieldCheck} label="BSP Regulated" />
          <TrustBadge icon={Lock} label="PCI DSS Compliant" />
          <TrustBadge icon={CheckCircle2} label="256-bit TLS Encryption" />
          <TrustBadge icon={Zap} label="USDT T+0 Settlement" />
        </div>
      </section>

      {/* ════════════════════ STATS ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard value="7+" label="Payment Methods" sub="All-in-one" />
          <StatCard value="100+" label="PH Banks Supported" sub="InstaPay & PESONet" />
          <StatCard value="T+0" label="USDT Settlement" sub="Same-day payout" />
          <StatCard value="24/7" label="Telegram Alerts" sub="Real-time updates" />
        </div>
      </section>

      {/* ════════════════════ PAYMENT NETWORK ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pb-20">
        <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-8 sm:p-10">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">
            Accepted payment networks &amp; settlement rails
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {PAYMENT_METHODS.map(({ label, color }) => (
              <PaymentPill key={label} label={label} color={color} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ VISION HEADLINE ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/25 bg-teal-500/8 px-4 py-1.5 mb-6">
          <TrendingUp className="h-3.5 w-3.5 text-teal-400" />
          <span className="text-xs font-semibold text-teal-300 tracking-wide">Our Vision</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-5">
          Building the Financial Backbone of{' '}
          <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            Philippine Commerce
          </span>
        </h2>
        <p className="text-slate-400 text-lg leading-relaxed max-w-3xl mx-auto">
          We believe every Filipino entrepreneur deserves world-class financial tooling. {APP_NAME} unifies
          domestic and cross-border payment rails, real-time treasury management, and compliance workflows
          into a single Telegram-native platform — empowering businesses of every size to collect, manage,
          and grow with confidence.
        </p>
        <div className="mt-8 grid sm:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: Building2,
              title: 'Merchant-First',
              body: 'Built for Philippine SMEs and enterprise merchants who need speed, reliability, and multi-channel payment acceptance without complex integrations.',
              color: 'text-blue-400',
            },
            {
              icon: Globe,
              title: 'Cross-Border Reach',
              body: 'Connect seamlessly with Chinese mobile wallets and USDT settlement rails, opening your business to the global digital economy.',
              color: 'text-teal-400',
            },
            {
              icon: Receipt,
              title: 'Full Transparency',
              body: 'Every peso in and out is tracked, categorised, and auditable. Real-time dashboards and exportable reports give you total financial clarity.',
              color: 'text-amber-400',
            },
          ].map(({ icon: Icon, title, body, color }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <Icon className={`h-6 w-6 ${color} mb-3`} />
              <h4 className="font-semibold text-white text-sm mb-2">{title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════ FEATURES GRID ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/8 px-4 py-1.5 mb-4">
            <Star className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-blue-300 tracking-wide">Platform Features</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Everything your business needs
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            From accepting payments to disbursing funds and staying compliant — {APP_NAME} covers
            the complete financial lifecycle.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/features"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all features
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ════════════════════ HOW IT WORKS ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Steps */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/8 px-4 py-1.5 mb-6">
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-purple-300 tracking-wide">How It Works</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
              Up and running in minutes
            </h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              No engineering team required. Onboard, configure, and start collecting revenue the same day.
            </p>
            <div className="space-y-7">
              {STEPS.map((s) => (
                <StepCard key={s.step} {...s} />
              ))}
            </div>
            <div className="mt-10">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-bold text-white transition-colors shadow-lg shadow-blue-600/25"
              >
                Create Your Account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Dashboard preview card */}
          <div className="rounded-3xl border border-white/[0.08] bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-5 border-b border-white/[0.06] pb-4">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold text-white">{APP_NAME} Dashboard</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-400">Live</span>
              </span>
            </div>

            {/* Mini stat row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Balance', value: '₱ 84,250', color: 'text-emerald-400' },
                { label: 'Today', value: '₱ 12,400', color: 'text-blue-400' },
                { label: 'Pending', value: '₱ 3,800', color: 'text-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                  <p className="text-slate-500 text-[10px] mb-1">{label}</p>
                  <p className={`text-xs font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Mini tx list */}
            <div className="space-y-2">
              {[
                { type: 'Invoice', id: '#INV-042', amt: '+₱ 1,500', badge: 'paid', bc: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                { type: 'QR Code', id: '#QR-019', amt: '+₱ 250', badge: 'paid', bc: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                { type: 'Disburse', id: '#DIS-007', amt: '-₱ 500', badge: 'sent', bc: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                { type: 'VA BPI', id: '#VA-031', amt: '+₱ 3,000', badge: 'pending', bc: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
              ].map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-white">{tx.type}</p>
                    <p className="text-[10px] text-slate-500">{tx.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-white">{tx.amt}</p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tx.bc}`}>{tx.badge}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-blue-600/10 border border-blue-500/20 p-3 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-[11px] text-blue-300">USDT settlement available — withdraw anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ CTA ════════════════════ */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-900/30 via-[#0F172A] to-indigo-900/20 p-10 sm:p-14 text-center">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-blue-600/15 blur-[80px]" />
          </div>
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Ready to grow your business?
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto mb-8 leading-relaxed">
              Join Philippine merchants who trust {APP_NAME} to power their payment operations. Set up
              in minutes, scale without limits.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-8 py-3.5 text-base font-bold text-white transition-colors shadow-xl shadow-blue-600/30"
              >
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] px-8 py-3.5 text-base font-semibold text-slate-200 transition-all"
              >
                Talk to Sales
              </a>
            </div>
            <p className="mt-6 text-xs text-slate-600">
              No credit card required · {COMPANY_NAME} · BSP Regulated
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <AppFooter variant="public" />
    </div>
  );
}
