import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PinAuthDialog from '@/components/PinAuthDialog';
import {
  Building2, Loader2, Plus,
  Send, RotateCcw, Users, CalendarDays, History, Settings2,
  ChevronRight, Check, ShieldCheck, Receipt, Search, Trash2, Zap
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

export default function DisbursementsPage() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState('disbursements');
  const [wizardStep, setWizardStep] = useState(1);
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

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'disburse' | 'refund', data: any } | null>(null);

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
      setDisbursements(Array.isArray(dRes.data?.items) ? dRes.data.items : []);
      setRefunds(Array.isArray(rRes.data?.items) ? rRes.data.items : []);
      setSubscriptions(Array.isArray(sRes.data?.items) ? sRes.data.items : []);
      setCustomers(Array.isArray(cRes.data?.items) ? cRes.data.items : []);
    } catch {
      setDisbursements([]);
      setRefunds([]);
      setSubscriptions([]);
      setCustomers([]);
    }
    setListLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDisburse = async () => {
    if (!dAmount || !dAccount || !dName) { toast.error('Fill all required fields'); return; }

    setPendingAction({
      type: 'disburse',
      data: { amount: parseFloat(dAmount), bank_code: dBank, account_number: dAccount, account_name: dName, description: dDesc }
    });
    setPinValue('');
    setPinDialogOpen(true);
  };

  const executeDisburse = async (data: any, pin: string) => {
    setDLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/disbursement', method: 'POST',
        data: { ...data, pin },
      });
      if (res.data?.success) {
        toast.success('Disbursement created!');
        setDAmount(''); setDAccount(''); setDName(''); setDDesc('');
        setWizardStep(1);
        fetchAll();
        setPinDialogOpen(false);
      }
      else {
        const msg = res.data?.message || 'Failed';
        toast.error(msg);
        if (msg.toLowerCase().includes('pin')) setPinValue('');
      }
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setDLoading(false);
  };

  const handleRefund = async () => {
    if (!rTxnId || !rAmount) { toast.error('Enter transaction ID and amount'); return; }

    setPendingAction({
      type: 'refund',
      data: { transaction_id: parseInt(rTxnId), amount: parseFloat(rAmount), reason: rReason }
    });
    setPinValue('');
    setPinDialogOpen(true);
  };

  const executeRefund = async (data: any, pin: string) => {
    setRLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/refund', method: 'POST',
        data: { ...data, pin },
      });
      if (res.data?.success) {
        toast.success('Refund processed!');
        setRTxnId(''); setRAmount(''); setRReason('');
        fetchAll();
        setPinDialogOpen(false);
      }
      else {
        const msg = res.data?.message || 'Failed';
        toast.error(msg);
        if (msg.toLowerCase().includes('pin')) setPinValue('');
      }
    } catch (e: unknown) { toast.error((e as { data?: { detail?: string } })?.data?.detail || 'Failed'); }
    setRLoading(false);
  };

  const handlePinConfirm = () => {
    if (pinValue.length < 4) {
      toast.error('Enter full security PIN');
      return;
    }
    if (pendingAction?.type === 'disburse') {
      executeDisburse(pendingAction.data, pinValue);
    } else if (pendingAction?.type === 'refund') {
      executeRefund(pendingAction.data, pinValue);
    }
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
      completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      failed: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };
    return <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full ${cfg[s] || 'bg-slate-500/10 text-muted-foreground border-slate-500/20'} border text-[9px] font-black uppercase tracking-widest shadow-sm`}>{s}</div>;
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase">Merchant Operations</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Capital Lifecycle Management & Payout Node</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="fintech-badge bg-[#0A0F1E] text-white border-white/10 px-6 py-2.5 backdrop-blur-md shadow-sm">
               <Settings2 className="h-4 w-4 mr-2 inline text-brandblue-400" />
               <span className="opacity-80">Settlement Basis:</span> <span className="text-brandblue-400 ml-1">T+1_AUTO</span>
             </div>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-10">
          <div className="flex overflow-x-auto custom-scrollbar bg-[#0A0F1E] rounded-[1.5rem] shadow-2xl p-1.5 border border-white/5 w-fit">
            <TabsList className="bg-transparent h-auto p-0 gap-2">
              <TabsTrigger value="disbursements" className="rounded-xl py-3.5 px-8 font-black text-[11px] uppercase tracking-[0.3em] data-[state=active]:bg-white/10 data-[state=active]:text-white transition-all text-white/30 border border-transparent data-[state=active]:border-white/10">
                <Send className="h-4 w-4 mr-3" />DISBURSE
              </TabsTrigger>
              <TabsTrigger value="refunds" className="rounded-xl py-3.5 px-8 font-black text-[11px] uppercase tracking-[0.3em] data-[state=active]:bg-white/10 data-[state=active]:text-white transition-all text-white/30 border border-transparent data-[state=active]:border-white/10">
                <RotateCcw className="h-4 w-4 mr-3" />REFUNDS
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="rounded-xl py-3.5 px-8 font-black text-[11px] uppercase tracking-[0.3em] data-[state=active]:bg-white/10 data-[state=active]:text-white transition-all text-white/30 border border-transparent data-[state=active]:border-white/10">
                <CalendarDays className="h-4 w-4 mr-3" />SUB_PLANS
              </TabsTrigger>
              <TabsTrigger value="customers" className="rounded-xl py-3.5 px-8 font-black text-[11px] uppercase tracking-[0.3em] data-[state=active]:bg-white/10 data-[state=active]:text-white transition-all text-white/30 border border-transparent data-[state=active]:border-white/10">
                <Users className="h-4 w-4 mr-3" />DIRECTORY
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="disbursements" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <Card className="lg:col-span-5 fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm h-fit">
                <div className="h-2.5 bg-emerald-500 w-full shadow-[0_0_15px_rgba(52,211,153,0.4)]" />
                <CardHeader className="p-10 border-b border-border/10">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                      <Send className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                       <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Initiate Requisition</CardTitle>
                       <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">Deploy liquidity to external bank node</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-10">
                  <div className="flex justify-between mb-12 px-2 relative">
                     <div className="absolute top-5 left-10 right-10 h-0.5 bg-muted -z-0" />
                     {[1, 2, 3].map((s) => (
                        <div key={s} className="relative z-10 flex flex-col items-center">
                           <div className={`h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-700 font-black text-xs ${wizardStep >= s ? 'bg-[#0A0F1E] border-[#0A0F1E] text-white shadow-2xl scale-110' : 'bg-card border-border/60 text-muted-foreground/40'}`}>
                              {wizardStep > s ? <Check className="h-5 w-5 text-emerald-400" /> : s}
                           </div>
                           <span className={`text-[8px] font-black uppercase tracking-[0.4em] mt-4 transition-colors duration-500 ${wizardStep === s ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                              {s === 1 ? 'QUOTA' : s === 2 ? 'TARGET' : 'EMIT'}
                           </span>
                        </div>
                     ))}
                  </div>

                  {wizardStep === 1 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transfer Volume (PHP)</Label>
                        <div className="relative group">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-emerald-500 font-black text-3xl group-focus-within:scale-110 transition-transform">₱</span>
                          <Input type="number" placeholder="0.00" value={dAmount} onChange={e => setDAmount(e.target.value)}
                            className="pl-12 h-20 bg-muted/20 border-border/40 text-4xl font-black rounded-3xl tabular-nums focus:ring-emerald-500/10 transition-all border-2 shadow-inner" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transmission Memo</Label>
                        <Input placeholder="REQUISITION_METADATA_STRING" value={dDesc} onChange={e => setDDesc(e.target.value)} className="h-16 bg-muted/20 border-border/40 rounded-2xl px-6 font-black uppercase tracking-widest border-2 shadow-sm" />
                      </div>
                      <Button onClick={() => dAmount && setWizardStep(2)} className="w-full h-20 bg-[#0A0F1E] hover:bg-black text-white font-black rounded-[2rem] uppercase tracking-[0.4em] shadow-2xl transition-all active:scale-95 group">
                        NEXT_PROTOCOL
                        <ChevronRight className="h-6 w-6 ml-4 group-hover:translate-x-1.5 transition-transform" />
                      </Button>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="grid grid-cols-1 gap-8">
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Receiving Node (Bank)</Label>
                          <Select value={dBank} onValueChange={setDBank}>
                            <SelectTrigger className="h-18 bg-muted/20 border-border/40 rounded-3xl font-black uppercase text-[11px] tracking-[0.2em] px-8 border-2 shadow-sm transition-all focus:ring-emerald-500/10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-[2rem] border-border/40 shadow-2xl p-2 bg-[#0A0F1E]">
                              {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'METROBANK', 'GCASH', 'PAYMAYA'].map(b => (
                                <SelectItem key={b} value={b} className="text-[10px] font-black uppercase tracking-[0.3em] py-4 text-white/60 hover:text-white rounded-xl mb-1">{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Endpoint Identity (Account)</Label>
                          <Input placeholder="09XXXXXXXXX / ACCT_ID" value={dAccount} onChange={e => setDAccount(e.target.value)} className="h-18 bg-muted/20 border-border/40 rounded-3xl px-8 font-black tabular-nums tracking-[0.4em] border-2 shadow-inner uppercase" />
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Legal Beneficiary Alias</Label>
                          <Input placeholder="ENTITY_NAME_STRING" value={dName} onChange={e => setDName(e.target.value)} className="h-18 bg-muted/20 border-border/40 rounded-3xl px-8 font-black uppercase tracking-widest border-2 shadow-sm" />
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <Button variant="ghost" onClick={() => setWizardStep(1)} className="h-18 flex-1 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.3em] border-2 border-border/40">ABORT</Button>
                        <Button onClick={() => dAccount && dName && setWizardStep(3)} className="h-18 flex-[2] bg-[#0A0F1E] text-white font-black rounded-[1.5rem] uppercase tracking-[0.4em] shadow-2xl">SUMMARY_AUDIT</Button>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="p-8 rounded-[2.5rem] bg-emerald-500/5 border-2 border-emerald-500/20 space-y-6 shadow-inner relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Zap className="h-32 w-32 text-emerald-500" /></div>
                         <div className="flex justify-between items-center border-b border-emerald-500/10 pb-6">
                            <span className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.4em]">Final Quota</span>
                            <span className="text-4xl font-black text-emerald-500 tracking-tighter tabular-nums">₱{fmt(parseFloat(dAmount))}</span>
                         </div>
                         <div className="space-y-5 pt-4">
                            <div className="flex justify-between">
                               <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Protocol Recipient</span>
                               <span className="text-xs font-black uppercase text-foreground">{dName}</span>
                            </div>
                            <div className="flex justify-between">
                               <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Network Destination</span>
                               <span className="text-xs font-black uppercase text-brand-blue-600">{dBank} • {dAccount}</span>
                            </div>
                         </div>
                      </div>
                      <div className="flex gap-4">
                        <Button variant="ghost" onClick={() => setWizardStep(2)} className="h-20 flex-1 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.4em] border-2 border-border/40" disabled={dLoading}>ADJUST</Button>
                        <Button onClick={handleDisburse} disabled={dLoading} className="h-20 flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-[2rem] uppercase tracking-[0.4em] shadow-2xl shadow-emerald-500/40 transition-all active:scale-95 group">
                          {dLoading ? <Loader2 className="h-7 w-7 animate-spin mr-3 opacity-50" /> : <><ShieldCheck className="h-7 w-7 mr-4 group-hover:scale-110 transition-transform" /> COMMIT_EMISSION</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-7 fintech-card border-0 shadow-2xl overflow-hidden h-[860px] flex flex-col bg-card/40 backdrop-blur-sm">
                <CardHeader className="p-10 border-b border-border/10 bg-[#0A0F1E]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                       <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                          <History className="h-6 w-6 text-white/30" />
                       </div>
                       <div>
                          <CardTitle className="text-xl font-black uppercase tracking-tight text-white/80">Operations Ledger</CardTitle>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Real-time disbursement audit stream</p>
                       </div>
                    </div>
                    <div className="relative w-full sm:w-72 group">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-brandblue-400 transition-colors" />
                      <Input placeholder="REQUISITION_ID..." className="pl-14 h-14 text-[11px] font-black bg-white/5 border-white/10 rounded-2xl uppercase tracking-[0.3em] text-white focus:ring-brandblue-500/20 border-2 transition-all shadow-sm" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden bg-card">
                  {listLoading ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-8 px-10">
                      <Loader2 className="h-16 w-16 animate-spin text-brandblue-500 opacity-20" />
                      <p className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 animate-pulse">Syncing network state across nodes...</p>
                    </div>
                  ) : disbursements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 px-10 text-center space-y-8">
                      <div className="h-32 w-32 rounded-[3rem] bg-muted/20 flex items-center justify-center shadow-inner border-4 border-dashed border-border/40 group">
                        <Receipt className="h-16 w-16 text-muted-foreground/10 group-hover:scale-110 transition-transform duration-700" />
                      </div>
                      <div className="space-y-2">
                         <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Zero Record Set</h3>
                         <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">No operations detected in current cycle</p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/10 overflow-y-auto h-full px-8 custom-scrollbar pt-6">
                      {Array.isArray(disbursements) && disbursements.map(d => (
                        <div key={d.id} className="p-8 hover:bg-muted/10 transition-all rounded-[2.5rem] my-4 border border-transparent hover:border-border/40 group/item">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-2">
                            <div className="flex items-center gap-6 min-w-0">
                              <div className="h-16 w-16 rounded-[1.5rem] bg-muted/20 flex items-center justify-center shrink-0 border-2 border-border/40 shadow-sm group-hover/item:scale-110 group-hover/item:rotate-3 transition-all duration-500 group-hover/item:border-brandblue-500/20 group-hover/item:text-brandblue-600">
                                <Building2 className="h-8 w-8 text-muted-foreground/40 group-hover/item:text-brandblue-500 transition-colors" />
                              </div>
                              <div className="min-w-0 space-y-2">
                                <p className="text-base font-black text-foreground uppercase tracking-tight truncate max-w-[280px]">{d.account_name}</p>
                                <div className="flex flex-wrap items-center gap-4">
                                   <div className="fintech-badge bg-brandblue-500/5 text-brandblue-600 border-brandblue-500/10 px-3 tracking-widest">{d.bank_code}</div>
                                   <span className="h-1 w-1 rounded-full bg-border" />
                                   <code className="text-[11px] font-black text-muted-foreground/60 tracking-[0.3em] tabular-nums">{d.account_number}</code>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-3">
                              <p className="text-2xl font-black text-rose-500 tracking-tighter tabular-nums group-hover:scale-110 transition-transform">-₱{fmt(d.amount)}</p>
                              {statusBadge(d.status)}
                            </div>
                          </div>
                          <div className="mt-6 pt-6 border-t border-border/5 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <Clock className="h-3 w-3 text-muted-foreground/40" />
                                <span className="text-[9px] font-black uppercase text-muted-foreground/40 tracking-widest">{new Date(d.created_at!).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                             <p className="text-[10px] font-bold text-muted-foreground/20 uppercase tracking-[0.3em] italic truncate max-w-[200px]">ID: {d.external_id}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="refunds" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
                <div className="h-2.5 bg-orange-500 w-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                <CardHeader className="p-10 border-b border-border/10">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-inner">
                      <RotateCcw className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                       <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Protocol Reversal</CardTitle>
                       <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">Initiate asset recovery from settled node</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Internal Reference Hub (TXN_ID)</Label>
                    <Input type="number" placeholder="NODE_IDENTIFIER (e.g. 10245)" value={rTxnId} onChange={e => setRTxnId(e.target.value)}
                      className="h-18 bg-muted/20 border-border/40 rounded-3xl font-black tabular-nums tracking-[0.3em] focus:ring-orange-500/10 border-2 shadow-inner uppercase px-8" />
                  </div>
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Adjustment Quota (PHP)</Label>
                    <div className="relative group">
                       <span className="absolute left-6 top-1/2 -translate-y-1/2 text-orange-500 font-black text-3xl group-focus-within:scale-110 transition-transform">₱</span>
                       <Input type="number" placeholder="0.00" value={rAmount} onChange={e => setRAmount(e.target.value)}
                         className="pl-12 h-20 bg-muted/20 border-border/40 rounded-3xl text-4xl font-black tabular-nums focus:ring-orange-500/10 border-2 shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Reason for Adjustment</Label>
                    <Textarea placeholder="Specify network adjustment metadata..." value={rReason} onChange={e => setRReason(e.target.value)}
                      className="bg-muted/20 border-border/40 rounded-[2rem] min-h-[160px] resize-none focus:ring-orange-500/10 p-8 font-black uppercase tracking-tight text-sm border-2 shadow-inner" />
                  </div>
                  <Button onClick={handleRefund} disabled={rLoading} className="w-full h-20 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-[2rem] shadow-2xl shadow-orange-500/30 transition-all active:scale-95 uppercase tracking-[0.4em] group">
                    {rLoading ? <Loader2 className="h-7 w-7 mr-3 animate-spin opacity-50" /> : <RotateCcw className="h-7 w-7 mr-4 group-hover:rotate-180 transition-transform duration-700" />}
                    EXECUTE_REVERSAL
                  </Button>
                </CardContent>
              </Card>

              <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm h-[800px] flex flex-col">
                <CardHeader className="p-10 border-b border-border/10 bg-[#0A0F1E]">
                   <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                         <History className="h-6 w-6 text-white/30" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-black uppercase tracking-tight text-white/80">Adjustment Logs</CardTitle>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Audit trail for node reversals</p>
                      </div>
                   </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex-1 bg-card">
                  {listLoading ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-8 px-10">
                       <Loader2 className="h-16 w-16 animate-spin text-orange-500 opacity-20" />
                       <p className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 animate-pulse">Scanning ledger adjustments...</p>
                    </div>
                  ) : refunds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 px-10 text-center space-y-8">
                      <div className="h-32 w-32 rounded-[3rem] bg-muted/20 flex items-center justify-center shadow-inner border-4 border-dashed border-border/40 group">
                        <RotateCcw className="h-16 w-16 text-muted-foreground/10 group-hover:-rotate-180 transition-transform duration-1000" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Zero Record set</h3>
                        <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">No reversals detected in this node cycle</p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/10 h-full overflow-y-auto px-8 custom-scrollbar pt-6">
                      {Array.isArray(refunds) && refunds.map(r => (
                        <div key={r.id} className="p-8 hover:bg-muted/10 transition-all rounded-[2.5rem] my-4 border border-transparent hover:border-border/40 group/item">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-2">
                            <div className="min-w-0 space-y-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="fintech-badge bg-orange-500/5 text-orange-600 border-orange-500/10 px-3 tracking-widest">TXN_REF: #{r.transaction_id}</div>
                                <div className="fintech-badge bg-muted/20 text-muted-foreground/40 border-0 px-3 tracking-widest">{r.refund_type.toUpperCase()}</div>
                              </div>
                              <p className="text-xs text-muted-foreground/60 font-black uppercase tracking-tight leading-relaxed italic truncate max-w-[340px]">"{r.reason || 'SYSTEM_INITIATED_ADJUSTMENT'}"</p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-3">
                              <p className="text-2xl font-black text-orange-500 tracking-tighter tabular-nums group-hover:scale-110 transition-transform">₱{fmt(r.amount)}</p>
                              {statusBadge(r.status)}
                            </div>
                          </div>
                          <div className="mt-6 pt-6 border-t border-border/5 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <Clock className="h-3 w-3 text-muted-foreground/40" />
                                <span className="text-[9px] font-black uppercase text-muted-foreground/40 tracking-widest">{new Date(r.created_at!).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                             <p className="text-[10px] font-bold text-white/5 uppercase tracking-[0.5em]">AUTH_OK</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="subscriptions" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
             <Card className="fintech-card border-0 bg-[#0A0F1E] p-20 text-center border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-brandblue-500/5 to-transparent opacity-50" />
                <div className="relative z-10 space-y-10">
                   <div className="h-32 w-32 rounded-[3rem] bg-white/5 flex items-center justify-center mx-auto mb-10 shadow-3xl border border-white/10 group-hover:scale-110 transition-transform duration-1000">
                      <CalendarDays className="h-16 w-16 text-brandblue-400 animate-float" />
                   </div>
                   <div className="space-y-4">
                      <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Recurring Engine Active</h3>
                      <p className="text-[11px] text-white/30 font-black uppercase tracking-[0.5em] max-w-lg mx-auto leading-loose">Automated subscription node management system is fully operational across regional clusters.</p>
                   </div>
                   <div className="flex gap-4 justify-center pt-10 border-t border-white/5">
                      <div className="fintech-badge bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-8">DAEMON_ONLINE</div>
                      <div className="fintech-badge bg-white/5 text-white/40 border-white/10 px-8">VERSION_4.2.0</div>
                   </div>
                </div>
             </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-0 animate-in fade-in slide-in-from-top-4 duration-500">
             <Card className="fintech-card border-0 bg-[#0A0F1E] p-20 text-center border-white/5 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-50" />
                <div className="relative z-10 space-y-10">
                   <div className="h-32 w-32 rounded-[3rem] bg-white/5 flex items-center justify-center mx-auto mb-10 shadow-3xl border border-white/10 group-hover:scale-110 transition-transform duration-1000">
                      <Users className="h-16 w-16 text-cyan-400 animate-float-delayed" />
                   </div>
                   <div className="space-y-4">
                      <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Directory Node Synchronized</h3>
                      <p className="text-[11px] text-white/30 font-black uppercase tracking-[0.5em] max-w-lg mx-auto leading-loose">Identity management kernel is aggregating transmission data from all merchant endpoints in real-time.</p>
                   </div>
                   <div className="flex gap-4 justify-center pt-10 border-t border-white/5">
                      <div className="fintech-badge bg-cyan-500/10 text-cyan-400 border-cyan-500/20 px-8">IAM_SYNCED</div>
                      <div className="fintech-badge bg-white/5 text-white/40 border-white/10 px-8">DATA_LOCKED</div>
                   </div>
                </div>
             </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PinAuthDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        value={pinValue}
        onValueChange={setPinValue}
        onConfirm={handlePinConfirm}
        loading={dLoading || rLoading}
      />
    </Layout>
  );
}
