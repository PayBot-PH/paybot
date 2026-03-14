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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  ShieldAlert,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

/** Extract a user-readable error message from a non-ok fetch Response. */
async function getResponseError(res: Response, fallback: string): Promise<string> {
  try {
    const e = await res.json();
    return (e.detail as string) || (e.message as string) || fallback;
  } catch {
    return fallback;
  }
}

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

interface UsdtSendRequest {
  id: number;
  user_id: string;
  to_address: string;
  amount: number;
  note: string | null;
  status: string;
  denial_reason: string | null;
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
  usdt_send: {
    label: 'Sent USDT',
    color: 'text-red-400',
    icon: <Send className="h-4 w-4 text-red-400" />,
    sign: '-',
  },
  usd_send: {
    label: 'Sent USD',
    color: 'text-red-400',
    icon: <Send className="h-4 w-4 text-red-400" />,
    sign: '-',
  },
  usd_receive: {
    label: 'Received USD',
    color: 'text-emerald-400',
    icon: <ArrowDownToLine className="h-4 w-4 text-emerald-400" />,
    sign: '+',
  },
  admin_credit: {
    label: 'Admin Credit',
    color: 'text-blue-400',
    icon: <ArrowDownLeft className="h-4 w-4 text-blue-400" />,
    sign: '+',
  },
  admin_debit: {
    label: 'Admin Debit',
    color: 'text-orange-400',
    icon: <ArrowUpFromLine className="h-4 w-4 text-orange-400" />,
    sign: '-',
  },
};

