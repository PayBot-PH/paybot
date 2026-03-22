import React, { useEffect } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

const LogoutCallbackPage: React.FC = () => {
  useEffect(() => {
    // The OIDC provider has logged out the user and redirected here
    // We can redirect to the home page or show a logout success message
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0F1E]">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-500/20 border border-green-500/30 mb-4">
          <svg
            className="h-6 w-6 text-green-400"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
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
