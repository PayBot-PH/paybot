import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  QrCode,
  LinkIcon,
  Plus,
  Loader2,
  CheckCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

const METHOD_OPTIONS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'jcb', label: 'JCB' },
  { value: 'amex', label: 'Amex' },
  { value: 'unionpay', label: 'UnionPay' },
  { value: 'apple_pay', label: 'Apple Pay' },
  { value: 'google_pay', label: 'Google Pay' },
  { value: 'gcash', label: 'GCash' },
  { value: 'grabpay', label: 'GrabPay' },
  { value: 'maya', label: 'Maya' },
  { value: 'alipay', label: 'Alipay' },
  { value: 'wechat_pay', label: 'WeChat Pay' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'instapay', label: 'InstaPay' },
  { value: 'pesonet', label: 'PESONet' },
  { value: 'qrph', label: 'QRPH' },
  { value: 'paypal', label: 'PayPal' },
] as const;

const QR_METHODS = new Set(['qrph', 'maya', 'gcash', 'grabpay', 'alipay', 'wechat_pay']);

export default function CreatePayment() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'invoice';

  const [paymentType, setPaymentType] = useState(initialType);
  const [amount, setAmount] = useState(searchParams.get('amount') || '');
  const [description, setDescription] = useState(searchParams.get('description') || '');
  const [descriptor, setDescriptor] = useState(searchParams.get('descriptor') || '');
  const [merchantName, setMerchantName] = useState(searchParams.get('merchant_name') || '');
  const [customerName, setCustomerName] = useState(searchParams.get('customer_name') || '');
  const [customerEmail, setCustomerEmail] = useState(searchParams.get('customer_email') || '');
  const [apiKey, setApiKey] = useState(localStorage.getItem('payment_api_key') || '');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(
    (searchParams.get('payment_methods') || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const visibleMethods = useMemo(
    () => METHOD_OPTIONS.filter((m) => (paymentType === 'qr_code' ? QR_METHODS.has(m.value) : true)),
    [paymentType]
  );

  useEffect(() => {
    const allowed = new Set(visibleMethods.map((m) => m.value));
    setPaymentMethods((prev) => prev.filter((m) => allowed.has(m)));
  }, [visibleMethods]);

  useEffect(() => {
    if (apiKey.trim()) {
      localStorage.setItem('payment_api_key', apiKey.trim());
    }
  }, [apiKey]);

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      let endpoint = '';
      let payload: Record<string, unknown> = {};

      if (paymentType === 'invoice') {
        endpoint = '/api/v1/xend/create-invoice';
        payload = { amount: parseFloat(amount), description, descriptor: descriptor.trim() || undefined, merchant_name: merchantName.trim() || undefined, customer_name: customerName, customer_email: customerEmail, payment_methods: paymentMethods };
      } else if (paymentType === 'qr_code') {
        endpoint = '/api/v1/xend/create-qr-code';
        payload = { amount: parseFloat(amount), description, descriptor: descriptor.trim() || undefined, merchant_name: merchantName.trim() || undefined, payment_methods: paymentMethods };
      } else {
        endpoint = '/api/v1/xend/create-payment-link';
        payload = { amount: parseFloat(amount), description, descriptor: descriptor.trim() || undefined, merchant_name: merchantName.trim() || undefined, customer_name: customerName, customer_email: customerEmail, payment_methods: paymentMethods };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('auth_token') ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } : {}),
          ...(apiKey.trim() ? { 'X-API-Key': apiKey.trim() } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const responseData = data?.data ?? data;

      if (!res.ok) {
        toast.error(data?.detail || data?.message || `Error ${res.status}`);
      } else if (data?.success) {
        setResult(responseData);
        toast.success(data.message || 'Payment created successfully!');
      } else {
        toast.error(data?.message || 'Failed to create payment');
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const typeConfig = {
    invoice: { icon: <FileText className="h-5 w-5" />, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    qr_code: { icon: <QrCode className="h-5 w-5" />, color: 'text-purple-400', bg: 'bg-purple-500/20' },
    payment_link: { icon: <LinkIcon className="h-5 w-5" />, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  };

  const currentType = typeConfig[paymentType as keyof typeof typeConfig] || typeConfig.invoice;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Create Payment</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center space-x-2">
                <div className={`h-8 w-8 ${currentType.bg} rounded-lg flex items-center justify-center ${currentType.color}`}>
                  {currentType.icon}
                </div>
                <span>Payment Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Payment Type</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-muted border-border">
                      <SelectItem value="invoice" className="text-foreground">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-blue-400" />
                          <span>Invoice</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="qr_code" className="text-foreground">
                        <div className="flex items-center space-x-2">
                          <QrCode className="h-4 w-4 text-purple-400" />
                          <span>QR Code</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="payment_link" className="text-foreground">
                        <div className="flex items-center space-x-2">
                          <LinkIcon className="h-4 w-4 text-cyan-400" />
                          <span>Payment Link</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-muted-foreground">Amount (PHP)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>

                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <Textarea
                    placeholder="Payment description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <Label className="text-muted-foreground">Payment Methods ({paymentMethods.length} selected)</Label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {visibleMethods.map((method) => {
                      const selected = paymentMethods.includes(method.value);
                      return (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => togglePaymentMethod(method.value)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs text-left transition-smooth ${
                            selected
                              ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                              : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {method.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select which payment methods to offer. Leave unselected to allow all gateway-supported methods.
                  </p>
                </div>

                <div>
                  <Label className="text-muted-foreground">API Key (optional)</Label>
                  <Input
                    placeholder="sk_live_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">If provided, requests include an <code>X-API-Key</code> header. Generate keys in Developer Tools.</p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Merchant Name</Label>
                  <Input
                    placeholder="e.g. Click Store"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Shown to payer on checkout page
                  </p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Bank Descriptor</Label>
                  <Input
                    placeholder="e.g. CLICK STORE PH"
                    value={descriptor}
                    onChange={(e) => setDescriptor(e.target.value.slice(0, 22))}
                    maxLength={22}
                    className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Shown on payer&apos;s bank statement · {descriptor.length}/22 chars
                  </p>
                </div>

                {paymentType !== 'qr_code' && (
                  <>
                    <div>
                      <Label className="text-muted-foreground">Customer Name</Label>
                      <Input
                        placeholder="John Doe"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Customer Email</Label>
                      <Input
                        type="email"
                        placeholder="john@example.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create {paymentType === 'qr_code' ? 'QR Code' : paymentType === 'payment_link' ? 'Payment Link' : 'Invoice'}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Result */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Result</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="text-center py-12">
                  <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">Create a payment to see the result here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-emerald-400 mb-4">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Payment Created!</span>
                  </div>

                  {Object.entries(result)
                    .filter(([key, value]) => value != null && key !== 'success' && key !== 'message')
                    .map(([key, value]) => {
                      const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));
                      return (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            {key.replace(/_/g, ' ')}
                          </Label>
                          <div className="flex items-center space-x-2">
                            {isUrl ? (
                              <a
                                href={value as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-400 hover:text-blue-300 underline break-all flex-1"
                              >
                                {value as string}
                              </a>
                            ) : (
                              <code className="text-sm text-foreground font-mono bg-muted px-2 py-1 rounded break-all flex-1">
                                {String(value)}
                              </code>
                            )}
                            <button
                              onClick={() => copyToClipboard(String(value))}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {isUrl && (
                              <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground flex-shrink-0">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
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
    </Layout>
  );
}
