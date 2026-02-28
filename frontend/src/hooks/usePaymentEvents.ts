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
  // GitHub PR fields
  pr_number?: number;
  pr_title?: string;
  pr_state?: string;
  pr_url?: string;
  pr_draft?: boolean;
  pr_merged?: boolean;
  pr_user?: string;
  action?: string;
}

interface UsePaymentEventsOptions {
  enabled?: boolean;
  onStatusChange?: (event: PaymentEvent) => void;
  onWalletUpdate?: (event: PaymentEvent) => void;
  onPrUpdate?: (event: PaymentEvent) => void;
  pollInterval?: number;
}

/**
 * Hook for real-time payment and wallet notifications.
 * Uses polling to /api/v1/events/recent for reliable cross-environment support.
 * Silently handles all errors to prevent UI disruption.
 */
export function usePaymentEvents({
  enabled = true,
  onStatusChange,
  onWalletUpdate,
  onPrUpdate,
  pollInterval = 10000,
}: UsePaymentEventsOptions = {}) {
  const [lastEvent, setLastEvent] = useState<PaymentEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const lastTimestampRef = useRef<number>(Date.now() / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef<number>(0);

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

      // Reset fail count on success
      failCountRef.current = 0;
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
        } else if (eventType === 'pr_update') {
          setLastEvent(event);
          onPrUpdate?.(event);
        }
        if (event.timestamp && event.timestamp > lastTimestampRef.current) {
          lastTimestampRef.current = event.timestamp;
        }
      }
    } catch {
      // Silently fail - increment fail count and back off
      failCountRef.current += 1;
      if (connected && failCountRef.current > 2) {
        setConnected(false);
      }
      // Don't show any error toast - this is background polling
    }
  }, [connected, onStatusChange, onWalletUpdate, onPrUpdate, showNotification]);

  useEffect(() => {
    if (!enabled) return;

    // Delay initial poll slightly to let auth settle
    const initialTimeout = setTimeout(() => {
      pollEvents();
    }, 2000);

    // Set up interval
    intervalRef.current = setInterval(pollEvents, pollInterval);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollEvents, pollInterval]);

  return { lastEvent, connected };
}