const BANKS = ['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'METROBANK'];

// PayBot PH bank accounts for top-up
const TOPUP_BANKS: { bank: string; name: string; number: string }[] = [
  { bank: 'GoTyme Digital Bank',       name: 'PayBot PH', number: '012116012891'  },
  { bank: 'Security Bank Corporation', name: 'PayBot PH', number: '0000068888173' },
  { bank: 'Asia United Bank',          name: 'PayBot PH', number: '934105321485'  },
];

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

  // PHP Top Up Info Dialog
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [topupDialogMethod, setTopupDialogMethod] = useState<'ubp' | 'bank'>('ubp');
  const [paymentCodeCopied, setPaymentCodeCopied] = useState(false);
  const [topupStep, setTopupStep] = useState(0);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupToBank, setTopupToBank] = useState('GoTyme Digital Bank');
  const [topupTransferMethod, setTopupTransferMethod] = useState('');
  const [topupRefNumber, setTopupRefNumber] = useState('');
  const [topupProofFile, setTopupProofFile] = useState<File | null>(null);
  const [topupSubmitting, setTopupSubmitting] = useState(false);

  // Crypto Top Up state
  const [cryptoDepositInfo, setCryptoDepositInfo] = useState<CryptoDepositInfo | null>(null);
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoTxHash, setCryptoTxHash] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoRequests, setCryptoRequests] = useState<CryptoTopupRequest[]>([]);
  const [addressCopied, setAddressCopied] = useState(false);

  // Send USDT state
  const [sendUsdtAddress, setSendUsdtAddress] = useState('');
  const [sendUsdtAmount, setSendUsdtAmount] = useState('');
  const [sendUsdtNote, setSendUsdtNote] = useState('');
  const [sendUsdtLoading, setSendUsdtLoading] = useState(false);
  const [sendUsdtRequests, setSendUsdtRequests] = useState<UsdtSendRequest[]>([]);

  // Send USD to user state
  const [sendUsdUsername, setSendUsdUsername] = useState('');
  const [sendUsdAmount, setSendUsdAmount] = useState('');
  const [sendUsdNote, setSendUsdNote] = useState('');
  const [sendUsdLoading, setSendUsdLoading] = useState(false);

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

  const fetchSendUsdtRequests = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/v1/wallet/usdt-send-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSendUsdtRequests(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch USDT send requests:', err);
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
      await fetchSendUsdtRequests();
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
  }, [user, fetchWalletData, fetchCryptoRequests, fetchSendUsdtRequests]);

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
      if (!res.ok) {
        toast.error(await getResponseError(res, 'Failed to withdraw'));
        return;
      }
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Withdrawal submitted');
        setWithdrawAmount(''); setWithdrawBank(''); setWithdrawAccount(''); setWithdrawNote('');
        await fetchWalletData();
      } else {
        toast.error(data.message || 'Failed to withdraw');
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
      if (!res.ok) {
        toast.error(await getResponseError(res, 'Disbursement failed'));
        return;
      }
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Disbursement sent');
        setDAmount(''); setDAccount(''); setDName(''); setDDesc('');
        await fetchWalletData();
      } else {
        toast.error(data.message || 'Disbursement failed');
      }
    } catch {
      toast.error('Disbursement failed');
    } finally { setDLoading(false); }
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
      if (!res.ok) {
        toast.error(await getResponseError(res, 'Submission failed'));
        return;
      }
      const data = await res.json();
      if (data.success) {
        toast.success('Request submitted! An admin will review and credit your USD wallet shortly.');
        setCryptoAmount('');
        setCryptoTxHash('');
        await fetchCryptoRequests();
      } else {
        toast.error(data.message || 'Submission failed');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setCryptoLoading(false); }
  };

  const handleSendUsdt = async () => {
    const amount = parseFloat(sendUsdtAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid USDT amount'); return; }
    const addr = sendUsdtAddress.trim();
    if (!addr) { toast.error('Enter the recipient TRC-20 address'); return; }
    if (!addr.startsWith('T') || addr.length !== 34) {
      toast.error('Invalid TRC-20 address — must start with T and be 34 characters');
      return;
    }
    setSendUsdtLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/send-usdt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_address: addr, amount, note: sendUsdtNote }),
      });
      if (!res.ok) {
        toast.error(await getResponseError(res, 'Failed to submit send request'));
        return;
      }
      toast.success('Send request submitted! Awaiting super admin approval.');
      setSendUsdtAddress('');
      setSendUsdtAmount('');
      setSendUsdtNote('');
      await fetchSendUsdtRequests();
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setSendUsdtLoading(false); }
  };

  const handleSendUsd = async () => {
    const amount = parseFloat(sendUsdAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid USD amount'); return; }
    const uname = sendUsdUsername.trim().replace(/^@/, '');
    if (!uname) { toast.error('Enter the recipient Telegram username'); return; }
    setSendUsdLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/send-usd', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_username: uname, amount, note: sendUsdNote }),
      });
      if (!res.ok) {
        toast.error(await getResponseError(res, 'Failed to send USD'));
        return;
      }
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Sent $${amount.toFixed(2)} USD to @${uname}`);
        setSendUsdUsername('');
        setSendUsdAmount('');
        setSendUsdNote('');
        await fetchWalletData();
      } else {
        toast.error(data.message || 'Failed to send USD');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setSendUsdLoading(false); }
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
  const pendingSendCount = sendUsdtRequests.filter(r => r.status === 'pending').length;

  return (
    <Layout connected={connected}>
      <div className="max-w-3xl mx-auto">

        {/* Dual Wallet Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Wallet Balance */}
          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-0 overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white,transparent)]" />
            <CardContent className="p-5 sm:p-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-200 text-xs font-medium mb-1">Wallet Balance</p>
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
              {pendingSendCount > 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-amber-200" />
                  <span className="text-amber-200 text-[10px]">{pendingSendCount} pending send request{pendingSendCount > 1 ? 's' : ''}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions: Withdraw / Disburse / Top Up */}
        <Card className="bg-[#1E293B] border-slate-700/50 mb-6">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-none rounded-t-lg bg-slate-800/60 border-b border-slate-700 h-14 p-0 gap-0">
                <TabsTrigger
                  value="withdraw"
                  className="flex-1 h-full rounded-none rounded-tl-lg data-[state=active]:bg-[#1E293B] data-[state=active]:text-amber-400 text-slate-400 flex-col gap-0.5 py-2 text-[10px] sm:flex-row sm:gap-2 sm:text-sm sm:py-0"
                >
                  <ArrowUpFromLine className="h-4 w-4 shrink-0" />
                  <span>Withdraw</span>
                </TabsTrigger>
                <TabsTrigger
                  value="disburse"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-[#1E293B] data-[state=active]:text-emerald-400 text-slate-400 flex-col gap-0.5 py-2 text-[10px] sm:flex-row sm:gap-2 sm:text-sm sm:py-0"
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>Disburse</span>
                </TabsTrigger>
                <TabsTrigger
                  value="topup"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-[#1E293B] data-[state=active]:text-blue-400 text-slate-400 flex-col gap-0.5 py-2 text-[10px] sm:flex-row sm:gap-2 sm:text-sm sm:py-0"
                >
                  <PlusCircle className="h-4 w-4 shrink-0" />
                  <span>Top Up</span>
                </TabsTrigger>
                <TabsTrigger
                  value="send-usd"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-[#1E293B] data-[state=active]:text-emerald-400 text-slate-400 flex-col gap-0.5 py-2 text-[10px] sm:flex-row sm:gap-2 sm:text-sm sm:py-0"
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <span>Send USD</span>
                </TabsTrigger>
                <TabsTrigger
                  value="send-usdt"
                  className="flex-1 h-full rounded-none rounded-tr-lg data-[state=active]:bg-[#1E293B] data-[state=active]:text-teal-400 text-slate-400 flex-col gap-0.5 py-2 text-[10px] sm:flex-row sm:gap-2 sm:text-sm sm:py-0"
                >
                  <Bitcoin className="h-4 w-4 shrink-0" />
                  <span>Send USDT</span>
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
                {/* PHP Top Up — informational button */}
                <div className="border-b border-slate-700/60">
                  <button
                    onClick={() => { setTopupDialogOpen(true); setTopupDialogMethod('ubp'); }}
                    className="w-full py-3 text-sm font-medium flex items-center justify-center gap-2 text-blue-400 hover:bg-blue-500/5 transition-colors"
                  >
                    <PlusCircle className="h-4 w-4" />
                    PHP Top Up — How to Top Up
                  </button>
                </div>

                {/* Crypto (USDT TRC20) Top Up Panel */}
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
              </TabsContent>

              {/* PHP Top Up Info Dialog */}
              <Dialog open={topupDialogOpen} onOpenChange={(open) => {
                if (!open) {
                  setTopupStep(0);
                  setTopupAmount('');
                  setTopupToBank('GoTyme Digital Bank');
                  setTopupTransferMethod('');
                  setTopupRefNumber('');
                  setTopupProofFile(null);
                }
                setTopupDialogOpen(open);
              }}>
                <DialogContent className="bg-[#1E293B] border-slate-700 text-white max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-white text-base font-semibold">
                      {topupStep === 0 ? 'Choose Top Up method' : topupStep === 1 ? 'Top Up Balance' : topupStep === 2 ? 'Confirm Transfer' : 'Submit Proof'}
                    </DialogTitle>
                  </DialogHeader>

                  {topupStep === 0 ? (
                    <>
                      {/* Method selector */}
                      <div className="flex gap-3 mt-1">
                        <button
                          onClick={() => setTopupDialogMethod('ubp')}
                          className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            topupDialogMethod === 'ubp'
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-600 hover:border-slate-500 bg-slate-800/40'
                          }`}
                        >
                          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center text-white font-extrabold text-sm">UB</div>
                          <span className="text-xs font-medium text-center leading-tight">UBP Bills<br />Payment</span>
                        </button>
                        <button
                          onClick={() => setTopupDialogMethod('bank')}
                          className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            topupDialogMethod === 'bank'
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-slate-600 hover:border-slate-500 bg-slate-800/40'
                          }`}
                        >
                          <Building2 className="w-9 h-9 text-blue-400" />
                          <span className="text-xs font-medium text-center leading-tight">Bank<br />Transfer</span>
                        </button>
                      </div>

                      {/* UBP Bills Payment instructions */}
                      {topupDialogMethod === 'ubp' && (
                        <div className="space-y-3 mt-1">
                          <p className="text-slate-300 text-sm">Please follow these steps:</p>
                          <ol className="space-y-2.5 text-sm text-slate-300">
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">1.</span>
                              <span>Log in to your <strong className="text-white">UnionBank (UBP)</strong> account</span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">2.</span>
                              <span>Go to <strong className="text-white">Pay Bills (UBP Online)</strong> or <strong className="text-white">Bills Payment (UBP The Portal)</strong> section</span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">3.</span>
                              <span>Click <strong className="text-white">Select Biller</strong> and go to the <strong className="text-white">Biller List</strong> section</span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">4.</span>
                              <span>Select biller name <strong className="text-white">"XENDIT BALANCE TOP-UP"</strong></span>
                            </li>
                            <li className="flex gap-3 items-start">
                              <span className="text-slate-500 shrink-0 w-4 text-right">5.</span>
                              <span className="flex items-center gap-2 flex-wrap">
                                Enter your payment code:
                                {/* Payment code for the Xendit account associated with this platform */}
                                <span className="text-blue-400 font-mono font-semibold">uso1h0</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText('uso1h0').then(() => {
                                      setPaymentCodeCopied(true);
                                      setTimeout(() => setPaymentCodeCopied(false), 2000);
                                    }).catch(() => {
                                      toast.error('Could not copy to clipboard');
                                    });
                                  }}
                                  className="text-slate-400 hover:text-blue-400 transition-colors"
                                  title="Copy payment code"
                                >
                                  {paymentCodeCopied ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                              </span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">6.</span>
                              <span>Enter the amount you want to top-up</span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">7.</span>
                              <span>Indicate the date you want to process the top-up. Note that you can either top-up right away or create a one-time or recurring schedule.</span>
                            </li>
                            <li className="flex gap-3">
                              <span className="text-slate-500 shrink-0 w-4 text-right">8.</span>
                              <span>Review the details and click <strong className="text-white">Pay</strong> to continue</span>
                            </li>
                          </ol>
                        </div>
                      )}

                      {/* Bank Transfer details */}
                      {topupDialogMethod === 'bank' && (
                        <div className="space-y-3 mt-1">
                          <p className="text-slate-300 text-sm leading-relaxed">
                            To top-up your balance, transfer to one of the PayBot PH bank accounts below. Your top-up will be credited after admin verification.
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-slate-600/50">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-slate-700/50">
                                  <th className="px-3 py-2.5 text-left text-slate-300 font-medium text-xs">Bank</th>
                                  <th className="px-3 py-2.5 text-left text-slate-300 font-medium text-xs">Account Name</th>
                                  <th className="px-3 py-2.5 text-left text-slate-300 font-medium text-xs">Account Number</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-600/30">
                                {TOPUP_BANKS.map((b) => (
                                  <tr key={b.bank}>
                                    <td className="px-3 py-2.5 text-slate-300 text-xs">{b.bank}</td>
                                    <td className="px-3 py-2.5 text-slate-400 text-xs">{b.name}</td>
                                    <td className="px-3 py-2.5 text-slate-400 text-xs font-mono">{b.number}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
                        <a
                          href="https://help.xendit.co/hc/en-us/articles/360034928492"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300 transition-colors"
                        >
                          <LinkIcon className="h-3 w-3" />
                          Learn more about Top up
                        </a>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setTopupDialogOpen(false)}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700">
                            Cancel
                          </Button>
                          {topupDialogMethod === 'bank' ? (
                            <Button size="sm" onClick={() => setTopupStep(1)}
                              className="bg-blue-600 hover:bg-blue-700 text-white">
                              Submit Details
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => setTopupDialogOpen(false)}
                              className="bg-blue-600 hover:bg-blue-700 text-white">
                              Okay
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : topupStep === 1 ? (
                    <>
                      {/* Top Up Balance form */}
                      <div className="space-y-4 mt-2">
                        <div className="space-y-1.5">
                          <Label className="text-slate-300 text-sm font-medium">Top Up Amount</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 5000"
                            value={topupAmount}
                            onChange={(e) => setTopupAmount(e.target.value)}
                            className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-blue-400 text-sm font-medium">Top Up to</Label>
                          <Select value={topupToBank} onValueChange={setTopupToBank}>
                            <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white focus:ring-blue-500">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1E293B] border-slate-700 text-white">
                              {TOPUP_BANKS.map((b) => (
                                <SelectItem key={b.bank} value={b.bank} className="text-white focus:bg-slate-700 focus:text-white">{b.bank}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-blue-400 text-sm font-medium">Top Up Method</Label>
                          <Select value={topupTransferMethod} onValueChange={setTopupTransferMethod}>
                            <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white focus:ring-blue-500">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1E293B] border-slate-700 text-white">
                              <SelectItem value="interbank" className="text-white focus:bg-slate-700 focus:text-white">Interbank transfer</SelectItem>
                              <SelectItem value="cash" className="text-white focus:bg-slate-700 focus:text-white">Cash deposit</SelectItem>
                              <SelectItem value="check" className="text-white focus:bg-slate-700 focus:text-white">Check deposit</SelectItem>
                              <SelectItem value="international" className="text-white focus:bg-slate-700 focus:text-white">International transfer</SelectItem>
                              <SelectItem value="other" className="text-white focus:bg-slate-700 focus:text-white">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
                        <a
                          href="https://help.xendit.co/hc/en-us/articles/360034928492"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300 transition-colors"
                        >
                          <LinkIcon className="h-3 w-3" />
                          Learn more about Top up
                        </a>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setTopupStep(0)}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700">
                            Back
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!topupAmount || parseFloat(topupAmount) <= 0) {
                                toast.error('Please enter a valid top-up amount');
                                return;
                              }
                              if (!topupTransferMethod) {
                                toast.error('Please select a top-up method');
                                return;
                              }
                              setTopupStep(2);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Continue
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : topupStep === 2 ? (
                    <>
                      {/* Confirm Transfer */}
                      <div className="space-y-4 mt-2">
                        <p className="text-slate-300 text-sm leading-relaxed">
                          Please complete this bank transfer using the details below. Once done, proceed to upload your receipt.
                        </p>
                        <div className="rounded-lg border border-slate-600/50 bg-slate-800/40 divide-y divide-slate-600/30 text-sm">
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-slate-400">Amount</span>
                            <span className="text-white font-semibold">₱{parseFloat(topupAmount || '0').toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-slate-400">Bank</span>
                            <span className="text-white">{topupToBank}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-slate-400">Account Name</span>
                            <span className="text-white">{TOPUP_BANKS.find((b) => b.bank === topupToBank)?.name ?? 'PayBot PH'}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-slate-400">Account Number</span>
                            <span className="text-white font-mono">
                              {TOPUP_BANKS.find((b) => b.bank === topupToBank)?.number ?? '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-slate-400">Method</span>
                            <span className="text-white capitalize">{topupTransferMethod.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-amber-300 text-xs leading-relaxed">
                            Make sure the transfer details match exactly. Your top-up will be credited once an admin verifies your receipt.
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => setTopupStep(1)}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700">
                          Back
                        </Button>
                        <Button size="sm" onClick={() => setTopupStep(3)}
                          className="bg-blue-600 hover:bg-blue-700 text-white">
                          I've Transferred — Upload Receipt
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Submit Proof */}
                      <div className="space-y-4 mt-2">
                        <p className="text-slate-300 text-sm leading-relaxed">
                          Upload your transfer receipt so our team can verify and credit your balance.
                        </p>
                        <div className="space-y-1.5">
                          <Label className="text-slate-300 text-sm font-medium">Receipt / Screenshot <span className="text-slate-500 font-normal">(required)</span></Label>
                          <label className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed border-slate-600 hover:border-blue-500/60 bg-slate-800/30 cursor-pointer transition-colors">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) => setTopupProofFile(e.target.files?.[0] ?? null)}
                            />
                            {topupProofFile ? (
                              <span className="text-emerald-400 text-sm font-medium flex items-center gap-1.5">
                                <CheckCircle className="h-4 w-4" />
                                {topupProofFile.name}
                              </span>
                            ) : (
                              <>
                                <ArrowDownToLine className="h-6 w-6 text-slate-500" />
                                <span className="text-slate-400 text-xs text-center">Click to select image or PDF receipt</span>
                              </>
                            )}
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-slate-300 text-sm font-medium">Reference / Trace Number <span className="text-slate-500 font-normal">(optional)</span></Label>
                          <Input
                            placeholder="e.g. 123456789"
                            value={topupRefNumber}
                            onChange={(e) => setTopupRefNumber(e.target.value)}
                            className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => setTopupStep(2)}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                          disabled={topupSubmitting}>
                          Back
                        </Button>
                        <Button
                          size="sm"
                          disabled={topupSubmitting || !topupProofFile}
                          onClick={async () => {
                            if (!topupProofFile) {
                              toast.error('Please upload your transfer receipt');
                              return;
                            }
                            setTopupSubmitting(true);
                            try {
                              const form = new FormData();
                              form.append('amount_php', topupAmount);
                              form.append('channel', topupToBank);
                              form.append('account_number',
                                TOPUP_BANKS.find((b) => b.bank === topupToBank)?.number ?? '');
                              form.append('transfer_method', topupTransferMethod);
                              if (topupRefNumber) form.append('ref_number', topupRefNumber);
                              form.append('receipt', topupProofFile);
                              const res = await fetch('/api/v1/bank-deposits', {
                                method: 'POST',
                                credentials: 'include',
                                body: form,
                              });
                              if (res.ok) {
                                toast.success('Top-up request submitted! We\'ll credit your balance after verification.');
                                setTopupDialogOpen(false);
                                setTopupStep(0);
                                setTopupAmount('');
                                setTopupToBank('GoTyme Digital Bank');
                                setTopupTransferMethod('');
                                setTopupRefNumber('');
                                setTopupProofFile(null);
                              } else {
                                const err = await getResponseError(res, 'Failed to submit top-up request');
                                toast.error(err);
                              }
                            } catch (e: any) {
                              toast.error(e.message || 'Failed to submit top-up request');
                            } finally {
                              setTopupSubmitting(false);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {topupSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Submitting…</> : 'Submit Request'}
                        </Button>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>

              {/* Send USD Tab */}
              <TabsContent value="send-usd" className="p-4 sm:p-6 mt-0 space-y-5">
                {/* USD balance reminder */}
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 text-sm font-medium">USD Wallet Balance</span>
                  </div>
                  <span className="text-white font-bold text-sm">${usdBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-slate-300 text-sm">Recipient Telegram Username</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                      <Input
                        placeholder="username"
                        value={sendUsdUsername}
                        onChange={e => setSendUsdUsername(e.target.value.replace(/^@/, ''))}
                        className="pl-7 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <p className="text-slate-500 text-xs mt-1">Enter the Telegram username of the recipient (without @)</p>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Amount (USD)</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={sendUsdAmount}
                      onChange={e => setSendUsdAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Note (optional)</Label>
                    <Input
                      placeholder="Payment for..."
                      value={sendUsdNote}
                      onChange={e => setSendUsdNote(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
                  Funds are transferred instantly from your USD wallet to the recipient's USD wallet. The recipient must be a registered user.
                </div>

                <Button
                  onClick={handleSendUsd}
                  disabled={sendUsdLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {sendUsdLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                    : <><Send className="h-4 w-4 mr-2" />Send USD</>}
                </Button>
              </TabsContent>

              {/* Send USDT Tab */}
              <TabsContent value="send-usdt" className="p-4 sm:p-6 mt-0 space-y-5">
                {/* USD balance reminder */}
                <div className="flex items-center justify-between bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bitcoin className="h-4 w-4 text-teal-400 shrink-0" />
                    <span className="text-teal-300 text-sm font-medium">USD Wallet Balance</span>
                  </div>
                  <span className="text-white font-bold text-sm">${usdBal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</span>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-amber-300/90 text-xs leading-relaxed space-y-1">
                    <p className="font-semibold">Requires Super Admin Approval</p>
                    <p>Your send request will be reviewed before funds are transferred. Ensure the TRC-20 address is correct — crypto transfers are irreversible.</p>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-slate-300 text-sm">Recipient TRC-20 Address</Label>
                    <Input
                      placeholder="e.g. TGGtSorAyDSUxVXxk5jmK4jM2xFUv9Bbfx"
                      value={sendUsdtAddress}
                      onChange={e => setSendUsdtAddress(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-300 text-sm">Amount (USDT)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={sendUsdtAmount}
                        onChange={e => setSendUsdtAmount(e.target.value)}
                        min="0.01"
                        step="0.01"
                        className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300 text-sm">Network</Label>
                      <Input
                        value="TRC20 (TRON)"
                        readOnly
                        className="mt-1 bg-slate-800/40 border-slate-600/40 text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm">Note (optional)</Label>
                    <Input
                      placeholder="Purpose of transfer"
                      value={sendUsdtNote}
                      onChange={e => setSendUsdtNote(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSendUsdt}
                  disabled={sendUsdtLoading}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {sendUsdtLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                    : <><Send className="h-4 w-4 mr-2" />Submit Send Request</>}
                </Button>

                {/* Send Request History */}
                {sendUsdtRequests.length > 0 && (
                  <div>
                    <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Your Send Requests</p>
                    <div className="space-y-2">
                      {sendUsdtRequests.slice(0, 5).map(req => (
                        <div key={req.id} className={`rounded-xl border overflow-hidden ${
                          req.status === 'denied' ? 'border-red-500/25' : 'border-slate-700/30'
                        }`}>
                          <div className="flex items-center justify-between bg-slate-800/40 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white text-sm font-medium">${req.amount.toFixed(2)} USDT</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                  req.status === 'approved'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : req.status === 'denied'
                                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                }`}>
                                  {req.status}
                                </span>
                              </div>
                              <p className="text-slate-500 text-[10px] font-mono truncate mt-0.5 max-w-[200px]">
                                → {req.to_address}
                              </p>
                            </div>
                            <div className="shrink-0 ml-2">
                              {req.status === 'pending'
                                ? <Clock className="h-4 w-4 text-amber-400" />
                                : req.status === 'approved'
                                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                                : <XCircle className="h-4 w-4 text-red-400" />}
                            </div>
                          </div>
                          {req.status === 'denied' && req.denial_reason && (
                            <div className="flex items-start gap-2 bg-red-500/10 px-3 py-2 border-t border-red-500/20">
                              <ShieldAlert className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-red-400 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Denial Reason</p>
                                <p className="text-red-300/80 text-xs">{req.denial_reason}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
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
                  const isCrypto = txn.transaction_type === 'crypto_topup' || txn.transaction_type === 'usdt_send';
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
