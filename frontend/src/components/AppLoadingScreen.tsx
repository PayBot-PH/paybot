import { Bot } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';

/**
 * Full-screen branded loading overlay shown during the initial auth check.
 * Uses the dark fintech colour scheme to avoid a light-flash before the app mounts.
 */
export default function AppLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#040C18] app-loading-enter">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-700/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-teal-700/8 blur-[90px] rounded-full" />
      </div>

      <div className="relative flex flex-col items-center gap-7">
        {/* Animated logo with spinner ring */}
        <div className="relative">
          <div className="h-20 w-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30">
            <Bot className="h-10 w-10 text-white" />
          </div>
          {/* Spinning border ring */}
          <div
            className="absolute -inset-2 rounded-[1.375rem] border-2 border-transparent animate-spin"
            style={{ borderTopColor: 'rgba(59,130,246,0.7)', borderRightColor: 'rgba(59,130,246,0.25)' }}
          />
        </div>

        {/* Brand name */}
        <div className="text-center">
          <p className="text-white font-bold text-xl tracking-tight">{APP_NAME}</p>
          <p className="text-blue-400/60 text-sm mt-1">Loading, please wait…</p>
        </div>

        {/* Bouncing dots */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-blue-500/70 animate-bounce"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
