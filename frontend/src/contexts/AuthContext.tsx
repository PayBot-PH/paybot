import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { authApi, TelegramWidgetUser } from '../lib/auth';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (userId?: string, password?: string) => Promise<void>;
  loginWithTelegram: (user: TelegramWidgetUser) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  isAdmin: boolean;
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

  const checkAuthStatus = async () => {
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
  };

  const login = async (userId?: string, password?: string) => {
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
  };

  const loginWithTelegram = async (telegramUser: TelegramWidgetUser) => {
    try {
      setError(null);
      await authApi.loginWithTelegram(telegramUser);
      await checkAuthStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telegram login failed');
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await authApi.logout();
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  };

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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};