import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight, ChevronRight, CheckCircle2,
  UserPlus, Menu, X, Lock,
} from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';
import { APP_NAME, SUPPORT_LINKS, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

declare global {
  interface Window { onTelegramAuth?: (user: TelegramWidgetUser) => void; }
}

/* ─── Logo helpers ──────────────────────────────────────────────── */

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
  Alipay:    (s = 40) => <SiIcon  src="/logos/alipay.svg"    alt="Alipay"     bg="#0070FF" size={s} />,
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
/* ─── Hero payment card ─────────────────────────────────────── */
function HeroCard({
  icon, name, amount, statusLabel, statusCls,
}: { icon: React.ReactNode; name: string; amount: string; statusLabel: string; statusCls: string }) {
  return (
    <div className="glass-effect rounded-2xl p-4 card-shadow-lg hover-scale animate-float logo-pop">
      <div className="flex items-center gap-3 mb-3">
        <div className="animate-logo-entrance">
          {icon}
        </div>
        <div>
          <p className="text-[#141414] font-semibold text-sm">{name}</p>
          <p className="text-[#595959] text-xs">Payment Method</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[#141414] font-bold">{amount}</span>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

/* ─── Scroll reveal (IntersectionObserver) ──────────────────── */
function RevealGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('revealed'); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal-group ${className}`}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════════ */

/* ─── USDT daily seeded stats ─────────────────────────────────── */
const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function seededRand(seed: number): number {
  const x = Math.sin(seed + 9301) * 49297;
  return x - Math.floor(x);
}

function getDailyUsdtStats() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const total  = 5000 + seededRand(seed)     * 95000;  // $5,000 – $100,000
  const alipay =   50 + seededRand(seed + 1) * 1950;  // $50 – $2,000
  const wechat =   30 + seededRand(seed + 2) * 1470;  // $30 – $1,500
  const gcash  =   20 + seededRand(seed + 3) * 980;   // $20 – $1,000
  return { total, alipay, wechat, gcash };
}

/* ─── Marquee logo rows ─────────────────────────────────────── */
const MARQUEE_ROW_1 = [
  { el: Logo.Alipay(40),    label: 'Alipay'    },
  { el: Logo.WeChat(40),    label: 'WeChat'    },
  { el: Logo.GCash(40),     label: 'GCash'     },
  { el: Logo.Maya(40),      label: 'Maya'      },
  { el: Logo.GrabPay(40),   label: 'GrabPay'   },
  { el: Logo.BPI(40),       label: 'BPI'       },
];
const MARQUEE_ROW_2 = [
  { el: Logo.BDO(40),       label: 'BDO'       },
  { el: Logo.UnionBank(40), label: 'UnionBank' },
  { el: Logo.Metrobank(40), label: 'Metrobank' },
  { el: Logo.RCBC(40),      label: 'RCBC'      },
  { el: Logo.PSBank(40),    label: 'PSBank'    },
  { el: Logo.USDT(40),      label: 'USDT'      },
];

/* ═══════════════════════════════════════════════════════════════ */

/* ─── Social platform icons ─────────────────────────────────── */
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path d="M17.5 6.5A7.4 7.4 0 0 0 6.2 17.1L5 19l1.9-1.2a7.4 7.4 0 0 0 10.6-6.4 7.3 7.3 0 0 0-2.1-5.1-7.3 7.3 0 0 0-.9.2zm-5.3 11.4a6.1 6.1 0 0 1-3.1-.9l-.2-.1-2 .5.5-1.9-.2-.2a6.2 6.2 0 1 1 5 2.6zm3.4-4.7c-.2-.1-1-.5-1.2-.5-.2-.1-.3-.1-.4.1-.1.2-.5.5-.6.7-.1.1-.2.1-.4 0-.2-.1-.8-.3-1.5-1-.6-.5-.9-1.1-1-1.3-.1-.2 0-.3.1-.4l.3-.3.2-.3v-.3c0-.1-.4-1-.6-1.3-.1-.3-.3-.3-.4-.3h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 3.9 3.5.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1-.1-.2-.2-.2-.4-.3z" fill="white" />
    </svg>
  );
}

function MessengerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="url(#msgGradLogin)" />
      <defs>
        <linearGradient id="msgGradLogin" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00C6FF" />
          <stop offset="1" stopColor="#0068FF" />
        </linearGradient>
      </defs>
      <path d="M12 4C7.58 4 4 7.36 4 11.5c0 2.2 1.02 4.17 2.63 5.52V19l2.42-1.33c.64.18 1.33.28 2.04.28H12c4.42 0 8-3.36 8-7.5S16.42 4 12 4zm.79 9.78l-2.04-2.18-3.98 2.18 4.38-4.65 2.09 2.18 3.94-2.18-4.39 4.65z" fill="white" />
    </svg>
  );
}

export default function Login() {
  const { user, loginWithTelegram, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const usdtStats = getDailyUsdtStats();
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string>(
    (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
  );
  const [socialConfig, setSocialConfig] = useState<{ whatsapp_number: string; messenger_page_username: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/social-config')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSocialConfig(d))
      .catch(() => {});
  }, []);

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
      if (turnstileSiteKey && !turnstileToken) return;
      if (!widgetContainerRef.current) return;
      setLocalError(null);
      window.onTelegramAuth = async (tgUser: TelegramWidgetUser) => {
        setSubmitting(true); setLocalError(null);
        await loginWithTelegram(tgUser, turnstileToken ?? undefined);
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
  }, [botUsername, loginWithTelegram, turnstileToken, turnstileSiteKey]);

  if (user) return <Navigate to="/intro" replace />;

  return (
    <div className="min-h-screen bg-white text-[#141414] overflow-x-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b border-[#E8EAED] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt={APP_NAME} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl animate-logo-entrance hover:animate-logo-bounce" />
            <span className="font-bold text-base sm:text-lg text-[#141414] tracking-tight">{APP_NAME}</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link to="/features" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Features</Link>
            <Link to="/pricing" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Support</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={scrollToLogin}
              className="flex items-center gap-1.5 bg-[#0070FF] hover:bg-[#005FDD] text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-full transition-all hover-scale shadow-md shadow-blue-500/20"
            >
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 text-[#595959] hover:text-[#141414]"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#E8EAED] bg-white px-4 py-4 space-y-1">
            <Link to="/features" className="block py-2.5 text-[#595959] hover:text-[#0070FF] text-sm font-medium transition-colors" onClick={() => setMobileNavOpen(false)}>Features</Link>
            <Link to="/pricing" className="block py-2.5 text-[#595959] hover:text-[#0070FF] text-sm font-medium transition-colors" onClick={() => setMobileNavOpen(false)}>Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="block py-2.5 text-[#595959] hover:text-[#0070FF] text-sm font-medium transition-colors" onClick={() => setMobileNavOpen(false)}>Support</a>
          </div>
        )}
      </header>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0070FF] to-[#0047CC]">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[400px] sm:h-[500px] bg-white/5 blur-[100px] sm:blur-[120px] rounded-full" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

            {/* Left — copy */}
            <div className="pt-12 pb-8 sm:pt-16 sm:pb-10 lg:py-24 text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 py-1.5 mb-5 sm:mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-white text-xs font-semibold tracking-wide uppercase">Now live in the Philippines</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-5 sm:mb-6">
                Accept{' '}
                <span className="text-yellow-300">Alipay</span>,{' '}
                <span className="text-green-300">WeChat</span>,{' '}
                <span className="text-sky-200">GCash</span>
                <br className="hidden sm:block" />{' '}
                <span className="text-white/90">
                  &amp; All PH Banks.
                </span>
              </h1>

              <p className="text-blue-100 text-base sm:text-lg leading-relaxed mb-7 sm:mb-8 max-w-lg mx-auto lg:mx-0">
                The unified Telegram payment platform for Philippine merchants. Accept from Chinese tourists,
                GCash, Maya, GrabPay and all major PH banks — settle in{' '}
                <span className="text-yellow-300 font-semibold">USDT same day</span>.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
                <button
                  onClick={scrollToLogin}
                  className="flex items-center justify-center gap-2 bg-white hover:bg-blue-50 text-[#0070FF] font-semibold px-7 py-3.5 rounded-full text-sm transition-all hover-scale card-shadow-lg w-full sm:w-auto"
                >
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to="/features"
                  className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-7 py-3.5 rounded-full text-sm transition-all hover-scale w-full sm:w-auto"
                >
                  View Features <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-start">
                {[
                  { img: '/logos/bsp.svg', alt: 'BSP Regulated',     bg: 'bg-white/10 border-white/20'  },
                  { img: '/logos/pci.svg', alt: 'PCI DSS Compliant', bg: 'bg-white/10 border-white/20'  },
                  { img: '/logos/dpo.svg', alt: 'NPC / DPO',         bg: 'bg-white/10 border-white/20'  },
                ].map(({ img, alt, bg }) => (
                  <div key={alt} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bg} text-[11px] text-white font-medium logo-glow-hover transition-all`}>
                    <img src={img} alt={alt} className="h-4 w-auto" />
                    {alt}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-white/10 border-white/20 text-[11px] text-white font-medium">
                  <Lock className="h-3 w-3 text-white" />
                  256-bit SSL
                </div>
              </div>
            </div>

            {/* Right — floating payment cards (desktop only) */}
            <div className="relative hidden lg:flex items-center justify-center py-16">
              <div className="relative w-full max-w-sm">
                <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full" />
                <div className="relative space-y-3">
                  <HeroCard icon={Logo.Alipay(40)}  name="Alipay QR"  amount="¥ 1,200.00" statusLabel="Accepted" statusCls="bg-blue-100 text-blue-700" />
                  <div className="ml-6">
                    <HeroCard icon={Logo.WeChat(40)} name="WeChat Pay" amount="¥ 880.00"   statusLabel="Settled"  statusCls="bg-green-100 text-green-700" />
                  </div>
                  <HeroCard icon={Logo.GCash(40)}   name="GCash"      amount="₱ 2,500.00" statusLabel="Accepted" statusCls="bg-sky-100 text-sky-700" />
                  <div className="ml-8">
                    <div className="bg-white border border-[#E8EAED] rounded-2xl p-4 shadow-xl">
                      <div className="flex items-center gap-3">
                        {Logo.USDT(40)}
                        <div>
                          <p className="text-[#52C41A] font-bold">+$87.42 USDT</p>
                          <p className="text-[#595959] text-xs">T+0 Settlement • Today</p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-[#52C41A] ml-auto" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-3 -right-3 bg-[#52C41A] rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
                </div>
              </div>
            </div>
          </div>

          {/* Mobile — two-row auto-scrolling marquee */}
          <div className="lg:hidden pb-10">
            <p className="text-center text-white/60 text-xs font-semibold tracking-widest uppercase mb-5">Accepted payments</p>
            {/* Row 1 — left to right */}
            <div className="marquee-track mb-3">
              <div className="animate-marquee-ltr">
                {[...MARQUEE_ROW_1, ...MARQUEE_ROW_1].map(({ el, label }, i) => (
                  <div key={`${label}-${i}`} className="flex flex-col items-center gap-1.5 mx-3">
                    {el}
                    <span className="text-white/70 text-[10px] font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Row 2 — right to left */}
            <div className="marquee-track">
              <div className="animate-marquee-rtl">
                {[...MARQUEE_ROW_2, ...MARQUEE_ROW_2].map(({ el, label }, i) => (
                  <div key={`${label}-${i}`} className="flex flex-col items-center gap-1.5 mx-3">
                    {el}
                    <span className="text-white/70 text-[10px] font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[#F5F7FA] border-b border-[#E8EAED]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <RevealGroup className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { value: '10+',  label: 'Payment Methods', sub: 'Chinese · PH wallets · Banks' },
              { value: 'T+0',  label: 'Settlement',      sub: 'USDT same-day payout'          },
              { value: '100%', label: 'Telegram Native', sub: 'No app install needed'          },
              { value: 'KYC',  label: 'KYB Verified',    sub: 'Compliance ready'               },
            ].map(({ value, label, sub }) => (
              <div key={label} className="reveal-item py-2">
                <p className="text-3xl sm:text-4xl font-extrabold text-[#0070FF] mb-1">{value}</p>
                <p className="text-[#141414] font-semibold text-xs sm:text-sm mb-0.5">{label}</p>
                <p className="text-[#595959] text-[11px] sm:text-xs">{sub}</p>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── PAYMENT METHODS ────────────────────────────────────────── */}
      <section id="payments" className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#141414] mb-3 sm:mb-4">
              One bot. Every payment network.
            </h2>
            <p className="text-[#595959] text-base sm:text-lg max-w-2xl mx-auto">
              Accept from Chinese tourists and Filipino customers through a single Telegram bot.
            </p>
          </div>

          {/* Chinese wallets */}
          <RevealGroup className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">

            {/* Alipay */}
            <div className="reveal-item relative bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden group hover:border-[#0070FF]/40 hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#0070FF]/3 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-4 sm:mb-5">
                  <div className="animate-logo-entrance logo-pop logo-glow-hover">
                    {Logo.Alipay(52)}
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#141414]">Alipay QR</h3>
                    <p className="text-[#595959] text-xs sm:text-sm">Chinese e-wallet · Cross-border</p>
                  </div>
                </div>
                <p className="text-[#595959] text-sm leading-relaxed mb-5">
                  Generate dynamic QR codes for instant Alipay payments. Ideal for Chinese tourists — one of the world's largest digital wallets with 1B+ users.
                </p>
                <ul className="space-y-2">
                  {['Scan & pay in seconds', 'CNY multi-currency support', 'Real-time confirmation'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-[#141414] text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#0070FF' }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* WeChat Pay */}
            <div className="reveal-item relative bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden group hover:border-[#07C160]/40 hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#07C160]/3 blur-3xl rounded-full" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-4 sm:mb-5">
                  <div className="animate-logo-entrance logo-pop logo-glow-hover">
                    {Logo.WeChat(52)}
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#141414]">WeChat Pay</h3>
                    <p className="text-[#595959] text-xs sm:text-sm">Chinese super-app · 900M users</p>
                  </div>
                </div>
                <p className="text-[#595959] text-sm leading-relaxed mb-5">
                  Accept WeChat Pay QR payments from the world's most-used super-app. Tap into 900M+ active users and instant CNY settlements.
                </p>
                <ul className="space-y-2">
                  {['QR-code based checkout', 'CNY & multi-currency', 'Instant settlement'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-[#141414] text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#07C160' }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </RevealGroup>

          {/* PH E-Wallets */}
          <div className="relative bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden hover:shadow-md transition-all mb-4 sm:mb-6">
            <div className="relative">
              <div className="mb-4 sm:mb-5">
                <h3 className="text-lg sm:text-xl font-bold text-[#141414] mb-1">Philippine E-Wallets</h3>
                <p className="text-[#595959] text-sm">Accept from all major Philippine digital wallets via PayMongo.</p>
              </div>
              <RevealGroup className="flex flex-wrap gap-3 sm:gap-4 mb-5 sm:mb-6">
                {[
                  { el: Logo.GCash(40),   label: 'GCash'   },
                  { el: Logo.Maya(40),    label: 'Maya'    },
                  { el: Logo.GrabPay(40), label: 'GrabPay' },
                ].map(({ el, label }) => (
                  <div key={label} className="reveal-item flex items-center gap-2.5 bg-[#F5F7FA] border border-[#E8EAED] rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 logo-box-glow transition-all cursor-default logo-pop">
                    <div className="animate-logo-entrance">
                      {el}
                    </div>
                    <span className="text-[#141414] text-sm font-semibold">{label}</span>
                  </div>
                ))}
              </RevealGroup>
              <ul className="grid sm:grid-cols-2 gap-2">
                {[
                  'E-wallet checkout via PayMongo',
                  '70M+ GCash users',
                  '30M+ Maya users',
                  'GrabPay ecosystem integration',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-[#141414] text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#007DC5' }} /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* PH Banks */}
          <div id="banks" className="relative bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-6 sm:p-8 overflow-hidden hover:shadow-md transition-all">
            <div className="relative">
              <div className="mb-4 sm:mb-5">
                <h3 className="text-lg sm:text-xl font-bold text-[#141414] mb-1">Philippine Banks</h3>
                <p className="text-[#595959] text-sm">InstaPay &amp; PESONet transfers from all major PH banks — accepted instantly via QR or payment link.</p>
              </div>
              <RevealGroup className="flex flex-wrap gap-2.5 sm:gap-3 mb-5 sm:mb-6">
                {[
                  { el: Logo.BPI(36),       label: 'BPI'       },
                  { el: Logo.BDO(36),       label: 'BDO'       },
                  { el: Logo.UnionBank(36), label: 'UnionBank' },
                  { el: Logo.Metrobank(36), label: 'Metrobank' },
                  { el: Logo.RCBC(36),      label: 'RCBC'      },
                  { el: Logo.PSBank(36),    label: 'PSBank'    },
                ].map(({ el, label }) => (
                  <div key={label} className="reveal-item flex items-center gap-2 bg-[#F5F7FA] border border-[#E8EAED] rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 logo-box-glow transition-all cursor-default logo-pop">
                    <div className="animate-logo-entrance">
                      {el}
                    </div>
                    <span className="text-[#141414] text-xs sm:text-sm font-medium">{label}</span>
                  </div>
                ))}
                <div className="reveal-item flex items-center bg-[#F5F7FA] border border-[#E8EAED] rounded-lg sm:rounded-xl px-3 py-2">
                  <span className="text-[#595959] text-xs sm:text-sm">+100 more banks</span>
                </div>
              </RevealGroup>
              <ul className="grid sm:grid-cols-2 gap-2">
                {[
                  'Instant credit notifications via Telegram',
                  'InstaPay & PESONet supported',
                  'QR Ph / payment links',
                  'Automatic reconciliation',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-[#141414] text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── USDT SETTLEMENT ────────────────────────────────────────── */}
      <section id="settlement" className="py-14 sm:py-20 relative overflow-hidden bg-[#F5F7FA]">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-10 sm:gap-14 items-center">

            {/* Visual ledger */}
            <div className="relative lg:order-1">
              <div className="bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-5 sm:mb-6">
                  <div className="animate-logo-entrance logo-pop logo-glow-hover">
                    {Logo.USDT(44)}
                  </div>
                  <div>
                    <p className="text-[#141414] font-bold text-base sm:text-lg">USDT Settlement</p>
                    <p className="text-[#595959] text-xs sm:text-sm">Tether • TRC-20 / ERC-20</p>
                  </div>
                  <span className="ml-auto bg-[#52C41A]/10 text-[#52C41A] text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full border border-[#52C41A]/20">T+0</span>
                </div>
                <div className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-6">
                  {[
                    { method: 'Alipay Collection',   amount: `+$${fmtUsd(usdtStats.alipay)} USDT`, time: 'Today 14:30' },
                    { method: 'WeChat Pay',           amount: `+$${fmtUsd(usdtStats.wechat)} USDT`, time: 'Today 12:15' },
                    { method: 'GCash / PH Banks',     amount: `+$${fmtUsd(usdtStats.gcash)} USDT`,  time: 'Today 10:02' },
                  ].map(({ method, amount, time }) => (
                    <div key={method} className="flex items-center justify-between bg-[#F5F7FA] border border-[#E8EAED] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
                      <div>
                        <p className="text-[#141414] text-sm font-medium">{method}</p>
                        <p className="text-[#595959] text-xs">{time}</p>
                      </div>
                      <span className="text-[#52C41A] font-bold text-sm">{amount}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-[#52C41A]/5 border border-[#52C41A]/20 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[#595959] text-xs mb-0.5">Total settled today</p>
                    <p className="text-[#52C41A] font-extrabold text-xl sm:text-2xl">${fmtUsd(usdtStats.total)} USDT</p>
                  </div>
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-[#52C41A]/10 rounded-xl sm:rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#52C41A]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="lg:order-2">
              <div className="inline-flex items-center gap-2 bg-[#52C41A]/10 border border-[#52C41A]/25 rounded-full px-3 sm:px-4 py-1.5 mb-5 sm:mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-[#52C41A] animate-pulse" />
                <span className="text-[#52C41A] text-xs font-semibold tracking-wide uppercase">T+0 Same-Day Settlement</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#141414] mb-4 leading-tight">
                Receive your earnings<br />
                <span className="text-[#52C41A]">in USDT. Same day.</span>
              </h2>
              <p className="text-[#595959] text-base sm:text-lg leading-relaxed mb-7 sm:mb-8">
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
                    <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-[#52C41A]/10 border border-[#52C41A]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#52C41A]" />
                    </div>
                    <div>
                      <p className="text-[#141414] font-semibold text-sm mb-0.5">{title}</p>
                      <p className="text-[#595959] text-sm">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="py-14 sm:py-20 border-t border-[#E8EAED] bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#141414] mb-3 sm:mb-4">How it works</h2>
            <p className="text-[#595959] text-base sm:text-lg">Three steps — from payment request to USDT settlement.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-8">
            {[
              { step: '01', color: 'bg-[#0070FF]',  border: 'border-[#0070FF]/20',  accent: 'text-[#0070FF]',  title: 'Choose a method', desc: 'Select Alipay, WeChat Pay, GCash, Maya, GrabPay or any PH bank. Share the QR or payment link.' },
              { step: '02', color: 'bg-purple-500', border: 'border-purple-200',    accent: 'text-purple-600', title: 'Customer pays',   desc: 'Customer scans the QR or opens the link. You get an instant Telegram notification.' },
              { step: '03', color: 'bg-[#52C41A]',  border: 'border-[#52C41A]/20', accent: 'text-[#52C41A]',  title: 'Receive USDT T+0', desc: 'Your balance is settled in USDT to your wallet by end of day. No waiting, no bank forms.' },
            ].map(({ step, color, border, accent, title, desc }) => (
              <div key={step} className={`bg-white border ${border} rounded-2xl p-5 sm:p-7 text-center shadow-sm`}>
                <div className={`h-12 w-12 sm:h-14 sm:w-14 ${color} rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-md`}>
                  <span className="text-white font-extrabold text-base sm:text-lg">{step}</span>
                </div>
                <h3 className={`font-bold text-base sm:text-lg mb-2 ${accent}`}>{title}</h3>
                <p className="text-[#595959] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOGIN ───────────────────────────────────────────────── */}
      <section ref={loginSectionRef} className="py-16 sm:py-24 bg-gradient-to-br from-[#0070FF] to-[#0047CC] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] sm:w-[700px] h-[300px] sm:h-[400px] bg-white/5 blur-[80px] sm:blur-[100px] rounded-full" />
        </div>
        <div className="relative max-w-md mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 py-1.5 mb-4 sm:mb-5">
            <img src="/logo.svg" alt="" className="h-3.5 w-3.5 rounded" />
            <span className="text-white text-xs font-semibold tracking-wide uppercase">Telegram Authentication</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">Ready to get started?</h2>
          <p className="text-blue-100 text-sm sm:text-base mb-8 sm:mb-10">
            Sign in with your authorized Telegram account to access the{' '}
            <span className="text-white font-medium">{APP_NAME}</span> dashboard.
          </p>

          <div className="bg-white border border-[#E8EAED] rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xl">
            {turnstileSiteKey && !turnstileToken && (
              <div className="flex flex-col items-center mb-5 gap-3">
                <p className="text-[#595959] text-xs">Please verify you are human</p>
                <Turnstile
                  siteKey={turnstileSiteKey}
                  onSuccess={(token) => setTurnstileToken(token)}
                  options={{ theme: 'light' }}
                />
              </div>
            )}
            <div className="flex justify-center mb-5" ref={widgetContainerRef} />
            {submitting && (
              <div className="flex items-center justify-center gap-2 text-[#595959] text-sm mb-4">
                <span className="h-4 w-4 border-2 border-[#0070FF] border-t-transparent rounded-full animate-spin" />
                Signing in…
              </div>
            )}
            {(localError || error) && (
              <div className="bg-[#FF4D4F]/5 border border-[#FF4D4F]/20 rounded-xl px-4 py-3 text-[#FF4D4F] text-sm mb-4">
                {localError || error}
              </div>
            )}
            {loading && !submitting && (
              <p className="text-[#595959] text-sm text-center mb-4">Checking session…</p>
            )}
            <div className="border-t border-[#E8EAED] pt-4 sm:pt-5 space-y-3">
              {/* Social login options */}
              {socialConfig && (socialConfig.whatsapp_number || socialConfig.messenger_page_username) && (
                <>
                  <div className="relative flex items-center gap-2 mb-1">
                    <div className="flex-1 h-px bg-[#E8EAED]" />
                    <span className="text-[#595959] text-xs shrink-0">or sign in via</span>
                    <div className="flex-1 h-px bg-[#E8EAED]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {socialConfig.whatsapp_number && (
                      <a
                        href={`https://wa.me/${socialConfig.whatsapp_number.replace(/\D/g, '')}?text=Hi%2C+I+want+to+sign+in`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full border border-[#E8EAED] bg-white hover:bg-green-50 hover:border-green-300 rounded-xl px-4 py-3 text-sm font-medium text-[#141414] transition-colors"
                      >
                        <WhatsAppIcon size={20} />
                        <span>Continue with WhatsApp</span>
                      </a>
                    )}
                    {socialConfig.messenger_page_username && (
                      <a
                        href={`https://m.me/${socialConfig.messenger_page_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full border border-[#E8EAED] bg-white hover:bg-blue-50 hover:border-blue-300 rounded-xl px-4 py-3 text-sm font-medium text-[#141414] transition-colors"
                      >
                        <MessengerIcon size={20} />
                        <span>Continue with Messenger</span>
                      </a>
                    )}
                    <div className="relative flex items-center gap-2 my-1">
                      <div className="flex-1 h-px bg-[#E8EAED]" />
                    </div>
                  </div>
                </>
              )}
              <Link
                to="/register"
                className="flex items-center justify-between w-full bg-[#F5F7FA] hover:bg-[#E8F4FF] border border-[#E8EAED] hover:border-[#0070FF]/30 text-[#0070FF] hover:text-[#0070FF] text-sm font-semibold py-3 sm:py-3.5 px-4 sm:px-5 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Create an account
                </div>
                <ChevronRight className="h-4 w-4 text-[#0070FF]/40 group-hover:text-[#0070FF] transition-colors" />
              </Link>
              <p className="text-[#595959] text-xs text-center pt-1">
                Need access?{' '}
                {SUPPORT_LINKS.map((link, index) => (
                <span key={link.handle}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer"
                    className="text-[#0070FF] hover:text-[#005FDD] transition-colors">
                    Contact {link.handle}
                  </a>
                  {index === SUPPORT_LINKS.length - 2 ? ' and ' : index < SUPPORT_LINKS.length - 1 ? ', ' : ''}
                </span>
              ))}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <AppFooter />

    </div>
  );
}
