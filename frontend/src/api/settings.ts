import { client } from '../lib/api';

export interface EnvVariable {
  key: string;
  value: string;
  description: string;
}

export interface EnvConfig {
  backend_vars: Record<string, EnvVariable>;
  frontend_vars: Record<string, EnvVariable>;
}

export interface EnvVariableUpdate {
  value: string;
}

export const settingsApi = {
  async getConfig(): Promise<EnvConfig> {
    const response = await client.apiCall.invoke({
      url: '/api/v1/admin/settings/',
      method: 'GET',
      data: {},
    });
    return response.data;
  },

  async updateBackendConfig(
    key: string,
    value: string
  ): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/backend/${key}`,
      method: 'PUT',
      data: { value },
    });
    return response.data;
  },

  async updateFrontendConfig(
    key: string,
    value: string
  ): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/frontend/${key}`,
      method: 'PUT',
      data: { value },
    });
    return response.data;
  },

  async addBackendConfig(
    key: string,
    value: string
  ): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/backend/${key}`,
      method: 'POST',
      data: { value },
    });
    return response.data;
  },

  async addFrontendConfig(
    key: string,
    value: string
  ): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/frontend/${key}`,
      method: 'POST',
      data: { value },
    });
    return response.data;
  },

  async deleteBackendConfig(key: string): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/backend/${key}`,
      method: 'DELETE',
      data: {},
    });
    return response.data;
  },

  async deleteFrontendConfig(key: string): Promise<{ message: string }> {
    const response = await client.apiCall.invoke({
      url: `/api/v1/admin/settings/frontend/${key}`,
      method: 'DELETE',
      data: {},
    });
    return response.data;
  },
};