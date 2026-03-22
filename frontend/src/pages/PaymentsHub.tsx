import { useState, useEffect, useCallback } from 'react';
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
  FileText, QrCode, LinkIcon, Plus, Loader2, CheckCircle,
  Copy, ExternalLink, Wallet, CreditCard, Building2, Smartphone, Store,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

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
        case 'alipay':
          endpoint = '/api/v1/photonpay/alipay-session';
          payload = { amount: amt, description: description || 'Alipay payment' };
          break;
        case 'wechat':
          endpoint = '/api/v1/photonpay/wechat-session';
          payload = { amount: amt, description: description || 'WeChat Pay' };
          break;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.detail || data?.message || `Error ${res.status}`);
      } else if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'Payment created!');
      } else {
        toast.error(data?.message || 'Failed');
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed');
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
    alipay: { icon: <QrCode className="h-4 w-4" />, color: 'text-red-400' },
    wechat: { icon: <QrCode className="h-4 w-4" />, color: 'text-green-400' },
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Payments Hub</h1>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setResult(null); }}>
          <TabsList className="bg-muted border border-slate-700 mb-6 flex-wrap h-auto gap-1 p-1">
            {Object.entries(tabConfig).map(([key, cfg]) => (
              <TabsTrigger key={key} value={key} className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-muted-foreground">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className="ml-2 capitalize">{key.replace(/_/g, ' ').replace('alipay', 'Alipay').replace('wechat', 'WeChat')}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  Create {tab.replace(/_/g, ' ').replace('alipay', 'Alipay').replace('wechat', 'WeChat')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-slate-300">Amount (PHP)</Label>
                  <Input type="number" step="0.01" min="1" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 bg-muted border-slate-600 text-white placeholder:text-muted-foreground" />
                </div>

                {(tab === 'invoice' || tab === 'qr_code' || tab === 'payment_link' || tab === 'alipay' || tab === 'wechat') && (
                  <div>
                    <Label className="text-slate-300">Description</Label>
                    <Textarea placeholder="Payment description..." value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="mt-1 bg-muted border-slate-600 text-white placeholder:text-muted-foreground resize-none" rows={2} />
                  </div>
                )}

                {(tab === 'invoice' || tab === 'payment_link' || tab === 'virtual_account') && (
                  <div>
                    <Label className="text-slate-300">Customer Name</Label>
                    <Input placeholder="John Doe" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 bg-muted border-slate-600 text-white placeholder:text-muted-foreground" />
                  </div>
                )}

                {(tab === 'invoice' || tab === 'payment_link') && (
                  <div>
                    <Label className="text-slate-300">Customer Email</Label>
                    <Input type="email" placeholder="john@example.com" value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1 bg-muted border-slate-600 text-white placeholder:text-muted-foreground" />
                  </div>
                )}

                {tab === 'virtual_account' && (
                  <div>
                    <Label className="text-slate-300">Bank</Label>
                    <Select value={bankCode} onValueChange={setBankCode}>
                      <SelectTrigger className="mt-1 bg-muted border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-slate-600">
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
                        <SelectTrigger className="mt-1 bg-muted border-slate-600 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-muted border-slate-600">
                          {[['PH_GCASH', 'GCash'], ['PH_GRABPAY', 'GrabPay']].map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-white">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300">Mobile Number (optional)</Label>
                      <Input placeholder="+639XXXXXXXXX" value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        className="mt-1 bg-muted border-slate-600 text-white placeholder:text-muted-foreground" />
                    </div>
                  </>
                )}

                <Button onClick={handleCreate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create</>}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-white">Result</CardTitle></CardHeader>
              <CardContent>
                {!result ? (
                  <div className="text-center py-12">
                    <CreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-muted-foreground">Create a payment to see the result</p>
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
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">{key.replace(/_/g, ' ')}</Label>
                          <div className="flex items-center space-x-2">
                            {isUrl ? (
                              <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline break-all flex-1">{value as string}</a>
                            ) : (
                              <code className="text-sm text-white font-mono bg-muted px-2 py-1 rounded break-all flex-1">{String(value)}</code>
                            )}
                            <button onClick={() => copy(String(value))} className="text-muted-foreground hover:text-slate-300"><Copy className="h-3.5 w-3.5" /></button>
                            {isUrl && <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-slate-300"><ExternalLink className="h-3.5 w-3.5" /></a>}
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
      </div>
    </Layout>
  );
}
