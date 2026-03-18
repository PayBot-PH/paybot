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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5F7FA] to-[#E8EAED]">
      {skeleton ? (
        <div className="w-full max-w-2xl px-6 space-y-4 animate-slide-in-up">
          {/* Header skeleton */}
          <div className="skeleton-shimmer h-8 w-48 mb-6 rounded-lg" />
          {/* Card skeletons */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="stagger-item bg-white rounded-xl p-4 space-y-3 border border-[#E8EAED] card-shadow-md hover:card-shadow-lg transition-shadow">
              <div className="skeleton-shimmer h-4 w-3/4 rounded-md" />
              <div className="skeleton-shimmer h-4 w-1/2 rounded-md" />
              <div className="skeleton-shimmer h-4 w-2/3 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center animate-fade-in-scale">
          {/* Branded ring spinner */}
          <div className="relative inline-flex items-center justify-center w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#1677FF]/10" />
            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-[#1677FF] border-r-[#1677FF]/60 animate-spin" />
            <div className="h-5 w-5 rounded-full bg-gradient-blue opacity-30 animate-pulse" />
          </div>
          <p className="mt-6 text-[#595959] text-sm font-medium tracking-wide">{message}</p>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
