import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  BarChart3,
  FileText,
  Plus,
  Loader2,
  Wallet as WalletIcon,
  Send,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownLeft,
  TrendingUp,
  Wifi,
  WifiOff,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

interface WalletBalance {
  wallet_id: number;
  balance: number;
  currency: string;
}

interface WalletTxn {
  id: number;
  transaction_type: string;
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  recipient: string | null;
  note: string | null;
  status: string | null;
  reference_id: string | null;
  created_at: string | null;
}

const txnTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string }> = {
  top_up: {
    label: 'Top Up',
    color: 'text-emerald-400',
    icon: <ArrowDownLeft className="h-4 w-4 text-emerald-400" />,
    sign: '+',
  },
  send: {
    label: 'Sent',
    color: 'text-red-400',
    icon: <Send className="h-4 w-4 text-red-400" />,
    sign: '-',
  },
  withdraw: {
    label: 'Withdrawal',
    color: 'text-amber-400',
    icon: <ArrowUpFromLine className="h-4 w-4 text-amber-400" />,
    sign: '-',
  },
  receive: {
    label: 'Received',
    color: 'text-emerald-400',
    icon: <ArrowDownToLine className="h-4 w-4 text-emerald-400" />,
    sign: '+',
  },
};

export default function Wallet() {
  const { user, loading: authLoading, login } = useAuth();
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);

  // Send money state
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const fetchWalletData = useCallback(async () => {
    if (!user) return;
    try {
      const [balRes, txnRes] = await Promise.all([
        client.apiCall.invoke({ url: '/api/v1/wallet/balance', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/transactions', method: 'GET', data: {} }),
      ]);
      setWalletBalance(balRes.data);
      setTransactions(txnRes.data?.items || []);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    }
  }, [user]);

  // Real-time events
  const { connected } = usePaymentEvents({
    enabled: !!user,
    onWalletUpdate: useCallback(() => {
      fetchWalletData();
    }, [fetchWalletData]),
    onStatusChange: useCallback(() => {
      fetchWalletData();
    }, [fetchWalletData]),
    pollInterval: 5000,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      await fetchWalletData();
      setLoading(false);
    };
    load();
  }, [user, fetchWalletData]);

  const handleSend = async () => {
    if (!sendRecipient || !sendAmount) {
      toast.error('Please enter recipient and amount');
      return;
    }
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setSendLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/wallet/send',
        method: 'POST',
        data: { recipient: sendRecipient, amount, note: sendNote },
      });
      if (res.data?.success) {
        toast.success(res.data.message);
        setSendRecipient('');
        setSendAmount('');
        setSendNote('');
        await fetchWalletData();
      } else {
        toast.error(res.data?.message || 'Failed to send money');
      }
    } catch (err: unknown) {
      const errorMsg = (err as { data?: { detail?: string } })?.data?.detail || 'Failed to send money';
      toast.error(errorMsg);
    } finally {
      setSendLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      toast.error('Please enter an amount');
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setWithdrawLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/wallet/withdraw',
        method: 'POST',
        data: {
          amount,
          bank_name: withdrawBank,
          account_number: withdrawAccount,
          note: withdrawNote,
        },
      });
      if (res.data?.success) {
        toast.success(res.data.message);
        setWithdrawAmount('');
        setWithdrawBank('');
        setWithdrawAccount('');
        setWithdrawNote('');
        await fetchWalletData();
      } else {
        toast.error(res.data?.message || 'Failed to withdraw');
      }
    } catch (err: unknown) {
      const errorMsg = (err as { data?: { detail?: string } })?.data?.detail || 'Failed to withdraw';
      toast.error(errorMsg);
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md px-6">
          <WalletIcon className="h-16 w-16 text-blue-400 mx-auto" />
          <h1 className="text-3xl font-bold text-white">Wallet</h1>
          <p className="text-slate-400">Sign in to access your wallet</p>
          <Button onClick={login} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Layout connected={connected}>
      <div className="max-w-5xl mx-auto">
        {/* Wallet Balance Card */}
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-0 mb-8 overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djJIMjR2LTJoMTJ6TTM2IDI0djJIMjR2LTJoMTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
          <CardContent className="p-8 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm font-medium mb-1">Wallet Balance</p>
                <p className="text-5xl font-bold text-white tracking-tight transition-all duration-500">
                  {loading ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : (
                    `₱${(walletBalance?.balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                  )}
                </p>
                <p className="text-blue-200 text-xs mt-2">{walletBalance?.currency || 'PHP'}</p>
              </div>
              <div className="h-20 w-20 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <WalletIcon className="h-10 w-10 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Send Money */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Send className="h-5 w-5 text-cyan-400" />
                <span>Send Money</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300">Recipient</Label>
                <Input
                  placeholder="Username, email, or wallet ID"
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Amount (₱)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  min="1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Note (optional)</Label>
                <Input
                  placeholder="What's this for?"
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={sendLoading}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {sendLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Money
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Withdraw */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <ArrowUpFromLine className="h-5 w-5 text-amber-400" />
                <span>Withdraw</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300">Amount (₱)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  min="1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Bank Name</Label>
                <Input
                  placeholder="e.g., BDO, BPI, GCash"
                  value={withdrawBank}
                  onChange={(e) => setWithdrawBank(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Account Number</Label>
                <Input
                  placeholder="Enter account number"
                  value={withdrawAccount}
                  onChange={(e) => setWithdrawAccount(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Note (optional)</Label>
                <Input
                  placeholder="Withdrawal note"
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                onClick={handleWithdraw}
                disabled={withdrawLoading}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                {withdrawLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowUpFromLine className="h-4 w-4 mr-2" />
                    Withdraw
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Wallet Transaction History */}
        <Card className="bg-[#1E293B] border-slate-700/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <span>Wallet History</span>
            </CardTitle>
            <Badge className="bg-slate-700 text-slate-300 border-slate-600 border">
              {transactions.length} transactions
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <WalletIcon className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No wallet transactions yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Create a payment to top up your wallet, or use /balance in Telegram
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn) => {
                  const config = txnTypeConfig[txn.transaction_type] || {
                    label: txn.transaction_type,
                    color: 'text-slate-400',
                    icon: <WalletIcon className="h-4 w-4 text-slate-400" />,
                    sign: '',
                  };
                  const isCredit = txn.transaction_type === 'top_up' || txn.transaction_type === 'receive';
                  const statusIcon = txn.status === 'completed'
                    ? <CheckCircle className="h-3 w-3 text-emerald-400" />
                    : txn.status === 'pending'
                    ? <Clock className="h-3 w-3 text-amber-400" />
                    : <XCircle className="h-3 w-3 text-red-400" />;

                  return (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-700/50 flex items-center justify-center">
                          {config.icon}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium text-white">{config.label}</p>
                            {statusIcon}
                          </div>
                          <p className="text-xs text-slate-500">
                            {txn.note || txn.recipient || txn.reference_id || `#${txn.id}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-mono font-semibold ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                          {config.sign}₱{txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                        {txn.balance_after != null && (
                          <p className="text-[10px] text-slate-500">
                            Bal: ₱{txn.balance_after.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}