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
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      {skeleton ? (
        <div className="w-full max-w-2xl px-6 space-y-4">
          {/* Header skeleton */}
          <div className="skeleton-shimmer h-8 w-48 mb-6" />
          {/* Card skeletons */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 space-y-3 border border-[#E8EAED]">
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
            <div className="absolute inset-0 rounded-full border-2 border-[#1677FF]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#1677FF] border-r-[#1677FF]/60 border-b-transparent border-l-transparent animate-spin" />
            <div className="h-4 w-4 rounded-full bg-[#1677FF]/20" />
          </div>
          <p className="mt-4 text-[#595959] text-sm tracking-wide">{message}</p>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
