import { Bot } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';

interface Props {
  /** When true, plays the exit animation. */
  exiting?: boolean;
}

export default function AppLoadingScreen({ exiting = false }: Props) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center app-loading-bg ${
        exiting ? 'app-loading-exit' : 'app-loading-enter'
      }`}
    >
      {/* Subtle radial glow backdrop */}
      <div className="absolute inset-0 pointer-events-none app-loading-glow" aria-hidden="true" />

      <div className="relative flex flex-col items-center gap-5">
        {/* Logo with pulse ring */}
        <div className="relative flex items-center justify-center">
          <span className="absolute inset-0 rounded-2xl app-logo-ring" />
          <div className="relative h-14 w-14 rounded-2xl bg-[#1557d0] flex items-center justify-center shadow-lg shadow-blue-500/30 app-logo-pulse">
            <Bot className="h-7 w-7 text-white" strokeWidth={1.75} />
          </div>
        </div>

        {/* Brand */}
        <p className="text-[15px] font-semibold tracking-tight app-loading-text">{APP_NAME}</p>

        {/* Animated loading dots */}
        <div className="flex items-center gap-1.5">
          <span className="app-loading-dot" style={{ animationDelay: '0ms' }} />
          <span className="app-loading-dot" style={{ animationDelay: '160ms' }} />
          <span className="app-loading-dot" style={{ animationDelay: '320ms' }} />
        </div>
      </div>
    </div>
  );
}

