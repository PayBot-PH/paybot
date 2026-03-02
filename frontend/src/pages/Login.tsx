import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowRight, ChevronRight, CheckCircle2, Zap, Shield, Bell, UserPlus, Bot } from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL } from '@/lib/brand';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

/* ─── Logo system ──────────────────────────────────────────────── */

/** Real brand icon via Simple Icons CDN (MIT licensed) */
function SiLogo({
  slug, color, size = 24, white = false,
}: { slug: string; color: string; size?: number; white?: boolean }) {
  const fill = white ? 'ffffff' : color.replace('#', '');
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}/${fill}`}
      width={size}
      height={size}
      alt={slug}
      style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}

/** Text / wordmark badge for brands not in Simple Icons */
function TextLogo({
  text, bg, fg = '#ffffff', size = 32, radius = 8, fontSize,
}: { text: string; bg: string; fg?: string; size?: number; radius?: number; fontSize?: number }) {
  const fs = fontSize ?? (text.length <= 2 ? Math.round(size * 0.44) : text.length <= 4 ? Math.round(size * 0.3) : Math.round(size * 0.25));
  return (
    <div style={{
      width: size, height: size, background: bg, borderRadius: radius,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: fs, color: fg, fontFamily: 'system-ui,sans-serif',
      letterSpacing: '-0.5px', flexShrink: 0, userSelect: 'none',
    }}>
      {text}
    </div>
  );
}

/** Colored rounded square wrapping a white SI icon */
function BrandSquare({ slug, bg, size = 40, radius = 12 }: { slug: string; bg: string; size?: number; radius?: number }) {
  return (
    <div style={{
      width: size, height: size, background: bg, borderRadius: radius,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      padding: Math.round(size * 0.18),
    }}>
      <SiLogo slug={slug} color={bg} white size={size * 0.62} />
    </div>
  );
}

/* ─── Brand definitions ────────────────────────────────────────── */
const CHINESE = [
  { id: 'alipay',  name: 'Alipay',     color: '#1677FF', si: 'alipay' },
  { id: 'wechat',  name: 'WeChat Pay', color: '#07C160', si: 'wechat' },
];
const PH_WALLETS = [
  { id: 'gcash',   name: 'GCash',    color: '#007DC5', si: 'gcash' },
  { id: 'maya',    name: 'Maya',     color: '#00C282', text: 'maya' },
  { id: 'grabpay', name: 'GrabPay',  color: '#00B14F', text: 'Grab' },
];
const PH_BANKS = [
  { id: 'bpi',       name: 'BPI',       color: '#BF0000', text: 'BPI' },
  { id: 'bdo',       name: 'BDO',       color: '#0032A0', text: 'BDO' },
  { id: 'unionbank', name: 'UnionBank', color: '#E31B23', text: 'UB' },
  { id: 'rcbc',      name: 'RCBC',      color: '#076F3C', text: 'RCBC' },
  { id: 'metrobank', name: 'Metrobank', color: '#1D4289', text: 'MB' },
  { id: 'psb',       name: 'PSBank',    color: '#003087', text: 'PSB' },
];
const USDT_BRAND = { id: 'tether', name: 'USDT', color: '#26A17B', si: 'tether' };

/** Render the right logo for any brand entry */
function BrandLogo({ brand, size = 28, white = false }: {
  brand: typeof CHINESE[0] | typeof PH_WALLETS[0] | typeof PH_BANKS[0];
  size?: number;
  white?: boolean;
}) {
  if ('si' in brand && brand.si) {
    return <SiLogo slug={brand.si} color={brand.color} size={size} white={white} />;
  }
  if ('text' in brand && brand.text) {
    return <TextLogo text={brand.text} bg={white ? 'transparent' : brand.color} fg={white ? '#ffffff' : '#ffffff'} size={size} />;
  }
  return null;
}

/* ─── Hero floating card ──────────────────────────────────────── */
function PaymentCard({ icon, name, amount, statusLabel, statusCls }: {
  icon: React.ReactNode; name: string; amount: string;
  statusLabel: string; statusCls: string;
}) {
  return (
    <div className="bg-[#111827]/90 backdrop-blur border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[196px]">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <div>
          <p className="text-white font-semibold text-sm">{name}</p>
          <p className="text-slate-400 text-xs">Payment Method</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white font-bold text-lg">{amount}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

/* ─── Marquee ─────────────────────────────────────────────────── */
type MarqueeItem = { icon: React.ReactNode; name: string };

function MarqueeStrip({ items, reverse = false }: { items: MarqueeItem[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden w-full py-1.5">
      <div
        className={`flex gap-4 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}
        style={{ width: 'max-content' }}
      >
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2 whitespace-nowrap">
            {item.icon}
            <span className="text-slate-300 text-xs font-medium">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MARQUEE_ITEMS: MarqueeItem[] = [
  ...CHINESE.map(b => ({ icon: <SiLogo slug={b.si} color={b.color} size={18} />, name: b.name })),
  ...PH_WALLETS.map(b => ({
    icon: 'si' in b ? <SiLogo slug={(b as any).si} color={b.color} size={18} />
                    : <TextLogo text={(b as any).text} bg={b.color} size={18} radius={4} />,
    name: b.name,
  })),
  ...PH_BANKS.map(b => ({ icon: <TextLogo text={b.text} bg={b.color} size={18} radius={4} />, name: b.name })),
  { icon: <SiLogo slug={USDT_BRAND.si} color={USDT_BRAND.color} size={18} />, name: 'USDT T+0' },
];

