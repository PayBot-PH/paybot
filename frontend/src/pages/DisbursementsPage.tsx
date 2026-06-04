import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot, BarChart3, Wallet, CreditCard, FileText, Building2, Loader2, Plus,
  Send, RotateCcw, Users, CalendarDays, Trash2, ArrowUpRight, Search,
  History, UserPlus, CreditCard as CreditCardIcon, Receipt, Settings2,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmt } from '@/lib/format';

interface Disbursement {
  id: number; external_id: string; amount: number; bank_code: string;
  account_number: string; account_name: string; description: string;
  status: string; disbursement_type: string; created_at: string | null;
}
interface Refund {
  id: number; transaction_id: number; amount: number; reason: string;
  status: string; refund_type: string; created_at: string | null;
}
interface Subscription {
  id: number; plan_name: string; amount: number; interval: string;
  customer_name: string; customer_email: string; status: string;
  next_billing_date: string | null; total_cycles: number; created_at: string | null;
}
interface Customer {
  id: number; name: string; email: string; phone: string; notes: string;
  total_payments: number; total_amount: number; created_at: string | null;
}

const NAV = [
  { to: '/', icon: BarChart3, label: 'Dashboard', active: false },
  { to: '/wallet', icon: Wallet, label: 'Wallet', active: false },
  { to: '/payments', icon: CreditCard, label: 'Payments', active: false },
  { to: '/transactions', icon: FileText, label: 'Transactions', active: false },
  { to: '/disbursements', icon: Building2, label: 'Manage', active: true },
  { to: '/bot-settings', icon: Bot, label: 'Bot', active: false },
];

