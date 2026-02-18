import { useEffect, useRef, useCallback, useState } from 'react';
import { client } from '@/lib/api';
import { toast } from 'sonner';

export interface PaymentEvent {
  type: string;
  event_type?: string;
  transaction_id?: number;
  external_id?: string;
  old_status?: string;
  new_status?: string;
  amount?: number;
  description?: string;
  transaction_type?: string;
  timestamp?: number;
  // Wallet fields
  wallet_id?: number;
  balance?: number;
}

interface UsePaymentEventsOptions {
  enabled?: boolean;
  onStatusChange?: (event: PaymentEvent) => void;
  onWalletUpdate?: (event: PaymentEvent) => void;
  pollInterval?: number;
}

/**
 * Hook for real-time payment and wallet notifications.
 * Uses polling to /api/v1/events/recent for reliable cross-environment support.
 */
export function usePaymentEvents({
  enabled = true,
  onStatusChange,
  onWalletUpdate,
  pollInterval = 5000,
}: UsePaymentEventsOptions = {}) {
  const [lastEvent, setLastEvent] = useState<PaymentEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const lastTimestampRef = useRef<number>(Date.now() / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showNotification = useCallback((event: PaymentEvent) => {
    const eventType = event.event_type || event.type;

    if (eventType === 'wallet_update') {
      const txnType = event.transaction_type || '';
      const amount = event.amount
        ? `₱${event.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        : '';
      const balance = event.balance != null
        ? `₱${event.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        : '';

      if (txnType === 'top_up') {
        toast.success(`💰 Wallet Top-Up! +${amount}`, {
          description: `New balance: ${balance}`,
          duration: 6000,
        });
      } else if (txnType === 'send') {
        toast.info(`💸 Money Sent: ${amount}`, {
          description: `New balance: ${balance}`,
          duration: 5000,
        });
      } else if (txnType === 'withdraw') {
        toast.info(`🏦 Withdrawal: ${amount}`, {
          description: `New balance: ${balance}`,
          duration: 5000,
        });
      } else {
        toast.info(`💰 Wallet Updated`, {
          description: `Balance: ${balance}`,
          duration: 5000,
        });
      }
      return;
    }

    // Payment status change notifications
    const statusEmoji: Record<string, string> = {
      paid: '✅',
      expired: '❌',
      pending: '⏳',
    };
    const emoji = statusEmoji[event.new_status || ''] || '🔔';
    const typeLabel: Record<string, string> = {
      invoice: 'Invoice',
      qr_code: 'QR Code',
      payment_link: 'Payment Link',
    };
    const label = typeLabel[event.transaction_type || ''] || 'Payment';
    const amount = event.amount
      ? `₱${event.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      : '';

    if (event.new_status === 'paid') {
      toast.success(`${emoji} ${label} Paid! ${amount}`, {
        description: event.description || event.external_id || '',
        duration: 8000,
      });
    } else if (event.new_status === 'expired') {
      toast.error(`${emoji} ${label} Expired ${amount}`, {
        description: event.description || event.external_id || '',
        duration: 6000,
      });
    } else {
      toast.info(`${emoji} ${label} → ${event.new_status?.toUpperCase()} ${amount}`, {
        description: event.description || event.external_id || '',
        duration: 5000,
      });
    }
  }, []);

  const pollEvents = useCallback(async () => {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/events/recent',
        method: 'GET',
        data: { since: lastTimestampRef.current },
      });

      if (!connected) setConnected(true);

      const events: PaymentEvent[] = res.data?.events || [];
      const serverTime = res.data?.server_time;
      if (serverTime) {
        lastTimestampRef.current = serverTime;
      }

      for (const event of events) {
        const eventType = event.event_type || event.type;
        if (eventType === 'status_change') {
          setLastEvent(event);
          showNotification(event);
          onStatusChange?.(event);
        } else if (eventType === 'wallet_update') {
          setLastEvent(event);
          showNotification(event);
          onWalletUpdate?.(event);
        }
        if (event.timestamp && event.timestamp > lastTimestampRef.current) {
          lastTimestampRef.current = event.timestamp;
        }
      }
    } catch {
      // Silently fail - will retry on next poll
      if (connected) setConnected(false);
    }
  }, [connected, onStatusChange, onWalletUpdate, showNotification]);

  useEffect(() => {
    if (!enabled) return;

    // Initial poll
    pollEvents();

    // Set up interval
    intervalRef.current = setInterval(pollEvents, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollEvents, pollInterval]);

  return { lastEvent, connected };
}