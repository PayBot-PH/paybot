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
      <div className="max-w-7xl mx-auto pb-16 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase">Merchant Terminal</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Secure Multi-Channel Hub</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="fintech-badge bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-6 py-2.5 backdrop-blur-md">
               <Zap className="h-4 w-4 mr-2 inline animate-pulse" /> NETWORK ACTIVE
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Method Selection & Form */}
          <div className="lg:col-span-7 space-y-10">
            <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
              <div className="bg-[#0A0F1E] border-b border-white/5 p-8">
                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60 mb-6 ml-1">Transmission Protocol</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {methods.map((m) => {
                    const Icon = m.icon;
                    const isActive = tab === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setTab(m.id); setResult(null); }}
                        className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl text-[10px] font-black transition-all duration-500 border-2 ${
                          isActive
                            ? 'bg-brandblue-500 border-brandblue-500 text-white shadow-xl shadow-brandblue-500/40 scale-105'
                            : 'bg-white/5 border-white/5 text-white/40 hover:border-white/10 hover:bg-white/[0.08] hover:text-white/60'
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${isActive ? 'text-white' : 'text-white/60'}`} />
                        <span className="uppercase tracking-widest">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <CardContent className="p-10 space-y-10">
                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-1">
                       <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Payment Amount (PHP)</Label>
                       <span className="text-[9px] font-black text-brandblue-500 uppercase tracking-widest bg-brandblue-500/5 px-2 py-0.5 rounded">T+0 Priority</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-brand-blue-500 group-focus-within:scale-110 transition-transform">₱</div>
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pl-12 h-24 text-4xl font-black bg-muted/20 border-border/40 rounded-3xl tabular-nums focus:ring-brandblue-500/10 transition-all border-2"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Order Specification</Label>
                    <Textarea
                      placeholder="Transaction details, product IDs, or memo..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-muted/20 border-border/40 min-h-[140px] rounded-[2rem] resize-none focus:ring-brandblue-500/10 text-base font-black uppercase tracking-tight p-8 border-2"
                    />
                  </div>

                  {/* Contextual Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-2 duration-500">
                    {(tab === 'invoice' || tab === 'payment_link' || tab === 'virtual_account') && (
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Beneficiary Name</Label>
                        <Input placeholder="Full Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="bg-muted/20 border-border/40 h-16 rounded-2xl px-6 text-sm font-black uppercase tracking-widest border-2" />
                      </div>
                    )}
                    {(tab === 'invoice' || tab === 'payment_link') && (
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transmission Email</Label>
                        <Input type="email" placeholder="customer@domain.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="bg-muted/20 border-border/40 h-16 rounded-2xl px-6 text-sm font-black border-2" />
                      </div>
                    )}
                    {tab === 'virtual_account' && (
                      <div className="space-y-4">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Node Target Bank</Label>
                        <Select value={bankCode} onValueChange={setBankCode}>
                          <SelectTrigger className="bg-muted/20 border-border/40 h-16 rounded-2xl px-6 font-black uppercase text-[11px] tracking-widest border-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2">
                            {['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB'].map(b => (
                              <SelectItem key={b} value={b} className="py-3 font-black rounded-xl mb-1">{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {tab === 'ewallet' && (
                      <>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Channel Provider</Label>
                          <Select value={ewalletProvider} onValueChange={setEwalletProvider}>
                            <SelectTrigger className="bg-muted/20 border-border/40 h-16 rounded-2xl px-6 font-black uppercase text-[11px] tracking-widest border-2"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2">
                              {[['PH_GCASH', 'GCash'], ['PH_MAYA', 'Maya'], ['PH_GRABPAY', 'GrabPay']].map(([v, l]) => (
                                <SelectItem key={v} value={v} className="py-3 font-black rounded-xl mb-1">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Identity (Mobile)</Label>
                          <Input placeholder="09XXXXXXXXX" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="bg-muted/20 border-border/40 h-16 rounded-2xl px-6 font-black tracking-widest border-2" />
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black text-lg rounded-[2rem] shadow-2xl shadow-brandblue-500/30 transition-all active:scale-95 uppercase tracking-[0.4em]"
                  >
                    {loading ? (
                      <div className="flex items-center gap-4">
                        <Loader2 className="h-7 w-7 animate-spin" />
                        <span>PROCESSING...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <Plus className="h-7 w-7" />
                        <span>DEPLOY {currentMethod.label}</span>
                      </div>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="bg-[#0A0F1E] rounded-[2.5rem] p-8 border border-white/5 flex items-start gap-6 shadow-xl group">
              <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-brandblue-500 transition-colors duration-500">
                <ShieldCheck className="h-7 w-7 text-brandblue-400 group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Institutional Compliance</p>
                <p className="text-xs text-white/40 leading-relaxed font-medium uppercase tracking-tight">
                  Transactions are routed through the Maya PCI-DSS verified production cluster. Real-time AML monitoring and fraud prevention protocols are active across all regional nodes.
                </p>
              </div>
            </div>
          </div>

          {/* Result / Live View */}
          <div className="lg:col-span-5 space-y-8 sticky top-10">
            {!result ? (
              <div className="fintech-card border-dashed border-2 border-border/60 min-h-[600px] flex flex-col items-center justify-center text-center p-12 bg-muted/5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-muted/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <div className="h-28 w-28 rounded-[2.5rem] bg-muted/20 flex items-center justify-center mb-10 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-700">
                  <Smartphone className="h-14 w-14 text-muted-foreground/20 group-hover:text-brandblue-500/20 transition-colors" />
                </div>
                <h2 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter mb-4">Awaiting Signal</h2>
                <p className="text-[11px] text-muted-foreground/60 max-w-[280px] font-black uppercase tracking-[0.3em] leading-relaxed">
                  Configure channel parameters to generate encrypted network assets
                </p>

                <div className="mt-16 pt-10 border-t border-border/10 w-full flex flex-col items-center gap-4 opacity-20 group-hover:opacity-40 transition-opacity">
                   <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-brandblue-500" />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em]">Node-Secured</span>
                   </div>
                   <div className="flex gap-2">
                      <div className="h-1 w-1 rounded-full bg-brandblue-500" />
                      <div className="h-1 w-1 rounded-full bg-brandblue-500 opacity-50" />
                      <div className="h-1 w-1 rounded-full bg-brandblue-500 opacity-20" />
                   </div>
                </div>
              </div>
            ) : (
              <Card className="fintech-card border-0 bg-[#0A0F1E] shadow-[0_40px_80px_rgba(0,0,0,0.4)] overflow-hidden animate-in zoom-in-95 duration-700">
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2.5 w-full shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                <CardHeader className="p-10 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-black flex items-center text-emerald-400 uppercase tracking-tight">
                      <CheckCircle className="h-6 w-6 mr-3" />
                      Protocol Emitted
                    </CardTitle>
                    <div className="bg-white/5 text-white/60 px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest border border-white/10">ASSET_READY</div>
                  </div>
                </CardHeader>
                <CardContent className="p-10 space-y-10">
                  <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 text-center relative overflow-hidden group/res">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Zap className="h-32 w-32 text-white" /></div>
                    <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em] mb-4">Transmission Value</p>
                    <h2 className="text-5xl font-black text-white tracking-tighter tabular-nums">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                    {description && <p className="text-xs text-white/40 mt-6 font-black uppercase tracking-widest italic leading-relaxed">"{description}"</p>}

                    <div className="mt-10 pt-10 border-t border-white/5 space-y-8 text-left">
                      {/* QR Code Display if available in result */}
                      {(() => {
                        const qr = (result.qr_string || (result.data as any)?.qr_string) as string | undefined;
                        if (!qr) return null;
                        return (
                          <div className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] mb-4 shadow-inner">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`}
                              alt="Payment QR"
                              className="w-48 h-48"
                            />
                            <p className="mt-4 text-[10px] font-black text-black/30 uppercase tracking-[0.3em] text-center">Scan with any QRPH application</p>
                          </div>
                        );
                      })()}

                      {Object.entries(result.data && typeof result.data === 'object' ? { ...result, ...(result.data as object) } : result).map(([key, value]) => {
                        if (!value || key === 'success' || key === 'message' || key === 'data') return null;
                        const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

                        return (
                          <div key={key} className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <Label className="text-[10px] font-black text-white/60 uppercase tracking-[0.4em]">
                                {key.replace(/_/g, ' ')}
                              </Label>
                              <button onClick={() => copy(String(value))} className="text-[10px] font-black text-brandblue-400 hover:text-white transition-colors uppercase tracking-[0.2em] flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg">
                                <Copy className="h-3 w-3" /> COPY
                              </button>
                            </div>

                            <div className="flex items-center gap-4 p-5 bg-black/40 rounded-2xl border border-white/5 overflow-hidden group/field">
                              {isUrl ? (
                                <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-xs text-brandblue-400 font-bold truncate underline flex-1 hover:text-white transition-colors">{value as string}</a>
                              ) : (
                                <code className="text-sm text-white/90 font-black truncate flex-1 leading-none tabular-nums tracking-widest">{String(value)}</code>
                              )}
                              {isUrl && (
                                <a href={value as string} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-xl bg-brandblue-500 flex items-center justify-center text-white hover:bg-brandblue-400 hover:scale-110 transition-all shrink-0 shadow-lg shadow-brandblue-500/30">
                                  <ExternalLink className="h-5 w-5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    {(() => {
                      const url = (result.invoice_url || result.payment_link_url || result.checkout_url || result.payment_url || (result.data as any)?.checkout_url) as string | undefined;
                      if (!url) return null;
                      return (
                        <Button
                          className="bg-brandblue-600 hover:bg-brandblue-700 text-white font-black h-20 rounded-[1.5rem] group shadow-2xl shadow-brandblue-500/20 active:scale-95 transition-all text-sm tracking-[0.2em]"
                          onClick={() => window.open(url, '_blank')}
                        >
                          <span>INITIATE GATEWAY ACCESS</span>
                          <ChevronRight className="ml-3 h-6 w-6 group-hover:translate-x-1.5 transition-transform" />
                        </Button>
                      );
                    })()}
                    <Button
                      variant="ghost"
                      className="text-white/40 hover:text-white hover:bg-white/5 font-black h-16 rounded-[1.5rem] text-[11px] uppercase tracking-[0.4em] transition-all border border-white/5"
                      onClick={() => {
                        setResult(null);
                        setAmount('');
                        setDescription('');
                      }}
                    >
                      <History className="h-5 w-5 mr-3" />
                      NEW REQUISITION
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
