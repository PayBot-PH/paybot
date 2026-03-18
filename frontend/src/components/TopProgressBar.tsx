import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Thin progress bar that runs across the top on every route change.
 */
export default function TopProgressBar() {
  const location = useLocation();
  const [key, setKey] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setKey((k) => k + 1);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(t);
  }, [location.key]);

  if (!visible) return null;

  return (
    <div className="progress-bar-track">
      <div key={key} className="progress-bar-fill" />
    </div>
  );
}
