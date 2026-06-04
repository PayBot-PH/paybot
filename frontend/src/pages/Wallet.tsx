import { useEffect, useState, useCallback } from 'react';
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

const txnTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string; bg: string }> = {
  top_up: { label: 'Deposit', color: 'text-emerald-500', icon: <ArrowDownLeft className="h-4 w-4" />, sign: '+', bg: 'bg-emerald-50' },
  send: { label: 'Transfer', color: 'text-rose-500', icon: <Send className="h-4 w-4" />, sign: '-', bg: 'bg-rose-50' },
  withdraw: { label: 'Cash Out', color: 'text-amber-500', icon: <ArrowUpFromLine className="h-4 w-4" />, sign: '-', bg: 'bg-amber-50' },
  receive: { label: 'Received', color: 'text-emerald-500', icon: <ArrowDownToLine className="h-4 w-4" />, sign: '+', bg: 'bg-emerald-50' },
  crypto_topup: { label: 'USDT In', color: 'text-teal-500', icon: <Bitcoin className="h-4 w-4" />, sign: '+', bg: 'bg-teal-50' },
  usdt_send: { label: 'USDT Out', color: 'text-rose-500', icon: <Send className="h-4 w-4" />, sign: '-', bg: 'bg-rose-50' },
  admin_credit: { label: 'Correction', color: 'text-brand-blue-500', icon: <Zap className="h-4 w-4" />, sign: '+', bg: 'bg-brand-blue-50' },
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
      setTransactions(txnRes?.items || []);
    } catch (err) { console.error(err); }
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
    setWithdrawLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ amount: amt, bank_name: withdrawBank, account_number: withdrawAccount, note: withdrawNote }),
      });
      if (res.ok) {
        toast.success('Withdrawal request submitted');
        setWithdrawAmount(''); setWithdrawAccount(''); setWithdrawNote('');
        fetchWalletData();
      } else toast.error(await getResponseError(res, 'Failed'));
    } catch { toast.error('Connection error'); }
    finally { setWithdrawLoading(false); }
  };

  const handleSendUsd = async () => {
    const amt = parseFloat(sendUsdAmount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    setSendUsdLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/send-usd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ recipient_username: sendUsdUsername.replace('@',''), amount: amt }),
      });
      if (res.ok) { toast.success('USD Transferred!'); setSendUsdUsername(''); setSendUsdAmount(''); fetchWalletData(); }
      else toast.error(await getResponseError(res, 'Failed'));
    } catch { toast.error('Error'); }
    finally { setSendUsdLoading(false); }
  };

  const copyAddr = () => {
    if (cryptoDepositInfo?.address) {
      navigator.clipboard.writeText(cryptoDepositInfo.address);
      toast.success('Address copied to clipboard');
    }
  };

  if (!user) return <Layout><div className="py-20 text-center"><Button onClick={() => login()}>Sign In to View Wallet</Button></div></Layout>;

  return (
    <Layout connected={connected}>
      <div className="max-w-7xl mx-auto pb-10 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase">Vault & Settlement</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-2">
               <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
               Multi-currency liquidity and global payout control
            </p>
          </div>
          <div className="flex items-center gap-3">
             <Badge className="bg-brand-blue-500/10 text-brand-blue-600 border-0 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
               <ShieldAlert className="h-3.5 w-3.5 mr-2 inline" /> Verified Node
             </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Balances & Actions */}
          <div className="lg:col-span-4 space-y-8">
            <Card className="bg-brand-blue-600 border-0 shadow-2xl shadow-brand-blue-500/30 overflow-hidden relative rounded-[2.5rem] group">
               <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-700 pointer-events-none"><PhilippinePeso className="h-40 w-40" /></div>
               <CardContent className="p-10 relative z-10">
                  <p className="text-[10px] font-black text-brand-blue-100 uppercase tracking-[0.3em] mb-3">Available Liquidity</p>
                  <h2 className="text-5xl font-black text-white tracking-tighter mb-10 tabular-nums">
                    {loading ? '₱ --.--' : `₱${fmt(phpBalance?.balance)}`}
                  </h2>
                  <div className="flex gap-3">
                    <Button onClick={() => setTopupDialogOpen(true)} className="flex-1 bg-white text-brand-blue-600 hover:bg-brand-blue-50 font-black rounded-2xl h-14 uppercase text-[10px] tracking-widest shadow-xl shadow-black/10">
                      <PlusCircle className="h-4 w-4 mr-2" /> Top Up
                    </Button>
                    <Button onClick={() => setActiveTab('withdraw')} variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 font-black rounded-2xl h-14 uppercase text-[10px] tracking-widest">
                      <ArrowUpFromLine className="h-4 w-4 mr-2" /> Payout
                    </Button>
                  </div>
               </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 shadow-2xl shadow-emerald-600/30 overflow-hidden relative rounded-[2.5rem] group">
               <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:rotate-12 transition-transform duration-700 pointer-events-none"><Bitcoin className="h-40 w-40" /></div>
               <CardContent className="p-10 relative z-10">
                  <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.3em] mb-3">USDT Stablecoin (TRC-20)</p>
                  <h2 className="text-5xl font-black text-white tracking-tighter mb-10 tabular-nums">
                    {loading ? '$ --.--' : `$${fmtUsd(usdBalance?.balance)}`}
                  </h2>
                  <div className="flex gap-3">
                    <Button onClick={() => setActiveTab('crypto')} className="flex-1 bg-white text-emerald-600 hover:bg-emerald-50 font-black rounded-2xl h-14 uppercase text-[10px] tracking-widest shadow-xl shadow-black/10">
                      <ArrowDownLeft className="h-4 w-4 mr-2" /> Deposit
                    </Button>
                    <Button onClick={() => setActiveTab('send-usd')} variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 font-black rounded-2xl h-14 uppercase text-[10px] tracking-widest">
                      <Send className="h-4 w-4 mr-2" /> Send
                    </Button>
                  </div>
               </CardContent>
            </Card>

            <Card className="glass-card bg-muted/20">
               <CardHeader className="pb-4 pt-6">
                 <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Network Protocols</CardTitle>
               </CardHeader>
               <CardContent className="space-y-5 pb-8">
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-muted-foreground uppercase tracking-wider">Local Clear</span>
                    <span className="text-foreground">T+1 SETTLEMENT</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-muted-foreground uppercase tracking-wider">Asset Bridge</span>
                    <span className="text-emerald-500">REALTIME (T+0)</span>
                  </div>
                  <div className="pt-4 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-bold uppercase italic tracking-tighter">Encrypted node validation active. Funds are secured by cross-chain ledger protocols.</p>
                  </div>
               </CardContent>
            </Card>
          </div>

          {/* Right Column: Dynamic Action Panel & History */}
          <div className="lg:col-span-8 space-y-8">
             <Card className="glass-card overflow-hidden h-fit">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex overflow-x-auto custom-scrollbar bg-muted/30">
                    <TabsList className="bg-transparent border-b border-border/30 h-16 p-0 rounded-none justify-start px-8 gap-10 min-w-max">
                      <TabsTrigger value="withdraw" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-brand-blue-500 rounded-none font-black text-[10px] uppercase tracking-[0.3em] px-0 transition-all">Withdrawal</TabsTrigger>
                      <TabsTrigger value="send-usd" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-emerald-500 rounded-none font-black text-[10px] uppercase tracking-[0.3em] px-0 transition-all">Inter-Vault</TabsTrigger>
                      <TabsTrigger value="crypto" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-4 data-[state=active]:border-teal-500 rounded-none font-black text-[10px] uppercase tracking-[0.3em] px-0 transition-all">Stablecoin In</TabsTrigger>
                    </TabsList>
                  </div>

                  <CardContent className="p-10">
                    <TabsContent value="withdraw" className="mt-0 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Transfer Amount (PHP)</Label>
                          <div className="relative group">
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-brand-blue-500 text-xl">₱</span>
                            <Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="pl-10 h-16 bg-muted/20 border-border/50 text-2xl font-black rounded-2xl tabular-nums focus:ring-primary/20 transition-all" placeholder="0.00" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Receiving Bank</Label>
                          <Select value={withdrawBank} onValueChange={setWithdrawBank}>
                            <SelectTrigger className="h-16 bg-muted/20 border-border/50 rounded-2xl font-black uppercase text-[10px] tracking-widest px-6"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-2xl border-border/40 shadow-2xl">{bankOptions.map(b => <SelectItem key={b.code} value={b.code} className="py-3 font-bold">{b.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Beneficiary Account</Label>
                          <Input value={withdrawAccount} onChange={e => setWithdrawAccount(e.target.value)} className="h-16 bg-muted/20 border-border/50 font-black text-sm rounded-2xl px-6 tracking-widest tabular-nums uppercase" placeholder="09XXXXXXXXX" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Transaction Ref</Label>
                          <Input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} className="h-16 bg-muted/20 border-border/50 text-sm font-black rounded-2xl px-6 uppercase tracking-tight" placeholder="Private internal note" />
                        </div>
                      </div>
                      <Button onClick={handleWithdraw} disabled={withdrawLoading} className="w-full h-16 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-[1.5rem] shadow-2xl shadow-brand-blue-500/30 uppercase tracking-widest transition-all active:scale-95 text-xs">
                        {withdrawLoading ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <ArrowUpFromLine className="h-6 w-6 mr-3" />} Authorize Payout
                      </Button>
                    </TabsContent>

                    <TabsContent value="send-usd" className="mt-0 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="space-y-3 text-center mb-10">
                         <h3 className="text-xl font-black uppercase tracking-tight">Node-to-Node Transfer</h3>
                         <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Zero-fee internal asset routing between PayBot accounts</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Target Account @ID</Label>
                          <div className="relative"><span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-lg">@</span><Input value={sendUsdUsername} onChange={e => setSendUsdUsername(e.target.value)} className="pl-10 h-16 bg-muted/20 border-border/50 text-sm font-black rounded-2xl px-6 uppercase" placeholder="ADMIN_USERNAME" /></div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Asset Value (USDT)</Label>
                          <div className="relative"><span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-emerald-500 text-lg">$</span><Input type="number" value={sendUsdAmount} onChange={e => setSendUsdAmount(e.target.value)} className="pl-10 h-16 bg-muted/20 border-border/50 text-2xl font-black rounded-2xl tabular-nums" placeholder="0.00" /></div>
                        </div>
                      </div>
                      <Button onClick={handleSendUsd} disabled={sendUsdLoading} className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-[1.5rem] shadow-2xl shadow-emerald-500/30 uppercase tracking-widest transition-all active:scale-95 text-xs">
                         {sendUsdLoading ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Send className="h-6 w-6 mr-3" />} Execute Transfer
                      </Button>
                    </TabsContent>

                    <TabsContent value="crypto" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                       <div className="flex flex-col md:flex-row gap-12 items-center bg-muted/20 rounded-[2.5rem] p-10 border border-border/40 shadow-inner">
                          <div className="shrink-0 bg-white p-5 rounded-[2rem] shadow-2xl border border-border/60 group cursor-pointer relative overflow-hidden">
                             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${cryptoDepositInfo?.address || 'loading'}`} alt="QR" className="w-44 h-44 relative z-10" />
                             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <QrCode className="h-10 w-10 text-primary" />
                             </div>
                          </div>
                          <div className="flex-1 space-y-6">
                             <div>
                               <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-3 ml-1">Destination TRC-20 Hub</p>
                               <div className="flex items-center gap-4 bg-card border border-border/60 p-4 rounded-2xl shadow-sm">
                                 <code className="text-sm font-black text-teal-600 truncate flex-1 tracking-widest">{cryptoDepositInfo?.address || 'INITIALIZING NODE...'}</code>
                                 <button onClick={copyAddr} className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-brand-blue-500 hover:bg-muted transition-all active:scale-90"><Copy className="h-5 w-5" /></button>
                               </div>
                             </div>
                             <div className="bg-amber-500/5 border border-amber-500/15 p-6 rounded-2xl flex gap-4">
                                <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0" />
                                <p className="text-[10px] font-black text-amber-700 leading-relaxed uppercase tracking-tighter">Critical: Transfer strictly USDT via TRON (TRC-20). Incompatible assets or network mismatch results in permanent fund loss.</p>
                             </div>
                          </div>
                       </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
             </Card>

             <Card className="glass-card overflow-hidden">
                <CardHeader className="bg-muted/10 border-b border-border/40 flex flex-row items-center justify-between py-6 px-8">
                  <div className="flex items-center gap-3">
                    <History className="h-4 w-4 text-brand-blue-500" />
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em]">Ledger Stream</CardTitle>
                  </div>
                  <Badge className="bg-muted/50 text-muted-foreground font-black text-[9px] uppercase tracking-widest border-0 px-3 py-1 rounded-full">{transactions.length} records</Badge>
                </CardHeader>
                <CardContent className="p-0 max-h-[600px] overflow-y-auto custom-scrollbar">
                   {loading ? (
                     <div className="py-32 text-center flex flex-col items-center gap-4">
                       <Loader2 className="h-10 w-10 animate-spin text-brand-blue-500 opacity-20" />
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest animate-pulse">Parsing ledger history...</p>
                     </div>
                   ) : transactions.length === 0 ? (
                     <div className="py-32 text-center px-10">
                       <div className="h-20 w-20 rounded-[1.5rem] bg-muted/20 flex items-center justify-center mx-auto mb-6 shadow-inner">
                         <WalletIcon className="h-10 w-10 text-muted-foreground/20" />
                       </div>
                       <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">No operations recorded on this node</p>
                     </div>
                   ) : (
                     <div className="divide-y divide-border/20 px-4">
                       {transactions.map(txn => {
                         const cfg = txnTypeConfig[txn.transaction_type] || { label: txn.transaction_type, color: 'text-foreground', icon: <History className="h-4 w-4" />, sign: '', bg: 'bg-muted' };
                         const isCrypto = txn.transaction_type.includes('usd');
                         return (
                           <div key={txn.id} className="p-6 flex items-center justify-between hover:bg-muted/20 transition-all rounded-3xl my-2 border border-transparent hover:border-border/40 group">
                              <div className="flex items-center gap-5 min-w-0">
                                <div className={`h-12 w-12 rounded-[1rem] ${cfg.bg} flex items-center justify-center shrink-0 border border-black/5 shadow-sm group-hover:scale-105 transition-transform`}>
                                  {cfg.icon}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black text-foreground uppercase tracking-tight truncate">{cfg.label}</p>
                                  <p className="text-[10px] font-bold text-muted-foreground mt-1.5 truncate italic uppercase tracking-tighter">
                                     {new Date(txn.created_at!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} • {txn.note || txn.reference_id || 'SYSTEM_ENTRY'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right ml-4 shrink-0">
                                <p className={`text-base font-black ${txn.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'} tabular-nums tracking-tighter`}>
                                  {cfg.sign}{isCrypto ? '$' : '₱'}{fmt(Math.abs(txn.amount))}
                                </p>
                                <div className="mt-2 flex justify-end">
                                   <Badge className="bg-muted/50 text-[8px] font-black uppercase tracking-widest text-muted-foreground border-0 px-2.5 py-0.5">{txn.status}</Badge>
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
            <div className="bg-brand-blue-500 p-8 text-center">
               <div className="h-16 w-16 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center mx-auto mb-4 border border-white/20"><Building2 className="h-8 w-8 text-white" /></div>
               <h3 className="text-xl font-black text-white uppercase tracking-tight">Manual Top-Up</h3>
               <p className="text-brand-blue-50 text-[10px] font-bold uppercase tracking-widest mt-1">Local Bank Transfer Instructions</p>
            </div>
            <div className="p-8 space-y-6">
               <div className="space-y-4">
                  {TOPUP_BANKS.map(b => (
                    <div key={b.number} className="bg-muted/30 border border-border/40 rounded-2xl p-4 flex flex-col gap-1 hover:bg-muted/50 transition-colors">
                       <p className="text-[9px] font-black text-brand-blue-500 uppercase tracking-widest">{b.bank}</p>
                       <p className="text-xs font-black text-foreground uppercase">{b.name}</p>
                       <div className="flex items-center justify-between">
                         <code className="text-sm font-black text-foreground tracking-tighter">{b.number}</code>
                         <button onClick={() => { navigator.clipboard.writeText(b.number); toast.success('Account number copied'); }} className="text-muted-foreground hover:text-brand-blue-500"><Copy className="h-3.5 w-3.5" /></button>
                       </div>
                    </div>
                  ))}
               </div>
               <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">After transfer, please send a screenshot of the receipt to @PayBotPH_Bot on Telegram for manual verification.</p>
               </div>
               <Button onClick={() => setTopupDialogOpen(false)} className="w-full h-12 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-xl uppercase tracking-widest">Got it</Button>
            </div>
         </DialogContent>
      </Dialog>
    </Layout>
  );
}
