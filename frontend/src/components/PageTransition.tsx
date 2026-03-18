import { useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const prevKey = useRef(location.key);

  useEffect(() => {
    if (location.key !== prevKey.current) {
      prevKey.current = location.key;
      setVisible(false);
      const t = setTimeout(() => setVisible(true), 40);
      return () => clearTimeout(t);
    }
  }, [location.key]);

  return (
    <div
      className="transition-all duration-300 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      {children}
    </div>
  );
}
