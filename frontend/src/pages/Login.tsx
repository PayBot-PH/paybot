import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TelegramWidgetUser } from '@/lib/auth';

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

export default function Login() {
  const { user, loginWithTelegram, loading, error } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername) {
      setLocalError('Telegram sign-in is not configured. Please set VITE_TELEGRAM_BOT_USERNAME.');
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
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    widgetContainerRef.current.appendChild(script);

    return () => {
      if (widgetContainerRef.current) {
        widgetContainerRef.current.innerHTML = '';
      }
      delete window.onTelegramAuth;
    };
  }, [botUsername, loginWithTelegram]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Telegram Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">Use your Telegram account to sign in as admin.</p>
            <div ref={widgetContainerRef} className="flex justify-center" />
            {submitting && <p className="text-slate-300 text-sm">Signing in...</p>}
            {(localError || error) && <p className="text-red-400 text-sm">{localError || error}</p>}
            {loading && <p className="text-slate-400 text-sm">Checking session...</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
