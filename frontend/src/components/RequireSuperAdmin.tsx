import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import { ShieldOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

/**
 * Route guard: only super admins may pass.
 * Regular admins see a 403 page; unauthenticated users are sent to /login.
 */
export default function RequireSuperAdmin({ children }: Props) {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <div className="h-16 w-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mb-5">
            <ShieldOff className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
          <p className="text-muted-foreground text-sm max-w-sm mb-1">
            This page is only accessible to <span className="text-amber-500 font-semibold">Super Admins</span>.
          </p>
          <p className="text-muted-foreground text-xs max-w-sm">
            Your account has <span className="font-medium">Admin</span> access.
            Contact a super admin to request elevated permissions.
          </p>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}
