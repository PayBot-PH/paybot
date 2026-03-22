import React, { useEffect } from 'react';

const LogoutCallbackPage: React.FC = () => {
  useEffect(() => {
    setTimeout(() => { window.location.href = '/'; }, 2000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 mb-4">
          <svg className="h-6 w-6 text-emerald-500" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Logout Successful
        </h2>
        <p className="text-muted-foreground mb-4">
          You have been successfully logged out.
        </p>
        <p className="text-sm text-muted-foreground">Redirecting to home page...</p>
      </div>
    </div>
  );
};

export default LogoutCallbackPage;
