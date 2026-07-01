import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import { ShieldOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

/**
 * Route guard: users with developer-level bot permissions may pass.
 * Super admins are always allowed.
 */
export default function RequireDeveloperRole({ children }: Props) {
  const { user, loading, isSuperAdmin, permissions } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const canAccess = Boolean(isSuperAdmin || permissions?.can_manage_bot);
  if (!canAccess) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <div className="h-16 w-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mb-5">
            <ShieldOff className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
          <p className="text-muted-foreground text-sm max-w-sm mb-1">
            This page is only accessible to <span className="text-amber-400 font-semibold">Developer or Super Admin</span> roles.
          </p>
          <p className="text-muted-foreground text-xs max-w-sm">
            Request <span className="font-medium">API/Webhook management</span> permission from your organization owner.
          </p>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}
