import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  fullscreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  fullscreen = true,
}) => {
  const content = (
    <div className="flex flex-col items-center gap-4">
      {/* Stacked rings */}
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
        <div className="absolute inset-1.5 rounded-full border border-transparent border-t-blue-300/50"
          style={{ animation: 'spin 1.5s linear infinite reverse' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        </div>
      </div>
      {message && <p className="text-sm text-slate-400 animate-pulse">{message}</p>}
    </div>
  );

  if (!fullscreen) return content;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {content}
    </div>
  );
};

export default LoadingSpinner;
