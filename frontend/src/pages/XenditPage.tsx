import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, QrCode, LinkIcon, Wallet, CreditCard, Building2,
  Smartphone, RefreshCw, Calculator, Loader2, CheckCircle, Copy,
  ExternalLink, ArrowUpRight, DollarSign, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

/* ────────────────────────────── types ─────────────────────────── */
interface FeeResult {
  amount: number;
  method: string;
  fee: number;
  net_amount: number;
  fee_percentage: number;
  fee_fixed: number;
}

interface Bank {
  code: string;
  name: string;
}

/* ────────────────────────────── helpers ────────────────────────── */
const PHP = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

const EWALLET_PROVIDERS = [
  { value: 'PH_GCASH', label: 'GCash' },
  { value: 'PH_PAYMAYA', label: 'Maya (PayMaya)' },
  { value: 'PH_GRABPAY', label: 'GrabPay' },
  { value: 'PH_SHOPEEPAY', label: 'ShopeePay' },
];

const DEFAULT_BANKS = [
  { code: 'BDO', name: 'BDO Unibank' },
  { code: 'BPI', name: 'Bank of the Philippine Islands' },
  { code: 'METROBANK', name: 'Metropolitan Bank & Trust' },
  { code: 'PNB', name: 'Philippine National Bank' },
  { code: 'LANDBANK', name: 'Land Bank of the Philippines' },
  { code: 'RCBC', name: 'Rizal Commercial Banking Corp.' },
  { code: 'CHINABANK', name: 'China Banking Corporation' },
  { code: 'UNIONBANK', name: 'UnionBank of the Philippines' },
  { code: 'SECURITYBANK', name: 'Security Bank Corporation' },
];

const FEE_METHODS = [
  { value: 'invoice', label: 'Invoice (2.8%)' },
  { value: 'qr_code', label: 'QR Code (0.7%)' },
  { value: 'ewallet', label: 'E-Wallet (2.0%)' },
  { value: 'virtual_account', label: 'Virtual Account (₱25 fixed)' },
  { value: 'card', label: 'Credit / Debit Card (3.5%)' },
  { value: 'disbursement', label: 'Disbursement (₱25 fixed)' },
  { value: 'retail', label: 'Retail (₱20 fixed)' },
];

async function apiPost(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
  return data;
}

async function apiGet(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
  return data;
}

