import { Link } from 'react-router-dom';
import {
  Bot, CheckCircle2, ArrowRight, MessageCircle, Zap, Shield,
  Building2, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import { useState } from 'react';
import { APP_NAME, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

/* ─── Logo helpers (same as Login.tsx) ───────────────────────── */
function SiIcon({ src, alt, bg, size = 32 }: { src: string; alt: string; bg: string; size?: number }) {
  const r = Math.round(size * 0.25);
  const p = Math.round(size * 0.18);
  return (
    <div style={{ width: size, height: size, background: bg, borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: p, flexShrink: 0 }}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
    </div>
  );
}
function ImgIcon({ src, alt, size = 32 }: { src: string; alt: string; size?: number }) {
  return <img src={src} alt={alt} style={{ height: size, width: 'auto', objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />;
}

/* ─── FAQ ─────────────────────────────────────────────────────── */
function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.08] rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-white font-medium text-sm pr-4">{q}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 bg-white/[0.01] border-t border-white/[0.06]">
          <p className="text-slate-400 text-sm leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Plan card ───────────────────────────────────────────────── */
interface Plan {
  name: string;
  price: string;
  period?: string;
  desc: string;
  badge?: string;
  badgeCls?: string;
  borderCls: string;
  bgCls: string;
  glowCls: string;
  ctaLabel: string;
  ctaTo: string;
  ctaCls: string;
  features: string[];
  notIncluded?: string[];
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className={`relative flex flex-col rounded-3xl p-7 sm:p-8 border ${plan.borderCls} ${plan.bgCls} overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-48 h-48 ${plan.glowCls} blur-3xl rounded-full`} />
      <div className="relative flex-1">
        {plan.badge && (
          <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border mb-4 ${plan.badgeCls}`}>
            <Zap className="h-3 w-3" /> {plan.badge}
          </div>
        )}
        <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
        <p className="text-slate-400 text-sm mb-5">{plan.desc}</p>
        <div className="mb-6">
          <span className="text-3xl sm:text-4xl font-extrabold text-white">{plan.price}</span>
          {plan.period && <span className="text-slate-400 text-sm ml-1">{plan.period}</span>}
        </div>
        <ul className="space-y-2.5 mb-6">
          {plan.features.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-slate-300 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" /> {f}
            </li>
          ))}
          {plan.notIncluded?.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-slate-600 text-sm line-through">
              <X className="h-4 w-4 shrink-0 mt-0.5" /> {f}
            </li>
          ))}
        </ul>
      </div>
      <Link to={plan.ctaTo} className={`relative flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-xl text-sm transition-all ${plan.ctaCls}`}>
        {plan.ctaLabel} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    desc: 'Try the platform with no commitment. Perfect for testing and onboarding.',
    borderCls: 'border-white/[0.08]',
    bgCls: 'bg-white/[0.02]',
    glowCls: 'bg-blue-700/5',
    ctaLabel: 'Create an account',
    ctaTo: '/register',
    ctaCls: 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-slate-200 hover:text-white',
    features: [
      'Telegram bot access',
      'GCash & Maya e-wallet',
      'QR code payments',
      'Real-time Telegram alerts',
      'Transaction history',
      'Email support',
    ],
    notIncluded: [
      'Alipay & WeChat Pay',
      'USDT T+0 settlement',
      'Virtual accounts (InstaPay)',
      'Disbursements',
      'Multi-admin management',
      'Reports & analytics',
    ],
  },
  {
    name: 'Merchant',
    price: 'No monthly fee',
    desc: 'For active merchants who need full local and cross-border coverage. Pay only per transaction at Xendit rates.',
    badge: 'Most Popular',
    badgeCls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    borderCls: 'border-blue-500/40',
    bgCls: 'bg-gradient-to-br from-[#0D1F4A] to-[#0A1530]',
    glowCls: 'bg-blue-600/8',
    ctaLabel: 'Get started',
    ctaTo: '/register',
    ctaCls: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25',
    features: [
      'Everything in Starter',
      'Opening deposit: 600 USDT or ₱30,000',
      'Xendit transaction fees apply (see table below)',
      'Alipay QR collection',
      'WeChat Pay QR collection',
      'All PH banks via InstaPay / PESONet',
      'GrabPay support',
      'Disbursements to any PH bank',
      'USDT T+0 same-day settlement',
      'Reports & analytics',
      'KYC / KYB onboarding',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    desc: 'For high-volume merchants and businesses with custom requirements.',
    badge: 'Contact Us',
    badgeCls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    borderCls: 'border-emerald-500/25',
    bgCls: 'bg-gradient-to-br from-[#0A2B1A] to-[#071A10]',
    glowCls: 'bg-emerald-700/6',
    ctaLabel: 'Contact sales',
    ctaTo: SUPPORT_URL,
    ctaCls: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20',
    features: [
      'Everything in Merchant',
      'Dedicated account manager',
      'Custom settlement schedule',
      'Multi-branch / sub-merchant',
      'Webhook & API integration',
      'White-label Telegram bot',
      'Custom compliance & reporting',
      'SLA-backed uptime guarantee',
      'Onsite onboarding & training',
    ],
  },
];

/* ─── Xendit fee schedule ────────────────────────────────────── */
const XENDIT_FEES = [
  { method: 'GCash', fee: '2.3%', note: '' },
  { method: 'Maya', fee: '1.8%', note: '' },
  { method: 'GrabPay', fee: '2.0%', note: '' },
  { method: 'ShopeePay', fee: '2.0%', note: '' },
  { method: 'QRPH (QR code payments)', fee: '1.4%', note: 'Min. ₱15 per transaction' },
  { method: 'Local credit / debit cards', fee: '3.2% + ₱10', note: '' },
  { method: 'International cards (PHP)', fee: '4.2% + ₱10', note: '' },
  { method: 'Bank direct debit (BPI, UBP, RCBC, etc.)', fee: '1.0%', note: 'Min. ₱15 per transaction' },
  { method: 'Over-the-counter (7-Eleven, ECPay)', fee: '1.5%', note: 'Min. ₱15 per transaction' },
  { method: 'Over-the-counter (Cebuana, LBC, SM)', fee: '₱25', note: 'Fixed per transaction' },
  { method: 'BillEase (BNPL)', fee: '1.5%', note: '' },
];

const FAQS = [
  {
    q: 'What is the opening account deposit?',
    a: 'To activate a Merchant account, a one-time opening deposit of 600 USDT or ₱30,000 is required. This deposit is held as a security float and applied to your transaction balance — it is not a fee.',
  },
  {
    q: 'Are there any monthly subscription fees?',
    a: 'No. PayBot Philippines uses Xendit\'s pay-as-you-go pricing — there are no monthly subscription fees. You only pay the standard Xendit transaction fee per successful payment collected.',
  },
  {
    q: 'What are the transaction fees?',
    a: 'Transaction fees follow Xendit\'s published rates: GCash 2.3%, Maya 1.8%, GrabPay 2.0%, QRPH 1.4% (min ₱15), local cards 3.2% + ₱10, international cards 4.2% + ₱10, bank direct debit 1.0% (min ₱15). See the full fee table on this page. All fees are exclusive of VAT.',
  },
  {
    q: 'How does USDT T+0 settlement work?',
    a: 'All PHP collections (Alipay, WeChat, GCash, BPI, BDO, etc.) are converted to USDT at the daily closing rate and sent to your registered USDT wallet address by end of business day — no waiting for T+1 or T+3 bank settlement.',
  },
  {
    q: 'Do I need a separate Telegram account?',
    a: 'Yes. PayBot Philippines is 100% Telegram-native. You authenticate with your Telegram account. Once approved, all payment commands, alerts, and notifications come through the bot — no app install required.',
  },
  {
    q: 'What KYC / KYB documents are required?',
    a: 'For individual merchants: a government-issued ID and proof of business. For companies: SEC/DTI registration, business permit, and authorized representative ID. The registration form guides you through each step.',
  },
  {
    q: 'Can I accept Chinese tourist payments (Alipay / WeChat Pay)?',
    a: 'Yes — this is a core feature of the Merchant and Enterprise plans. You generate a dynamic QR code via the bot or dashboard, the Chinese customer scans it with their Alipay or WeChat Pay app, and the payment is credited instantly.',
  },
];

/* ═══════════════════════════════════════════════════════════════ */

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#040C18] text-white overflow-x-hidden">

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#040C18]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2.5">
            <div className="h-8 w-8 sm:h-9 sm:w-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="font-bold text-base sm:text-lg text-white tracking-tight">{APP_NAME}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/features" className="text-slate-400 hover:text-white text-sm transition-colors">Features</Link>
            <Link to="/pricing" className="text-white text-sm font-medium">Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white text-sm transition-colors">Support</a>
          </nav>
          <Link to="/register" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-full transition-colors shadow-lg shadow-blue-600/25">
            Get Started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative pt-16 sm:pt-20 pb-10 sm:pb-14 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-700/10 blur-[120px] rounded-full" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/25 rounded-full px-4 py-1.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Simple, transparent pricing</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
            Pricing that grows<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              with your business
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-6">
            No monthly fees. Pay only per transaction at Xendit rates. Unlock Alipay, WeChat Pay, all PH banks, and USDT settlement when you're ready.
          </p>

          {/* Accepted payment logos */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { el: <SiIcon src="/logos/alipay.svg" alt="Alipay" bg="#1677FF" size={26} />, name: 'Alipay' },
              { el: <SiIcon src="/logos/wechat.svg" alt="WeChat" bg="#07C160" size={26} />, name: 'WeChat Pay' },
              { el: <ImgIcon src="/logos/gcash.svg" alt="GCash" size={26} />, name: 'GCash' },
              { el: <ImgIcon src="/logos/maya.svg" alt="Maya" size={26} />, name: 'Maya' },
              { el: <SiIcon src="/logos/grab.svg" alt="GrabPay" bg="#00B14F" size={26} />, name: 'GrabPay' },
              { el: <SiIcon src="/logos/tether.svg" alt="USDT" bg="#26A17B" size={26} />, name: 'USDT' },
            ].map(({ el, name }) => (
              <div key={name} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
                {el}
                <span className="text-slate-400 text-xs">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── OPENING DEPOSIT BANNER ───────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-6">
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 sm:px-7 py-4 sm:py-5">
          <div className="flex-shrink-0 h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <Building2 className="h-5 w-5 text-amber-400" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-amber-300 font-bold text-sm">Opening Account Deposit Required</p>
            <p className="text-slate-400 text-xs mt-0.5">
              A one-time security deposit of <span className="text-white font-semibold">600 USDT</span> or <span className="text-white font-semibold">₱30,000</span> is required to activate a Merchant account. This is applied to your transaction balance — not a fee.
            </p>
          </div>
        </div>
      </section>

      {/* ── PLANS ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          All prices in Philippine Peso (PHP). Xendit transaction fees are exclusive of VAT. Opening deposit (600 USDT or ₱30,000) required for Merchant accounts.
        </p>
      </section>

      {/* ── XENDIT FEE SCHEDULE ─────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-2">Xendit transaction fees</h2>
        <p className="text-slate-400 text-sm text-center mb-8 sm:mb-10">Pay only per successful transaction. No monthly fees, no hidden charges. All fees exclusive of VAT.</p>
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
          <div className="grid grid-cols-3 bg-white/[0.03] border-b border-white/[0.08]">
            <div className="px-4 sm:px-6 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider col-span-2">Payment Method</div>
            <div className="px-4 sm:px-6 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">Fee</div>
          </div>
          {XENDIT_FEES.map(({ method, fee, note }, i) => (
            <div key={method} className={`grid grid-cols-3 border-b border-white/[0.05] last:border-0 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
              <div className="px-4 sm:px-6 py-3 col-span-2">
                <span className="text-slate-300 text-xs sm:text-sm">{method}</span>
                {note && <span className="ml-2 text-slate-500 text-xs">{note}</span>}
              </div>
              <div className="px-4 sm:px-6 py-3 text-blue-300 font-semibold text-xs sm:text-sm">{fee}</div>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-4 text-center">
          Source: <a href="https://www.xendit.co/en-ph/pricing/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400 transition-colors">xendit.co/en-ph/pricing</a>. Rates may change; confirm current rates with Xendit directly.
        </p>
      </section>

      {/* ── FEATURE COMPARISON TABLE ─────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8 sm:mb-10">Compare plans</h2>
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-4 bg-white/[0.03] border-b border-white/[0.08]">
            <div className="px-4 sm:px-6 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">Feature</div>
            {['Starter', 'Merchant', 'Enterprise'].map((p, i) => (
              <div key={p} className={`px-2 sm:px-4 py-3 text-center text-xs font-bold ${i === 1 ? 'text-blue-400' : i === 2 ? 'text-emerald-400' : 'text-slate-300'}`}>{p}</div>
            ))}
          </div>

          {[
            { label: 'Telegram bot', values: [true, true, true] },
            { label: 'GCash payments', values: [true, true, true] },
            { label: 'Maya payments', values: [true, true, true] },
            { label: 'GrabPay', values: [true, true, true] },
            { label: 'QR code generation', values: [true, true, true] },
            { label: 'Real-time alerts', values: [true, true, true] },
            { label: 'Transaction history', values: [true, true, true] },
            { label: 'Alipay QR collection', values: [false, true, true] },
            { label: 'WeChat Pay QR', values: [false, true, true] },
            { label: 'PH banks (InstaPay)', values: [false, true, true] },
            { label: 'Disbursements', values: [false, true, true] },
            { label: 'USDT T+0 settlement', values: [false, true, true] },
            { label: 'Reports & analytics', values: [false, true, true] },
            { label: 'KYC / KYB onboarding', values: [false, true, true] },
            { label: 'Multi-admin', values: [false, true, true] },
            { label: 'Custom settlement', values: [false, false, true] },
            { label: 'API / Webhook access', values: [false, false, true] },
            { label: 'White-label bot', values: [false, false, true] },
            { label: 'Dedicated account manager', values: [false, false, true] },
          ].map(({ label, values }, i) => (
            <div key={label} className={`grid grid-cols-4 border-b border-white/[0.05] last:border-0 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
              <div className="px-4 sm:px-6 py-3 text-slate-300 text-xs sm:text-sm">{label}</div>
              {values.map((v, j) => (
                <div key={j} className="flex items-center justify-center py-3">
                  {v
                    ? <CheckCircle2 className={`h-4 w-4 ${j === 0 ? 'text-slate-400' : j === 1 ? 'text-blue-400' : 'text-emerald-400'}`} />
                    : <span className="h-1 w-4 bg-white/[0.08] rounded-full" />
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW FEES WORK ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            {
              icon: <Shield className="h-5 w-5 text-blue-400" />,
              bg: 'bg-blue-500/10 border-blue-500/20',
              title: 'No monthly fees',
              desc: 'Pay only per successful transaction at Xendit\'s published rates. No subscription, no platform markup.',
            },
            {
              icon: <Zap className="h-5 w-5 text-emerald-400" />,
              bg: 'bg-emerald-500/10 border-emerald-500/20',
              title: 'T+0 USDT payout',
              desc: 'Skip T+1–T+3 bank delays. Your daily collections convert to USDT and hit your wallet same-day.',
            },
            {
              icon: <Building2 className="h-5 w-5 text-amber-400" />,
              bg: 'bg-amber-500/10 border-amber-500/20',
              title: 'KYC / KYB included',
              desc: 'Compliance is built in. Full KYC and KYB onboarding at no extra cost on Merchant and Enterprise plans.',
            },
          ].map(({ icon, bg, title, desc }) => (
            <div key={title} className={`rounded-2xl border p-5 sm:p-6 ${bg}`}>
              <div className="mb-3">{icon}</div>
              <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8 sm:mb-10">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQS.map(faq => <FAQ key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </section>

      {/* ── BOTTOM CTA ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/50 via-[#0A1628] to-emerald-900/20 border border-blue-700/25 rounded-3xl p-8 sm:p-12 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="h-12 w-12 sm:h-14 sm:w-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-600/30">
              <Bot className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Ready to start accepting payments?
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm sm:text-base">
              Create your free account today. No credit card required. Upgrade whenever you need more payment methods.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/register"
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-xl text-sm transition-all shadow-xl shadow-blue-600/25 hover:-translate-y-0.5"
              >
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-slate-300 hover:text-white font-semibold px-7 py-3.5 rounded-xl text-sm transition-all"
              >
                <MessageCircle className="h-4 w-4 text-sky-400" />
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <AppFooter />

    </div>
  );
}
