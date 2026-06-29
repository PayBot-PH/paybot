import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * NProgress-style thin bar that runs across the top on every route change.
 * Shows immediately when navigation starts and fades away once complete.
 */
export default function TopProgressBar() {
  const location = useLocation();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [key, setKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    setKey((k) => k + 1);
    setPhase('running');
    // After the fill animation completes, hold momentarily then fade out
    timerRef.current = setTimeout(() => setPhase('done'), 580);
    const removeTimer = setTimeout(() => setPhase('idle'), 900);
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(removeTimer);
    };
  }, [location.key]);

  if (phase === 'idle') return null;

  return (
    <div className="progress-bar-track" aria-hidden="true">
      <div key={key} className={`progress-bar-fill${phase === 'done' ? ' progress-bar-done' : ''}`} />
    </div>
  );
}
