import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight, ChevronRight, CheckCircle2, Zap, Shield,
  Bell, UserPlus, Bot, Menu, X,
} from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL } from '@/lib/brand';

declare global {
  interface Window { onTelegramAuth?: (user: TelegramWidgetUser) => void; }
}

/* ─── Logo helpers ─────────────────────────────────────────────── */

/**
 * Simple Icons SVG (black path) displayed as white icon
 * inside a branded colored rounded square.
 */
function SiIcon({
  src, alt, bg, size = 40,
}: { src: string; alt: string; bg: string; size?: number }) {
  const r = Math.round(size * 0.24);
  const p = Math.round(size * 0.19);
  return (
    <div
      style={{
        width: size, height: size, background: bg, borderRadius: r,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: p, flexShrink: 0,
      }}
    >
      <img
        src={src} alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
      />
    </div>
  );
}

/**
 * Pre-coloured SVG/image logo (GCash, Maya, banks…).
 * Wraps in a rounded frame so it looks consistent with SiIcon.
 */
function ImgIcon({
  src, alt, size = 40,
}: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src} alt={alt}
      style={{ height: size, width: 'auto', objectFit: 'contain', borderRadius: 8, flexShrink: 0 }}
    />
  );
}

/* Convenience wrappers */
const Logo = {
  Alipay:    (s = 40) => <SiIcon  src="/logos/alipay.svg"    alt="Alipay"     bg="#1677FF" size={s} />,
  WeChat:    (s = 40) => <SiIcon  src="/logos/wechat.svg"    alt="WeChat Pay" bg="#07C160" size={s} />,
  GCash:     (s = 40) => <ImgIcon src="/logos/gcash.svg"     alt="GCash"      size={s} />,
  Maya:      (s = 40) => <ImgIcon src="/logos/maya.svg"      alt="Maya"       size={s} />,
  GrabPay:   (s = 40) => <SiIcon  src="/logos/grab.svg"      alt="GrabPay"    bg="#00B14F" size={s} />,
  BPI:       (s = 40) => <ImgIcon src="/logos/bpi.svg"       alt="BPI"        size={s} />,
  BDO:       (s = 40) => <ImgIcon src="/logos/bdo.svg"       alt="BDO"        size={s} />,
  UnionBank: (s = 40) => <ImgIcon src="/logos/unionbank.svg" alt="UnionBank"  size={s} />,
  Metrobank: (s = 40) => <ImgIcon src="/logos/metrobank.svg" alt="Metrobank"  size={s} />,
  RCBC:      (s = 40) => <ImgIcon src="/logos/rcbc.svg"      alt="RCBC"       size={s} />,
  PSBank:    (s = 40) => <ImgIcon src="/logos/psbank.svg"    alt="PSBank"     size={s} />,
  USDT:      (s = 40) => <SiIcon  src="/logos/tether.svg"    alt="USDT"       bg="#26A17B" size={s} />,
};

/* ─── Marquee ─────────────────────────────────────────────────── */
type MItem = { icon: React.ReactNode; name: string };

