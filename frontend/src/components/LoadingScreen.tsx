import { useEffect, useState } from 'react';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

interface LoadingScreenProps {
  onDone?: () => void;
  /** Duration in ms before calling onDone (default 2000) */
  duration?: number;
}

export default function LoadingScreen({ onDone, duration = 2000 }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'done'>('loading');

  useEffect(() => {
    const steps = [
      { target: 25, delay: 100 },
      { target: 55, delay: 350 },
      { target: 80, delay: 700 },
      { target: 95, delay: 1200 },
      { target: 100, delay: duration - 200 },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach(({ target, delay }) => {
      timers.push(setTimeout(() => setProgress(target), delay));
    });

    timers.push(
      setTimeout(() => {
        setPhase('done');
        setTimeout(() => onDone?.(), 350);
      }, duration),
    );

    return () => timers.forEach(clearTimeout);
  }, [duration, onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-[#060D1A] transition-opacity duration-350
        ${phase === 'done' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* Background ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-indigo-700/8 blur-[100px]" />
        <div className="absolute top-1/3 right-1/4 w-[200px] h-[200px] rounded-full bg-cyan-600/6 blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#3B82F6 1px, transparent 1px), linear-gradient(90deg, #3B82F6 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-6 animate-fade-in">
        {/* Logo */}
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-blue-500/30 blur-xl animate-pulse-glow" />
          <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-2xl shadow-blue-600/40">
            <img src="/logo.svg" alt={APP_NAME} className="h-10 w-10 object-contain" />
          </div>
          {/* Orbit ring */}
          <div
            className="absolute -inset-3 rounded-full border border-blue-500/20"
            style={{ animation: 'spin 4s linear infinite' }}
          />
          <div
            className="absolute -inset-6 rounded-full border border-blue-400/10"
            style={{ animation: 'spin 8s linear infinite reverse' }}
          />
        </div>

        {/* Name */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">{APP_NAME}</h1>
          <p className="text-sm text-slate-400 mt-1">{APP_TAGLINE}</p>
        </div>

        {/* Progress bar */}
        <div className="w-56 flex flex-col items-center gap-2">
          <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, boxShadow: '0 0 8px rgba(59,130,246,0.7)' }}
            />
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">{progress}%</span>
        </div>

        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-blue-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      </div>

      {/* Bottom label */}
      <div className="absolute bottom-8 text-xs text-slate-600">
        Powered by Xendit · PayMongo · Telegram
      </div>
    </div>
  );
}
