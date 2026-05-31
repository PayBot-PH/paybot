const TOKEN_KEY = 'token';

export interface TelegramWidgetUser {
  id: number;
  auth_date: number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

export const authApi = {
  async getCurrentUser() {
    try {
      const token = getStoredToken();
      if (!token) return null;

      const response = await fetch('/api/v1/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data) {
        return {
          id: data.id || '',
          email: data.email || '',
          name: data.name || data.email || '',
          role: data.role || 'user',
          permissions: data.permissions ?? undefined,
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async login(email: string, password: string) {
    const response = await fetch('/api/v1/auth/terminal-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || 'Login failed');
    }

    const data = await response.json();
    if (!data?.access_token) {
      throw new Error('Login failed: missing access token');
    }

    setStoredToken(data.access_token);
  },

  async loginWithTelegram(user: TelegramWidgetUser, cfTurnstileToken?: string | null) {
    const response = await fetch('/api/v1/auth/telegram-login-widget', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...user,
        ...(cfTurnstileToken ? { cf_turnstile_token: cfTurnstileToken } : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || 'Telegram login failed');
    }

    const data = await response.json();
    if (!data?.token) {
      throw new Error('Telegram login failed: missing token');
    }

    setStoredToken(data.token);
  },

  async logout() {
    clearStoredToken();
  },
};