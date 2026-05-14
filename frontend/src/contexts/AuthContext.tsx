import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { authApi, TelegramWidgetUser } from '../lib/auth';

interface UserPermissions {
  is_super_admin: boolean;
  can_manage_payments: boolean;
  can_manage_disbursements: boolean;
  can_view_reports: boolean;
  can_manage_wallet: boolean;
  can_manage_transactions: boolean;
  can_manage_bot: boolean;
  can_approve_topups: boolean;
}

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  permissions?: UserPermissions;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (userId?: string, password?: string) => Promise<void>;
  loginWithTelegram: (user: TelegramWidgetUser, cfTurnstileToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: UserPermissions | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (userId?: string, password?: string) => {
    try {
      setError(null);

      if (!userId || !password) {
        window.location.href = '/login';
        return;
      }

      await authApi.login(userId, password);
      await checkAuthStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }, [checkAuthStatus]);

  const loginWithTelegram = useCallback(async (telegramUser: TelegramWidgetUser, cfTurnstileToken?: string | null) => {
    try {
      setError(null);
      await authApi.loginWithTelegram(telegramUser, cfTurnstileToken);
      await checkAuthStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram login failed');
    }
  }, [checkAuthStatus]);

  const logout = useCallback(async () => {
    try {
      setError(null);
      await authApi.logout();
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    loginWithTelegram,
    logout,
    refetch: checkAuthStatus,
    isAdmin: user?.role === 'admin',
    isSuperAdmin: user?.permissions?.is_super_admin ?? false,
    permissions: user?.permissions ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};