export default function DisbursementsPage() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState('disbursements');
  const [dAmount, setDAmount] = useState('');
  const [dBank, setDBank] = useState('BDO');
  const [dAccount, setDAccount] = useState('');
  const [dName, setDName] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dLoading, setDLoading] = useState(false);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [rTxnId, setRTxnId] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rReason, setRReason] = useState('');
  const [rLoading, setRLoading] = useState(false);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [sPlan, setSPlan] = useState('');
  const [sAmount, setSAmount] = useState('');
  const [sInterval, setSInterval] = useState('monthly');
  const [sCustName, setSCustName] = useState('');
  const [sCustEmail, setSCustEmail] = useState('');
  const [sLoading, setSLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cLoading, setCLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const [dRes, rRes, sRes, cRes] = await Promise.all([
        client.apiCall.invoke({ url: '/api/v1/gateway/disbursements', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/gateway/refunds', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/gateway/subscriptions', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/gateway/customers', method: 'GET', data: {} }),
      ]);
      setDisbursements(dRes.data?.items || []);
      setRefunds(rRes.data?.items || []);
      setSubscriptions(sRes.data?.items || []);
      setCustomers(cRes.data?.items || []);
    } catch { /* ignore */ }
    setListLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDisburse = async () => {
    if (!dAmount || !dAccount || !dName) { toast.error('Fill all required fields'); return; }
    setDLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/disbursement', method: 'POST',
        data: { amount: parseFloat(dAmount), bank_code: dBank, account_number: dAccount, account_name: dName, description: dDesc },
      });
      if (res.data?.success) { toast.success('Disbursement created!'); setDAmount(''); setDAccount(''); setDName(''); setDDesc(''); fetchAll(); }
      else toast.error(res.data?.message || 'Failed');
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setDLoading(false);
  };

  const handleRefund = async () => {
    if (!rTxnId || !rAmount) { toast.error('Enter transaction ID and amount'); return; }
    setRLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/refund', method: 'POST',
        data: { transaction_id: parseInt(rTxnId), amount: parseFloat(rAmount), reason: rReason },
      });
      if (res.data?.success) { toast.success('Refund processed!'); setRTxnId(''); setRAmount(''); setRReason(''); fetchAll(); }
      else toast.error(res.data?.message || 'Failed');
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setRLoading(false);
  };

  const handleSubscribe = async () => {
    if (!sPlan || !sAmount) { toast.error('Enter plan name and amount'); return; }
    setSLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/subscription', method: 'POST',
        data: { plan_name: sPlan, amount: parseFloat(sAmount), interval: sInterval, customer_name: sCustName, customer_email: sCustEmail },
      });
      if (res.data?.success) { toast.success('Subscription created!'); setSPlan(''); setSAmount(''); setSCustName(''); setSCustEmail(''); fetchAll(); }
      else toast.error(res.data?.message || 'Failed');
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setSLoading(false);
  };

  const handleSubAction = async (id: number, status: string) => {
    try {
      await client.apiCall.invoke({ url: `/api/v1/gateway/subscription/${id}`, method: 'PUT', data: { status } });
      toast.success(`Subscription ${status}`); fetchAll();
    } catch { toast.error('Failed'); }
  };

  const handleAddCustomer = async () => {
    if (!cName) { toast.error('Enter customer name'); return; }
    setCLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/customer', method: 'POST',
        data: { name: cName, email: cEmail, phone: cPhone, notes: cNotes },
      });
      if (res.data?.success) { toast.success('Customer added!'); setCName(''); setCEmail(''); setCPhone(''); setCNotes(''); fetchAll(); }
      else toast.error(res.data?.message || 'Failed');
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setCLoading(false);
  };

  const handleDeleteCustomer = async (id: number) => {
    try {
      await client.apiCall.invoke({ url: `/api/v1/gateway/customer/${id}`, method: 'DELETE', data: {} });
      toast.success('Customer deleted'); fetchAll();
    } catch { toast.error('Failed'); }
  };

  const statusBadge = (s: string) => {
    const cfg: Record<string, string> = {
      completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return <Badge className={`${cfg[s] || 'bg-slate-500/20 text-muted-foreground border-slate-500/30'} border text-xs`}>{s}</Badge>;
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">Money Management</h1>
            <p className="text-muted-foreground text-sm mt-1">Disbursements, refunds, and customer relations</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 py-1 px-3">
              <Settings2 className="h-3 w-3 mr-1.5" />
              Settlement: T+1
            </Badge>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-8">
          <TabsList className="bg-muted/50 border border-border/60 p-1 h-auto flex-wrap sm:inline-flex gap-1 rounded-xl">
            <TabsTrigger value="disbursements" className="rounded-lg py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Send className="h-3.5 w-3.5 mr-2 text-emerald-500" />Disbursements
            </TabsTrigger>
            <TabsTrigger value="refunds" className="rounded-lg py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <RotateCcw className="h-3.5 w-3.5 mr-2 text-orange-500" />Refunds
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="rounded-lg py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 mr-2 text-purple-500" />Subscriptions
            </TabsTrigger>
            <TabsTrigger value="customers" className="rounded-lg py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="h-3.5 w-3.5 mr-2 text-cyan-500" />Customers
            </TabsTrigger>
          </TabsList>

          {/* DISBURSEMENTS TAB */}
          <TabsContent value="disbursements" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
                <div className="h-1 bg-emerald-500 w-full" />
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold flex items-center">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mr-3">
                      <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    New Payout
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Payout Amount (₱)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₱</span>
                      <Input type="number" placeholder="0.00" value={dAmount} onChange={e => setDAmount(e.target.value)}
                        className="pl-7 bg-muted/30 border-border/60 text-lg font-bold h-12 focus-visible:ring-emerald-500/30" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Recipient Bank</Label>
                      <Select value={dBank} onValueChange={setDBank}>
                        <SelectTrigger className="bg-muted/30 border-border/60 h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'METROBANK', 'GCASH', 'PAYMAYA'].map(b => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Number</Label>
                      <Input placeholder="09XXXXXXXXX" value={dAccount} onChange={e => setDAccount(e.target.value)} className="bg-muted/30 border-border/60 h-10" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Holder Name</Label>
                    <Input placeholder="Juan Dela Cruz" value={dName} onChange={e => setDName(e.target.value)} className="bg-muted/30 border-border/60 h-10" />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Reference / Note</Label>
                    <Input placeholder="e.g. Salary, Supplier Payment" value={dDesc} onChange={e => setDDesc(e.target.value)} className="bg-muted/30 border-border/60 h-10" />
                  </div>

                  <Button onClick={handleDisburse} disabled={dLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 rounded-xl shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98]">
                    {dLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
                    Initialize Disbursement
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground px-4 leading-relaxed">
                    By clicking initialize, you authorize the transfer of funds to the recipient above.
                    Standard processing times apply.
                  </p>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3 border-border/60 shadow-sm flex flex-col h-[580px]">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold flex items-center">
                      <History className="h-4 w-4 mr-2 text-muted-foreground" />
                      Recent Payouts
                    </CardTitle>
                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Search payouts..." className="pl-8 h-8 text-xs bg-muted/40 border-border/60 rounded-full" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  {listLoading ? (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50 mb-4" />
                      <p className="text-sm text-muted-foreground animate-pulse">Syncing with gateway...</p>
                    </div>
                  ) : disbursements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
                      <div className="h-16 w-16 rounded-3xl bg-muted flex items-center justify-center mb-4">
                        <Receipt className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <h3 className="text-foreground font-bold">No disbursements found</h3>
                      <p className="text-sm text-muted-foreground max-w-[240px] mt-1 leading-relaxed">
                        When you send money to banks or wallets, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 overflow-y-auto h-full">
                      {disbursements.map(d => (
                        <div key={d.id} className="p-4 hover:bg-muted/30 transition-colors group cursor-default">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                                <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{d.account_name}</p>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                  {d.bank_code} • {d.account_number}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-red-500">-₱{fmt(d.amount)}</p>
                              <div className="mt-1 flex justify-end">
                                {statusBadge(d.status)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2">
                            <p className="truncate italic">"{d.description || 'No reference note'}"</p>
                            <p className="shrink-0">{d.created_at ? new Date(d.created_at).toLocaleString() : 'N/A'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* REFUNDS TAB */}
          <TabsContent value="refunds" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <div className="h-1 bg-orange-500 w-full" />
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center">
                    <RotateCcw className="h-5 w-5 mr-2 text-orange-500" />
                    Process Refund
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Original Transaction ID</Label>
                    <Input type="number" placeholder="Enter ID (e.g. 10245)" value={rTxnId} onChange={e => setRTxnId(e.target.value)}
                      className="bg-muted/30 h-10 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Refund Amount (₱)</Label>
                    <Input type="number" placeholder="0.00" value={rAmount} onChange={e => setRAmount(e.target.value)}
                      className="bg-muted/30 h-10 font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Reason for Refund</Label>
                    <Textarea placeholder="Double payment, customer return, etc." value={rReason} onChange={e => setRReason(e.target.value)}
                      className="bg-muted/30 min-h-[80px]" />
                  </div>
                  <Button onClick={handleRefund} disabled={rLoading} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-11">
                    {rLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                    Confirm Refund
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm flex flex-col h-[460px]">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-lg font-bold">Refund History</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex-1">
                  {listLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div> :
                  refunds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center h-full">
                      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                        <RotateCcw className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm text-muted-foreground">No refund records yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 h-full overflow-y-auto">
                      {refunds.map(r => (
                        <div key={r.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                          <div className="min-w-0 mr-3">
                            <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                              <span className="text-muted-foreground text-xs font-normal">Txn #</span>{r.transaction_id}
                              <Badge variant="outline" className="text-[9px] uppercase tracking-tighter py-0 px-1.5 h-4 bg-muted/40 font-bold border-border/60">{r.refund_type}</Badge>
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1 truncate max-w-[200px] italic">"{r.reason || 'No reason provided'}"</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-orange-500">₱{fmt(r.amount)}</p>
                            <div className="mt-1">{statusBadge(r.status)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SUBSCRIPTIONS TAB */}
          <TabsContent value="subscriptions" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <div className="h-1 bg-purple-500 w-full" />
                <CardHeader><CardTitle className="text-lg font-bold flex items-center"><CalendarDays className="h-5 w-5 mr-2 text-purple-500" />Recurring Bill</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Plan Name</Label><Input placeholder="e.g. Pro Plan" value={sPlan} onChange={e => setSPlan(e.target.value)} className="bg-muted/30" /></div>
                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Price (₱)</Label><Input type="number" placeholder="999" value={sAmount} onChange={e => setSAmount(e.target.value)} className="bg-muted/30 font-bold" /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Billing Interval</Label>
                    <Select value={sInterval} onValueChange={setSInterval}>
                      <SelectTrigger className="bg-muted/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['daily', 'weekly', 'monthly', 'yearly'].map(i => <SelectItem key={i} value={i} className="capitalize">{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Customer Info</Label>
                    <Input placeholder="John Doe" value={sCustName} onChange={e => setSCustName(e.target.value)} className="bg-muted/30 mb-2" />
                    <Input placeholder="john@example.com" value={sCustEmail} onChange={e => setSCustEmail(e.target.value)} className="bg-muted/30" />
                  </div>
                  <Button onClick={handleSubscribe} disabled={sLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-11 mt-2">
                    {sLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create Subscription
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm flex flex-col h-[500px]">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-lg font-bold">Active Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex-1">
                  {listLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div> :
                  subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center h-full">
                      <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 h-full overflow-y-auto">
                      {subscriptions.map(s => (
                        <div key={s.id} className="p-4 hover:bg-muted/10 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground leading-none mb-1">{s.plan_name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{s.customer_name} • {s.customer_email}</p>
                            </div>
                            {statusBadge(s.status)}
                          </div>
                          <div className="flex items-center justify-between text-xs mb-3 bg-muted/30 p-2 rounded-lg">
                            <span className="font-bold text-primary">₱{fmt(s.amount)} <span className="text-[10px] font-normal text-muted-foreground">/ {s.interval}</span></span>
                            {s.next_billing_date && <span className="text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />Next: {s.next_billing_date.split('T')[0]}</span>}
                          </div>
                          {s.status === 'active' ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => handleSubAction(s.id, 'paused')} className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 text-[10px] h-7 px-3 bg-amber-500/5">Pause</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleSubAction(s.id, 'cancelled')} className="text-red-500 hover:text-red-600 hover:bg-red-500/10 text-[10px] h-7 px-3 bg-red-500/5">Cancel</Button>
                            </div>
                          ) : s.status === 'paused' ? (
                            <Button size="sm" variant="ghost" onClick={() => handleSubAction(s.id, 'active')} className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 text-[10px] h-7 px-3 bg-emerald-500/5">Resume Plan</Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CUSTOMERS TAB */}
          <TabsContent value="customers" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60 shadow-sm overflow-hidden">
                <div className="h-1 bg-cyan-500 w-full" />
                <CardHeader><CardTitle className="text-lg font-bold flex items-center"><UserPlus className="h-5 w-5 mr-2 text-cyan-500" />Customer CRM</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Full Name</Label><Input placeholder="Juan Dela Cruz" value={cName} onChange={e => setCName(e.target.value)} className="bg-muted/30" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email Address</Label><Input placeholder="juan@example.com" value={cEmail} onChange={e => setCEmail(e.target.value)} className="bg-muted/30" /></div>
                    <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone Number</Label><Input placeholder="+639XXXXXXXXX" value={cPhone} onChange={e => setCPhone(e.target.value)} className="bg-muted/30" /></div>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Merchant Notes</Label><Textarea placeholder="VIP customer, prefers Maya payments, etc." value={cNotes} onChange={e => setCNotes(e.target.value)} className="bg-muted/30 resize-none" rows={3} /></div>
                  <Button onClick={handleAddCustomer} disabled={cLoading} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold h-11">
                    {cLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add to Contacts
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm flex flex-col h-[520px]">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold">Contact Directory</CardTitle>
                    <Badge className="bg-cyan-500/10 text-cyan-500 border-0 h-5 text-[10px]">{customers.length} total</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex-1">
                  {listLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div> :
                  customers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center h-full">
                      <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Directory is empty</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 h-full overflow-y-auto">
                      {customers.map(c => (
                        <div key={c.id} className="p-4 hover:bg-muted/10 transition-all group">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1 pr-4">
                              <p className="text-sm font-bold text-foreground mb-0.5">{c.name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-0.5"><Send className="h-2.5 w-2.5" />{c.email || 'no email'}</span>
                                <span>•</span>
                                <span>{c.phone || 'no phone'}</span>
                              </div>
                              {c.notes && (
                                <div className="mt-2 text-[10px] text-muted-foreground bg-muted/40 p-1.5 rounded border-l-2 border-cyan-500/40">
                                  {c.notes}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteCustomer(c.id)} className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-foreground">₱{fmt(c.total_amount)}</p>
                                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">{c.total_payments || 0} orders</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
