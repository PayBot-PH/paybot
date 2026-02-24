import { useEffect, useState, useCallback } from 'react';
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
  PlusCircle,
  ExternalLink,
  Copy,
  Check,
  Bitcoin,
  AlertCircle,
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

interface CryptoDepositInfo {
  address: string;
  network: string;
  currency: string;
  notes: string;
}

interface CryptoTopupRequest {
  id: number;
  user_id: string;
  amount_usdt: number;
  tx_hash: string;
  network: string;
  status: string;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  crypto_topup: {
    label: 'Crypto Top Up',
    color: 'text-teal-400',
    icon: <Bitcoin className="h-4 w-4 text-teal-400" />,
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
  const [phpBalance, setPhpBalance] = useState<WalletBalance | null>(null);
  const [usdBalance, setUsdBalance] = useState<WalletBalance | null>(null);
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

  // Top Up: method toggle
  const [topupMethod, setTopupMethod] = useState<'xendit' | 'crypto'>('xendit');

  // Xendit Top Up state
  const [topupAmount, setTopupAmount] = useState('');
  const [topupDesc, setTopupDesc] = useState('Wallet Top Up');
  const [topupEmail, setTopupEmail] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupResult, setTopupResult] = useState<{ invoice_url: string; amount: number } | null>(null);

