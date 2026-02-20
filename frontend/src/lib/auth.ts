const TOKEN_KEY = 'paybot_auth_token';

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
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async login(userId: string, password: string) {
    const response = await fetch('/api/v1/auth/telegram-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ telegram_user_id: userId, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || 'Login failed');
    }

    const data = await response.json();
    if (!data?.token) {
      throw new Error('Login failed: missing token');
    }

    setStoredToken(data.token);
  },

  async logout() {
    clearStoredToken();
  },
};