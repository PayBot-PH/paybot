import { client } from './api';

export const authApi = {
  async getCurrentUser() {
    try {
      const response = await client.auth.me();
      if (response?.data) {
        return {
          id: response.data.id || response.data.sub,
          email: response.data.email || '',
          name: response.data.name || response.data.email || '',
          role: response.data.role || 'user',
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async login() {
    await client.auth.toLogin();
  },

  async logout() {
    await client.auth.logout();
  },
};