import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { client } from '@/lib/api';
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

export default function CreatePayment() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'invoice';

  const [paymentType, setPaymentType] = useState(initialType);
  const [amount, setAmount] = useState(searchParams.get('amount') || '');
  const [description, setDescription] = useState(searchParams.get('description') || '');
  const [customerName, setCustomerName] = useState(searchParams.get('customer_name') || '');
  const [customerEmail, setCustomerEmail] = useState(searchParams.get('customer_email') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

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
        endpoint = '/api/v1/xendit/create-invoice';
        payload = { amount: parseFloat(amount), description, customer_name: customerName, customer_email: customerEmail };
      } else if (paymentType === 'qr_code') {
        endpoint = '/api/v1/xendit/create-qr-code';
        payload = { amount: parseFloat(amount), description };
      } else {
        endpoint = '/api/v1/xendit/create-payment-link';
        payload = { amount: parseFloat(amount), description, customer_name: customerName, customer_email: customerEmail };
      }

      const res = await client.apiCall.invoke({
        url: endpoint,
        method: 'POST',
        data: payload,
      });

      if (res.data?.success) {
        setResult(res.data.data);
        toast.success(res.data.message || 'Payment created successfully!');
      } else {
        toast.error(res.data?.message || 'Failed to create payment');
      }
    } catch (err: unknown) {
      const errorMsg = (err as { data?: { detail?: string } })?.data?.detail || 'Failed to create payment';
      toast.error(errorMsg);
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

                  {Object.entries(result).map(([key, value]) => {
                    if (!value) return null;
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
