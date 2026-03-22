import { Bot } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';

interface Props {
  /** When true, plays the exit animation. */
  exiting?: boolean;
}

export default function AppLoadingScreen({ exiting = false }: Props) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f9fafb] ${
        exiting ? 'app-loading-exit' : 'app-loading-enter'
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Logo */}
        <div className="h-11 w-11 rounded-xl bg-[#1557d0] flex items-center justify-center">
          <Bot className="h-6 w-6 text-white" strokeWidth={1.75} />
        </div>

        {/* Brand */}
        <p className="text-[15px] font-semibold text-slate-900 tracking-tight">{APP_NAME}</p>

        {/* Thin sliding bar */}
        <div className="w-20 h-0.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full w-2/5 bg-[#1557d0] rounded-full app-loader-bar" />
        </div>
      </div>
    </div>
  );
}

