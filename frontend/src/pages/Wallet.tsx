import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { walletApi } from '@/api/wallet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import PinAuthDialog from '@/components/PinAuthDialog';
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
  Info,
  Link as LinkIcon,
  Zap,
  ArrowRight,
  History,
  PhilippinePeso,
  QrCode,
  ShieldLock,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmt, fmtUsd } from '@/lib/format';

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
  available_balance: number;
  pending_balance: number;
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

const txnTypeConfig: Record<string, { label: string; color: string; icon: ReactNode; sign: string; bg: string }> = {
  top_up: { label: 'Deposit', color: 'text-emerald-500', icon: <ArrowDownLeft className="h-4 w-4" />, sign: '+', bg: 'bg-emerald-50' },
  send: { label: 'Transfer', color: 'text-rose-500', icon: <Send className="h-4 w-4" />, sign: '-', bg: 'bg-rose-50' },
  withdraw: { label: 'Cash Out', color: 'text-amber-500', icon: <ArrowUpFromLine className="h-4 w-4" />, sign: '-', bg: 'bg-amber-50' },
  receive: { label: 'Received', color: 'text-emerald-500', icon: <ArrowDownToLine className="h-4 w-4" />, sign: '+', bg: 'bg-emerald-50' },
  crypto_topup: { label: 'USDT In', color: 'text-teal-500', icon: <Bitcoin className="h-4 w-4" />, sign: '+', bg: 'bg-teal-50' },
  usdt_send: { label: 'USDT Out', color: 'text-rose-500', icon: <Send className="h-4 w-4" />, sign: '-', bg: 'bg-rose-50' },
  admin_credit: { label: 'Correction', color: 'text-brandblue-500', icon: <Zap className="h-4 w-4" />, sign: '+', bg: 'bg-brandblue-50' },
  admin_debit: { label: 'Correction', color: 'text-rose-500', icon: <Zap className="h-4 w-4" />, sign: '-', bg: 'bg-rose-50' },
};

const TOPUP_BANKS = [
  { bank: 'GoTyme Digital Bank',       name: 'PayBot PH', number: '012116012891'  },
  { bank: 'Security Bank Corporation', name: 'PayBot PH', number: '0000068888173' },
  { bank: 'Asia United Bank',          name: 'PayBot PH', number: '934105321485'  },
];

