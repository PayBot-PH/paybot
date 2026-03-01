import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, Zap, ArrowRight, ShieldCheck, User, Wallet, QrCode, Bell, ChevronRight, UserPlus, UserCheck, Lock } from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL } from '@/lib/brand';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

const HIGHLIGHTS = [
  { icon: Wallet, label: 'Wallet & Disbursements', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15' },
  { icon: QrCode, label: 'QR · Alipay · WeChat Pay', color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/15' },
  { icon: Bell, label: 'Real-time Payment Alerts', color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/15' },
  { icon: UserCheck, label: 'KYC / KYB Identity Checks', color: 'text-sky-400', bg: 'bg-sky-500/8 border-sky-500/15' },
  { icon: ShieldCheck, label: 'Telegram-Only Secure Auth', color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/15' },
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

  if (user) return <Navigate to="/intro" replace />;

  const handleDemoLogin = async (type: 'super_admin' | 'admin') => {
    setDemoLoading(type);
    setLocalError(null);
    await loginAsDemo(type);
    setDemoLoading(null);
  };

  return (
    <div className="min-h-screen bg-[#060B18] flex">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[600px] h-[600px] rounded-full bg-blue-700/8 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-700/6 blur-3xl" />
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-emerald-700/4 blur-3xl" />
      </div>

      {/* Left panel — branding (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between w-[50%] bg-gradient-to-br from-[#0A1628] via-[#0D1933] to-[#060B18] border-r border-white/[0.04] px-14 py-12 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Top dot accent */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600/0 via-blue-500/60 to-blue-600/0" />

        <div className="relative space-y-10">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 ring-1 ring-blue-400/20">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-tight tracking-tight">{APP_NAME}</p>
              <p className="text-slate-500 text-xs">by {COMPANY_NAME}</p>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-2">
              One bot.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-400">All payments.</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              A powerful Telegram-based payment platform with built-in KYC/KYB compliance and real-time management.
            </p>
          </div>

          {/* Feature pills */}
          <div className="space-y-2">
            {HIGHLIGHTS.map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 ${bg}`}>
                <Icon className={`h-4 w-4 ${color} shrink-0`} />
                <span className="text-slate-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Demo login section */}
          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-slate-500 text-xs text-center mb-3">— try demo access —</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleDemoLogin('super_admin')}
                disabled={demoLoading !== null}
                className="group flex flex-col items-center gap-1.5 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/25 hover:border-amber-500/40 rounded-xl p-3 transition-all disabled:opacity-60"
              >
                {demoLoading === 'super_admin' ? (
                  <span className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-amber-300 text-xs font-semibold">Super Admin</span>
                <span className="text-slate-500 text-[10px]">Full access</span>
              </button>
              <button
                onClick={() => handleDemoLogin('admin')}
                disabled={demoLoading !== null}
                className="group flex flex-col items-center gap-1.5 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/25 hover:border-blue-500/40 rounded-xl p-3 transition-all disabled:opacity-60"
              >
                {demoLoading === 'admin' ? (
                  <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <User className="h-4 w-4 text-blue-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-blue-300 text-xs font-semibold">Admin User</span>
                <span className="text-slate-500 text-[10px]">Limited access</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Link
              to="/features"
              className="flex items-center justify-center gap-2 w-full bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-white text-sm font-medium py-2.5 rounded-xl transition-colors border border-white/[0.06] hover:border-white/[0.12]"
            >
              <Zap className="h-4 w-4 text-blue-400" />
              See all features
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <p className="text-slate-600 text-xs text-center">
              Having trouble?{' '}
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
                className="text-sky-500 hover:text-sky-400 underline underline-offset-2 transition-colors">
                Contact us on Telegram
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-slate-700 text-xs">© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">{APP_NAME}</p>
            <p className="text-slate-500 text-xs">by {COMPANY_NAME}</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <Lock className="h-4 w-4 text-blue-400" />
              </div>
              <span className="text-blue-400 text-xs font-semibold tracking-widest uppercase">Secure Sign-In</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Welcome back</h2>
            <p className="text-slate-400 text-sm">Sign in with your authorized Telegram account to access the dashboard.</p>
          </div>

          {/* Role info card */}
          <div className="mb-5 grid grid-cols-2 gap-2">
            <div className="bg-blue-500/6 border border-blue-500/18 rounded-xl p-3 text-center">
              <User className="h-4 w-4 text-blue-400 mx-auto mb-1" />
              <p className="text-blue-300 text-xs font-semibold">Admin</p>
              <p className="text-slate-500 text-[10px] mt-0.5">Payments · Reports</p>
            </div>
            <div className="bg-amber-500/6 border border-amber-500/18 rounded-xl p-3 text-center">
              <ShieldCheck className="h-4 w-4 text-amber-400 mx-auto mb-1" />
              <p className="text-amber-300 text-xs font-semibold">Super Admin</p>
              <p className="text-slate-500 text-[10px] mt-0.5">KYC · KYB · Full</p>
            </div>
          </div>

          {/* Telegram widget card */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 space-y-5 shadow-2xl shadow-black/30">
            <div className="text-center mb-1">
              <p className="text-slate-400 text-xs">Use the button below to authenticate via Telegram</p>
            </div>
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

            <div className="border-t border-white/[0.05] pt-4 space-y-2.5">
              {/* Register link */}
              <Link to="/register"
                className="flex items-center justify-between w-full bg-emerald-500/6 hover:bg-emerald-500/12 border border-emerald-500/18 hover:border-emerald-500/32 text-emerald-300 hover:text-emerald-200 text-sm font-medium py-3 px-4 rounded-xl transition-all group">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create an account
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </Link>

              {/* Features button */}
              <Link to="/features"
                className="flex items-center justify-between w-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] text-slate-300 hover:text-white text-sm font-medium py-3 px-4 rounded-xl transition-all group">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-400" />
                  Explore bot features
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
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

          {/* Mobile demo buttons */}
          <div className="lg:hidden mt-6 pt-5 border-t border-white/[0.05]">
            <p className="text-slate-600 text-xs text-center mb-3">— try demo access —</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleDemoLogin('super_admin')}
                disabled={demoLoading !== null}
                className="flex flex-col items-center gap-1.5 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/25 rounded-xl p-3 transition-colors disabled:opacity-60"
              >
                {demoLoading === 'super_admin'
                  ? <span className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  : <ShieldCheck className="h-4 w-4 text-amber-400" />}
                <span className="text-amber-300 text-xs font-semibold">Super Admin</span>
              </button>
              <button
                onClick={() => handleDemoLogin('admin')}
                disabled={demoLoading !== null}
                className="flex flex-col items-center gap-1.5 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/25 rounded-xl p-3 transition-colors disabled:opacity-60"
              >
                {demoLoading === 'admin'
                  ? <span className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  : <User className="h-4 w-4 text-blue-400" />}
                <span className="text-blue-300 text-xs font-semibold">Admin User</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

