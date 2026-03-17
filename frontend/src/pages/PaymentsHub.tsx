import { useState, useEffect } from 'react';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, QrCode, LinkIcon, Plus, Loader2, CheckCircle,
  Copy, ExternalLink, CreditCard, Building2, Smartphone, Store, ShoppingCart, Banknote,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

const TAB_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  qr_code: 'QR Code',
  payment_link: 'Payment Link',
  virtual_account: 'Virtual Account',
  ewallet: 'E-Wallet',
  retail_outlet: 'Retail Outlet',
  card: 'Card',
  paylater: 'PayLater',
  alipay: 'Alipay',
  wechat: 'WeChat',
};

/** Which tabs require which gateway to be configured */
const TAB_GATEWAY: Record<string, 'xendit' | 'photonpay'> = {
  invoice: 'xendit',
  qr_code: 'xendit',
  payment_link: 'xendit',
  virtual_account: 'xendit',
  ewallet: 'xendit',
  retail_outlet: 'xendit',
  card: 'xendit',
  paylater: 'xendit',
  alipay: 'photonpay',
  wechat: 'photonpay',
};

interface GatewayStatus {
  xendit: boolean;
  paymongo: boolean;
  photonpay: boolean;
  any_configured: boolean;
}

/** Extract a user-readable error message from an API error (works for both
 *  AxiosError and plain Error objects returned by client.apiCall.invoke). */