export default function Wallet() {
  const { user, login } = useAuth();
  const [phpBalance, setPhpBalance] = useState<WalletBalance | null>(null);
  const [usdBalance, setUsdBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('withdraw');
  const [bankOptions, setBankOptions] = useState<{name: string; code: string}[]>([]);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [cryptoDepositInfo, setCryptoDepositInfo] = useState<CryptoDepositInfo | null>(null);
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoTxHash, setCryptoTxHash] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);

  const [sendUsdUsername, setSendUsdUsername] = useState('');
  const [sendUsdAmount, setSendUsdAmount] = useState('');
  const [sendUsdLoading, setSendUsdLoading] = useState(false);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'withdraw' | 'send-usd', data: any } | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!user) return;
    try {
      const [phpRes, usdRes, txnRes] = await Promise.all([
        fetch('/api/v1/wallet/wallet?currency=PHP', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()),
        fetch('/api/v1/wallet/wallet?currency=USD', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()),
        fetch('/api/v1/wallet/transactions', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()),
      ]);
      setPhpBalance(phpRes);
      setUsdBalance(usdRes);
      setTransactions(Array.isArray(txnRes?.items) ? txnRes.items : []);
    } catch (err) {
      console.error(err);
      setTransactions([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchWalletData().finally(() => setLoading(false));

    fetch('/api/v1/gateway/available-banks')
      .then(r => r.json())
      .then(data => {
        setBankOptions(data || []);
        if (data?.[0]) setWithdrawBank(data[0].code);
      })
      .catch(() => {
        const fb = ['BDO', 'BPI', 'GCASH', 'MAYA'].map(b => ({ name: b, code: b }));
        setBankOptions(fb);
        setWithdrawBank('BDO');
      });

    fetch('/api/v1/wallet/crypto-deposit-info')
      .then(r => r.json())
      .then(data => setCryptoDepositInfo(data))
      .catch(() => {});
  }, [user, fetchWalletData]);

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }

    // Prompt for PIN
    setPendingAction({
      type: 'withdraw',
      data: { amount: amt, bank_name: withdrawBank, account_number: withdrawAccount, note: withdrawNote }
    });
    setPinValue('');
    setPinDialogOpen(true);
  };

  const executeWithdraw = async (data: any, pin: string) => {
    setWithdrawLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ ...data, pin }),
      });
      if (res.ok) {
        toast.success('Withdrawal request submitted');
        setWithdrawAmount(''); setWithdrawAccount(''); setWithdrawNote('');
        fetchWalletData();
        setPinDialogOpen(false);
      } else {
        const err = await getResponseError(res, 'Failed');
        toast.error(err);
        if (err.toLowerCase().includes('pin')) setPinValue('');
      }
    } catch { toast.error('Connection error'); }
    finally { setWithdrawLoading(false); }
  };

  const handleSendUsd = async () => {
    const amt = parseFloat(sendUsdAmount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }

    // Prompt for PIN
    setPendingAction({
      type: 'send-usd',
      data: { recipient_username: sendUsdUsername.replace('@',''), amount: amt }
    });
    setPinValue('');
    setPinDialogOpen(true);
  };

  const executeSendUsd = async (data: any, pin: string) => {
    setSendUsdLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/send-usd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ ...data, pin }),
      });
      if (res.ok) {
        toast.success('USD Transferred!');
        setSendUsdUsername(''); setSendUsdAmount('');
        fetchWalletData();
        setPinDialogOpen(false);
      } else {
        const err = await getResponseError(res, 'Failed');
        toast.error(err);
        if (err.toLowerCase().includes('pin')) setPinValue('');
      }
    } catch { toast.error('Error'); }
    finally { setSendUsdLoading(false); }
  };

  const handlePinSubmit = () => {
    if (pinValue.length < 4) {
      toast.error('Enter full security PIN');
      return;
    }
    if (pendingAction?.type === 'withdraw') {
      executeWithdraw(pendingAction.data, pinValue);
    } else if (pendingAction?.type === 'send-usd') {
      executeSendUsd(pendingAction.data, pinValue);
    }
  };

  const copyAddr = () => {
    if (cryptoDepositInfo?.address) {
      navigator.clipboard.writeText(cryptoDepositInfo.address);
      toast.success('Address copied to clipboard');
    }
  };

  if (!user) return <Layout><div className="py-20 text-center"><Button onClick={() => login()}>Sign In to View Wallet</Button></div></Layout>;

  return (
    <Layout connected={true}>
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground">Vault & Settlement</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Reserve Protocol v4.2 Active</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="fintech-badge bg-[#0A0F1E] text-white border-white/10 px-6 py-2.5">
               <ShieldAlert className="h-4 w-4 mr-2 inline text-amber-400" />
               <span className="opacity-80">Security Grade:</span> <span className="text-amber-400 ml-1">Enterprise</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Balances & Actions */}
          <div className="lg:col-span-4 space-y-10">
            <div className="fintech-gradient-card bg-brandblue-600 p-10 shadow-brandblue-500/20 group">
               <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-1000 pointer-events-none"><PhilippinePeso className="h-48 w-48" /></div>
               <div className="relative z-10 space-y-10">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-brandblue-100 uppercase tracking-[0.4em]">Core Liquidity (PHP)</p>
                    {phpBalance && phpBalance.pending_balance > 0 && (
                        <div className="bg-amber-400 text-amber-950 px-3 py-1 rounded-full font-black text-[9px] uppercase tracking-widest animate-pulse">Clearing</div>
                    )}
                  </div>
                  <h2 className="text-5xl font-black text-white tracking-tighter tabular-nums">
                    {loading ? '₱ --.--' : `₱${fmt(phpBalance?.available_balance)}`}
                  </h2>
                  <div className="flex items-center gap-6 text-brandblue-100/60 font-black text-[10px] uppercase tracking-[0.2em]">
                     <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Available</div>
                     {phpBalance && phpBalance.pending_balance > 0 && (
                         <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" /> ₱{fmt(phpBalance.pending_balance)} Pending</div>
                     )}
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={() => setTopupDialogOpen(true)} className="flex-1 bg-white text-brandblue-600 hover:bg-brandblue-50 font-black rounded-2xl h-16 uppercase text-[11px] tracking-widest shadow-2xl transition-all active:scale-95">
                      <PlusCircle className="h-5 w-5 mr-2" /> Top Up
                    </Button>
                    <Button onClick={() => setActiveTab('withdraw')} variant="ghost" className="flex-1 bg-white/10 border border-white/10 text-white hover:bg-white/20 font-black rounded-2xl h-16 uppercase text-[11px] tracking-widest transition-all active:scale-95">
                      <ArrowUpFromLine className="h-5 w-5 mr-2" /> Payout
                    </Button>
                  </div>
               </div>
            </div>

            <div className="fintech-gradient-card bg-[#111827] p-10 shadow-emerald-500/10 group">
               <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-1000 pointer-events-none"><Bitcoin className="h-48 w-48 text-emerald-500" /></div>
               <div className="relative z-10 space-y-10">
                  <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.4em]">Settlement Vault (USDT)</p>
                  <h2 className="text-5xl font-black text-white tracking-tighter tabular-nums">
                    {loading ? '$ --.--' : `$${fmtUsd(usdBalance?.balance)}`}
                  </h2>
                  <div className="flex gap-4">
                    <Button onClick={() => setActiveTab('crypto')} className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600 font-black rounded-2xl h-16 uppercase text-[11px] tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                      <ArrowDownLeft className="h-5 w-5 mr-2" /> Deposit
                    </Button>
                    <Button onClick={() => setActiveTab('send-usd')} variant="ghost" className="flex-1 bg-white/5 border border-white/5 text-white hover:bg-white/10 font-black rounded-2xl h-16 uppercase text-[11px] tracking-widest transition-all active:scale-95">
                      <Send className="h-5 w-5 mr-2" /> Send
                    </Button>
                  </div>
               </div>
            </div>

            <Card className="fintech-card bg-muted/20 border-0 shadow-xl overflow-hidden">
               <CardHeader className="pb-6 pt-10 px-10 border-b border-border/10">
                 <CardTitle className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-[0.4em]">Bridge Protocols</CardTitle>
               </CardHeader>
               <CardContent className="space-y-6 p-10">
                  {[
                    { label: 'Local PHP Clear', status: 'T+1 SETTLEMENT', color: 'text-foreground' },
                    { label: 'USDT Cross-Chain', status: 'REALTIME (T+0)', color: 'text-emerald-500' },
                    { label: 'Node Encryption', status: 'AES-256 GCM', color: 'text-brandblue-500' },
                  ].map(p => (
                    <div key={p.label} className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{p.label}</span>
                      <span className={`text-[10px] font-black ${p.color} uppercase tracking-tighter`}>{p.status}</span>
                    </div>
                  ))}
                  <div className="pt-6 border-t border-border/10">
                    <p className="text-[9px] text-muted-foreground/40 leading-relaxed font-bold uppercase italic tracking-tighter">Funds are secured by segregated multi-signature institutional cold storage.</p>
                  </div>
               </CardContent>
            </Card>
          </div>

          {/* Right Column: Dynamic Action Panel & History */}
          <div className="lg:col-span-8 space-y-10">
             <Card className="fintech-card overflow-hidden h-fit border-0 shadow-2xl">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex overflow-x-auto custom-scrollbar bg-[#0A0F1E]">
                    <TabsList className="bg-transparent border-b border-white/5 h-20 p-0 rounded-none justify-start px-10 gap-12 min-w-max">
                      <TabsTrigger value="withdraw" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-brand-blue-500 rounded-none font-black text-[11px] uppercase tracking-[0.4em] px-0 transition-all text-white/30 data-[state=active]:text-white">Withdrawal</TabsTrigger>
                      <TabsTrigger value="send-usd" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-emerald-500 rounded-none font-black text-[11px] uppercase tracking-[0.4em] px-0 transition-all text-white/30 data-[state=active]:text-white">Inter-Vault</TabsTrigger>
                      <TabsTrigger value="crypto" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-teal-400 rounded-none font-black text-[11px] uppercase tracking-[0.4em] px-0 transition-all text-white/30 data-[state=active]:text-white">Stablecoin In</TabsTrigger>
                    </TabsList>
                  </div>

                  <CardContent className="p-12 bg-card">
                    <TabsContent value="withdraw" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transfer Amount (PHP)</Label>
                          <div className="relative group">
                            <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-brand-blue-500 text-2xl">₱</span>
                            <Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="pl-12 h-20 bg-muted/20 border-border/40 text-3xl font-black rounded-3xl tabular-nums focus:ring-brandblue-500/10 transition-all" placeholder="0.00" />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Receiving Bank</Label>
                          <Select value={withdrawBank} onValueChange={setWithdrawBank}>
                            <SelectTrigger className="h-20 bg-muted/20 border-border/40 rounded-3xl font-black uppercase text-[11px] tracking-[0.2em] px-8 shadow-sm transition-all focus:ring-brandblue-500/10"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-[2rem] border-border/40 shadow-2xl p-2">{bankOptions.map(b => <SelectItem key={b.code} value={b.code} className="py-4 font-black uppercase text-[10px] tracking-widest rounded-xl mb-1">{b.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Beneficiary Account</Label>
                          <Input value={withdrawAccount} onChange={e => setWithdrawAccount(e.target.value)} className="h-20 bg-muted/20 border-border/40 font-black text-lg rounded-3xl px-8 tracking-[0.3em] tabular-nums uppercase focus:ring-brandblue-500/10" placeholder="09XXXXXXXXX" />
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transaction Ref</Label>
                          <Input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} className="h-20 bg-muted/20 border-border/40 text-sm font-black rounded-3xl px-8 uppercase tracking-tight focus:ring-brandblue-500/10" placeholder="Internal memo" />
                        </div>
                      </div>
                      <Button onClick={handleWithdraw} disabled={withdrawLoading} className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-[2rem] shadow-2xl shadow-brandblue-500/30 uppercase tracking-[0.4em] transition-all active:scale-95 text-[11px]">
                        {withdrawLoading ? <Loader2 className="h-7 w-7 animate-spin mr-4" /> : <ArrowUpFromLine className="h-7 w-7 mr-4" />} Authorize Network Payout
                      </Button>
                    </TabsContent>

                    <TabsContent value="send-usd" className="mt-0 space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="space-y-4 text-center">
                         <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Node-to-Node Asset Routing</h3>
                         <p className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-[0.3em] bg-muted/30 inline-block px-6 py-2 rounded-full border border-border/10">Zero-fee internal vault clearance</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Target Account @ID</Label>
                          <div className="relative group"><span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-2xl group-focus-within:scale-125 transition-transform duration-300">@</span><Input value={sendUsdUsername} onChange={e => setSendUsdUsername(e.target.value)} className="pl-12 h-20 bg-muted/20 border-border/40 text-lg font-black rounded-3xl px-8 uppercase tracking-widest focus:ring-emerald-500/10" placeholder="RECIPIENT_ID" /></div>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Asset Value (USDT)</Label>
                          <div className="relative group"><span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-2xl group-focus-within:scale-125 transition-transform duration-300">$</span><Input type="number" value={sendUsdAmount} onChange={e => setSendUsdAmount(e.target.value)} className="pl-12 h-20 bg-muted/20 border-border/40 text-3xl font-black rounded-3xl tabular-nums focus:ring-emerald-500/10" placeholder="0.00" /></div>
                        </div>
                      </div>
                      <Button onClick={handleSendUsd} disabled={sendUsdLoading} className="w-full h-20 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-[2rem] shadow-2xl shadow-emerald-600/30 uppercase tracking-[0.4em] transition-all active:scale-95 text-[11px]">
                         {sendUsdLoading ? <Loader2 className="h-7 w-7 animate-spin mr-4" /> : <Send className="h-7 w-7 mr-4" />} Execute Inter-Vault Transfer
                      </Button>
                    </TabsContent>

                    <TabsContent value="crypto" className="mt-0 space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
                       <div className="flex flex-col md:flex-row gap-16 items-center bg-muted/10 rounded-[3rem] p-12 border border-border/40 shadow-inner">
                          <div className="shrink-0 bg-white p-8 rounded-[2.5rem] shadow-3xl border-4 border-muted group cursor-pointer relative overflow-hidden transition-all hover:scale-105 active:scale-95 duration-500">
                             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${cryptoDepositInfo?.address || 'loading'}`} alt="QR" className="w-56 h-56 relative z-10" />
                             <div className="absolute inset-0 bg-brand-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[4px]">
                                <QrCode className="h-14 w-14 text-brand-blue-600 animate-pulse" />
                             </div>
                          </div>
                          <div className="flex-1 space-y-10">
                             <div>
                               <div className="flex items-center gap-3 mb-4 ml-1">
                                 <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
                                 <p className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.4em]">Network Destination (TRC-20)</p>
                               </div>
                               <div className="flex items-center gap-6 bg-card border-2 border-border/40 p-6 rounded-3xl shadow-xl group/addr">
                                 <code className="text-lg font-black text-teal-600 truncate flex-1 tracking-widest">{cryptoDepositInfo?.address || 'INITIALIZING NODE...'}</code>
                                 <button onClick={copyAddr} className="h-12 w-12 rounded-2xl flex items-center justify-center bg-muted/40 text-muted-foreground hover:text-brand-blue-600 hover:bg-brand-blue-50 transition-all active:scale-90 shadow-sm border border-border/20"><Copy className="h-5 w-5" /></button>
                               </div>
                             </div>
                             <div className="bg-rose-500/5 border border-rose-500/20 p-8 rounded-[2rem] flex gap-6 shadow-sm">
                                <ShieldAlert className="h-8 w-8 text-rose-600 shrink-0" />
                                <div className="space-y-2">
                                   <p className="text-[11px] font-black text-rose-800 uppercase tracking-widest">Protocol Warning</p>
                                   <p className="text-[10px] font-bold text-rose-700/80 leading-relaxed uppercase tracking-tighter">Asset mismatch results in permanent loss. Use strictly Tether (USDT) via TRON Network. Confirm transaction hash before exit.</p>
                                </div>
                             </div>
                          </div>
                       </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
             </Card>

             <Card className="fintech-card overflow-hidden shadow-2xl border-0">
                <CardHeader className="bg-muted/10 border-b border-border/10 flex flex-row items-center justify-between py-10 px-10">
                  <div className="flex items-center gap-5">
                    <div className="h-10 w-10 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20">
                       <History className="h-5 w-5 text-brandblue-600" />
                    </div>
                    <div>
                       <CardTitle className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground/80">Vault Activity Ledger</CardTitle>
                       <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-1">Institutional Audit Stream</p>
                    </div>
                  </div>
                  <div className="fintech-badge bg-white text-muted-foreground border-border/60 px-5">{transactions.length} Transactions</div>
                </CardHeader>
                <CardContent className="p-0 max-h-[700px] overflow-y-auto custom-scrollbar bg-card">
                   {loading ? (
                     <div className="py-40 text-center flex flex-col items-center gap-6">
                       <Loader2 className="h-12 w-12 animate-spin text-brandblue-500 opacity-20" />
                       <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.4em] animate-pulse">Syncing Network States...</p>
                     </div>
                   ) : transactions.length === 0 ? (
                     <div className="py-40 text-center px-12">
                       <div className="h-24 w-24 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-8 shadow-inner border border-border/10">
                         <WalletIcon className="h-12 w-12 text-muted-foreground/10" />
                       </div>
                       <p className="text-sm font-black text-muted-foreground uppercase tracking-[0.3em] opacity-40">Zero recorded entries</p>
                     </div>
                   ) : (
                     <div className="divide-y divide-border/10 px-6">
                       {Array.isArray(transactions) && transactions.map(txn => {
                         const cfg = txnTypeConfig[txn.transaction_type] || { label: txn.transaction_type, color: 'text-foreground', icon: <History className="h-4 w-4" />, sign: '', bg: 'bg-muted' };
                         const isCrypto = String(txn.transaction_type).includes('usd');
                         return (
                           <div key={txn.id} className="p-8 flex items-center justify-between hover:bg-muted/10 transition-all rounded-[2.5rem] my-3 border border-transparent hover:border-border/40 group/item">
                              <div className="flex items-center gap-8 min-w-0">
                                <div className={`h-16 w-16 rounded-[1.5rem] ${cfg.bg} flex items-center justify-center shrink-0 border border-black/5 shadow-sm group-hover/item:scale-110 group-hover/item:rotate-3 transition-all duration-500`}>
                                  {cfg.icon}
                                </div>
                                <div className="min-w-0 space-y-2">
                                  <p className="text-sm font-black text-foreground uppercase tracking-tight truncate">{cfg.label}</p>
                                  <div className="flex items-center gap-4 flex-wrap">
                                     <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                        <Clock className="h-3 w-3" /> {new Date(txn.created_at!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                     </p>
                                     <span className="h-1 w-1 rounded-full bg-border" />
                                     <p className="text-[10px] font-black text-brandblue-500/40 uppercase tracking-tighter truncate max-w-[200px]">REF: {txn.note || txn.reference_id || 'INTERNAL_SYS'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right ml-6 shrink-0">
                                <p className={`text-xl font-black ${txn.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'} tabular-nums tracking-tighter group-hover/item:scale-110 transition-transform`}>
                                  {cfg.sign}{isCrypto ? '$' : '₱'}{fmt(Math.abs(txn.amount))}
                                </p>
                                <div className="mt-3 flex justify-end">
                                   <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                     txn.status === 'success' || txn.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted/50 text-muted-foreground'
                                   } border border-transparent shadow-sm`}>
                                      {txn.status}
                                   </div>
                                </div>
                              </div>
                           </div>
                         );
                       })}
                     </div>
                   )}
                </CardContent>
             </Card>
          </div>
        </div>
      </div>

      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
         <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-0 bg-card shadow-2xl">
            <div className="bg-brandblue-500 p-8 text-center">
               <div className="h-16 w-16 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center mx-auto mb-4 border border-white/20"><Building2 className="h-8 w-8 text-white" /></div>
               <h3 className="text-xl font-black text-white uppercase tracking-tight">Manual Top-Up</h3>
               <p className="text-brandblue-50 text-[10px] font-bold uppercase tracking-widest mt-1">Local Bank Transfer Instructions</p>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-4">
                  {TOPUP_BANKS.map(b => (
                    <div key={b.number} className="bg-muted/30 border border-border/40 rounded-2xl p-4 flex flex-col gap-1 hover:bg-muted/50 transition-colors">
                       <p className="text-[9px] font-black text-brandblue-500 uppercase tracking-widest">{b.bank}</p>
                       <p className="text-xs font-black text-foreground uppercase">{b.name}</p>
                       <div className="flex items-center justify-between">
                         <code className="text-sm font-black text-foreground tracking-tighter">{b.number}</code>
                         <button onClick={() => { navigator.clipboard.writeText(b.number); toast.success('Account number copied'); }} className="text-muted-foreground hover:text-brandblue-500"><Copy className="h-3.5 w-3.5" /></button>
                       </div>
                    </div>
                  ))}
               </div>
               <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">After transfer, please send a screenshot of the receipt to @PayBotPH_Bot on Telegram for manual verification.</p>
               </div>
               <Button onClick={() => setTopupDialogOpen(false)} className="w-full h-12 bg-brandblue-500 hover:bg-brandblue-600 text-white font-black rounded-xl uppercase tracking-widest">Got it</Button>
            </div>
         </DialogContent>
      </Dialog>

      <PinAuthDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        value={pinValue}
        onValueChange={setPinValue}
        onConfirm={handlePinSubmit}
        loading={withdrawLoading || sendUsdLoading}
      />
    </Layout>
  );
}
