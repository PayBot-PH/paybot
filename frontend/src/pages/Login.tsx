import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Zap, ArrowRight, ShieldCheck, User } from 'lucide-react';
import type { TelegramWidgetUser } from '@/lib/auth';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

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
        if (!canceled && runtimeUsername) {
          setBotUsername(runtimeUsername);
        }
        return runtimeUsername;
      } catch {
        return '';
      }
    };

    const renderWidget = async () => {
      const resolvedUsername = await resolveBotUsername();
      if (!resolvedUsername) {
        setLocalError('Telegram sign-in is not configured. Please set TELEGRAM_BOT_USERNAME or VITE_TELEGRAM_BOT_USERNAME.');
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
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = '';
      }
      delete window.onTelegramAuth;
    };
  }, [botUsername, loginWithTelegram]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleDemoLogin = async (type: 'super_admin' | 'admin') => {
    setDemoLoading(type);
    setLocalError(null);
    await loginAsDemo(type);
    setDemoLoading(null);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center px-4">
      {/* Branding */}
      <div className="flex items-center gap-2 mb-6">
        <div className="h-9 w-9 bg-blue-600 rounded-xl flex items-center justify-center">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-tight">PayBot</p>
          <p className="text-slate-500 text-xs leading-tight">by DRL Solutions</p>
        </div>
      </div>

      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white text-xl">Admin Sign In</CardTitle>
          <p className="text-slate-400 text-sm">Use your authorized Telegram account to continue.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div ref={widgetContainerRef} className="flex justify-center" />
            {submitting && <p className="text-slate-300 text-sm text-center">Signing in...</p>}
            {(localError || error) && <p className="text-red-400 text-sm">{localError || error}</p>}
            {loading && <p className="text-slate-400 text-sm text-center">Checking session...</p>}
          </div>

          {/* Demo login section */}
          <div className="mt-5 pt-4 border-t border-slate-700/50">
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
        </CardContent>
      </Card>
    </div>
  );
}