function extractErrorMessage(err: unknown): string {
  if (!err) return 'An unexpected error occurred';
  // AxiosError-style: err.response.data.detail or err.response.data.message
  const axiosErr = err as { response?: { data?: { detail?: string; message?: string; error?: string } } };
  if (axiosErr.response?.data) {
    return (
      axiosErr.response.data.detail ||
      axiosErr.response.data.message ||
      axiosErr.response.data.error ||
      'Request failed'
    );
  }
  // Fallback: err.message
  const errMsg = err as { message?: string };
  if (errMsg.message) return errMsg.message;
  return 'An unexpected error occurred';
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
  const [retailOutlet, setRetailOutlet] = useState('7ELEVEN');
  const [paylaterProvider, setPaylaterProvider] = useState('PH_BILLEASE');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);

  usePaymentEvents({ enabled: !!user });

  // Fetch gateway configuration status on mount
  useEffect(() => {
    client.apiCall.invoke({ url: '/api/v1/gateway/config-status', method: 'GET', data: {} })
      .then((res) => {
        if (res.data) setGatewayStatus(res.data as GatewayStatus);
      })
      .catch(() => {
        // Silently ignore — status check is informational only
      });
  }, []);

  const handleCreate = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (tab === 'retail_outlet' && !customerName.trim()) { toast.error('Customer name is required for retail outlet payments'); return; }
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
        case 'retail_outlet':
          endpoint = '/api/v1/gateway/retail-outlet';
          payload = { amount: amt, channel_code: retailOutlet, customer_name: customerName };
          break;
        case 'card':
          endpoint = '/api/v1/gateway/card-charge';
          payload = { amount: amt, description: description || 'Card payment' };
          break;
        case 'paylater':
          endpoint = '/api/v1/gateway/paylater';
          payload = { amount: amt, channel_code: paylaterProvider };
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

      const res = await client.apiCall.invoke({ url: endpoint, method: 'POST', data: payload });
      if (res.data?.success) {
        setResult(res.data.data || res.data);
        toast.success(res.data.message || 'Payment created!');
      } else {
        toast.error(res.data?.message || res.data?.error || 'Payment creation failed');
      }
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
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
    retail_outlet: { icon: <Store className="h-4 w-4" />, color: 'text-yellow-400' },
    card: { icon: <CreditCard className="h-4 w-4" />, color: 'text-pink-400' },
    paylater: { icon: <ShoppingCart className="h-4 w-4" />, color: 'text-violet-400' },
    alipay: { icon: <QrCode className="h-4 w-4" />, color: 'text-red-400' },
    wechat: { icon: <QrCode className="h-4 w-4" />, color: 'text-green-400' },
  };

  const RETAIL_OUTLETS = [
    ['7ELEVEN', '7-Eleven (CLIQQ)'],
    ['7ELEVEN_CLIQQ', '7-Eleven CLIQQ App'],
    ['CEBUANA', 'Cebuana Lhuillier'],
    ['ECPAY', 'ECPay'],
    ['MLHUILLIER', 'M Lhuillier'],
    ['PALAWAN', 'Palawan Express'],
    ['DP_NONBANK', 'DA5 / Non-bank'],
    ['POSIBLE', 'Posible'],
    ['USSC', 'USSC'],
  ];

  const EWALLET_PROVIDERS = [
    ['PH_GCASH', 'GCash'],
    ['PH_GRABPAY', 'GrabPay'],
    ['PH_PAYMAYA', 'Maya (PayMaya)'],
    ['PH_SHOPEEPAY', 'ShopeePay'],
  ];

  const PAYLATER_PROVIDERS = [
    ['PH_BILLEASE', 'BillEase'],
    ['PH_ATOME', 'Atome'],
  ];

  const VA_BANKS = ['BDO', 'BPI', 'UNIONBANK', 'RCBC', 'CHINABANK', 'PNB', 'EASTWEST', 'LANDBANK', 'METROBANK'];

  const needsDescription = ['invoice', 'qr_code', 'payment_link', 'card', 'alipay', 'wechat'];
  const needsCustomerName = ['invoice', 'payment_link', 'virtual_account', 'retail_outlet'];
  const needsCustomerEmail = ['invoice', 'payment_link'];

  /** True when the current tab's gateway is not configured */
  const currentGatewayMissing =
    gatewayStatus !== null &&
    !gatewayStatus[TAB_GATEWAY[tab] as keyof GatewayStatus];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Payments Hub</h1>
        <p className="text-slate-400 text-sm mb-4">Create payments using all Xendit payment channels</p>

        {/* Gateway configuration warnings */}
        {gatewayStatus && !gatewayStatus.xendit && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 mb-4">
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              <span className="font-medium">Xendit API key not configured.</span>{' '}
              Invoice, QR code, payment link, virtual account, e-wallet, retail outlet, card, and PayLater payments will fail.
              Set <code className="bg-yellow-950/60 px-1 rounded text-xs">XENDIT_SECRET_KEY</code> in your environment variables.
            </p>
          </div>
        )}
        {gatewayStatus && !gatewayStatus.photonpay && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 mb-4">
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              <span className="font-medium">PhotonPay credentials not configured.</span>{' '}
              Alipay and WeChat Pay sessions will fail.
              Set <code className="bg-yellow-950/60 px-1 rounded text-xs">PHOTONPAY_APP_ID</code> and{' '}
              <code className="bg-yellow-950/60 px-1 rounded text-xs">PHOTONPAY_APP_SECRET</code> in your environment variables.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setResult(null); }}>
          <TabsList className="bg-slate-800 border border-slate-700 mb-6 flex-wrap h-auto gap-1 p-1">
            {Object.entries(tabConfig).map(([key, cfg]) => (
              <TabsTrigger key={key} value={key} className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className="ml-2">{TAB_LABELS[key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-[#1E293B] border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <span className={tabConfig[tab]?.color}>{tabConfig[tab]?.icon}</span>
                  Create {TAB_LABELS[tab]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Per-tab gateway warning */}
                {currentGatewayMissing && (
                  <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-300">
                      {TAB_GATEWAY[tab] === 'xendit'
                        ? 'Xendit API key is not configured. This payment method will fail.'
                        : 'PhotonPay credentials are not configured. This payment method will fail.'}
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-slate-300">Amount (PHP)</Label>
                  <Input type="number" step="0.01" min="1" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                </div>

                {needsDescription.includes(tab) && (
                  <div>
                    <Label className="text-slate-300">Description</Label>
                    <Textarea placeholder="Payment description..." value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none" rows={2} />
                  </div>
                )}

                {needsCustomerName.includes(tab) && (
                  <div>
                    <Label className="text-slate-300">
                      Customer Name{tab === 'retail_outlet' ? ' *' : ''}
                    </Label>
                    <Input placeholder="John Doe" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                )}

                {needsCustomerEmail.includes(tab) && (
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
                        {VA_BANKS.map(b => (
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
                          {EWALLET_PROVIDERS.map(([v, l]) => (
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

                {tab === 'retail_outlet' && (
                  <div>
                    <Label className="text-slate-300">Retail Outlet / OTC Channel</Label>
                    <Select value={retailOutlet} onValueChange={setRetailOutlet}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {RETAIL_OUTLETS.map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-white">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Customer pays cash at the selected retail outlet using the generated payment code.</p>
                  </div>
                )}

                {tab === 'paylater' && (
                  <div>
                    <Label className="text-slate-300">PayLater Provider</Label>
                    <Select value={paylaterProvider} onValueChange={setPaylaterProvider}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {PAYLATER_PROVIDERS.map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-white">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Buy Now, Pay Later — customer is redirected to the provider's app to complete payment.</p>
                  </div>
                )}

                {tab === 'card' && (
                  <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3">
                    <p className="text-xs text-slate-400">
                      <span className="text-pink-400 font-medium">🔒 Secure card payment</span> — Customer is redirected to a Xendit-hosted checkout page to enter card details (Visa, Mastercard, JCB, Amex). PCI-compliant.
                    </p>
                  </div>
                )}

                <Button onClick={handleCreate} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create {TAB_LABELS[tab]}</>}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-[#1E293B] border-slate-700/50">
              <CardHeader><CardTitle className="text-white">Result</CardTitle></CardHeader>
              <CardContent>
                {!result ? (
                  <div className="text-center py-12">
                    <Banknote className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Create a payment to see the result</p>
                    <p className="text-slate-500 text-sm mt-2">Payment details and links will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-400 mb-4">
                      <CheckCircle className="h-5 w-5" /><span className="font-medium">Created successfully!</span>
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
                            <button onClick={() => copy(String(value))} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><Copy className="h-3.5 w-3.5" /></button>
                            {isUrl && <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 flex-shrink-0"><ExternalLink className="h-3.5 w-3.5" /></a>}
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
