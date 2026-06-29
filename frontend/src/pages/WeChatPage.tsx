import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, CheckCircle, Copy, ExternalLink, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

export default function WeChatPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  if (!user) return null;

  const handleCreate = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/v1/photonpay/wechat-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), description: description || 'WeChat Pay' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.detail || data?.message || `Error ${res.status}`);
      } else if (data?.success) {
        setResult(data.data || data);
        toast.success(data.message || 'WeChat Pay session created!');
      } else {
        toast.error(data?.message || 'Failed to create session');
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success('Copied!'))
      .catch(() => toast.error('Failed to copy'));
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <span className="text-xl">💬</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">WeChat Pay</h1>
            <p className="text-sm text-muted-foreground">Create WeChat Pay QR payment sessions via PhotonPay</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Create WeChat Pay Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                />
              </div>
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <Textarea
                  placeholder="Payment description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={2}
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                  : <><Plus className="h-4 w-4 mr-2" />Create WeChat Pay Session</>}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Result</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="text-center py-12">
                  <CreditCard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Create a session to see the result</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400 mb-4">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Session Created!</span>
                  </div>
                  {Object.entries(result).map(([key, value]) => {
                    if (!value || key === 'success') return null;
                    const isUrl = typeof value === 'string' && value.startsWith('http');
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
                          <button onClick={() => copy(String(value))} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {isUrl && (
                            <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
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

        <Card className="bg-card border-border mt-6">
          <CardHeader>
            <CardTitle className="text-foreground text-sm">Telegram Bot Command</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-sm text-muted-foreground font-mono bg-muted px-3 py-2 rounded block">
              /wechat [amount] [description]
            </code>
            <p className="text-xs text-muted-foreground mt-2">
              Example: <span className="font-mono">/wechat 500 Order payment</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
