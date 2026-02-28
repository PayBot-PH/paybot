import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, Zap, ArrowRight, ShieldCheck, User, Wallet, QrCode, Bell, ChevronRight, UserPlus } from 'lucide-react';
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
  const { user, loginWithTelegram, loginAsDemo, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<'super_admin' | 'admin' | null>(null);
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

  const handleDemoLogin = async (type: 'super_admin' | 'admin') => {
    setDemoLoading(type);
    setLocalError(null);
    await loginAsDemo(type);
    setDemoLoading(null);
  };

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

        {/* Brand + content */}
        <div className="relative">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-xl shadow-blue-500/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">PayBot</p>
              <p className="text-slate-500 text-sm">by DRL Solutions</p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="space-y-2.5 mb-10">
            {HIGHLIGHTS.map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                <Icon className={`h-4 w-4 ${color} shrink-0`} />
                <span className="text-slate-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Demo login section */}
          <div className="pt-6 border-t border-slate-700/50">
            <p className="text-slate-500 text-xs text-center mb-3">— or demo login —</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleDemoLogin('super_admin')}
                disabled={demoLoading !== null}
                className="flex flex-col items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl p-3 transition-colors disabled:opacity-60"
              >
                {demoLoading === 'super_admin' ? (
                  <span className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-amber-400" />
                )}
                <span className="text-amber-300 text-xs font-semibold">Super Admin</span>
                <span className="text-slate-500 text-[10px]">Full access</span>
              </button>
              <button
                onClick={() => handleDemoLogin('admin')}
                disabled={demoLoading !== null}
                className="flex flex-col items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl p-3 transition-colors disabled:opacity-60"
              >
                {demoLoading === 'admin' ? (
                  <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <User className="h-4 w-4 text-blue-400" />
                )}
                <span className="text-blue-300 text-xs font-semibold">Admin User</span>
                <span className="text-slate-500 text-[10px]">Limited access</span>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
            <Link
              to="/features"
              className="flex items-center justify-center gap-2 w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium py-2.5 rounded-lg transition-colors border border-slate-600/40"
            >
              <Zap className="h-4 w-4 text-blue-400" />
              See all features
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <p className="text-slate-500 text-xs text-center">
              Having trouble?{' '}
              <a
                href="https://t.me/traxionpay"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
              >
                Contact us on Telegram
              </a>
            </p>
          </div>
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
            <h2 className="text-2xl font-bold text-white mb-1">Admin Sign In</h2>
            <p className="text-slate-400 text-sm">Authorized Telegram accounts only.</p>
          </div>

          {/* Role info cards */}
          <div className="mb-5">
            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 text-center">
              <ShieldCheck className="h-4 w-4 text-blue-400 mx-auto mb-1" />
              <p className="text-blue-300 text-xs font-semibold">Admin</p>
              <p className="text-slate-500 text-[10px] mt-0.5">Payments · Reports · Wallet</p>
            </div>
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
              {/* Register link */}
              <Link to="/register"
                className="flex items-center justify-between w-full bg-emerald-500/8 hover:bg-emerald-500/14 border border-emerald-500/20 hover:border-emerald-500/35 text-emerald-300 hover:text-emerald-200 text-sm font-medium py-3 px-4 rounded-xl transition-all group">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create an account
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-500 group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all" />
              </Link>

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

