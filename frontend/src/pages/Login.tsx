import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { user, login, loading, error } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!userId.trim() || !password.trim()) {
      setLocalError('Please enter user ID and password');
      return;
    }

    setSubmitting(true);
    await login(userId.trim(), password);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1E293B] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Telegram Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label className="text-slate-300">Telegram User ID</Label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 bg-slate-800 border-slate-600 text-white"
                placeholder="Enter your Telegram user ID"
                autoComplete="username"
              />
            </div>

            <div>
              <Label className="text-slate-300">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 bg-slate-800 border-slate-600 text-white"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            {(localError || error) && (
              <p className="text-red-400 text-sm">{localError || error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={submitting || loading}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
