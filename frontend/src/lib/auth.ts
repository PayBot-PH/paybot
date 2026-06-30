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
          organization_id: data.organization_id ?? undefined,
          organization_name: data.organization_name ?? undefined,
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
      throw new Error(data?.detail || 'Email login failed');
    }

    const data = await response.json();
    const token = data?.access_token || data?.token;
    if (!token) {
      throw new Error('Email login failed: missing token');
    }

    setStoredToken(token);
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