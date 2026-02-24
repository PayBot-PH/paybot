import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, Zap, ArrowRight, ShieldCheck, Wallet, QrCode, Bell, ChevronRight } from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

const HIGHLIGHTS = [
  { icon: Wallet, label: 'Wallet & Disbursements', color: 'text-emerald-400' },
  { icon: QrCode, label: 'QR · Alipay · WeChat Pay', color: 'text-purple-400' },
  { icon: Bell, label: 'Real-time Payment Alerts', color: 'text-amber-400' },
  { icon: ShieldCheck, label: 'Telegram-Only Secure Auth', color: 'text-blue-400' },
];

export default function Login() {
  const { user, loginWithTelegram, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const [botUsername, setBotUsername] = useState<string>((import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim());

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

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      {/* Left panel — branding (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] bg-gradient-to-br from-[#0F172A] to-[#0A0F1E] border-r border-white/5 px-16 py-12 relative overflow-hidden">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-xl shadow-blue-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">PayBot</p>
            <p className="text-slate-500 text-xs">by DRL Solutions</p>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1 text-blue-300 text-xs font-medium mb-6">
              <Zap className="h-3 w-3" /> Telegram-native payment platform
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
              Accept Payments<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                Anywhere
              </span>
            </h1>
            <p className="text-slate-400 mt-4 leading-relaxed text-sm max-w-sm">
              Manage your entire payment operation through Telegram commands or this web dashboard. Invoices, QR codes, virtual accounts, and more.
            </p>
          </div>

          {/* Feature pills */}
          <div className="space-y-2.5">
            {HIGHLIGHTS.map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                <Icon className={`h-4 w-4 ${color} shrink-0`} />
                <span className="text-slate-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          <Link to="/features" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-blue-400 text-sm transition-colors group">
            See all features
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Footer */}
        <p className="relative text-slate-600 text-xs">© {new Date().getFullYear()} DRL Solutions</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">PayBot</p>
            <p className="text-slate-500 text-xs">by DRL Solutions</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-slate-400 text-sm">Sign in with your authorized Telegram account.</p>
          </div>

          {/* Telegram widget card */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-5">
            <div className="flex justify-center" ref={widgetContainerRef} />
            {submitting && (
              <div className="flex items-center justify-center gap-2 text-slate-300 text-sm">
                <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Signing in…
              </div>
            )}
            {(localError || error) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {localError || error}
              </div>
            )}
            {loading && !submitting && (
              <p className="text-slate-500 text-sm text-center">Checking session…</p>
            )}

            <div className="border-t border-white/5 pt-4 space-y-3">
              {/* Features button */}
              <Link to="/features"
                className="flex items-center justify-between w-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.14] text-slate-300 hover:text-white text-sm font-medium py-3 px-4 rounded-xl transition-all group">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-400" />
                  Explore bot features
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <p className="text-slate-500 text-xs text-center">
                Need access?{' '}
                <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 transition-colors">
                  Contact @traxionpay
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

