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
    <Layout>
      <div className="max-w-6xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Financial Center</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Manage your multi-currency balances and settlements</p>
          </div>
          <Badge className="bg-brand-blue-500/10 text-brand-blue-600 border-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
            <ShieldAlert className="h-3 w-3 mr-1.5 inline" /> Secure Node
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Balances & Actions */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="bg-brand-blue-600 border-0 shadow-xl shadow-brand-blue-500/20 overflow-hidden relative rounded-[2rem]">
               <div className="absolute top-0 right-0 p-8 opacity-10"><PhilippinePeso className="h-32 w-32" /></div>
               <CardContent className="p-8 relative z-10">
                  <p className="text-[10px] font-black text-brand-blue-100 uppercase tracking-[0.2em] mb-2">Available Balance</p>
                  <h2 className="text-4xl font-black text-white tracking-tight mb-8">
                    {loading ? '₱ --.--' : `₱${fmt(phpBalance?.balance)}`}
                  </h2>
                  <div className="flex gap-2">
                    <Button onClick={() => setTopupDialogOpen(true)} className="flex-1 bg-white text-brand-blue-600 hover:bg-brand-blue-50 font-black rounded-xl h-12 uppercase text-[10px] tracking-widest">
                      <PlusCircle className="h-4 w-4 mr-2" /> Top Up
                    </Button>
                    <Button onClick={() => setActiveTab('withdraw')} variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 font-black rounded-xl h-12 uppercase text-[10px] tracking-widest">
                      <ArrowUpFromLine className="h-4 w-4 mr-2" /> Cash Out
                    </Button>
                  </div>
               </CardContent>
            </Card>

            <Card className="bg-emerald-600 border-0 shadow-xl shadow-emerald-500/20 overflow-hidden relative rounded-[2rem]">
               <div className="absolute top-0 right-0 p-8 opacity-10"><Bitcoin className="h-32 w-32" /></div>
               <CardContent className="p-8 relative z-10">
                  <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-2">USDT Assets (TRC-20)</p>
                  <h2 className="text-4xl font-black text-white tracking-tight mb-8">
                    {loading ? '$ --.--' : `$${fmtUsd(usdBalance?.balance)}`}
                  </h2>
                  <div className="flex gap-2">
                    <Button onClick={() => setActiveTab('crypto')} className="flex-1 bg-white text-emerald-600 hover:bg-emerald-50 font-black rounded-xl h-12 uppercase text-[10px] tracking-widest">
                      <ArrowDownLeft className="h-4 w-4 mr-2" /> Receive
                    </Button>
                    <Button onClick={() => setActiveTab('send-usd')} variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 font-black rounded-xl h-12 uppercase text-[10px] tracking-widest">
                      <Send className="h-4 w-4 mr-2" /> Transfer
                    </Button>
                  </div>
               </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm bg-muted/20">
               <CardHeader className="pb-2">
                 <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Settlement Info</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground uppercase">Bank Payouts</span>
                    <span className="text-foreground">T+1 Business Day</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground uppercase">USDT Clearing</span>
                    <span className="text-foreground">Instant (T+0)</span>
                  </div>
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground leading-relaxed italic">Verified transactions are automatically settled to your designated PHP wallet.</p>
                  </div>
               </CardContent>
            </Card>
          </div>

          {/* Right Column: Dynamic Action Panel & History */}
          <div className="lg:col-span-8 space-y-6">
             <Card className="border-border/60 shadow-sm overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full bg-muted/40 border-b border-border/40 h-14 p-0 rounded-none justify-start px-4 gap-6">
                    <TabsTrigger value="withdraw" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-blue-500 rounded-none font-black text-[10px] uppercase tracking-widest">Withdraw</TabsTrigger>
                    <TabsTrigger value="send-usd" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 rounded-none font-black text-[10px] uppercase tracking-widest">Send USD</TabsTrigger>
                    <TabsTrigger value="crypto" className="h-full bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none font-black text-[10px] uppercase tracking-widest">USDT Deposit</TabsTrigger>
                  </TabsList>

                  <CardContent className="p-8">
                    <TabsContent value="withdraw" className="mt-0 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Amount to Cash Out (PHP)</Label>
                          <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">₱</span><Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="pl-8 h-12 bg-muted/20 border-border/60 text-lg font-black rounded-xl" placeholder="0.00" /></div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Recipient Bank</Label>
                          <Select value={withdrawBank} onValueChange={setWithdrawBank}>
                            <SelectTrigger className="h-12 bg-muted/20 border-border/60 rounded-xl font-bold uppercase text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-card">{bankOptions.map(b => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Account Number</Label>
                          <Input value={withdrawAccount} onChange={e => setWithdrawAccount(e.target.value)} className="h-12 bg-muted/20 border-border/60 font-mono text-sm rounded-xl" placeholder="09XXXXXXXXX" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Internal Reference</Label>
                          <Input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} className="h-12 bg-muted/20 border-border/60 text-sm font-medium rounded-xl" placeholder="Optional note" />
                        </div>
                      </div>
                      <Button onClick={handleWithdraw} disabled={withdrawLoading} className="w-full h-14 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl shadow-lg shadow-brand-blue-500/20 uppercase tracking-widest transition-all">
                        {withdrawLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ArrowUpFromLine className="h-5 w-5 mr-2" />} Initialize Payout
                      </Button>
                    </TabsContent>

                    <TabsContent value="send-usd" className="mt-0 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Recipient @Username</Label>
                        <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">@</span><Input value={sendUsdUsername} onChange={e => setSendUsdUsername(e.target.value)} className="pl-8 h-12 bg-muted/20 border-border/60 text-sm font-black rounded-xl" placeholder="telegram_user" /></div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">USD Amount</Label>
                        <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">$</span><Input type="number" value={sendUsdAmount} onChange={e => setSendUsdAmount(e.target.value)} className="pl-8 h-12 bg-muted/20 border-border/60 text-lg font-black rounded-xl" placeholder="0.00" /></div>
                      </div>
                      <Button onClick={handleSendUsd} disabled={sendUsdLoading} className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/20 uppercase tracking-widest transition-all">
                         {sendUsdLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />} Transfer USD Assets
                      </Button>
                    </TabsContent>

                    <TabsContent value="crypto" className="mt-0 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                       <div className="flex flex-col md:flex-row gap-8 items-center bg-muted/20 rounded-[2rem] p-8 border border-border/40">
                          <div className="shrink-0 bg-white p-3 rounded-2xl shadow-sm border border-border/60">
                             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x130&data=${cryptoDepositInfo?.address || 'loading'}`} alt="QR" className="w-40 h-40" />
                          </div>
                          <div className="flex-1 space-y-4">
                             <div>
                               <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">TRC-20 Destination</p>
                               <div className="flex items-center gap-2 bg-card border border-border/60 px-4 py-2.5 rounded-xl">
                                 <code className="text-xs font-black text-teal-600 truncate flex-1">{cryptoDepositInfo?.address || '---'}</code>
                                 <button onClick={copyAddr} className="text-muted-foreground hover:text-brand-blue-500"><Copy className="h-4 w-4" /></button>
                               </div>
                             </div>
                             <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                                <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase">Important: Transfer only USDT on the TRON network. Cross-chain deposits cannot be recovered.</p>
                             </div>
                          </div>
                       </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
             </Card>

             <Card className="border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b border-border/40 flex flex-row items-center justify-between py-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-brand-blue-500" />
                    <CardTitle className="text-xs font-black uppercase tracking-widest">Recent Activity</CardTitle>
                  </div>
                  <Badge className="bg-muted text-muted-foreground font-black text-[9px] uppercase tracking-tighter border-0">{transactions.length} total</Badge>
                </CardHeader>
                <CardContent className="p-0 max-h-[500px] overflow-y-auto">
                   {loading ? (
                     <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-blue-500 opacity-40" /></div>
                   ) : transactions.length === 0 ? (
                     <div className="py-20 text-center px-6">
                       <WalletIcon className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                       <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No transaction data available</p>
                     </div>
                   ) : (
                     <div className="divide-y divide-border/30">
                       {transactions.map(txn => {
                         const cfg = txnTypeConfig[txn.transaction_type] || { label: txn.transaction_type, color: 'text-foreground', icon: <History className="h-4 w-4" />, sign: '', bg: 'bg-muted' };
                         const isCrypto = txn.transaction_type.includes('usd');
                         return (
                           <div key={txn.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className={`h-10 w-10 rounded-2xl ${cfg.bg} flex items-center justify-center shrink-0 border border-black/5`}>
                                  {cfg.icon}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">{cfg.label}</p>
                                  <p className="text-[10px] font-bold text-muted-foreground mt-1 truncate italic">"{txn.note || txn.reference_id || 'Automatic entry'}"</p>
                                </div>
                              </div>
                              <div className="text-right ml-4 shrink-0">
                                <p className={`text-sm font-black ${txn.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'} tabular-nums uppercase`}>
                                  {cfg.sign}{isCrypto ? '$' : '₱'}{fmt(Math.abs(txn.amount))}
                                </p>
                                <p className="text-[9px] font-bold text-muted-foreground mt-0.5 uppercase tracking-tighter">{txn.status}</p>
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