  // Crypto Top Up state
  const [cryptoDepositInfo, setCryptoDepositInfo] = useState<CryptoDepositInfo | null>(null);
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoTxHash, setCryptoTxHash] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoRequests, setCryptoRequests] = useState<CryptoTopupRequest[]>([]);
  const [addressCopied, setAddressCopied] = useState(false);

  const fetchWalletData = useCallback(async () => {
    if (!user) return;
    try {
      const [phpRes, usdRes, txnRes] = await Promise.all([
        fetch('/api/v1/wallet/balance?currency=PHP').then(r => r.json()),
        fetch('/api/v1/wallet/balance?currency=USD').then(r => r.json()),
        fetch('/api/v1/wallet/transactions').then(r => r.json()),
      ]);
      setPhpBalance(phpRes);
      setUsdBalance(usdRes);
      setTransactions(txnRes?.items || []);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    }
  }, [user]);

  const fetchCryptoRequests = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/v1/wallet/crypto-topup-requests');
      if (res.ok) {
        const data = await res.json();
        setCryptoRequests(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch crypto requests:', err);
    }
  }, [user]);

  const onWalletUpdate = useCallback(() => { fetchWalletData(); }, [fetchWalletData]);
  const onStatusChange = useCallback(() => { fetchWalletData(); }, [fetchWalletData]);

  const { connected } = usePaymentEvents({
    enabled: !!user,
    onWalletUpdate,
    onStatusChange,
    pollInterval: 5000,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      await fetchWalletData();
      await fetchCryptoRequests();
      setLoading(false);
    };
    load();

    // Fetch available banks
    fetch('/api/v1/gateway/available-banks')
      .then(r => r.json())
      .then((data) => {
        const banks: BankOption[] = (data || []).map((b: { name: string; code: string }) => ({
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
        const fallback = BANKS.map(b => ({ name: b, code: b }));
        setBankOptions(fallback);
        setWithdrawBank(fallback[0].code);
      });

    // Fetch crypto deposit info
    fetch('/api/v1/wallet/crypto-deposit-info')
      .then(r => r.json())
      .then(data => setCryptoDepositInfo(data))
      .catch(() => {});
  }, [user, fetchWalletData, fetchCryptoRequests]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setWithdrawLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, bank_name: withdrawBank, account_number: withdrawAccount, note: withdrawNote }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Withdrawal submitted');
        setWithdrawAmount(''); setWithdrawBank(''); setWithdrawAccount(''); setWithdrawNote('');
        await fetchWalletData();
      } else {
        toast.error(data.detail || data.message || 'Failed to withdraw');
      }
    } catch {
      toast.error('Failed to withdraw');
    } finally { setWithdrawLoading(false); }
  };

  const handleDisburse = async () => {
    const amount = parseFloat(dAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!dAccount || !dName) { toast.error('Enter account number and name'); return; }
    setDLoading(true);
    try {
      const res = await fetch('/api/v1/gateway/disbursement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, bank_code: dBank, account_number: dAccount, account_name: dName, description: dDesc }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Disbursement sent');
        setDAmount(''); setDAccount(''); setDName(''); setDDesc('');
        await fetchWalletData();
      } else {
        toast.error(data.detail || data.message || 'Disbursement failed');
      }
    } catch {
      toast.error('Disbursement failed');
    } finally { setDLoading(false); }
  };

  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setTopupLoading(true);
    setTopupResult(null);
    try {
      const res = await fetch('/api/v1/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description: topupDesc || 'Wallet Top Up', customer_email: topupEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTopupResult({ invoice_url: data.invoice_url, amount });
        toast.success('Invoice created! Complete payment to credit your wallet.');
      } else {
        toast.error(data.detail || data.message || 'Failed to create top-up invoice');
      }
    } catch {
      toast.error('Top-up failed');
    } finally { setTopupLoading(false); }
  };

  const handleCryptoTopup = async () => {
    const amount = parseFloat(cryptoAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid USDT amount'); return; }
    if (!cryptoTxHash.trim()) { toast.error('Enter the transaction hash'); return; }
    setCryptoLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/crypto-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usdt: amount, tx_hash: cryptoTxHash.trim(), network: 'TRC20' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Request submitted! An admin will review and credit your USD wallet shortly.');
        setCryptoAmount('');
        setCryptoTxHash('');
        await fetchCryptoRequests();
      } else {
        toast.error(data.detail || data.message || 'Submission failed');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setCryptoLoading(false); }
  };

  const handleCopyAddress = () => {
    if (cryptoDepositInfo?.address) {
      navigator.clipboard.writeText(cryptoDepositInfo.address).then(() => {
        setAddressCopied(true);
        setTimeout(() => setAddressCopied(false), 2000);
        toast.success('Address copied!');
      });
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
          <Button onClick={() => login()} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const phpBal = phpBalance?.balance ?? 0;
  const usdBal = usdBalance?.balance ?? 0;
  const pendingCryptoCount = cryptoRequests.filter(r => r.status === 'pending').length;

  return (
    <Layout connected={connected}>
      <div className="max-w-3xl mx-auto">

        {/* Dual Wallet Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* PHP Wallet */}
          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-0 overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white,transparent)]" />
            <CardContent className="p-5 sm:p-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-200 text-xs font-medium mb-1">PHP Wallet</p>
                  <p className="text-3xl font-bold text-white tracking-tight">
                    {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : `₱${phpBal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </p>
                  <p className="text-blue-200 text-[10px] mt-1">Philippine Peso</p>
                </div>
                <div className="h-12 w-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <WalletIcon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* USD Wallet */}
          <Card className="bg-gradient-to-br from-teal-600 to-emerald-700 border-0 overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white,transparent)]" />
            <CardContent className="p-5 sm:p-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-teal-100 text-xs font-medium mb-1">USD Wallet</p>
                  <p className="text-3xl font-bold text-white tracking-tight">
                    {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : `$${usdBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </p>
                  <p className="text-teal-100 text-[10px] mt-1">US Dollar · via Crypto Topup</p>
                </div>
                <div className="h-12 w-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Bitcoin className="h-6 w-6 text-white" />
                </div>
              </div>
              {pendingCryptoCount > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-teal-200" />
                  <span className="text-teal-200 text-[10px]">{pendingCryptoCount} pending crypto request{pendingCryptoCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions: Withdraw / Disburse / Top Up */}
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
                  className="flex-1 h-full rounded-none data-[state=active]:bg-[#1E293B] data-[state=active]:text-emerald-400 text-slate-400 gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  Disburse
                </TabsTrigger>
                <TabsTrigger
                  value="topup"
                  className="flex-1 h-full rounded-none rounded-tr-lg data-[state=active]:bg-[#1E293B] data-[state=active]:text-blue-400 text-slate-400 gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  Top Up
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

              {/* Top Up Tab */}
              <TabsContent value="topup" className="mt-0">
                {/* Method Selector */}
                <div className="flex border-b border-slate-700/60">
                  <button
                    onClick={() => setTopupMethod('xendit')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      topupMethod === 'xendit'
                        ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Xendit Invoice
                  </button>
                  <button
                    onClick={() => setTopupMethod('crypto')}
                    className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      topupMethod === 'crypto'
                        ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-500/5'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Bitcoin className="h-4 w-4" />
                    Crypto (USDT)
                  </button>
                </div>

                {topupMethod === 'xendit' ? (
                  <div className="p-4 sm:p-6 space-y-4">
                    {topupResult ? (
                      <div className="text-center space-y-4">
                        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4">
                          <CheckCircle className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                          <p className="text-white font-semibold">Invoice Created!</p>
                          <p className="text-slate-400 text-sm mt-1">₱{topupResult.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be credited after payment</p>
                        </div>
                        <a
                          href={topupResult.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open Payment Page
                        </a>
                        <button
                          onClick={() => { setTopupResult(null); setTopupAmount(''); }}
                          className="text-slate-400 text-sm hover:text-slate-300 transition"
                        >
                          Create another top-up
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-slate-300 text-sm">Amount (₱)</Label>
                            <Input type="number" placeholder="0.00" value={topupAmount}
                              onChange={e => setTopupAmount(e.target.value)} min="1"
                              className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Email (optional)</Label>
                            <Input type="email" placeholder="your@email.com" value={topupEmail}
                              onChange={e => setTopupEmail(e.target.value)}
                              className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-slate-300 text-sm">Description</Label>
                            <Input placeholder="Wallet Top Up" value={topupDesc}
                              onChange={e => setTopupDesc(e.target.value)}
                              className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
                          A Xendit payment invoice will be generated. Pay via credit card, GCash, Maya, bank transfer, or any supported method. Your PHP wallet is credited automatically once paid.
                        </div>
                        <Button onClick={handleTopup} disabled={topupLoading}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                          {topupLoading
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating Invoice...</>
                            : <><PlusCircle className="h-4 w-4 mr-2" />Generate Top Up Invoice</>}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  /* Crypto (USDT TRC20) Top Up Panel */
                  <div className="p-4 sm:p-6 space-y-5">
                    {/* Deposit Address Card */}
                    <div className="bg-slate-800/60 border border-teal-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bitcoin className="h-4 w-4 text-teal-400" />
                        <span className="text-teal-300 text-sm font-semibold">USDT Deposit Address</span>
                        <Badge className="bg-teal-500/15 border border-teal-500/25 text-teal-400 text-[9px] px-1.5 py-0 h-4 ml-auto">TRC20</Badge>
                      </div>

                      {cryptoDepositInfo ? (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          {/* QR Code */}
                          <div className="shrink-0">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${cryptoDepositInfo.address}&bgcolor=1e293b&color=ffffff&margin=8`}
                              alt="USDT TRC20 QR Code"
                              className="rounded-lg border border-slate-600/50"
                              width={130}
                              height={130}
                            />
                          </div>
                          {/* Address + Copy */}
                          <div className="flex-1 min-w-0 w-full">
                            <p className="text-slate-400 text-xs mb-1.5">Send USDT (TRC20) to:</p>
                            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2">
                              <code className="text-teal-300 text-xs font-mono break-all flex-1">
                                {cryptoDepositInfo.address}
                              </code>
                              <button
                                onClick={handleCopyAddress}
                                className="shrink-0 text-slate-400 hover:text-teal-400 transition-colors"
                                title="Copy address"
                              >
                                {addressCopied ? <Check className="h-4 w-4 text-teal-400" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </div>
                            <div className="mt-2 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <p className="text-amber-300/80 text-[10px] leading-relaxed">
                                Only send USDT on the TRON (TRC20) network. Other networks will result in permanent loss of funds.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                        </div>
                      )}
                    </div>

                    {/* Submit TX Hash Form */}
                    <div>
                      <p className="text-slate-300 text-sm font-medium mb-3">Submit Transaction Proof</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-slate-400 text-xs">Amount Sent (USDT)</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 50.00"
                            value={cryptoAmount}
                            onChange={e => setCryptoAmount(e.target.value)}
                            min="0.01"
                            step="0.01"
                            className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-400 text-xs">Network</Label>
                          <Input
                            value="TRC20 (TRON)"
                            readOnly
                            className="mt-1 bg-slate-800/40 border-slate-600/40 text-slate-400 cursor-not-allowed"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-slate-400 text-xs">Transaction Hash (TxID)</Label>
                          <Input
                            placeholder="Paste your transaction hash here"
                            value={cryptoTxHash}
                            onChange={e => setCryptoTxHash(e.target.value)}
                            className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 font-mono text-xs"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={handleCryptoTopup}
                        disabled={cryptoLoading}
                        className="w-full mt-3 bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        {cryptoLoading
                          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                          : <><Bitcoin className="h-4 w-4 mr-2" />Submit Topup Request</>}
                      </Button>
                      <p className="text-slate-500 text-xs text-center mt-2">
                        An admin will verify your transaction and credit your USD wallet.
                      </p>
                    </div>

                    {/* Crypto Request History */}
                    {cryptoRequests.length > 0 && (
                      <div>
                        <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Your Requests</p>
                        <div className="space-y-2">
                          {cryptoRequests.slice(0, 5).map(req => (
                            <div key={req.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 rounded-lg px-3 py-2.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-sm font-medium">${req.amount_usdt.toFixed(2)} USDT</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                    req.status === 'approved'
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : req.status === 'rejected'
                                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  }`}>
                                    {req.status}
                                  </span>
                                </div>
                                <p className="text-slate-500 text-[10px] font-mono truncate mt-0.5 max-w-[200px]">{req.tx_hash}</p>
                              </div>
                              <div className="text-right ml-2 shrink-0">
                                {req.status === 'pending'
                                  ? <Clock className="h-4 w-4 text-amber-400" />
                                  : req.status === 'approved'
                                  ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                                  : <XCircle className="h-4 w-4 text-red-400" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                  const isCredit = txn.transaction_type === 'top_up' || txn.transaction_type === 'receive' || txn.transaction_type === 'crypto_topup';
                  const isCrypto = txn.transaction_type === 'crypto_topup';
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
                          {config.sign}{isCrypto ? '$' : '₱'}{txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        {txn.balance_after != null && (
                          <p className="text-[10px] text-slate-500">
                            Bal: {isCrypto ? '$' : '₱'}{txn.balance_after.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
