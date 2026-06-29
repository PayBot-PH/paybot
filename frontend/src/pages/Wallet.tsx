import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import {
  Wallet, DollarSign, ArrowUpFromLine, ArrowDownToLine, Send, Bitcoin,
  Loader2, ChevronRight, Clock, CheckCircle, XCircle, Building2, Landmark,
  CreditCard, Receipt, AlertCircle, ArrowRight, Globe, Wallet2, Landmark2
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
interface WalletBalance {
  balance: number;
  currency: string;
  updated_at?: string;
}

interface WalletTxn {
  id: number;
  type: 'deposit' | 'withdraw' | 'receive' | 'sent' | 'crypto_topup' | 'usdt_send' | 'disbursement' | 'refund';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  description?: string;
  created_at: string;
  reference?: string;
}

interface BankOption {
  code: string;
  name: string;
}

interface WithdrawRequest {
  id: number;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  rejection_reason?: string;
  request_type: 'php_bank' | 'usdt_trc20';
  usdt_address?: string;
  usdt_platform?: string;
}

// ─── Constants ───────────────────────────────────────────────────────
const BANKS: string[] = [
  'BDO', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'PNB',
  'Chinabank', 'RCBC', 'Security Bank', 'EastWest', 'GCash', 'Maya'
];

const USDT_PLATFORMS: { code: string; name: string }[] = [
  { code: 'binance', name: 'Binance' },
  { code: 'trust_wallet', name: 'Trust Wallet' },
  { code: 'metamask', name: 'MetaMask' },
  { code: 'okx', name: 'OKX' },
  { code: 'bybit', name: 'Bybit' },
  { code: 'kucoin', name: 'KuCoin' },
  { code: 'gate_io', name: 'Gate.io' },
  { code: 'tronlink', name: 'TronLink' },
  { code: 'other', name: 'Other / Custom' },
];

const DEPOSIT_DESTINATIONS = [
  { value: 'Security Bank Corporation', label: 'Security Bank', account_number: '0000068888173', account_name: 'Xendit Philippines Inc' },
  { value: 'Asia United Bank', label: 'Asia United Bank', account_number: '934105321485', account_name: 'Xendit Philippines Inc' },
];

const DEPOSIT_CHANNELS = DEPOSIT_DESTINATIONS.map(dest => ({ value: dest.value, label: dest.label }));

const TOPUP_METHODS = [
  { value: 'same_bank', label: 'Same-bank transfer' },
  { value: 'interbank', label: 'Interbank transfer' },
  { value: 'cash_deposit', label: 'Cash deposit' },
  { value: 'check_deposit', label: 'Check deposit' },
  { value: 'international', label: 'International transfer' },
];

const FUND_WALLET_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer', description: 'Transfer funds directly from a Philippine bank into the Xendit account.' },
  { value: 'ubp_bills_payment', label: 'UBP Bills Payment', description: 'Use UnionBank Bills Payment and enter your Xendit payment code to top up.' },
];

const FUND_WALLET_STEP_TITLES = ['Choose method', 'Top up details', 'Confirm top up', 'Submit proof'];

const txnMeta: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string }> = {
  deposit:       { label: 'Deposit', color: 'text-emerald-600', icon: <ArrowDownToLine className="h-4 w-4" />, sign: '+' },
  withdraw:      { label: 'Withdrawal', color: 'text-amber-600', icon: <ArrowUpFromLine className="h-4 w-4" />, sign: '-' },
  receive:       { label: 'Received', color: 'text-emerald-600', icon: <ArrowDownToLine className="h-4 w-4" />, sign: '+' },
  sent:          { label: 'Sent', color: 'text-red-600', icon: <Send className="h-4 w-4" />, sign: '-' },
  crypto_topup:  { label: 'Crypto Top Up', color: 'text-teal-600', icon: <Bitcoin className="h-4 w-4" />, sign: '+' },
  usdt_send:     { label: 'USDT Withdrawal', color: 'text-red-600', icon: <Send className="h-4 w-4" />, sign: '-' },
  disbursement:  { label: 'Disbursement', color: 'text-red-600', icon: <Send className="h-4 w-4" />, sign: '-' },
  refund:        { label: 'Refund', color: 'text-emerald-600', icon: <Receipt className="h-4 w-4" />, sign: '+' },
};

