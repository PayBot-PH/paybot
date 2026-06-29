import React, { useEffect, useRef } from 'react';
import { TelegramWidgetUser } from '@/lib/auth';

interface TelegramLoginWidgetProps {
  botName: string;
  onAuth: (user: TelegramWidgetUser) => void;
  buttonSize?: 'large' | 'medium' | 'small';
  cornerRadius?: number;
  requestAccess?: string;
  showUserPhoto?: boolean;
}

declare global {
  interface Window {
    onTelegramAuth: (user: any) => void;
  }
}

export default function TelegramLoginWidget({
  botName,
  onAuth,
  buttonSize = 'large',
  cornerRadius = 12,
  requestAccess = 'write',
  showUserPhoto = true,
}: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Define global callback for Telegram script
    window.onTelegramAuth = (user: any) => {
      onAuth(user as TelegramWidgetUser);
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', cornerRadius.toString());
    script.setAttribute('data-request-access', requestAccess);
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      delete window.onTelegramAuth;
    };
  }, [botName, onAuth, buttonSize, cornerRadius, requestAccess]);

  return <div ref={containerRef} className="flex justify-center" />;
}
