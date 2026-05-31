import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { Config } from '../Config';

const BASE_URL = Config.API_BASE_URL;

const getHeaders = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  const deviceId = await DeviceInfo.getUniqueId();
  return {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

export const terminalApi = {
  registerDevice: async () => {
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      const brand = await DeviceInfo.getBrand();
      const model = await DeviceInfo.getModel();
      const osVersion = await DeviceInfo.getSystemVersion();
      const appVersion = await DeviceInfo.getVersion();

      const response = await axios.post(`${BASE_URL}/pos-terminals/devices/register`, {
        device_id: deviceId,
        brand,
        model,
        os_version: osVersion,
        app_version: appVersion,
        metadata_json: {
          deviceName: await DeviceInfo.getDeviceName(),
        },
      });

      return response.data;
    } catch (error) {
      console.error('Device registration failed:', error);
      throw error;
    }
  },

  getTerminals: async () => {
    const headers = await getHeaders();
    const response = await axios.get(`${BASE_URL}/pos-terminals/`, { headers });
    return response.data;
  },

  getTransactions: async (terminalId: number) => {
    const headers = await getHeaders();
    const response = await axios.get(`${BASE_URL}/pos-terminals/${terminalId}/transactions?per_page=20`, { headers });
    return response.data;
  },

  createTransaction: async (terminalId: number, data: any) => {
    const headers = await getHeaders();
    const response = await axios.post(`${BASE_URL}/pos-terminals/${terminalId}/transactions`, data, { headers });
    return response.data;
  },

  finalizeEcrTransaction: async (terminalId: number, orderId: string, paymentMethod: string) => {
    const headers = await getHeaders();
    const response = await axios.post(`${BASE_URL}/pos-terminals/${terminalId}/transactions/${orderId}/finalize`, { payment_method: paymentMethod }, { headers });
    return response.data;
  },

  getTransaction: async (orderId: string) => {
    const headers = await getHeaders();
    const response = await axios.get(`${BASE_URL}/pos-terminals/transactions/${orderId}`, { headers });
    return response.data;
  },

  getWalletBalance: async () => {
    const headers = await getHeaders();
    const response = await axios.get(`${BASE_URL}/wallet/balance?currency=PHP`, { headers });
    return response.data;
  },
};
