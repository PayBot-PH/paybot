import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, QrCode, LinkIcon, Bot, BarChart3, Plus, Loader2, CheckCircle,
  Copy, ExternalLink, Wallet, CreditCard, Building2, Smartphone, Store,
} from 'lucide-react';
import { toast } from 'sonner';

const NAV = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments', active: true },
  { to: '/transactions', icon: FileText, label: 'Transactions' },
  { to: '/disbursements', icon: Building2, label: 'Disbursements' },
  { to: '/bot-settings', icon: Bot, label: 'Bot' },
];

function NavHeader() {
  return (
    <header className="border-b border-slate-700/50 bg-[#0F172A]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">PayBot</span>
          </Link>
          <nav className="flex items-center space-x-1">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}>
                <Button variant="ghost" size="sm" className={n.active ? 'text-white bg-slate-700/50' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}>
                  <n.icon className="h-4 w-4 mr-2" />
                  {n.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

export default function PaymentsHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState('invoice');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [bankCode, setBankCode] = useState('BDO');
  const [ewalletProvider, setEwalletProvider] = useState('PH_GCASH');
  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  usePaymentEvents({ enabled: !!user });

  const reset = () => { setAmount(''); setDescription(''); setCustomerName(''); setCustomerEmail(''); setResult(null); };

  const handleCreate = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    setResult(null);
    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};
      const amt = parseFloat(amount);

      switch (tab) {
        case 'invoice':
          endpoint = '/api/v1/xendit/create-invoice';
          payload = { amount: amt, description, customer_name: customerName, customer_email: customerEmail };
          break;
        case 'qr_code':
          endpoint = '/api/v1/xendit/create-qr-code';
          payload = { amount: amt, description };
          break;
        case 'payment_link':
          endpoint = '/api/v1/xendit/create-payment-link';
          payload = { amount: amt, description, customer_name: customerName, customer_email: customerEmail };
          break;
        case 'virtual_account':
          endpoint = '/api/v1/gateway/virtual-account';
          payload = { amount: amt, bank_code: bankCode, name: customerName || 'Customer' };
          break;
        case 'ewallet':
          endpoint = '/api/v1/gateway/ewallet-charge';
          payload = { amount: amt, channel_code: ewalletProvider, mobile_number: mobileNumber };
          break;
      }

      const res = await client.apiCall.invoke({ url: endpoint, method: 'POST', data: payload });
      if (res.data?.success) {
        setResult(res.data.data || res.data);
        toast.success(res.data.message || 'Payment created!');
      } else {
        toast.error(res.data?.message || 'Failed');
      }
    } catch (err: unknown) {
      toast.error((err as { data?: { detail?: string } })?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copied!'); };

  const tabConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    invoice: { icon: <FileText className="h-4 w-4" />, color: 'text-blue-400' },
    qr_code: { icon: <QrCode className="h-4 w-4" />, color: 'text-purple-400' },
    payment_link: { icon: <LinkIcon className="h-4 w-4" />, color: 'text-cyan-400' },
    virtual_account: { icon: <Building2 className="h-4 w-4" />, color: 'text-emerald-400' },
    ewallet: { icon: <Smartphone className="h-4 w-4" />, color: 'text-orange-400' },
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      <NavHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Payments Hub</h1>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setResult(null); }}>
          <TabsList className="bg-slate-800 border border-slate-700 mb-6 flex-wrap h-auto gap-1 p-1">
            {Object.entries(tabConfig).map(([key, cfg]) => (
              <TabsTrigger key={key} value={key} className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className="ml-2 capitalize">{key.replace('_', ' ')}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[#1E293B] border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white">Create {tab.replace('_', ' ')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-slate-300">Amount (PHP)</Label>
                  <Input type="number" step="0.01" min="1" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                </div>

                {(tab === 'invoice' || tab === 'qr_code' || tab === 'payment_link') && (
                  <div>
                    <Label className="text-slate-300">Description</Label>
                    <Textarea placeholder="Payment description..." value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none" rows={2} />
                  </div>
                )}

                {(tab === 'invoice' || tab === 'payment_link' || tab === 'virtual_account') && (
                  <div>
                    <Label className="text-slate-300">Customer Name</Label>
                    <Input placeholder="John Doe" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                )}

                {(tab === 'invoice' || tab === 'payment_link') && (
                  <div>
                    <Label className="text-slate-300">Customer Email</Label>
                    <Input type="email" placeholder="john@example.com" value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                )}

                {tab === 'virtual_account' && (
                  <div>
                    <Label className="text-slate-300">Bank</Label>
                    <Select value={bankCode} onValueChange={setBankCode}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB'].map(b => (
                          <SelectItem key={b} value={b} className="text-white">{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {tab === 'ewallet' && (
                  <>
                    <div>
                      <Label className="text-slate-300">E-Wallet Provider</Label>
                      <Select value={ewalletProvider} onValueChange={setEwalletProvider}>
                        <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-600">
                          {[['PH_GCASH', 'GCash'], ['PH_GRABPAY', 'GrabPay'], ['PH_PAYMAYA', 'PayMaya']].map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-white">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300">Mobile Number (optional)</Label>
                      <Input placeholder="+639XXXXXXXXX" value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                    </div>
                  </>
                )}

                <Button onClick={handleCreate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create</>}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-[#1E293B] border-slate-700/50">
              <CardHeader><CardTitle className="text-white">Result</CardTitle></CardHeader>
              <CardContent>
                {!result ? (
                  <div className="text-center py-12">
                    <CreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Create a payment to see the result</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-400 mb-4">
                      <CheckCircle className="h-5 w-5" /><span className="font-medium">Created!</span>
                    </div>
                    {Object.entries(result).map(([key, value]) => {
                      if (!value || key === 'success') return null;
                      const isUrl = typeof value === 'string' && value.startsWith('http');
                      return (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</Label>
                          <div className="flex items-center space-x-2">
                            {isUrl ? (
                              <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline break-all flex-1">{value as string}</a>
                            ) : (
                              <code className="text-sm text-white font-mono bg-slate-800 px-2 py-1 rounded break-all flex-1">{String(value)}</code>
                            )}
                            <button onClick={() => copy(String(value))} className="text-slate-500 hover:text-slate-300"><Copy className="h-3.5 w-3.5" /></button>
                            {isUrl && <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300"><ExternalLink className="h-3.5 w-3.5" /></a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Tabs>
      </main>
    </div>
  );
}