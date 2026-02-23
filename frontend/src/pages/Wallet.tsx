import { useEffect, useState, useCallback } from 'react';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Wallet as WalletIcon,
  Send,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowDownLeft,
  TrendingUp,
  CheckCircle,
  Clock,
  XCircle,
  Building2,
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

const BANKS = ['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'METROBANK'];

interface BankOption {
  name: string;
  code: string;
}

export default function Wallet() {
  const { user, loading: authLoading, login } = useAuth();
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('withdraw');
  const [bankOptions, setBankOptions] = useState<BankOption[]>([]);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Disburse state
  const [dAmount, setDAmount] = useState('');
  const [dBank, setDBank] = useState('BDO');
  const [dAccount, setDAccount] = useState('');
  const [dName, setDName] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dLoading, setDLoading] = useState(false);

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

  const { connected } = usePaymentEvents({
    enabled: !!user,
    onWalletUpdate: useCallback(() => { fetchWalletData(); }, [fetchWalletData]),
    onStatusChange: useCallback(() => { fetchWalletData(); }, [fetchWalletData]),
    pollInterval: 5000,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => { setLoading(true); await fetchWalletData(); setLoading(false); };
    load();
    // Fetch available banks from Xendit
    client.apiCall.invoke({ url: '/api/v1/gateway/available-banks', method: 'GET', data: {} })
      .then((res) => {
        const banks: BankOption[] = (res.data || []).map((b: { name: string; code: string }) => ({
          name: b.name,
          code: b.code,
        }));
        if (banks.length > 0) {
          setBankOptions(banks);
          setWithdrawBank(banks[0].code);
          setDBank(banks[0].code);
        }
      })
      .catch(() => {
        // Fallback to static list if API fails
        const fallback = BANKS.map(b => ({ name: b, code: b }));
        setBankOptions(fallback);
        setWithdrawBank(fallback[0].code);
      });
  }, [user, fetchWalletData]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setWithdrawLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/wallet/withdraw', method: 'POST',
        data: { amount, bank_name: withdrawBank, account_number: withdrawAccount, note: withdrawNote },
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Withdrawal submitted');
        setWithdrawAmount(''); setWithdrawBank(''); setWithdrawAccount(''); setWithdrawNote('');
        await fetchWalletData();
      } else {
        toast.error(res.data?.message || 'Failed to withdraw');
      }
    } catch (err: unknown) {
      toast.error((err as { data?: { detail?: string } })?.data?.detail || 'Failed to withdraw');
    } finally { setWithdrawLoading(false); }
  };

  const handleDisburse = async () => {
    const amount = parseFloat(dAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!dAccount || !dName) { toast.error('Enter account number and name'); return; }
    setDLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/disbursement', method: 'POST',
        data: { amount, bank_code: dBank, account_number: dAccount, account_name: dName, description: dDesc },
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Disbursement sent');
        setDAmount(''); setDAccount(''); setDName(''); setDDesc('');
        await fetchWalletData();
      } else {
        toast.error(res.data?.message || 'Disbursement failed');
      }
    } catch (err: unknown) {
      toast.error((err as { data?: { detail?: string } })?.data?.detail || 'Disbursement failed');
    } finally { setDLoading(false); }
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
          <Button onClick={() => login()} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const balance = walletBalance?.balance || 0;

  return (
    <Layout connected={connected}>
      <div className="max-w-3xl mx-auto">

        {/* Wallet Balance Card */}
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-0 mb-6 overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white,transparent)]" />
          <CardContent className="p-6 sm:p-8 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm font-medium mb-1">Wallet Balance</p>
                <p className="text-4xl sm:text-5xl font-bold text-white tracking-tight transition-all duration-500">
                  {loading ? <Loader2 className="h-9 w-9 animate-spin" /> : `₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                </p>
                <p className="text-blue-200 text-xs mt-2">{walletBalance?.currency || 'PHP'}</p>
              </div>
              <div className="h-16 w-16 sm:h-20 sm:w-20 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <WalletIcon className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions: Withdraw / Disburse */}
        <Card className="bg-[#1E293B] border-slate-700/50 mb-6">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-none rounded-t-lg bg-slate-800/60 border-b border-slate-700 h-12 p-0 gap-0">
                <TabsTrigger
                  value="withdraw"
                  className="flex-1 h-full rounded-none rounded-tl-lg data-[state=active]:bg-[#1E293B] data-[state=active]:text-amber-400 text-slate-400 gap-2"
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  Withdraw
                </TabsTrigger>
                <TabsTrigger
                  value="disburse"
                  className="flex-1 h-full rounded-none rounded-tr-lg data-[state=active]:bg-[#1E293B] data-[state=active]:text-emerald-400 text-slate-400 gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  Disburse
                </TabsTrigger>
              </TabsList>

              {/* Withdraw Tab */}
              <TabsContent value="withdraw" className="p-4 sm:p-6 mt-0 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-300 text-sm">Amount (₱)</Label>
                    <Input type="number" placeholder="0.00" value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)} min="1"
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Bank</Label>
                    <Select value={withdrawBank} onValueChange={setWithdrawBank}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white">
                        <SelectValue placeholder="Select bank…" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600 max-h-64">
                        {(bankOptions.length > 0 ? bankOptions : BANKS.map(b => ({ name: b, code: b }))).map(b => (
                          <SelectItem key={b.code} value={b.code} className="text-white">{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Account Number</Label>
                    <Input placeholder="Enter account number" value={withdrawAccount}
                      onChange={e => setWithdrawAccount(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Note (optional)</Label>
                    <Input placeholder="Withdrawal note" value={withdrawNote}
                      onChange={e => setWithdrawNote(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                </div>
                <Button onClick={handleWithdraw} disabled={withdrawLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                  {withdrawLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                    : <><ArrowUpFromLine className="h-4 w-4 mr-2" />Withdraw</>}
                </Button>
              </TabsContent>

              {/* Disburse Tab */}
              <TabsContent value="disburse" className="p-4 sm:p-6 mt-0 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-300 text-sm">Amount (₱)</Label>
                    <Input type="number" placeholder="0.00" value={dAmount}
                      onChange={e => setDAmount(e.target.value)} min="1"
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Bank</Label>
                    <Select value={dBank} onValueChange={setDBank}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {(bankOptions.length > 0 ? bankOptions : BANKS.map(b => ({ name: b, code: b }))).map(b => (
                          <SelectItem key={b.code} value={b.code} className="text-white">{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Account Number</Label>
                    <Input placeholder="1234567890" value={dAccount}
                      onChange={e => setDAccount(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Account Name</Label>
                    <Input placeholder="Juan Dela Cruz" value={dName}
                      onChange={e => setDName(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-slate-300 text-sm">Description (optional)</Label>
                    <Input placeholder="Salary payout, etc." value={dDesc}
                      onChange={e => setDDesc(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                </div>
                <Button onClick={handleDisburse} disabled={dLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  {dLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                    : <><Send className="h-4 w-4 mr-2" />Send Disbursement</>}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Wallet Transaction History */}
        <Card className="bg-[#1E293B] border-slate-700/50">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-white flex items-center space-x-2 text-base">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <span>Wallet History</span>
            </CardTitle>
            <Badge className="bg-slate-700 text-slate-300 border-slate-600 border">
              {transactions.length} txns
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10">
                <WalletIcon className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No wallet transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn) => {
                  const config = txnTypeConfig[txn.transaction_type] || {
                    label: txn.transaction_type, color: 'text-slate-400',
                    icon: <WalletIcon className="h-4 w-4 text-slate-400" />, sign: '',
                  };
                  const isCredit = txn.transaction_type === 'top_up' || txn.transaction_type === 'receive';
                  const statusIcon = txn.status === 'completed'
                    ? <CheckCircle className="h-3 w-3 text-emerald-400" />
                    : txn.status === 'pending'
                    ? <Clock className="h-3 w-3 text-amber-400" />
                    : <XCircle className="h-3 w-3 text-red-400" />;
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                          {config.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <p className="text-sm font-medium text-white">{config.label}</p>
                            {statusIcon}
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {txn.note || txn.recipient || txn.reference_id || `#${txn.id}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right ml-2 shrink-0">
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
