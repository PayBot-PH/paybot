import { client } from '../lib/api';

export interface WalletBalance {
  wallet_id: number;
  balance: number;
  currency: string;
}

export interface AdminWalletEntry {
  user_id: string;
  telegram_username?: string;
  balance: number;
  wallet_id: number;
}

export interface WalletActionResponse {
  success: boolean;
  message: string;
  balance: number;
  transaction_id: number;
}

export interface AdminWalletAdjustRequest {
  amount: number;
  note?: string;
}

// Error handling wrapper for API calls
async function handleApiCall<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Wallet API Error - ${operationName}:`, error);
    throw new Error(`Failed to ${operationName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const walletApi = {
  async getBalance(currency: string = 'PHP'): Promise<WalletBalance> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: `/api/v1/wallet/balance?currency=${currency}`,
        method: 'GET',
        data: {},
      });
      return response.data;
    }, 'get wallet balance');
  },

  // Admin endpoints for PHP wallets
  async listPhpWallets(): Promise<AdminWalletEntry[]> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: '/api/v1/wallet/admin/php-wallets',
        method: 'GET',
        data: {},
      });
      return response.data;
    }, 'list PHP wallets');
  },

  async adjustPhpWallet(
    userId: string,
    amount: number,
    note?: string
  ): Promise<WalletActionResponse> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: `/api/v1/wallet/admin/php-wallets/${encodeURIComponent(userId)}/adjust`,
        method: 'POST',
        data: { amount, note },
      });
      return response.data;
    }, 'adjust PHP wallet');
  },

  // Admin endpoints for USD wallets
  async listUsdWallets(): Promise<AdminWalletEntry[]> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: '/api/v1/wallet/admin/usd-wallets',
        method: 'GET',
        data: {},
      });
      return response.data;
    }, 'list USD wallets');
  },

  async adjustUsdWallet(
    userId: string,
    amount: number,
    note?: string
  ): Promise<WalletActionResponse> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: `/api/v1/wallet/admin/usd-wallets/${encodeURIComponent(userId)}/adjust`,
        method: 'POST',
        data: { amount, note },
      });
      return response.data;
    }, 'adjust USD wallet');
  },

  async transfer(
    recipient_user_id: string,
    amount: number,
    currency: string = 'PHP',
    note?: string
  ): Promise<WalletActionResponse> {
    return handleApiCall(async () => {
      const response = await client.apiCall.invoke({
        url: '/api/v1/wallet/transfer',
        method: 'POST',
        data: { recipient_user_id, amount, currency, note },
      });
      return response.data;
    }, 'transfer funds');
  },
};