/* ═══════════════════════════ MAIN PAGE ═══════════════════════════ */
export default function XenditPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('invoice');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [banks, setBanks] = useState<Bank[]>(DEFAULT_BANKS);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  // Shared form state
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // VA-specific
  const [bankCode, setBankCode] = useState('BDO');

  // E-wallet-specific
  const [ewalletProvider, setEwalletProvider] = useState('PH_GCASH');
  const [mobileNumber, setMobileNumber] = useState('');

  // Disbursement-specific
  const [disbBankCode, setDisbBankCode] = useState('BDO');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [disbDesc, setDisbDesc] = useState('');

  // Refund-specific
  const [refundTxnId, setRefundTxnId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('REQUESTED_BY_CUSTOMER');

  // Fee calculator
  const [feeAmount, setFeeAmount] = useState('');
  const [feeMethod, setFeeMethod] = useState('invoice');
  const [feeResult, setFeeResult] = useState<FeeResult | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  /* ── fetch balance ─────────────────────────────────────────── */
  const fetchBalance = useCallback(async () => {
    if (!user) return;
    setBalanceLoading(true);
    try {
      const data = await apiGet('/api/v1/xendit/balance');
      setBalance(data.balance ?? 0);
    } catch {
      // Balance may fail if Xendit key is not configured — show nothing
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [user]);

  /* ── fetch banks ───────────────────────────────────────────── */
  const fetchBanks = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiGet('/api/v1/xendit/available-banks');
      if (Array.isArray(data.banks) && data.banks.length > 0) {
        setBanks(data.banks);
      }
    } catch {
      // Keep defaults
    }
  }, [user]);

  useEffect(() => {
    fetchBalance();
    fetchBanks();
  }, [fetchBalance, fetchBanks]);

  /* ── reset result on tab switch ────────────────────────────── */
  useEffect(() => {
    setResult(null);
  }, [tab]);

  /* ── fee calculation ───────────────────────────────────────── */
  const handleCalculateFee = async () => {
    const amt = parseFloat(feeAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setFeeLoading(true);
    try {
      const data = await apiPost('/api/v1/xendit/calculate-fees', { amount: amt, method: feeMethod });
      setFeeResult(data);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to calculate fees');
    } finally {
      setFeeLoading(false);
    }
  };

  /* ── generic payment creation ──────────────────────────────── */
  const handleCreate = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    setResult(null);
    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};

      if (tab === 'invoice') {
        endpoint = '/api/v1/xendit/create-invoice';
        payload = { amount: amt, description, customer_name: customerName, customer_email: customerEmail };
      } else if (tab === 'qr_code') {
        endpoint = '/api/v1/xendit/create-qr-code';
        payload = { amount: amt, description };
      } else if (tab === 'payment_link') {
        endpoint = '/api/v1/xendit/create-payment-link';
        payload = { amount: amt, description, customer_name: customerName, customer_email: customerEmail };
      } else if (tab === 'virtual_account') {
        endpoint = '/api/v1/xendit/create-virtual-account';
        payload = { amount: amt, bank_code: bankCode, name: customerName || 'Customer' };
      } else if (tab === 'ewallet') {
        endpoint = '/api/v1/xendit/create-ewallet-charge';
        payload = { amount: amt, channel_code: ewalletProvider, mobile_number: mobileNumber };
      }

      const data = await apiPost(endpoint, payload);
      if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'Payment created!');
      } else {
        toast.error(data?.message || 'Failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── disbursement ──────────────────────────────────────────── */
  const handleDisburse = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!accountNumber || !accountName) { toast.error('Account number and name are required'); return; }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost('/api/v1/xendit/create-disbursement', {
        amount: amt,
        bank_code: disbBankCode,
        account_number: accountNumber,
        account_name: accountName,
        description: disbDesc,
      });
      if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'Disbursement created!');
      } else {
        toast.error(data?.message || 'Failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── refund ────────────────────────────────────────────────── */
  const handleRefund = async () => {
    const txnId = parseInt(refundTxnId, 10);
    const amt = parseFloat(refundAmount);
    if (!txnId) { toast.error('Enter a valid transaction ID'); return; }
    if (!amt || amt <= 0) { toast.error('Enter a valid refund amount'); return; }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost('/api/v1/xendit/create-refund', {
        transaction_id: txnId,
        amount: amt,
        reason: refundReason,
      });
      if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'Refund created!');
      } else {
        toast.error(data?.message || 'Failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── copy helper ───────────────────────────────────────────── */
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copied!'); };

  /* ── tab config ────────────────────────────────────────────── */
  const tabConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    invoice:         { icon: <FileText className="h-4 w-4" />, label: 'Invoice',        color: 'text-blue-400' },
    qr_code:         { icon: <QrCode className="h-4 w-4" />, label: 'QR Code',          color: 'text-purple-400' },
    payment_link:    { icon: <LinkIcon className="h-4 w-4" />, label: 'Payment Link',   color: 'text-cyan-400' },
    virtual_account: { icon: <Building2 className="h-4 w-4" />, label: 'Virtual Account', color: 'text-amber-400' },
    ewallet:         { icon: <Smartphone className="h-4 w-4" />, label: 'E-Wallet',     color: 'text-green-400' },
    disbursement:    { icon: <Send className="h-4 w-4" />, label: 'Disbursement',       color: 'text-rose-400' },
    refund:          { icon: <RefreshCw className="h-4 w-4" />, label: 'Refund',        color: 'text-orange-400' },
  };

  /* ── shared amount + description fields ────────────────────── */
  const AmountField = () => (
    <div className="space-y-1.5">
      <Label>Amount (PHP)</Label>
      <Input
        type="number"
        min="1"
        step="0.01"
        placeholder="e.g. 500"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="bg-slate-800 border-slate-600"
      />
    </div>
  );

  const DescriptionField = () => (
    <div className="space-y-1.5">
      <Label>Description</Label>
      <Input
        placeholder="Payment description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="bg-slate-800 border-slate-600"
      />
    </div>
  );

  const CustomerFields = () => (
    <>
      <div className="space-y-1.5">
        <Label>Customer Name</Label>
        <Input
          placeholder="Juan Dela Cruz"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="bg-slate-800 border-slate-600"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Customer Email</Label>
        <Input
          type="email"
          placeholder="juan@example.com"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          className="bg-slate-800 border-slate-600"
        />
      </div>
    </>
  );

  /* ── result display ─────────────────────────────────────────── */
  const ResultCard = () => {
    if (!result) return null;
    const url = (result.invoice_url || result.payment_link_url || result.checkout_url) as string | undefined;
    const qr = result.qr_string as string | undefined;
    const acct = result.account_number as string | undefined;

    return (
      <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">Payment Created</span>
        </div>

        {url && (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Payment URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-900 p-2 rounded break-all">{url}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(url)}><Copy className="h-4 w-4" /></Button>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
          </div>
        )}

        {qr && (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">QR String</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-900 p-2 rounded break-all">{qr}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(qr)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {acct && (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Virtual Account Number</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono bg-slate-900 p-2 rounded">{acct}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(acct)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-400 grid grid-cols-2 gap-1">
          {Object.entries(result)
            .filter(([k]) => !['invoice_url', 'payment_link_url', 'checkout_url', 'qr_string', 'account_number'].includes(k))
            .map(([k, v]) => (
              <span key={k}><span className="text-slate-500">{k}:</span> {String(v)}</span>
            ))}
        </div>
      </div>
    );
  };

  /* ══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">PayBot</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Manage all PayBot payment operations from one place
            </p>
          </div>
          <Badge className="bg-blue-600 text-white">PayBot</Badge>
        </div>

        {/* ── Balance + Fee Calculator ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Balance card */}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-400" /> PayBot Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : balance !== null ? (
                <p className="text-2xl font-bold text-white">{PHP(balance)}</p>
              ) : (
                <p className="text-slate-500 text-sm">Not available</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-xs text-slate-400"
                onClick={fetchBalance}
                disabled={balanceLoading}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
            </CardContent>
          </Card>

          {/* Fee calculator */}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-amber-400" /> Fee Calculator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="Amount"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-sm"
                />
                <Select value={feeMethod} onValueChange={setFeeMethod}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-sm w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleCalculateFee} disabled={feeLoading}>
                  {feeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calc'}
                </Button>
              </div>
              {feeResult && (
                <div className="text-xs grid grid-cols-3 gap-2">
                  <div className="bg-slate-900 rounded p-2 text-center">
                    <p className="text-slate-400">Amount</p>
                    <p className="text-white font-medium">{PHP(feeResult.amount)}</p>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded p-2 text-center">
                    <p className="text-slate-400">Fee</p>
                    <p className="text-rose-400 font-medium">{PHP(feeResult.fee)}</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 text-center">
                    <p className="text-slate-400">You receive</p>
                    <p className="text-emerald-400 font-medium">{PHP(feeResult.net_amount)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Payment methods tabs ────────────────────────────── */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-400" />
              Create Payment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 flex-wrap h-auto gap-1 mb-4">
                {Object.entries(tabConfig).map(([key, cfg]) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs"
                  >
                    <span className={cfg.color}>{cfg.icon}</span>
                    <span className="ml-1.5 hidden sm:inline">{cfg.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* ── Invoice ──────────────────────────────────── */}
              <TabsContent value="invoice" className="space-y-3">
                <p className="text-xs text-slate-400">
                  Generate a hosted payment page. Fee: <strong>2.8%</strong>
                </p>
                <AmountField />
                <DescriptionField />
                <CustomerFields />
                <Button onClick={handleCreate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  Create Invoice
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── QR Code ──────────────────────────────────── */}
              <TabsContent value="qr_code" className="space-y-3">
                <p className="text-xs text-slate-400">
                  QR Ph / InstaPay QR code. Fee: <strong>0.7%</strong>
                </p>
                <AmountField />
                <DescriptionField />
                <Button onClick={handleCreate} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}
                  Create QR Code
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── Payment Link ──────────────────────────────── */}
              <TabsContent value="payment_link" className="space-y-3">
                <p className="text-xs text-slate-400">
                  Shareable payment link. Fee: <strong>2.8%</strong>
                </p>
                <AmountField />
                <DescriptionField />
                <CustomerFields />
                <Button onClick={handleCreate} disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                  Create Payment Link
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── Virtual Account ───────────────────────────── */}
              <TabsContent value="virtual_account" className="space-y-3">
                <p className="text-xs text-slate-400">
                  Bank virtual account number. Fee: <strong>₱25 fixed</strong>
                </p>
                <AmountField />
                <div className="space-y-1.5">
                  <Label>Bank</Label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger className="bg-slate-800 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Account Holder Name</Label>
                  <Input
                    placeholder="Full name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <Button onClick={handleCreate} disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                  Create Virtual Account
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── E-Wallet ──────────────────────────────────── */}
              <TabsContent value="ewallet" className="space-y-3">
                <p className="text-xs text-slate-400">
                  GCash, Maya, GrabPay, ShopeePay. Fee: <strong>2.0%</strong>
                </p>
                <AmountField />
                <div className="space-y-1.5">
                  <Label>E-Wallet Provider</Label>
                  <Select value={ewalletProvider} onValueChange={setEwalletProvider}>
                    <SelectTrigger className="bg-slate-800 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EWALLET_PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile Number (optional)</Label>
                  <Input
                    placeholder="+639XXXXXXXXX"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <Button onClick={handleCreate} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Smartphone className="h-4 w-4 mr-2" />}
                  Charge E-Wallet
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── Disbursement ─────────────────────────────── */}
              <TabsContent value="disbursement" className="space-y-3">
                <p className="text-xs text-slate-400">
                  Send money to a bank account. Fee: <strong>₱25 fixed</strong>
                </p>
                <div className="space-y-1.5">
                  <Label>Amount (PHP)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 1000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank</Label>
                  <Select value={disbBankCode} onValueChange={setDisbBankCode}>
                    <SelectTrigger className="bg-slate-800 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Account Number</Label>
                  <Input
                    placeholder="Bank account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Account Holder Name</Label>
                  <Input
                    placeholder="Full name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Purpose of transfer"
                    value={disbDesc}
                    onChange={(e) => setDisbDesc(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <Button onClick={handleDisburse} disabled={loading} className="w-full bg-rose-600 hover:bg-rose-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Money
                </Button>
                <ResultCard />
              </TabsContent>

              {/* ── Refund ───────────────────────────────────── */}
              <TabsContent value="refund" className="space-y-3">
                <p className="text-xs text-slate-400">
                  Refund a previously paid PayBot invoice. Find the transaction ID in the Transactions page.
                </p>
                <div className="space-y-1.5">
                  <Label>Transaction ID</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 42"
                    value={refundTxnId}
                    onChange={(e) => setRefundTxnId(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Refund Amount (PHP)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 500"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Select value={refundReason} onValueChange={setRefundReason}>
                    <SelectTrigger className="bg-slate-800 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REQUESTED_BY_CUSTOMER">Requested by customer</SelectItem>
                      <SelectItem value="FRAUDULENT">Fraudulent transaction</SelectItem>
                      <SelectItem value="DUPLICATE">Duplicate payment</SelectItem>
                      <SelectItem value="OTHERS">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleRefund} disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Process Refund
                </Button>
                <ResultCard />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── Telegram bot commands reference ─────────────────── */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-blue-400" />
              Telegram Bot Commands — PayBot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
              {[
                { cmd: '/invoice', desc: 'Create invoice' },
                { cmd: '/qr', desc: 'QR Ph payment' },
                { cmd: '/link', desc: 'Payment link' },
                { cmd: '/va', desc: 'Virtual account' },
                { cmd: '/ewallet', desc: 'E-wallet charge' },
                { cmd: '/disburse', desc: 'Send money' },
                { cmd: '/refund', desc: 'Refund payment' },
                { cmd: '/status', desc: 'Check status' },
                { cmd: '/balance', desc: 'Wallet balance' },
                { cmd: '/fees', desc: 'Fee calculator' },
                { cmd: '/report', desc: 'Revenue report' },
                { cmd: '/pay', desc: 'Payment menu' },
              ].map(({ cmd, desc }) => (
                <div key={cmd} className="bg-slate-900 rounded p-2">
                  <code className="text-blue-400 font-mono">{cmd}</code>
                  <p className="text-slate-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Fee schedule ─────────────────────────────────────── */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-400" />
              PayBot Fee Schedule (Philippines)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="pb-2 pr-4">Method</th>
                    <th className="pb-2 pr-4">Rate</th>
                    <th className="pb-2">Fixed Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {[
                    { method: 'Invoice', rate: '2.8%', fixed: '—' },
                    { method: 'QR Code (InstaPay)', rate: '0.7%', fixed: '—' },
                    { method: 'E-Wallet (GCash/Maya…)', rate: '2.0%', fixed: '—' },
                    { method: 'Virtual Account', rate: '—', fixed: '₱25' },
                    { method: 'Credit / Debit Card', rate: '3.5%', fixed: '—' },
                    { method: 'Disbursement', rate: '—', fixed: '₱25' },
                    { method: 'Retail (7-Eleven…)', rate: '—', fixed: '₱20' },
                  ].map((row) => (
                    <tr key={row.method} className="text-slate-300">
                      <td className="py-1.5 pr-4">{row.method}</td>
                      <td className="py-1.5 pr-4 text-blue-400">{row.rate}</td>
                      <td className="py-1.5 text-amber-400">{row.fixed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