function Marquee({ items, reverse = false }: { items: MItem[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden w-full py-1">
      <div
        className={reverse ? 'animate-marquee-reverse' : 'animate-marquee'}
        style={{ display: 'flex', gap: 12, width: 'max-content' }}
      >
        {doubled.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1.5 whitespace-nowrap"
          >
            {item.icon}
            <span className="text-slate-300 text-xs font-medium">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MARQUEE: MItem[] = [
  { icon: Logo.Alipay(18),    name: 'Alipay' },
  { icon: Logo.WeChat(18),    name: 'WeChat Pay' },
  { icon: Logo.GCash(18),     name: 'GCash' },
  { icon: Logo.Maya(18),      name: 'Maya' },
  { icon: Logo.GrabPay(18),   name: 'GrabPay' },
  { icon: Logo.BPI(18),       name: 'BPI' },
  { icon: Logo.BDO(18),       name: 'BDO' },
  { icon: Logo.UnionBank(18), name: 'UnionBank' },
  { icon: Logo.Metrobank(18), name: 'Metrobank' },
  { icon: Logo.RCBC(18),      name: 'RCBC' },
  { icon: Logo.PSBank(18),    name: 'PSBank' },
  { icon: Logo.USDT(18),      name: 'USDT T+0' },
];

/* ─── Hero payment card ───────────────────────────────────────── */
function HeroCard({
  icon, name, amount, statusLabel, statusCls,
}: { icon: React.ReactNode; name: string; amount: string; statusLabel: string; statusCls: string }) {
  return (
    <div className="bg-[#0D1626]/90 backdrop-blur border border-white/10 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <div>
          <p className="text-white font-semibold text-sm">{name}</p>
          <p className="text-slate-400 text-xs">Payment Method</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-white font-bold">{amount}</span>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */

export default function Login() {
  const { user, loginWithTelegram, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string>(
    (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
  );

  const scrollToLogin = () => {
    setMobileNavOpen(false);
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    let canceled = false;
    const resolveBotUsername = async () => {
      if (botUsername) return botUsername;
      try {
        const res = await fetch('/api/v1/auth/telegram-login-config');
        if (!res.ok) return '';
        const data = await res.json();
        const ru = (data?.bot_username || '').toString().trim();
        if (!canceled && ru) setBotUsername(ru);
        return ru;
      } catch { return ''; }
    };
    const renderWidget = async () => {
      const u = await resolveBotUsername();
      if (!u) { setLocalError('Telegram sign-in is not configured. Please set TELEGRAM_BOT_USERNAME.'); return; }
      if (!widgetContainerRef.current) return;
      setLocalError(null);
      window.onTelegramAuth = async (tgUser: TelegramWidgetUser) => {
        setSubmitting(true); setLocalError(null);
        await loginWithTelegram(tgUser);
        setSubmitting(false);
      };
      widgetContainerRef.current.innerHTML = '';
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://telegram.org/js/telegram-widget.js?22';
      s.setAttribute('data-telegram-login', u);
      s.setAttribute('data-size', 'large');
      s.setAttribute('data-userpic', 'false');
      s.setAttribute('data-onauth', 'onTelegramAuth(user)');
      s.setAttribute('data-request-access', 'write');
      widgetContainerRef.current.appendChild(s);
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 sm:h-9 sm:w-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="font-bold text-base sm:text-lg text-white tracking-tight">{APP_NAME}</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {[
              { label: 'Payments',   id: 'payments' },
              { label: 'Banks',      id: 'banks' },
              { label: 'Settlement', id: 'settlement' },
            ].map(({ label, id }) => (
              <a key={id} href={`#${id}`}
                className="text-slate-400 hover:text-white text-sm transition-colors"
                onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
              >{label}</a>
            ))}
            <Link to="/features" className="text-slate-400 hover:text-white text-sm transition-colors">Features</Link>
            <Link to="/pricing"  className="text-slate-400 hover:text-white text-sm transition-colors">Pricing</Link>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={scrollToLogin}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-full transition-colors shadow-lg shadow-blue-600/25"
            >
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 text-slate-400 hover:text-white"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#040C18]/95 px-4 py-4 space-y-1">
            {[
              { label: 'Payments',   id: 'payments' },
              { label: 'Banks',      id: 'banks' },
              { label: 'Settlement', id: 'settlement' },
            ].map(({ label, id }) => (
              <a key={id} href={`#${id}`}
                className="block py-2.5 text-slate-300 hover:text-white text-sm font-medium transition-colors"
                onClick={e => { e.preventDefault(); setMobileNavOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
              >{label}</a>
            ))}
            <Link to="/features" className="block py-2.5 text-slate-300 hover:text-white text-sm font-medium transition-colors" onClick={() => setMobileNavOpen(false)}>Features</Link>
            <Link to="/pricing"  className="block py-2.5 text-slate-300 hover:text-white text-sm font-medium transition-colors" onClick={() => setMobileNavOpen(false)}>Pricing</Link>
            <Link to="/register" className="block py-2.5 text-emerald-400 hover:text-emerald-300 text-sm font-semibold transition-colors" onClick={() => setMobileNavOpen(false)}>Create an account →</Link>
          </div>
        )}
      </header>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[400px] sm:h-[500px] bg-blue-700/10 blur-[100px] sm:blur-[120px] rounded-full" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

            {/* Left — copy */}
            <div className="pt-12 pb-8 sm:pt-16 sm:pb-10 lg:py-24 text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/25 rounded-full px-3 sm:px-4 py-1.5 mb-5 sm:mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Now live in the Philippines</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-5 sm:mb-6">
                Accept{' '}
                <span style={{ color: '#1677FF' }}>Alipay</span>,{' '}
                <span style={{ color: '#07C160' }}>WeChat</span>,{' '}
                <span style={{ color: '#007DC5' }}>GCash</span>
                <br className="hidden sm:block" />{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  &amp; All PH Banks.
                </span>
              </h1>

              <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-7 sm:mb-8 max-w-lg mx-auto lg:mx-0">
                The unified Telegram payment platform for Philippine merchants. Accept from Chinese tourists,
                GCash, Maya, GrabPay and all major PH banks — settle in{' '}
                <span className="text-emerald-400 font-semibold">USDT same day</span>.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
                <button
                  onClick={scrollToLogin}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3.5 rounded-full text-sm transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 w-full sm:w-auto"
                >
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to="/features"
                  className="flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-slate-300 hover:text-white font-semibold px-7 py-3.5 rounded-full text-sm transition-all w-full sm:w-auto"
                >
                  View Features <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-5 justify-center lg:justify-start">
                {[
                  { icon: <Shield className="h-3.5 w-3.5 text-emerald-400" />, label: 'KYC / KYB Verified'  },
                  { icon: <Zap    className="h-3.5 w-3.5 text-amber-400"   />, label: 'Real-time Alerts'    },
                  { icon: <Bell   className="h-3.5 w-3.5 text-blue-400"    />, label: 'Telegram Native'     },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-slate-400 text-xs">
                    {icon} {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — floating payment cards (desktop only) */}
            <div className="relative hidden lg:flex items-center justify-center py-16">
              <div className="relative w-full max-w-sm">
                <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full" />
                <div className="relative space-y-3">
                  <HeroCard icon={Logo.Alipay(40)}  name="Alipay QR"  amount="¥ 1,200.00" statusLabel="Accepted" statusCls="bg-blue-500/20 text-blue-300" />
                  <div className="ml-6">
                    <HeroCard icon={Logo.WeChat(40)} name="WeChat Pay" amount="¥ 880.00"   statusLabel="Settled"  statusCls="bg-emerald-500/20 text-emerald-300" />
                  </div>
                  <HeroCard icon={Logo.GCash(40)}   name="GCash"      amount="₱ 2,500.00" statusLabel="Accepted" statusCls="bg-sky-500/20 text-sky-300" />
                  <div className="ml-8">
                    <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl">
                      <div className="flex items-center gap-3">
                        {Logo.USDT(40)}
                        <div>
                          <p className="text-emerald-300 font-bold">+$87.42 USDT</p>
                          <p className="text-emerald-500 text-xs">T+0 Settlement • Today</p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 ml-auto" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-3 -right-3 bg-emerald-500 rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
                </div>
              </div>
            </div>
          </div>

          {/* Mobile — logo grid (shown instead of floating cards) */}
          <div className="lg:hidden pb-10">
            <p className="text-center text-slate-500 text-xs font-semibold tracking-widest uppercase mb-4">Accepted payments</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {[
                { el: Logo.Alipay(44),    label: 'Alipay'    },
                { el: Logo.WeChat(44),    label: 'WeChat'    },
                { el: Logo.GCash(44),     label: 'GCash'     },
                { el: Logo.Maya(44),      label: 'Maya'      },
                { el: Logo.GrabPay(44),   label: 'GrabPay'   },
                { el: Logo.BPI(44),       label: 'BPI'       },
                { el: Logo.BDO(44),       label: 'BDO'       },
                { el: Logo.UnionBank(44), label: 'UnionBank' },
                { el: Logo.Metrobank(44), label: 'Metrobank' },
                { el: Logo.RCBC(44),      label: 'RCBC'      },
                { el: Logo.PSBank(44),    label: 'PSBank'    },
                { el: Logo.USDT(44),      label: 'USDT'      },
              ].map(({ el, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  {el}
                  <span className="text-slate-400 text-[10px] font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ─────────────────────────────────────────────── */}
      <section className="py-6 sm:py-8 border-y border-white/[0.05] bg-white/[0.01]">
        <p className="text-center text-slate-500 text-[10px] sm:text-xs font-semibold tracking-widest uppercase mb-4">
          Supported Payment Networks
        </p>
        <Marquee items={MARQUEE} />
      </section>

      {/* ── STATS ───────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-b border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { value: '10+',  label: 'Payment Methods', sub: 'Chinese · PH wallets · Banks' },
              { value: 'T+0',  label: 'Settlement',      sub: 'USDT same-day payout'          },
              { value: '100%', label: 'Telegram Native', sub: 'No app install needed'          },
              { value: 'KYC',  label: 'KYB Verified',    sub: 'Compliance ready'               },
            ].map(({ value, label, sub }) => (
              <div key={label} className="py-2">
                <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">{value}</p>
                <p className="text-slate-300 font-semibold text-xs sm:text-sm mb-0.5">{label}</p>
                <p className="text-slate-500 text-[11px] sm:text-xs">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAYMENT METHODS ─────────────────────────────────────── */}
      <section id="payments" className="py-14 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
              One bot. Every payment network.
            </h2>
            <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
              Accept from Chinese tourists and Filipino customers through a single Telegram bot.
            </p>
          </div>

          {/* Chinese wallets */}
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">

            {/* Alipay */}
            <div className="relative bg-gradient-to-br from-[#0D1F4A] to-[#0A1530] border border-[#1677FF]/25 rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden group hover:border-[#1677FF]/50 transition-all hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#1677FF]/5 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-4 sm:mb-5">
                  {Logo.Alipay(52)}
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white">Alipay QR</h3>
                    <p className="text-slate-400 text-xs sm:text-sm">Chinese e-wallet · Cross-border</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-5">
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

            {/* WeChat Pay */}
            <div className="relative bg-gradient-to-br from-[#0A2B1A] to-[#071A10] border border-[#07C160]/25 rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden group hover:border-[#07C160]/50 transition-all hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#07C160]/5 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-4 sm:mb-5">
                  {Logo.WeChat(52)}
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white">WeChat Pay</h3>
                    <p className="text-slate-400 text-xs sm:text-sm">Chinese super-app · 900M users</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed mb-5">
                  Accept WeChat Pay QR payments from the world's most-used super-app. Tap into 900M+ active users and instant CNY settlements.
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

          {/* PH E-Wallets */}
          <div className="relative bg-gradient-to-br from-[#0A1E35] to-[#07141F] border border-[#007DC5]/25 rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-[#007DC5]/40 transition-all mb-4 sm:mb-6">
            <div className="absolute top-0 right-0 w-60 h-60 bg-[#007DC5]/4 blur-3xl rounded-full" />
            <div className="relative">
              <div className="mb-4 sm:mb-5">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Philippine E-Wallets</h3>
                <p className="text-slate-400 text-sm">Accept from all major Philippine digital wallets via PayMongo.</p>
              </div>
              <div className="flex flex-wrap gap-3 sm:gap-4 mb-5 sm:mb-6">
                {[
                  { el: Logo.GCash(40),   label: 'GCash'   },
                  { el: Logo.Maya(40),    label: 'Maya'    },
                  { el: Logo.GrabPay(40), label: 'GrabPay' },
                ].map(({ el, label }) => (
                  <div key={label} className="flex items-center gap-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5">
                    {el}
                    <span className="text-slate-200 text-sm font-semibold">{label}</span>
                  </div>
                ))}
              </div>
              <ul className="grid sm:grid-cols-2 gap-2">
                {[
                  'E-wallet checkout via PayMongo',
                  '70M+ GCash users',
                  '30M+ Maya users',
                  'GrabPay ecosystem integration',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#007DC5' }} /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* PH Banks */}
          <div id="banks" className="relative bg-gradient-to-br from-[#15101A] to-[#0E0B14] border border-purple-500/20 rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-purple-500/35 transition-all">
            <div className="absolute top-0 right-0 w-60 h-60 bg-purple-700/4 blur-3xl rounded-full" />
            <div className="relative">
              <div className="mb-4 sm:mb-5">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Philippine Banks</h3>
                <p className="text-slate-400 text-sm">InstaPay &amp; PESONet transfers from all major PH banks — accepted instantly via QR or payment link.</p>
              </div>
              <div className="flex flex-wrap gap-2.5 sm:gap-3 mb-5 sm:mb-6">
                {[
                  { el: Logo.BPI(36),       label: 'BPI'       },
                  { el: Logo.BDO(36),       label: 'BDO'       },
                  { el: Logo.UnionBank(36), label: 'UnionBank' },
                  { el: Logo.Metrobank(36), label: 'Metrobank' },
                  { el: Logo.RCBC(36),      label: 'RCBC'      },
                  { el: Logo.PSBank(36),    label: 'PSBank'    },
                ].map(({ el, label }) => (
                  <div key={label} className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2">
                    {el}
                    <span className="text-slate-300 text-xs sm:text-sm font-medium">{label}</span>
                  </div>
                ))}
                <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg sm:rounded-xl px-3 py-2">
                  <span className="text-slate-500 text-xs sm:text-sm">+100 more banks</span>
                </div>
              </div>
              <ul className="grid sm:grid-cols-2 gap-2">
                {[
                  'Instant credit notifications via Telegram',
                  'InstaPay & PESONet supported',
                  'QR Ph / payment links',
                  'Automatic reconciliation',
                ].map(f => (
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
      <section id="settlement" className="py-14 sm:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/30 via-transparent to-emerald-950/10 pointer-events-none" />
        <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-[400px] sm:w-[500px] h-[400px] sm:h-[500px] bg-emerald-700/6 blur-[120px] rounded-full" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-10 sm:gap-14 items-center">

            {/* Visual ledger */}
            <div className="relative lg:order-1">
              <div className="bg-[#0A1A12]/80 border border-emerald-500/20 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  {Logo.USDT(44)}
                  <div>
                    <p className="text-emerald-300 font-bold text-base sm:text-lg">USDT Settlement</p>
                    <p className="text-slate-400 text-xs sm:text-sm">Tether • TRC-20 / ERC-20</p>
                  </div>
                  <span className="ml-auto bg-emerald-500/20 text-emerald-300 text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full border border-emerald-500/30">T+0</span>
                </div>
                <div className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-6">
                  {[
                    { method: 'Alipay Collection',   amount: '+$42.10 USDT', time: 'Today 14:30' },
                    { method: 'WeChat Pay',           amount: '+$28.55 USDT', time: 'Today 12:15' },
                    { method: 'GCash / PH Banks',     amount: '+$16.77 USDT', time: 'Today 10:02' },
                  ].map(({ method, amount, time }) => (
                    <div key={method} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
                      <div>
                        <p className="text-white text-sm font-medium">{method}</p>
                        <p className="text-slate-500 text-xs">{time}</p>
                      </div>
                      <span className="text-emerald-400 font-bold text-sm">{amount}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">Total settled today</p>
                    <p className="text-emerald-300 font-extrabold text-xl sm:text-2xl">$87.42 USDT</p>
                  </div>
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-emerald-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="lg:order-2">
              <div className="inline-flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/25 rounded-full px-3 sm:px-4 py-1.5 mb-5 sm:mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 text-xs font-semibold tracking-wide uppercase">T+0 Same-Day Settlement</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
                Receive your earnings<br />
                <span className="text-emerald-400">in USDT. Same day.</span>
              </h2>
              <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-7 sm:mb-8">
                No waiting 3–5 business days. All your Alipay, WeChat Pay, GCash, Maya, and PH bank
                collections are automatically converted and settled to your wallet in USDT at end of day.
              </p>
              <div className="space-y-4">
                {[
                  { title: 'No bank delays',     desc: 'Bypass traditional banking rails. USDT lands in your wallet same day.' },
                  { title: 'Borderless payouts', desc: 'Send USDT to any wallet worldwide. No remittance fees, no FX friction.' },
                  { title: 'Fully transparent',  desc: 'Every settlement is logged with a tx hash. Full audit trail in your dashboard.' },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-3 sm:gap-4">
                    <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400" />
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
      <section className="py-14 sm:py-20 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">How it works</h2>
            <p className="text-slate-400 text-base sm:text-lg">Three steps — from payment request to USDT settlement.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            {[
              { step: '01', color: 'bg-blue-600',    border: 'border-blue-500/30',    accent: 'text-blue-400',    title: 'Choose a method', desc: 'Select Alipay, WeChat Pay, GCash, Maya, GrabPay or any PH bank. Share the QR or payment link.' },
              { step: '02', color: 'bg-purple-600',  border: 'border-purple-500/30',  accent: 'text-purple-400',  title: 'Customer pays',   desc: 'Customer scans the QR or opens the link. You get an instant Telegram notification.' },
              { step: '03', color: 'bg-emerald-600', border: 'border-emerald-500/30', accent: 'text-emerald-400', title: 'Receive USDT T+0', desc: 'Your balance is settled in USDT to your wallet by end of day. No waiting, no bank forms.' },
            ].map(({ step, color, border, accent, title, desc }) => (
              <div key={step} className={`bg-white/[0.02] border ${border} rounded-2xl p-5 sm:p-7 text-center`}>
                <div className={`h-12 w-12 sm:h-14 sm:w-14 ${color} rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg`}>
                  <span className="text-white font-extrabold text-base sm:text-lg">{step}</span>
                </div>
                <h3 className={`font-bold text-white text-base sm:text-lg mb-2 ${accent}`}>{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOGIN ───────────────────────────────────────────────── */}
      <section ref={loginSectionRef} className="py-16 sm:py-24 border-t border-white/[0.05] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] sm:w-[700px] h-[300px] sm:h-[400px] bg-blue-700/8 blur-[80px] sm:blur-[100px] rounded-full" />
        </div>
        <div className="relative max-w-md mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/25 rounded-full px-3 sm:px-4 py-1.5 mb-4 sm:mb-5">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Telegram Authentication</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-slate-400 text-sm sm:text-base mb-8 sm:mb-10">
            Sign in with your authorized Telegram account to access the{' '}
            <span className="text-white font-medium">{APP_NAME}</span> dashboard.
          </p>

          <div className="bg-[#0A1628]/80 border border-white/[0.10] rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/40 backdrop-blur">
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
            <div className="border-t border-white/[0.06] pt-4 sm:pt-5 space-y-3">
              <Link
                to="/register"
                className="flex items-center justify-between w-full bg-emerald-500/8 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/35 text-emerald-300 hover:text-emerald-200 text-sm font-semibold py-3 sm:py-3.5 px-4 sm:px-5 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Create an account
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-600 group-hover:text-emerald-400 transition-colors" />
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
      <footer className="border-t border-white/[0.06] py-8 sm:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">

          {/* Top row: brand + nav */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 sm:h-8 sm:w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{APP_NAME}</p>
                <p className="text-slate-500 text-xs">by {COMPANY_NAME}</p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500">
              <a href="#payments" className="hover:text-slate-300 transition-colors"
                onClick={e => { e.preventDefault(); document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Payments
              </a>
              <a href="#banks" className="hover:text-slate-300 transition-colors"
                onClick={e => { e.preventDefault(); document.getElementById('banks')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Banks
              </a>
              <Link to="/features" className="hover:text-slate-300 transition-colors">Features</Link>
              <Link to="/pricing"  className="hover:text-slate-300 transition-colors">Pricing</Link>
              <Link to="/register" className="hover:text-slate-300 transition-colors">Register</Link>
              <Link to="/policies" className="hover:text-slate-300 transition-colors">Policies</Link>
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Support</a>
            </nav>

            <p className="text-slate-600 text-xs text-center sm:text-right">
              © {new Date().getFullYear()} {COMPANY_NAME}.<br className="sm:hidden" /> All rights reserved.
            </p>
          </div>

          {/* Bottom row: payment logos */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-4 border-t border-white/[0.04]">
            {[
              { el: Logo.Alipay(20),    name: 'Alipay'    },
              { el: Logo.WeChat(20),    name: 'WeChat Pay' },
              { el: Logo.GCash(20),     name: 'GCash'     },
              { el: Logo.Maya(20),      name: 'Maya'      },
              { el: Logo.GrabPay(20),   name: 'GrabPay'   },
              { el: Logo.BPI(20),       name: 'BPI'       },
              { el: Logo.BDO(20),       name: 'BDO'       },
              { el: Logo.USDT(20),      name: 'USDT'      },
            ].map(({ el, name }) => (
              <div key={name} className="flex items-center gap-1.5 text-slate-500 text-xs">
                {el} {name}
              </div>
            ))}
          </div>

        </div>
      </footer>

    </div>
  );
}
