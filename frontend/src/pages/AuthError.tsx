import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(3);
  const errorMessage =
    searchParams.get('msg') ||
    'Sorry, your authentication information is invalid or has expired';

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="space-y-6 max-w-md">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 blur-xl rounded-full"></div>
              <AlertCircle className="relative h-12 w-12 text-red-500" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Authentication Error</h1>
          <p className="text-base text-muted-foreground">{errorMessage}</p>
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              {countdown > 0 ? (
                <>Will automatically return to the home page in{' '}
                  <span className="text-primary font-semibold text-base">{countdown}</span>{' '}seconds</>
              ) : ('Redirecting...')}
            </p>
          </div>
        </div>
        <div className="flex justify-center pt-2">
          <Button onClick={() => window.location.href = '/'} className="px-6">Return to Home</Button>
        </div>
      </div>
    </div>
  );
}
