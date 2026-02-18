import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  Bot,
  BarChart3,
  Plus,
  Loader2,
  CheckCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CreatePayment() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'invoice';

  const [paymentType, setPaymentType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
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
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-[#0F172A]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link to="/" className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">PayBot</span>
              </Link>
            </div>
            <nav className="flex items-center space-x-1">
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link to="/transactions">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <FileText className="h-4 w-4 mr-2" />
                  Transactions
                </Button>
              </Link>
              <Link to="/create-payment">
                <Button variant="ghost" size="sm" className="text-white bg-slate-700/50">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </Link>
              <Link to="/bot-settings">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <Bot className="h-4 w-4 mr-2" />
                  Bot
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Create Payment</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <div className={`h-8 w-8 ${currentType.bg} rounded-lg flex items-center justify-center ${currentType.color}`}>
                  {currentType.icon}
                </div>
                <span>Payment Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-slate-300">Payment Type</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="invoice" className="text-white">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-blue-400" />
                          <span>Invoice</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="qr_code" className="text-white">
                        <div className="flex items-center space-x-2">
                          <QrCode className="h-4 w-4 text-purple-400" />
                          <span>QR Code</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="payment_link" className="text-white">
                        <div className="flex items-center space-x-2">
                          <LinkIcon className="h-4 w-4 text-cyan-400" />
                          <span>Payment Link</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300">Amount (PHP)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    required
                  />
                </div>

                <div>
                  <Label className="text-slate-300">Description</Label>
                  <Textarea
                    placeholder="Payment description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                    rows={3}
                  />
                </div>

                {paymentType !== 'qr_code' && (
                  <>
                    <div>
                      <Label className="text-slate-300">Customer Name</Label>
                      <Input
                        placeholder="John Doe"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Customer Email</Label>
                      <Input
                        type="email"
                        placeholder="john@example.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
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
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Result</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="text-center py-12">
                  <div className="h-16 w-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-slate-500" />
                  </div>
                  <p className="text-slate-400">Create a payment to see the result here</p>
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
                        <Label className="text-xs text-slate-400 uppercase tracking-wider">
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
                            <code className="text-sm text-white font-mono bg-slate-800 px-2 py-1 rounded break-all flex-1">
                              {String(value)}
                            </code>
                          )}
                          <button
                            onClick={() => copyToClipboard(String(value))}
                            className="text-slate-500 hover:text-slate-300 flex-shrink-0"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {isUrl && (
                            <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 flex-shrink-0">
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
      </main>
    </div>
  );
}