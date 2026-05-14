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
  Send, RotateCcw, Users, CalendarDays, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

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
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Money Management</h1>

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="bg-muted border border-border mb-6 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="disbursements" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
              <Send className="h-4 w-4 mr-1 text-emerald-400" />Disbursements
            </TabsTrigger>
            <TabsTrigger value="refunds" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
              <RotateCcw className="h-4 w-4 mr-1 text-orange-400" />Refunds
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
              <CalendarDays className="h-4 w-4 mr-1 text-purple-400" />Subscriptions
            </TabsTrigger>
            <TabsTrigger value="customers" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
              <Users className="h-4 w-4 mr-1 text-cyan-400" />Customers
            </TabsTrigger>
          </TabsList>

          {/* DISBURSEMENTS TAB */}
          <TabsContent value="disbursements">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground flex items-center"><Send className="h-5 w-5 mr-2 text-emerald-400" />Create Disbursement</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-muted-foreground">Amount (₱)</Label>
                    <Input type="number" placeholder="0.00" value={dAmount} onChange={e => setDAmount(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Bank</Label>
                    <Select value={dBank} onValueChange={setDBank}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'METROBANK'].map(b => <SelectItem key={b} value={b} className="text-foreground">{b}</SelectItem>)}
                      </SelectContent>
                    </Select></div>
                  <div><Label className="text-muted-foreground">Account Number</Label>
                    <Input placeholder="1234567890" value={dAccount} onChange={e => setDAccount(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Account Name</Label>
                    <Input placeholder="Juan Dela Cruz" value={dName} onChange={e => setDName(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Description</Label>
                    <Input placeholder="Salary payout" value={dDesc} onChange={e => setDDesc(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <Button onClick={handleDisburse} disabled={dLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    {dLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Send Money
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground">Recent Disbursements</CardTitle></CardHeader>
                <CardContent>
                  {listLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> :
                  disbursements.length === 0 ? <p className="text-muted-foreground text-center py-8">No disbursements yet</p> :
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">{disbursements.slice(0, 15).map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm text-foreground truncate">{d.account_name} ({d.bank_code})</p>
                        <p className="text-xs text-muted-foreground truncate">{d.description || d.external_id}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono text-red-400">-₱{d.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        {statusBadge(d.status)}
                      </div>
                    </div>
                  ))}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* REFUNDS TAB */}
          <TabsContent value="refunds">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground flex items-center"><RotateCcw className="h-5 w-5 mr-2 text-orange-400" />Process Refund</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-muted-foreground">Transaction ID</Label>
                    <Input type="number" placeholder="123" value={rTxnId} onChange={e => setRTxnId(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Refund Amount (₱)</Label>
                    <Input type="number" placeholder="0.00" value={rAmount} onChange={e => setRAmount(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Reason</Label>
                    <Input placeholder="Customer requested" value={rReason} onChange={e => setRReason(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <Button onClick={handleRefund} disabled={rLoading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                    {rLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}Process Refund
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground">Refund History</CardTitle></CardHeader>
                <CardContent>
                  {listLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> :
                  refunds.length === 0 ? <p className="text-muted-foreground text-center py-8">No refunds yet</p> :
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">{refunds.slice(0, 15).map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm text-foreground">Txn #{r.transaction_id} — {r.refund_type}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.reason || 'No reason'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono text-orange-400">₱{r.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        {statusBadge(r.status)}
                      </div>
                    </div>
                  ))}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SUBSCRIPTIONS TAB */}
          <TabsContent value="subscriptions">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground flex items-center"><CalendarDays className="h-5 w-5 mr-2 text-purple-400" />Create Subscription</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-muted-foreground">Plan Name</Label>
                    <Input placeholder="Premium Monthly" value={sPlan} onChange={e => setSPlan(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Amount (₱)</Label>
                    <Input type="number" placeholder="999" value={sAmount} onChange={e => setSAmount(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Interval</Label>
                    <Select value={sInterval} onValueChange={setSInterval}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {['daily', 'weekly', 'monthly', 'yearly'].map(i => <SelectItem key={i} value={i} className="text-foreground capitalize">{i}</SelectItem>)}
                      </SelectContent>
                    </Select></div>
                  <div><Label className="text-muted-foreground">Customer Name</Label>
                    <Input placeholder="John" value={sCustName} onChange={e => setSCustName(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Customer Email</Label>
                    <Input placeholder="john@example.com" value={sCustEmail} onChange={e => setSCustEmail(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <Button onClick={handleSubscribe} disabled={sLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                    {sLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create Subscription
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground">Active Subscriptions</CardTitle></CardHeader>
                <CardContent>
                  {listLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> :
                  subscriptions.length === 0 ? <p className="text-muted-foreground text-center py-8">No subscriptions yet</p> :
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">{subscriptions.map(s => (
                    <div key={s.id} className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-foreground">{s.plan_name}</p>
                        {statusBadge(s.status)}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>₱{s.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/{s.interval}</span>
                        <span>{s.customer_name || 'No customer'}</span>
                      </div>
                      {s.next_billing_date && <p className="text-xs text-muted-foreground mt-1">Next: {s.next_billing_date.split('T')[0]}</p>}
                      {s.status === 'active' && (
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => handleSubAction(s.id, 'paused')} className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10 text-xs h-7">Pause</Button>
                          <Button size="sm" variant="outline" onClick={() => handleSubAction(s.id, 'cancelled')} className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs h-7">Cancel</Button>
                        </div>
                      )}
                      {s.status === 'paused' && (
                        <Button size="sm" variant="outline" onClick={() => handleSubAction(s.id, 'active')} className="mt-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 text-xs h-7">Resume</Button>
                      )}
                    </div>
                  ))}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CUSTOMERS TAB */}
          <TabsContent value="customers">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground flex items-center"><Users className="h-5 w-5 mr-2 text-cyan-400" />Add Customer</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-muted-foreground">Name</Label>
                    <Input placeholder="Juan Dela Cruz" value={cName} onChange={e => setCName(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Email</Label>
                    <Input placeholder="juan@example.com" value={cEmail} onChange={e => setCEmail(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Phone</Label>
                    <Input placeholder="+639XXXXXXXXX" value={cPhone} onChange={e => setCPhone(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div><Label className="text-muted-foreground">Notes</Label>
                    <Input placeholder="VIP customer" value={cNotes} onChange={e => setCNotes(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <Button onClick={handleAddCustomer} disabled={cLoading} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
                    {cLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add Customer
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground">Customer List</CardTitle></CardHeader>
                <CardContent>
                  {listLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div> :
                  customers.length === 0 ? <p className="text-muted-foreground text-center py-8">No customers yet</p> :
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">{customers.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email || c.phone || 'No contact'}</p>
                        {c.notes && <p className="text-xs text-muted-foreground truncate">{c.notes}</p>}
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{c.total_payments || 0} payments</p>
                          <p className="text-xs text-muted-foreground">₱{(c.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteCustomer(c.id)} className="text-red-400 hover:text-red-300 h-8 w-8 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}