const statusMeta: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50', icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: 'Approved', color: 'text-blue-600', bg: 'bg-blue-50', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  processing:{ label: 'Processing', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  completed: { label: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected:  { label: 'Rejected', color: 'text-red-600', bg: 'bg-red-50', icon: <XCircle className="h-3.5 w-3.5" /> },
  failed:    { label: 'Failed', color: 'text-red-600', bg: 'bg-red-50', icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'Cancelled', color: 'text-slate-500', bg: 'bg-slate-50', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Component ───────────────────────────────────────────────────────
export default function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const [phpBalance, setPhpBalance] = useState<WalletBalance | null>(null);
  const [usdBalance, setUsdBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankOptions, setBankOptions] = useState<BankOption[]>([]);
  const [usdtPhpRate, setUsdtPhpRate] = useState<number | null>(null);

  // PHP Deposit Request form state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositChannel, setDepositChannel] = useState('Security Bank Corporation');
  const [depositMethod, setDepositMethod] = useState('same_bank');
  const [depositRefNumber, setDepositRefNumber] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [depositReceipt, setDepositReceipt] = useState<File | null>(null);
  const [depositDate, setDepositDate] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [fundMethod, setFundMethod] = useState<'bank_transfer' | 'ubp_bills_payment'>('bank_transfer');
  const [fundWizardStep, setFundWizardStep] = useState(1);

  // PHP Bank Withdraw Request form state
  const [wrAmount, setWrAmount] = useState('');
  const [wrBank, setWrBank] = useState('');
  const [wrAccount, setWrAccount] = useState('');
  const [wrName, setWrName] = useState('');
  const [wrNote, setWrNote] = useState('');
  const [wrLoading, setWrLoading] = useState(false);

  // USDT Withdraw Request form state
  const [usdtAmount, setUsdtAmount] = useState('');
  const [usdtAddress, setUsdtAddress] = useState('');
  const [usdtPlatform, setUsdtPlatform] = useState('');
  const [usdtLoading, setUsdtLoading] = useState(false);

  // USDT Top-up request form state
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [phpRes, usdRes, txnRes, banksRes, wrRes, rateRes] = await Promise.allSettled([
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=PHP', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=USD', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/transactions?limit=20', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/gateway/banks', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/withdraw-requests', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/topup/rate', method: 'GET', data: {} }),
      ]);

      if (phpRes.status === 'fulfilled' && phpRes.value?.data?.balance != null) {
        setPhpBalance({ balance: phpRes.value.data.balance, currency: 'PHP' });
      }
      if (usdRes.status === 'fulfilled' && usdRes.value?.data?.balance != null) {
        setUsdBalance({ balance: usdRes.value.data.balance, currency: 'USD' });
      }
      if (txnRes.status === 'fulfilled' && txnRes.value?.data?.items) {
        setTransactions(txnRes.value.data.items);
      }
      if (banksRes.status === 'fulfilled' && banksRes.value?.data?.banks) {
        setBankOptions(banksRes.value.data.banks);
      }
      if (wrRes.status === 'fulfilled' && wrRes.value?.data?.requests) {
        setWithdrawRequests(wrRes.value.data.requests);
      }
      if (rateRes.status === 'fulfilled' && rateRes.value?.data?.usdt_php_rate != null) {
        setUsdtPhpRate(rateRes.value.data.usdt_php_rate);
      }
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, fetchData]);

  const handlePhpDepositRequest = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid deposit amount'); return; }
    if (!depositChannel) { toast.error('Choose a destination bank'); return; }
    if (!depositMethod.trim()) { toast.error('Select a transfer method'); return; }
    if (!depositDate) { toast.error('Select the transfer date'); return; }
    if (!depositRefNumber.trim()) { toast.error('Enter the reference number'); return; }
    if (!depositReceipt) { toast.error('Upload proof of transaction'); return; }

    setDepositLoading(true);
    try {
      const selectedDestination = DEPOSIT_DESTINATIONS.find(d => d.value === depositChannel);
      const accountNumber = selectedDestination?.account_number || depositChannel;
      const formData = new FormData();
      formData.append('amount_php', amount.toString());
      formData.append('channel', depositChannel);
      formData.append('account_number', accountNumber);
      formData.append('transfer_method', depositMethod.trim());
      formData.append('ref_number', depositRefNumber.trim());
      formData.append('receipt', depositReceipt);
      if (depositNotes.trim()) {
        formData.append('note', depositNotes.trim());
      }
      formData.append('transfer_date', depositDate);

      const res = await fetch('/api/v1/bank-deposits', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.id) {
        toast.success('PHP deposit request submitted for review');
        setDepositAmount('');
        setDepositChannel('Security Bank Corporation');
        setDepositMethod('same_bank');
        setDepositRefNumber('');
        setDepositNotes('');
        setDepositReceipt(null);
        setDepositDate('');
        setFundWizardStep(1);
        await fetchData();
      } else {
        toast.error(data.detail || 'Failed to submit deposit request');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setDepositLoading(false); }
  };

  const handleTopupRequest = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid PHP amount'); return; }

    setTopupLoading(true);
    try {
      const res = await fetch('/api/v1/topup/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'PHP', note: topupNote.trim() || undefined }),
      });
      const data = await res.json();
      if (data.id) {
        toast.success('USDT top-up request submitted for admin approval');
        setTopupAmount(''); setTopupNote('');
        await fetchData();
      } else {
        toast.error(data.detail || 'Failed to submit top-up request');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setTopupLoading(false); }
  };

  const handlePhpWithdrawRequest = async () => {
    const amount = parseFloat(wrAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!wrBank) { toast.error('Select a bank'); return; }
    if (!wrAccount.trim()) { toast.error('Enter account number'); return; }
    if (!wrName.trim()) { toast.error('Enter account holder name'); return; }
    if (phpBalance && amount > phpBalance.balance) { toast.error('Insufficient balance'); return; }

    setWrLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: 'php_bank',
          amount,
          bank_name: wrBank,
          account_number: wrAccount.trim(),
          account_name: wrName.trim(),
          note: wrNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('PHP withdrawal request submitted for admin approval');
        setWrAmount(''); setWrBank(''); setWrAccount(''); setWrName(''); setWrNote('');
        await fetchData();
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setWrLoading(false); }
  };

  const handleUsdtWithdrawRequest = async () => {
    const amount = parseFloat(usdtAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid USDT amount'); return; }
    if (!usdtAddress.trim()) { toast.error('Enter your USDT address'); return; }
    if (!usdtPlatform) { toast.error('Select which platform your address belongs to'); return; }
    if (usdBalance && amount > usdBalance.balance) { toast.error('Insufficient USDT balance'); return; }

    setUsdtLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: 'usdt_trc20',
          amount,
          usdt_address: usdtAddress.trim(),
          usdt_platform: usdtPlatform,
          network: 'TRC20',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('USDT withdrawal request submitted for admin approval');
        setUsdtAmount(''); setUsdtAddress(''); setUsdtPlatform('');
        await fetchData();
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally { setUsdtLoading(false); }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Please log in to view your wallet.</p>
      </div>
    );
  }

  const bankList = bankOptions.length > 0 ? bankOptions : BANKS.map(b => ({ code: b, name: b }));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-slate-500" />
            Wallet
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your PHP and USDT balances, fund your wallet with PHP deposits or USDT top-ups, request withdrawals, and view transaction history.
          </p>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* PHP Balance */}
          <Card className="bg-white border border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">PHP Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? (
                  <span className="inline-block w-28 h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : `₱${fmt(phpBalance?.balance || 0)}`}
              </p>
              <p className="text-xs text-slate-500 mt-1">Philippine Peso</p>
            </CardContent>
          </Card>

          {/* USD Balance */}
          <Card className="bg-white border border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">USDT Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? (
                  <span className="inline-block w-28 h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : `$${fmtUsd(usdBalance?.balance || 0)}`}
              </p>
              <p className="text-xs text-slate-500 mt-1">USDT · TRC-20 Network</p>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-white border border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Requests</span>
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? (
                  <span className="inline-block w-12 h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : withdrawRequests.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Awaiting admin approval</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="fund" className="space-y-6">
          <TabsList className="flex flex-wrap items-center justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <TabsTrigger value="fund" className="flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium sm:flex-none sm:text-xs data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
              Fund Wallet
            </TabsTrigger>
            <TabsTrigger value="php" className="flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium sm:flex-none sm:text-xs data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              <Landmark className="mr-1.5 h-3.5 w-3.5" />
              PHP Withdraw
            </TabsTrigger>
            <TabsTrigger value="usdt" className="flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium sm:flex-none sm:text-xs data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              <Globe className="mr-1.5 h-3.5 w-3.5" />
              USDT Withdraw
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium sm:flex-none sm:text-xs data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              <Receipt className="mr-1.5 h-3.5 w-3.5" />
              History
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 justify-center whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-medium sm:flex-none sm:text-xs data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              My Requests
            </TabsTrigger>
          </TabsList>

          {/* ─── FUND WALLET TAB ─── */}
          <TabsContent value="fund" className="mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <Card className="bg-white border border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900">Fund Wallet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Top up your wallet</h2>
                      <p className="text-xs text-slate-600 mt-1">Select a route and submit deposit details.</p>
                    </div>
                    <p className="text-[10px] text-slate-500 max-w-xl">
                      Admin review happens after submission.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {FUND_WALLET_METHODS.map(method => (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setFundMethod(method.value as 'bank_transfer' | 'ubp_bills_payment')}
                        className={`rounded-2xl border p-2.5 text-left transition ${fundMethod === method.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{method.label}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${fundMethod === method.value ? 'bg-blue-600' : 'bg-slate-300'}`} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">{method.description}</p>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{fundMethod === 'bank_transfer' ? 'Bank Transfer Instructions' : 'UBP Bills Payment Instructions'}</p>
                    <div className="mt-2 text-xs text-slate-700 space-y-1">
                      {fundMethod === 'bank_transfer' ? (
                        <>
                          <p>1. Log in to your bank app or portal.</p>
                          <p>2. Transfer to one of Xendit&apos;s bank accounts below.</p>
                          <p>3. Use the selected destination and method when you submit proof.</p>
                        </>
                      ) : (
                        <>
                          <p>1. Log in to your UnionBank (UBP) account.</p>
                          <p>2. Go to Pay Bills (UBP Online) or Bills Payment (UBP The Portal).</p>
                          <p>3. Click Select Biller and go to the Biller List section.</p>
                          <p>4. Select biller name “XENDIT BALANCE TOP-UP”.</p>
                          <p>5. Enter your payment code: <span className="font-medium">uso1h0</span>.</p>
                          <p>6. Enter the amount you want to top-up.</p>
                          <p>7. Choose when to process the top-up and click Pay to continue.</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {FUND_WALLET_STEP_TITLES.map((title, index) => {
                          const step = index + 1;
                          const active = step === fundWizardStep;
                          return (
                            <div key={title} className={`rounded-2xl border px-3 py-2 text-[11px] font-semibold ${active ? 'border-blue-600 bg-blue-50 text-slate-900' : 'border-slate-200 bg-white text-slate-500'}`}>
                              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Step {step}</p>
                              <p className="mt-1 leading-tight">{title}</p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        {fundWizardStep === 1 && (
                          <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-900">Choose how to top up</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {FUND_WALLET_METHODS.map(method => (
                                <button
                                  key={method.value}
                                  type="button"
                                  onClick={() => setFundMethod(method.value as 'bank_transfer' | 'ubp_bills_payment')}
                                  className={`rounded-2xl border p-4 text-left transition ${fundMethod === method.value ? 'border-blue-600 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{method.label}</span>
                                    <span className={`h-2.5 w-2.5 rounded-full ${fundMethod === method.value ? 'bg-blue-600' : 'bg-slate-300'}`} />
                                  </div>
                                  <p className="text-xs text-slate-500 mt-2">{method.description}</p>
                                </button>
                              ))}
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Instructions</p>
                              <div className="mt-3 space-y-1 text-sm text-slate-700">
                                {fundMethod === 'bank_transfer' ? (
                                  <>
                                    <p>1. Log in to your bank app or portal.</p>
                                    <p>2. Transfer to one of Xendit&apos;s bank accounts below.</p>
                                    <p>3. Use the selected destination and method when you submit proof.</p>
                                  </>
                                ) : (
                                  <>
                                    <p>1. Log in to your UnionBank online banking.</p>
                                    <p>2. Choose Bills Payment and select Xendit Balance Top-up.</p>
                                    <p>3. Enter the amount and your payment code, then pay.</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {fundWizardStep === 2 && (
                          <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-900">Top up details</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label className="text-[10px] font-medium text-slate-700">Top Up Amount (₱)</Label>
                                <Input
                                  type="number"
                                  placeholder="1000"
                                  value={depositAmount}
                                  onChange={e => setDepositAmount(e.target.value)}
                                  min="1000"
                                  step="0.01"
                                  className="mt-1 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] font-medium text-slate-700">Top Up To</Label>
                                <Select value={depositChannel} onValueChange={setDepositChannel}>
                                  <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-900">
                                    <SelectValue placeholder="Select destination" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white border-slate-200">
                                    {DEPOSIT_DESTINATIONS.map(dest => (
                                      <SelectItem key={dest.value} value={dest.value} className="text-slate-900">
                                        {dest.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div>
                              <Label className="text-[10px] font-medium text-slate-700">Top Up Method</Label>
                              <Select value={depositMethod} onValueChange={setDepositMethod}>
                                <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-900">
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200">
                                  {TOPUP_METHODS.map(method => (
                                    <SelectItem key={method.value} value={method.value} className="text-slate-900">
                                      {method.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        {fundWizardStep === 3 && (
                          <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-900">Confirm top up</p>
                            <div className="grid grid-cols-1 gap-4 text-sm text-slate-700">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Destination</p>
                                    <p className="mt-2 text-slate-900 font-semibold">{DEPOSIT_DESTINATIONS.find(d => d.value === depositChannel)?.label || depositChannel}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Top Up Method</p>
                                    <p className="mt-2 text-slate-900 font-semibold">{TOPUP_METHODS.find(m => m.value === depositMethod)?.label || depositMethod}</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Account Number</p>
                                    <p className="mt-2 text-slate-900 font-semibold">{DEPOSIT_DESTINATIONS.find(d => d.value === depositChannel)?.account_number || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Account Name</p>
                                    <p className="mt-2 text-slate-900 font-semibold">{DEPOSIT_DESTINATIONS.find(d => d.value === depositChannel)?.account_name || 'Xendit Philippines Inc'}</p>
                                  </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Amount</p>
                                    <p className="mt-2 text-slate-900 font-semibold">₱{depositAmount || '0.00'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reference</p>
                                    <p className="mt-2 text-slate-900 font-semibold">{depositRefNumber || 'Not set'}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {fundWizardStep === 4 && (
                          <div className="space-y-4">
                            <p className="text-sm font-semibold text-slate-900">Submit proof</p>
                            <div className="space-y-4">
                              <div>
                                <Label className="text-[10px] font-medium text-slate-700">Proof of transaction</Label>
                                <input
                                  type="file"
                                  accept="image/*,.pdf"
                                  onChange={e => setDepositReceipt(e.target.files?.[0] || null)}
                                  className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                                <p className="text-xs text-slate-500 mt-2">Upload screenshot or receipt from your transfer.</p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-[10px] font-medium text-slate-700">Transfer Date</Label>
                                  <Input
                                    type="date"
                                    value={depositDate}
                                    onChange={e => setDepositDate(e.target.value)}
                                    className="mt-1 bg-white border-slate-200 text-slate-900"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] font-medium text-slate-700">Reference Number</Label>
                                  <Input
                                    placeholder="TRF-12345"
                                    value={depositRefNumber}
                                    onChange={e => setDepositRefNumber(e.target.value)}
                                    className="mt-1 bg-white border-slate-200 text-slate-900"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-[10px] font-medium text-slate-700">Notes</Label>
                                <Input
                                  placeholder="Optional notes for admin"
                                  value={depositNotes}
                                  onChange={e => setDepositNotes(e.target.value)}
                                  className="mt-1 bg-white border-slate-200 text-slate-900"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        {fundWizardStep > 1 && (
                          <Button
                            variant="outline"
                            onClick={() => setFundWizardStep(prev => Math.max(1, prev - 1))}
                            className="h-10 rounded-lg"
                          >
                            Back
                          </Button>
                        )}
                        {fundWizardStep < 4 ? (
                          <Button
                            onClick={() => setFundWizardStep(prev => Math.min(4, prev + 1))}
                            className="h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                          >
                            Continue
                          </Button>
                        ) : (
                          <Button
                            onClick={handlePhpDepositRequest}
                            disabled={depositLoading}
                            className="h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                          >
                            {depositLoading ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submit</>
                            ) : (
                              <>Submit</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

                <Card className="bg-white border border-slate-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-slate-500" />
                      Top Up USDT
                    </CardTitle>
                  </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-medium text-amber-800">USDT → PHP credit</p>
                      <p className="text-[10px] text-amber-700 mt-0.5">Enter the PHP amount you want credited; admin review applies.</p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-slate-700">PHP Amount</Label>
                    <Input
                      type="number"
                      placeholder="5000"
                      value={topupAmount}
                      onChange={e => setTopupAmount(e.target.value)}
                      min="100"
                      step="0.01"
                      className="mt-1 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    />
                    {usdtPhpRate ? (
                      <p className="text-[10px] text-slate-500 mt-1">Rate: ₱{usdtPhpRate.toFixed(2)} / USDT</p>
                    ) : (
                      <p className="text-[10px] text-slate-500 mt-1">Rate loads automatically.</p>
                    )}
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-slate-700">Note (optional)</Label>
                    <Input
                      placeholder="Reference for admin"
                      value={topupNote}
                      onChange={e => setTopupNote(e.target.value)}
                      className="mt-1 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    />
                  </div>

                  <Button
                    onClick={handleTopupRequest}
                    disabled={topupLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white h-8 rounded-lg font-medium"
                  >
                    {topupLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submit...</>
                    ) : (
                      <><Bitcoin className="h-4 w-4 mr-2" />Submit USDT</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── PHP WITHDRAW TAB ─── */}
          <TabsContent value="php" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* PHP Withdraw Form */}
              <Card className="lg:col-span-2 bg-white border border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    Request PHP Withdrawal to Bank
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">Admin Approval Required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Your withdrawal request will be sent to the Super Admin for review and approval. 
                        Processing typically takes 1-2 business days.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Amount (₱)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={wrAmount}
                        onChange={e => setWrAmount(e.target.value)}
                        min="1"
                        step="0.01"
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      />
                      {phpBalance && (
                        <p className="text-xs text-slate-500 mt-1">
                          Available: ₱{fmt(phpBalance.balance)}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Bank</Label>
                      <Select value={wrBank} onValueChange={setWrBank}>
                        <SelectTrigger className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900">
                          <SelectValue placeholder="Select bank…" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200">
                          {bankList.map(b => (
                            <SelectItem key={b.code} value={b.code} className="text-slate-900">
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Account Number</Label>
                      <Input
                        placeholder="1234567890"
                        value={wrAccount}
                        onChange={e => setWrAccount(e.target.value)}
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Account Holder Name</Label>
                      <Input
                        placeholder="Juan Dela Cruz"
                        value={wrName}
                        onChange={e => setWrName(e.target.value)}
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium text-slate-700">Note (optional)</Label>
                      <Input
                        placeholder="Additional instructions for admin..."
                        value={wrNote}
                        onChange={e => setWrNote(e.target.value)}
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handlePhpWithdrawRequest}
                    disabled={wrLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white h-10 rounded-lg font-medium"
                  >
                    {wrLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting Request...</>
                    ) : (
                      <><ArrowUpFromLine className="h-4 w-4 mr-2" />Submit PHP Withdrawal Request</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Supported Banks */}
              <Card className="bg-white border border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-slate-500" />
                    Supported Banks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {BANKS.slice(0, 8).map(bank => (
                      <div key={bank} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {bank}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                    Including GCash and Maya e-wallets
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── USDT WITHDRAW TAB ─── */}
          <TabsContent value="usdt" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* USDT Withdraw Form */}
              <Card className="lg:col-span-2 bg-white border border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-slate-500" />
                    Request USDT Withdrawal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">Admin Approval Required · TRC-20 Only</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Your USDT withdrawal request will be sent to the Super Admin for review. 
                        Ensure your address supports TRC-20 network. Processing typically takes 1-2 business days.
                      </p>
                    </div>
                  </div>

                  {/* Network Badge */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-800">Network: TRC-20 (Tron)</span>
                    <span className="text-xs text-emerald-600 ml-auto">Fixed</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Amount (USDT)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={usdtAmount}
                        onChange={e => setUsdtAmount(e.target.value)}
                        min="1"
                        step="0.01"
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      />
                      {usdBalance && (
                        <p className="text-xs text-slate-500 mt-1">
                          Available: ${fmtUsd(usdBalance.balance)} USDT
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Platform / Wallet</Label>
                      <Select value={usdtPlatform} onValueChange={setUsdtPlatform}>
                        <SelectTrigger className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900">
                          <SelectValue placeholder="Select your platform…" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200">
                          {USDT_PLATFORMS.map(p => (
                            <SelectItem key={p.code} value={p.code} className="text-slate-900">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium text-slate-700">USDT Address (TRC-20)</Label>
                      <Input
                        placeholder="TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                        value={usdtAddress}
                        onChange={e => setUsdtAddress(e.target.value)}
                        className="mt-1.5 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 font-mono text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Must start with "T" and be 34 characters long. Double-check before submitting.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleUsdtWithdrawRequest}
                    disabled={usdtLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white h-10 rounded-lg font-medium"
                  >
                    {usdtLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting Request...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" />Submit USDT Withdrawal Request</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Supported Platforms Info */}
              <Card className="bg-white border border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Wallet2 className="h-4 w-4 text-slate-500" />
                    Supported Platforms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {USDT_PLATFORMS.map(p => (
                      <div key={p.code} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        {p.name}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Network:</span> TRC-20 only
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-medium text-slate-700">Min amount:</span> 10 USDT
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-medium text-slate-700">Fee:</span> 1 USDT network fee
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── HISTORY TAB ─── */}
          <TabsContent value="history" className="mt-0">
            <Card className="bg-white border border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-slate-500" />
                  Transaction History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 animate-pulse">
                        <div className="h-9 w-9 rounded-lg bg-slate-200 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-200 rounded w-1/3" />
                          <div className="h-2.5 bg-slate-200 rounded w-1/4" />
                        </div>
                        <div className="h-4 w-20 bg-slate-200 rounded" />
                      </div>
                    ))}
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-900">No transactions yet</p>
                    <p className="text-xs text-slate-500 mt-1">Your transaction history will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {transactions.map(txn => {
                      const meta = txnMeta[txn.type] || txnMeta.deposit;
                      const st = statusMeta[txn.status] || statusMeta.pending;
                      return (
                        <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center ${meta.color}`}>
                              {meta.icon}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                              <p className="text-xs text-slate-500">
                                {txn.description || txn.reference || `#${txn.id}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${meta.color}`}>
                              {meta.sign}{txn.currency === 'USD' ? '$' : '₱'}{fmt(Math.abs(txn.amount))}
                            </p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.bg} ${st.color} ${st.bg.replace('bg-', 'border-').replace('50', '200')}`}>
                              {st.icon}
                              {st.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── MY REQUESTS TAB ─── */}
          <TabsContent value="requests" className="mt-0">
            <Card className="bg-white border border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  My Withdrawal Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 animate-pulse">
                        <div className="h-9 w-9 rounded-lg bg-slate-200 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-200 rounded w-1/3" />
                          <div className="h-2.5 bg-slate-200 rounded w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : withdrawRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-900">No withdrawal requests</p>
                    <p className="text-xs text-slate-500 mt-1">Submit a request from the PHP or USDT tab</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {withdrawRequests.map(req => {
                      const st = statusMeta[req.status] || statusMeta.pending;
                      const isUsdt = req.request_type === 'usdt_trc20';
                      return (
                        <div key={req.id} className="p-4 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${st.bg} ${st.color}`}>
                                {st.icon}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {isUsdt ? `$${fmtUsd(req.amount)} USDT` : `₱${fmt(req.amount)}`}
                                  </p>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.bg} ${st.color} ${st.bg.replace('bg-', 'border-').replace('50', '200')}`}>
                                    {st.label}
                                  </span>
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                    {isUsdt ? 'USDT · TRC-20' : 'PHP · Bank'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {isUsdt ? (
                                    <>
                                      {req.usdt_platform && `${USDT_PLATFORMS.find(p => p.code === req.usdt_platform)?.name || req.usdt_platform} · `}
                                      {req.usdt_address}
                                    </>
                                  ) : (
                                    <>
                                      {req.bank_name} · {req.account_number} · {req.account_name}
                                    </>
                                  )}
                                </p>
                                {req.note && (
                                  <p className="text-xs text-slate-500 mt-1 italic">
                                    Note: {req.note}
                                  </p>
                                )}
                                {req.rejection_reason && (
                                  <p className="text-xs text-red-600 mt-1">
                                    Reason: {req.rejection_reason}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">
                                {new Date(req.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              {req.processed_at && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Processed: {new Date(req.processed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