/* ═══════════════════════════════════════════════════════════════ */

export default function Login() {
  const { user, loginWithTelegram, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string>(
    (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
  );

  const scrollToLogin = () =>
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  useEffect(() => {
    let canceled = false;
    const resolveBotUsername = async () => {
      if (botUsername) return botUsername;
      try {
        const response = await fetch('/api/v1/auth/telegram-login-config');
        if (!response.ok) return '';
        const data = await response.json();
        const runtimeUsername = (data?.bot_username || '').toString().trim();
        if (!canceled && runtimeUsername) setBotUsername(runtimeUsername);
        return runtimeUsername;
      } catch { return ''; }
    };
    const renderWidget = async () => {
      const resolvedUsername = await resolveBotUsername();
      if (!resolvedUsername) {
        setLocalError('Telegram sign-in is not configured. Please set TELEGRAM_BOT_USERNAME.');
        return;
      }
      if (!widgetContainerRef.current) return;
      setLocalError(null);
      window.onTelegramAuth = async (telegramUser: TelegramWidgetUser) => {
        setSubmitting(true);
        setLocalError(null);
        await loginWithTelegram(telegramUser);
        setSubmitting(false);
      };
      widgetContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', resolvedUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-userpic', 'false');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      widgetContainerRef.current.appendChild(script);
    };
    renderWidget();
    return () => {
      canceled = true;
      if (widgetContainerRef.current) widgetContainerRef.current.innerHTML = '';
      delete window.onTelegramAuth;
    };
  }, [botUsername, loginWithTelegram]);

  if (user) return <Navigate to="/intro" replace />;

  return (
    <div className="min-h-screen bg-[#040C18] text-white overflow-x-hidden">

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#040C18]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">{APP_NAME}</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#payments" className="text-slate-400 hover:text-white text-sm transition-colors"
              onClick={e => { e.preventDefault(); document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Payments
            </a>
            <a href="#banks" className="text-slate-400 hover:text-white text-sm transition-colors"
              onClick={e => { e.preventDefault(); document.getElementById('banks')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Banks
            </a>
            <a href="#settlement" className="text-slate-400 hover:text-white text-sm transition-colors"
              onClick={e => { e.preventDefault(); document.getElementById('settlement')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Settlement
            </a>
          </nav>

          <button
            onClick={scrollToLogin}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors shadow-lg shadow-blue-600/25"
          >
            Sign In <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-0">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-700/10 blur-[120px] rounded-full" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left — copy */}
            <div className="py-16 lg:py-24">
              <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/25 rounded-full px-4 py-1.5 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Now live in the Philippines</span>
              </div>

              <h1 className="text-4xl lg:text-6xl font-extrabold text-white leading-[1.12] tracking-tight mb-6">
                Accept{' '}
                <span style={{ color: '#1677FF' }}>Alipay</span>,{' '}
                <span style={{ color: '#07C160' }}>WeChat</span>,{' '}
                <span style={{ color: '#007DC5' }}>GCash</span>{' '}
                <br className="hidden lg:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  &amp; All PH Banks.
                </span>
              </h1>

              <p className="text-slate-400 text-lg leading-relaxed mb-8 max-w-lg">
                The unified Telegram payment platform for Philippine merchants. Accept from Chinese tourists, GCash, Maya, GrabPay and all major PH banks — settle in{' '}
                <span className="text-emerald-400 font-semibold">USDT same day</span>.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <button
                  onClick={scrollToLogin}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-full text-sm transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                >
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to="/features"
                  className="flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-slate-300 hover:text-white font-semibold px-7 py-3.5 rounded-full text-sm transition-all"
                >
                  View Features <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Payment logos row */}
              <div className="flex flex-wrap items-center gap-3">
                {[...CHINESE, ...PH_WALLETS.slice(0, 2)].map(b => (
                  <div key={b.id} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
                    {'si' in b
                      ? <SiLogo slug={(b as any).si} color={b.color} size={16} />
                      : <TextLogo text={(b as any).text} bg={b.color} size={16} radius={3} />
                    }
                    <span className="text-slate-400 text-xs">{b.name}</span>
                  </div>
                ))}
                <span className="text-slate-600 text-xs">+10 more</span>
              </div>

              <div className="flex flex-wrap items-center gap-5 mt-5">
                {[
                  { icon: <Shield className="h-3.5 w-3.5 text-emerald-400" />, label: 'KYC / KYB Verified' },
                  { icon: <Zap className="h-3.5 w-3.5 text-amber-400" />, label: 'Real-time Alerts' },
                  { icon: <Bell className="h-3.5 w-3.5 text-blue-400" />, label: 'Telegram Native' },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-slate-400 text-xs">
                    {icon} {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — floating payment cards */}
            <div className="relative hidden lg:flex items-center justify-center py-16">
              <div className="relative w-full max-w-sm">
                <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full" />
                <div className="relative space-y-3">
                  <PaymentCard
                    icon={<BrandSquare slug="alipay" bg="#1677FF" size={40} />}
                    name="Alipay QR"
                    amount="¥ 1,200.00"
                    statusLabel="Accepted"
                    statusCls="bg-blue-500/20 text-blue-300"
                  />
                  <div className="ml-6">
                    <PaymentCard
                      icon={<BrandSquare slug="wechat" bg="#07C160" size={40} />}
                      name="WeChat Pay"
                      amount="¥ 880.00"
                      statusLabel="Settled"
                      statusCls="bg-emerald-500/20 text-emerald-300"
                    />
                  </div>
                  <PaymentCard
                    icon={<BrandSquare slug="gcash" bg="#007DC5" size={40} />}
                    name="GCash"
                    amount="₱ 2,500.00"
                    statusLabel="Accepted"
                    statusCls="bg-sky-500/20 text-sky-300"
                  />
                  <div className="ml-8">
                    <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl">
                      <div className="flex items-center gap-3">
                        <BrandSquare slug="tether" bg="#26A17B" size={40} />
                        <div>
                          <p className="text-emerald-300 font-bold text-base">+$87.42 USDT</p>
                          <p className="text-emerald-500 text-xs">T+0 Settlement • Today</p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 ml-auto" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-3 -right-3 bg-emerald-500 rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PARTNER MARQUEE ─────────────────────────────────────── */}
      <section className="py-8 border-y border-white/[0.05] bg-white/[0.01]">
        <p className="text-center text-slate-500 text-xs font-semibold tracking-widest uppercase mb-4">
          Supported Payment Networks
        </p>
        <MarqueeStrip items={MARQUEE_ITEMS} />
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────── */}
      <section className="py-14 border-b border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '10+', label: 'Payment Methods', sub: 'Chinese · PH wallets · Banks' },
              { value: 'T+0', label: 'Settlement', sub: 'USDT same-day payout' },
              { value: '100%', label: 'Telegram Native', sub: 'No app install needed' },
              { value: 'KYC', label: 'KYB Verified',   sub: 'Compliance ready' },
            ].map(({ value, label, sub }) => (
              <div key={label}>
                <p className="text-4xl font-extrabold text-white mb-1">{value}</p>
                <p className="text-slate-300 font-semibold text-sm mb-0.5">{label}</p>
                <p className="text-slate-500 text-xs">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAYMENT METHODS ─────────────────────────────────────── */}
      <section id="payments" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              One bot. Every payment network.
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Accept from Chinese tourists and Filipino customers. All through a single Telegram bot.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">

            {/* ── Alipay ── */}
            <div className="relative bg-gradient-to-br from-[#0D1F4A] to-[#0A1530] border border-[#1677FF]/25 rounded-3xl p-8 overflow-hidden group hover:border-[#1677FF]/50 transition-all hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#1677FF]/5 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-5">
                  <BrandSquare slug="alipay" bg="#1677FF" size={56} radius={14} />
                  <div>
                    <h3 className="text-xl font-bold text-white">Alipay QR</h3>
                    <p className="text-slate-400 text-sm">Chinese e-wallet · Cross-border</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Generate dynamic QR codes for instant Alipay payments. Ideal for Chinese tourists — one of the world's largest digital wallets with 1B+ users.
                </p>
                <ul className="space-y-2">
                  {['Scan & pay in seconds', 'CNY multi-currency support', 'Real-time confirmation'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#1677FF' }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── WeChat Pay ── */}
            <div className="relative bg-gradient-to-br from-[#0A2B1A] to-[#071A10] border border-[#07C160]/25 rounded-3xl p-8 overflow-hidden group hover:border-[#07C160]/50 transition-all hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#07C160]/5 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-5">
                  <BrandSquare slug="wechat" bg="#07C160" size={56} radius={14} />
                  <div>
                    <h3 className="text-xl font-bold text-white">WeChat Pay</h3>
                    <p className="text-slate-400 text-sm">Chinese super-app · 900M users</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Accept WeChat Pay QR payments from the world's most-used super-app ecosystem. Tap into 900M+ active users and instant CNY settlements.
                </p>
                <ul className="space-y-2">
                  {['QR-code based checkout', 'CNY & multi-currency', 'Instant settlement'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#07C160' }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── PH E-Wallets ── */}
          <div className="relative bg-gradient-to-br from-[#0A1E35] to-[#07141F] border border-[#007DC5]/25 rounded-3xl p-8 overflow-hidden group hover:border-[#007DC5]/35 transition-all mb-6">
            <div className="absolute top-0 right-0 w-72 h-72 bg-[#007DC5]/4 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-1">Philippine E-Wallets</h3>
                  <p className="text-slate-400 text-sm mb-5">Accept from all major Philippine digital wallets via PayMongo.</p>
                  <div className="flex flex-wrap gap-3 mb-6">
                    {PH_WALLETS.map(b => (
                      <div key={b.id} className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2">
                        {'si' in b
                          ? <SiLogo slug={(b as any).si} color={b.color} size={20} />
                          : <TextLogo text={(b as any).text} bg={b.color} size={20} radius={4} />
                        }
                        <span className="text-slate-200 text-sm font-medium">{b.name}</span>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-2">
                    {['E-wallet checkout link via PayMongo', '70M+ GCash users', '30M+ Maya users', 'Grab ecosystem integration'].map(f => (
                      <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#007DC5' }} /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* ── PH Banks ── */}
          <div id="banks" className="relative bg-gradient-to-br from-[#15101A] to-[#0E0B14] border border-purple-500/20 rounded-3xl p-8 overflow-hidden group hover:border-purple-500/35 transition-all">
            <div className="absolute top-0 right-0 w-72 h-72 bg-purple-700/4 blur-3xl rounded-full" />
            <div className="relative">
              <h3 className="text-xl font-bold text-white mb-1">Philippine Banks</h3>
              <p className="text-slate-400 text-sm mb-6">InstaPay & PESONet transfers from all major PH banks — accepted instantly via QR or payment link.</p>
              <div className="flex flex-wrap gap-3 mb-6">
                {PH_BANKS.map(b => (
                  <div key={b.id} className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2">
                    <TextLogo text={b.text} bg={b.color} size={22} radius={5} />
                    <span className="text-slate-200 text-sm font-medium">{b.name}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-full px-4 py-2">
                  <span className="text-slate-400 text-sm">+100 more banks</span>
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-8 gap-y-2">
                {['Instant credit notifications via Telegram', 'InstaPay & PESONet supported', 'QR Ph / payment links', 'Automatic reconciliation'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* ── USDT SETTLEMENT ─────────────────────────────────────── */}
      <section id="settlement" className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/30 via-transparent to-emerald-950/10 pointer-events-none" />
        <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-700/6 blur-[120px] rounded-full" />

        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-14 items-center">

            {/* Visual */}
            <div className="relative order-2 lg:order-1">
              <div className="bg-[#0A1A12]/80 border border-emerald-500/20 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <BrandSquare slug="tether" bg="#26A17B" size={48} radius={12} />
                  <div>
                    <p className="text-emerald-300 font-bold text-lg">USDT Settlement</p>
                    <p className="text-slate-400 text-sm">Tether • TRC-20 / ERC-20</p>
                  </div>
                  <span className="ml-auto bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30">T+0</span>
                </div>

                <div className="space-y-3 mb-6">
                  {[
                    { method: 'Alipay Collection', amount: '+$42.10 USDT', time: 'Today 14:30' },
                    { method: 'WeChat Pay',         amount: '+$28.55 USDT', time: 'Today 12:15' },
                    { method: 'GCash / PH Banks',   amount: '+$16.77 USDT', time: 'Today 10:02' },
                  ].map(({ method, amount, time }) => (
                    <div key={method} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-medium">{method}</p>
                        <p className="text-slate-500 text-xs">{time}</p>
                      </div>
                      <span className="text-emerald-400 font-bold text-sm">{amount}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs">Total settled today</p>
                    <p className="text-emerald-300 font-extrabold text-2xl">$87.42 USDT</p>
                  </div>
                  <div className="h-12 w-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/25 rounded-full px-4 py-1.5 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 text-xs font-semibold tracking-wide uppercase">T+0 Same-Day Settlement</span>
              </div>

              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
                Receive your earnings<br />
                <span className="text-emerald-400">in USDT. Same day.</span>
              </h2>

              <p className="text-slate-400 text-lg leading-relaxed mb-8">
                No waiting 3–5 business days. All your Alipay, WeChat Pay, GCash, Maya, and PH bank collections are automatically converted and settled to your wallet in USDT at end of day.
              </p>

              <div className="space-y-4">
                {[
                  { title: 'No bank delays',     desc: 'Bypass traditional banking rails. USDT lands in your wallet same day.' },
                  { title: 'Borderless payouts', desc: 'Send USDT to any wallet worldwide. No remittance fees, no FX friction.' },
                  { title: 'Fully transparent',  desc: 'Every settlement is logged with a tx hash. Full audit trail in your dashboard.' },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-4">
                    <div className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm mb-0.5">{title}</p>
                      <p className="text-slate-400 text-sm">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="py-20 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">How it works</h2>
            <p className="text-slate-400 text-lg">Three simple steps — from payment request to USDT settlement.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-[calc(16.7%+1rem)] right-[calc(16.7%+1rem)] h-px bg-gradient-to-r from-blue-600/40 via-emerald-600/40 to-emerald-600/40" />
            {[
              { step: '01', color: 'bg-blue-600',    border: 'border-blue-500/30',    accent: 'text-blue-400',    title: 'Choose a method', desc: 'Select from Alipay, WeChat Pay, GCash, Maya, GrabPay or any PH bank. Share the QR or payment link with your customer.' },
              { step: '02', color: 'bg-purple-600',  border: 'border-purple-500/30',  accent: 'text-purple-400',  title: 'Customer pays',   desc: 'Customer scans the QR or opens the link and completes payment. You receive an instant Telegram notification.' },
              { step: '03', color: 'bg-emerald-600', border: 'border-emerald-500/30', accent: 'text-emerald-400', title: 'Receive USDT T+0', desc: 'Your balance is settled in USDT to your wallet by end of day. No waiting. No bank forms.' },
            ].map(({ step, color, border, accent, title, desc }) => (
              <div key={step} className={`bg-white/[0.02] border ${border} rounded-2xl p-7 text-center relative`}>
                <div className={`h-14 w-14 ${color} rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg`}>
                  <span className="text-white font-extrabold text-lg">{step}</span>
                </div>
                <h3 className={`font-bold text-white text-lg mb-2 ${accent}`}>{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOGIN / CTA SECTION ─────────────────────────────────── */}
      <section ref={loginSectionRef} className="py-24 border-t border-white/[0.05] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-700/8 blur-[100px] rounded-full" />
        </div>

        <div className="relative max-w-lg mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/25 rounded-full px-4 py-1.5 mb-5">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Telegram Authentication</span>
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-slate-400 text-base mb-10">
            Sign in with your authorized Telegram account to access the{' '}
            <span className="text-white font-medium">{APP_NAME}</span> dashboard.
          </p>

          <div className="bg-[#0A1628]/80 border border-white/[0.10] rounded-3xl p-8 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex justify-center mb-5" ref={widgetContainerRef} />

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-slate-300 text-sm mb-4">
                <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Signing in…
              </div>
            )}
            {(localError || error) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                {localError || error}
              </div>
            )}
            {loading && !submitting && (
              <p className="text-slate-500 text-sm text-center mb-4">Checking session…</p>
            )}

            <div className="border-t border-white/[0.06] pt-5 space-y-3">
              <Link
                to="/register"
                className="flex items-center justify-between w-full bg-emerald-500/8 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/35 text-emerald-300 hover:text-emerald-200 text-sm font-semibold py-3.5 px-5 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create an account
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </Link>
              <p className="text-slate-600 text-xs text-center pt-1">
                Need access?{' '}
                <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sky-500 hover:text-sky-400 transition-colors">
                  Contact @traxionpay
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{APP_NAME}</p>
                <p className="text-slate-500 text-xs">by {COMPANY_NAME}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              {[...CHINESE, ...PH_WALLETS.slice(0, 2), USDT_BRAND].map(b => (
                <div key={b.id} className="flex items-center gap-1.5 text-slate-500 text-xs">
                  {'si' in b
                    ? <SiLogo slug={(b as any).si} color={b.color} size={16} />
                    : <TextLogo text={(b as any).text} bg={b.color} size={16} radius={3} />
                  }
                  {b.name}
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs">
              © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
