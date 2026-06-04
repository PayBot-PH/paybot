import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, QrCode, LinkIcon, Plus, Loader2, CheckCircle,
  Copy, ExternalLink, Wallet, CreditCard, Building2, Smartphone,
  Store, Zap, Info, ShieldCheck, ChevronRight, ArrowLeft, History
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmtCurrencyPhp } from '@/lib/format';

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

  const handleCreate = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Please enter a valid amount'); return; }
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.detail || data?.message || `Error ${res.status}`);
      } else if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'Payment created successfully!');
      } else {
        toast.error(data?.message || 'Failed to create payment');
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Internal processing failure');
    } finally {
      setLoading(false);
    }
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success('Copied to clipboard');
  };

  const methods = [
    { id: 'invoice', label: 'E-Invoice', icon: FileText, color: 'blue', desc: 'Email link with all methods' },
    { id: 'qr_code', label: 'QR Code', icon: QrCode, color: 'purple', desc: 'Scan to pay instantly' },
    { id: 'payment_link', label: 'Link', icon: LinkIcon, color: 'cyan', desc: 'Reusable universal link' },
    { id: 'virtual_account', label: 'VA Bank', icon: Building2, color: 'emerald', desc: 'Direct bank transfer' },
    { id: 'ewallet', label: 'E-Wallet', icon: Smartphone, color: 'orange', desc: 'GCash / Maya checkout' },
    { id: 'alipay', label: 'Alipay', icon: Store, color: 'rose', desc: 'Chinese wallet support' },
    { id: 'wechat', label: 'WeChat', icon: Store, color: 'green', desc: 'WeChat Pay support' },
  ];

  const currentMethod = useMemo(() => methods.find(m => m.id === tab) || methods[0], [tab]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Payments Hub</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Generate multi-channel payment orders for your customers</p>
          </div>
          <div className="flex items-center gap-3">
             <Badge className="bg-brand-blue-500/10 text-brand-blue-600 border-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
               <Zap className="h-3 w-3 mr-1.5 inline" /> Live Gateway
             </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Method Selection & Form */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <div className="bg-muted/20 border-b border-border/40 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Select Channel</p>
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => {
                    const Icon = m.icon;
                    const isActive = tab === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setTab(m.id); setResult(null); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all duration-200 border-2 ${
                          isActive
                            ? 'bg-brand-blue-500 border-brand-blue-500 text-white shadow-md shadow-brand-blue-500/20 scale-[1.02]'
                            : 'bg-card border-border/60 text-muted-foreground hover:border-brand-blue-500/40 hover:bg-brand-blue-50/50'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="uppercase tracking-wider">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <CardContent className="pt-8 pb-8 px-8 space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Payment Amount (PHP)</Label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-muted-foreground group-focus-within:text-brand-blue-500 transition-colors">₱</div>
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pl-10 h-16 text-2xl font-black bg-muted/20 border-border/60 focus-visible:ring-brand-blue-500/20 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Order Description</Label>
                    <Textarea
                      placeholder="What is the customer paying for?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-muted/20 border-border/60 min-h-[100px] resize-none focus-visible:ring-brand-blue-500/20 text-sm font-medium"
                    />
                  </div>

                  {/* Contextual Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {(tab === 'invoice' || tab === 'payment_link' || tab === 'virtual_account') && (
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Name</Label>
                        <Input placeholder="Full Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="bg-muted/20 border-border/60 h-11 text-sm font-medium" />
                      </div>
                    )}
                    {(tab === 'invoice' || tab === 'payment_link') && (
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Customer Email</Label>
                        <Input type="email" placeholder="email@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="bg-muted/20 border-border/60 h-11 text-sm font-medium" />
                      </div>
                    )}
                    {tab === 'virtual_account' && (
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Bank</Label>
                        <Select value={bankCode} onValueChange={setBankCode}>
                          <SelectTrigger className="bg-muted/20 border-border/60 h-11 text-sm font-medium"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card">
                            {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB'].map(b => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {tab === 'ewallet' && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Provider</Label>
                          <Select value={ewalletProvider} onValueChange={setEwalletProvider}>
                            <SelectTrigger className="bg-muted/20 border-border/60 h-11 text-sm font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-card">
                              {[['PH_GCASH', 'GCash'], ['PH_MAYA', 'Maya'], ['PH_GRABPAY', 'GrabPay']].map(([v, l]) => (
                                <SelectItem key={v} value={v}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mobile Number</Label>
                          <Input placeholder="09XXXXXXXXX" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="bg-muted/20 border-border/60 h-11 text-sm font-medium" />
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full h-16 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black text-lg rounded-2xl shadow-lg shadow-brand-blue-500/20 transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>PROCESSING...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Plus className="h-6 w-6" />
                        <span>GENERATE {currentMethod.label.toUpperCase()}</span>
                      </div>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="bg-muted/20 rounded-2xl p-5 border border-dashed border-border/60 flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-brand-blue-50 flex items-center justify-center shrink-0 shadow-sm">
                <Info className="h-5 w-5 text-brand-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-foreground uppercase tracking-widest mb-1">Payment Security</p>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Orders are processed via the Maya Secure Gateway. All transactions are PCI-DSS compliant and monitored for fraud in real-time.
                  Users can pay with any major Philippine bank or e-wallet.
                </p>
              </div>
            </div>
          </div>

          {/* Result / Live View */}
          <div className="lg:col-span-5 space-y-6 sticky top-6">
            {!result ? (
              <Card className="border-border/40 bg-muted/10 border-dashed min-h-[500px] flex flex-col items-center justify-center text-center p-10">
                <div className="h-24 w-24 rounded-[2.5rem] bg-muted flex items-center justify-center mb-8 shadow-inner">
                  <Smartphone className="h-12 w-12 text-muted-foreground/20" />
                </div>
                <h3 className="text-xl font-black text-foreground/40 uppercase tracking-tighter">Awaiting Generation</h3>
                <p className="text-xs text-muted-foreground/60 mt-2 max-w-[220px] font-medium leading-relaxed">
                  Fill in the amount and order details to generate a secure checkout link
                </p>
                <div className="mt-12 flex flex-col items-center gap-2 opacity-20">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    <ShieldCheck className="h-4 w-4" />
                    PayBot Secured
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 duration-500">
                <div className="bg-emerald-500 h-2 w-full" />
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-black flex items-center text-emerald-600 uppercase tracking-tight">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Ready to Send
                    </CardTitle>
                    <Badge className="bg-emerald-500 text-white border-0 font-black text-[9px] uppercase tracking-widest px-3">CREATED</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pb-8">
                  <div className="bg-card border border-border/60 rounded-[2rem] p-8 shadow-sm text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Zap className="h-24 w-24" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">Checkout Total</p>
                    <h2 className="text-4xl font-black text-foreground tracking-tight">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                    {description && <p className="text-sm text-muted-foreground mt-4 font-bold italic">"{description}"</p>}

                    <div className="mt-8 pt-8 border-t border-border/40 space-y-6 text-left">
                      {Object.entries(result).map(([key, value]) => {
                        if (!value || key === 'success' || key === 'message') return null;
                        const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

                        return (
                          <div key={key} className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                {key.replace(/_/g, ' ')}
                              </Label>
                              <button onClick={() => copy(String(value))} className="text-[10px] font-black text-brand-blue-500 hover:text-brand-blue-600 transition-colors uppercase tracking-widest flex items-center gap-1">
                                <Copy className="h-3 w-3" /> Copy
                              </button>
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/40 overflow-hidden">
                              {isUrl ? (
                                <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue-600 font-bold truncate underline flex-1">{value as string}</a>
                              ) : (
                                <code className="text-xs text-foreground font-black truncate flex-1 leading-none tabular-nums">{String(value)}</code>
                              )}
                              {isUrl && (
                                <a href={value as string} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-xl bg-brand-blue-500 flex items-center justify-center text-white hover:bg-brand-blue-600 transition-all shrink-0">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <Button
                      className="bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black h-16 rounded-2xl group shadow-lg shadow-brand-blue-500/20 active:scale-95 transition-all"
                      onClick={() => {
                        const url = result.invoice_url || result.payment_link_url || result.checkout_url || result.payment_url;
                        if (url) window.open(url as string, '_blank');
                      }}
                    >
                      <span>GO TO CHECKOUT PAGE</span>
                      <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <Button
                      variant="outline"
                      className="border-border/60 hover:bg-muted font-black h-14 rounded-2xl text-[11px] uppercase tracking-widest transition-all"
                      onClick={() => {
                        setResult(null);
                        setAmount('');
                        setDescription('');
                      }}
                    >
                      <History className="h-4 w-4 mr-2" />
                      Create Another Order
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
