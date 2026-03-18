import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  /** Show skeleton card placeholders instead of just a spinner */
  skeleton?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  skeleton = false,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
      {skeleton ? (
        <div className="w-full max-w-2xl px-6 space-y-4">
          {/* Header skeleton */}
          <div className="skeleton-shimmer h-8 w-48 mb-6" />
          {/* Card skeletons */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[#1E293B] rounded-xl p-4 space-y-3">
              <div className="skeleton-shimmer h-4 w-3/4" />
              <div className="skeleton-shimmer h-4 w-1/2" />
              <div className="skeleton-shimmer h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center">
          {/* Branded ring spinner */}
          <div className="relative inline-flex items-center justify-center w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-cyan-400 border-b-transparent border-l-transparent animate-spin" />
            <div className="h-4 w-4 rounded-full bg-blue-400/30" />
          </div>
          <p className="mt-4 text-slate-400 text-sm tracking-wide">{message}</p>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
