import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  BarChart3,
  FileText,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  Webhook,
  Info,
  Zap,
  Radio,
  FlaskConical,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

interface TestCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface WebhookInfo {
  webhook_url: string;
  is_registered: boolean;
  pending_update_count: number;
  last_error_message: string;
  message: string;
  token_configured: boolean;
}

export default function BotSettings() {
  const { user, login } = useAuth();
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [chatId, setChatId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Simulate webhook state
  const [simType, setSimType] = useState('invoice');
  const [simStatus, setSimStatus] = useState('paid');
  const [simAmount, setSimAmount] = useState('1000');
  const [simDescription, setSimDescription] = useState('');
  const [simLoading, setSimLoading] = useState(false);

  // Bot connectivity test state
  const [testChecks, setTestChecks] = useState<TestCheck[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testRan, setTestRan] = useState(false);

  // Webhook status state
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [webhookInfoLoading, setWebhookInfoLoading] = useState(false);
  const [autoSetupLoading, setAutoSetupLoading] = useState(false);

  const getErrorDetail = (error: unknown): string => {
    const err = error as { data?: { detail?: string; message?: string }; response?: { data?: { detail?: string } }; message?: string };
    return err?.data?.detail || err?.data?.message || err?.response?.data?.detail || err?.message || 'Unknown error';
  };

  const is401Error = (err: unknown): boolean => {
    const e = err as { status?: number; response?: { status?: number }; data?: { detail?: string } };
    return e?.status === 401 || e?.response?.status === 401 ||
      (typeof e?.data?.detail === 'string' && e.data.detail.toLowerCase().includes('unauthorized'));
  };

  const fetchBotInfo = async () => {
    setBotLoading(true);
    setBotError('');
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/bot-info',
        method: 'GET',
        data: {},
      });
      if (res.data?.success) {
        setBotInfo(res.data.data as BotInfo);
        setBotError('');
      } else {
        const msg = res.data?.message || 'Failed to get bot info';
        setBotError(msg);
        toast.error(msg);
      }
    } catch (err: unknown) {
      if (is401Error(err)) {
        setBotError('Authentication required. Please log in first.');
      } else {
        const errorMsg = getErrorDetail(err);
        console.error('Failed to get bot info:', errorMsg);
        setBotError(errorMsg);
        toast.error(`Bot connection failed: ${errorMsg}`);
      }
    } finally {
      setBotLoading(false);
    }
  };

  useEffect(() => {
    fetchBotInfo();
  }, []);

  const handleSetWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Please enter a webhook URL');
      return;
    }
    setWebhookLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/setup-webhook',
        method: 'POST',
        data: { webhook_url: webhookUrl },
      });
      if (res.data?.success) {
        toast.success('Webhook configured successfully!');
      } else {
        toast.error(res.data?.message || 'Failed to set webhook');
      }
    } catch (err: unknown) {
      if (is401Error(err)) {
        toast.error('Please log in first to set the webhook.');
      } else {
        const errorMsg = getErrorDetail(err);
        toast.error(errorMsg);
      }
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatId || !testMessage) {
      toast.error('Please enter both chat ID and message');
      return;
    }
    setSendLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/send-message',
        method: 'POST',
        data: { chat_id: chatId, message: testMessage },
      });
      if (res.data?.success) {
        toast.success('Message sent successfully!');
        setTestMessage('');
      } else {
        toast.error(res.data?.message || 'Failed to send message');
      }
    } catch (err: unknown) {
      if (is401Error(err)) {
        toast.error('Please log in first to send messages.');
      } else {
        const errorMsg = getErrorDetail(err);
        toast.error(errorMsg);
      }
    } finally {
      setSendLoading(false);
    }
  };

  const handleSimulateWebhook = async () => {
    const amount = parseFloat(simAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setSimLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/events/simulate',
        method: 'POST',
        data: {
          transaction_type: simType,
          status: simStatus,
          amount,
          description: simDescription,
        },
      });
      if (res.data?.success) {
        toast.success(`Test event sent! Check Dashboard & Transactions for real-time update.`, {
          description: `${simType.replace('_', ' ')} → ${simStatus.toUpperCase()} (₱${amount.toLocaleString()})`,
          duration: 5000,
        });
      } else {
        toast.error('Failed to simulate webhook');
      }
    } catch (err: unknown) {
      if (is401Error(err)) {
        toast.error('Please log in first to simulate webhooks.');
      } else {
        const errorMsg = getErrorDetail(err);
        toast.error(errorMsg);
      }
    } finally {
      setSimLoading(false);
    }
  };

  const handleTestBot = async () => {
    setTestLoading(true);
    setTestChecks([]);
    setTestRan(false);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/test',
        method: 'GET',
        data: {},
      });
      const data = res.data as { success?: boolean; checks?: TestCheck[] };
      if (Array.isArray(data?.checks)) {
        setTestChecks(data.checks);
        setTestRan(true);
        if (data.success) {
          toast.success('Bot is working correctly!');
        } else {
          toast.error('Some checks failed — see results below.');
        }
      } else {
        toast.error('Unexpected response from server');
      }
    } catch (err: unknown) {
      const errorMsg = getErrorDetail(err);
      toast.error(`Test failed: ${errorMsg}`);
    } finally {
      setTestLoading(false);
    }
  };

  const fetchWebhookInfo = async () => {
    setWebhookInfoLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/webhook-info',
        method: 'GET',
        data: {},
      });
      setWebhookInfo(res.data as WebhookInfo);
    } catch (err: unknown) {
      if (!is401Error(err)) {
        toast.error(`Could not fetch webhook status: ${getErrorDetail(err)}`);
      }
    } finally {
      setWebhookInfoLoading(false);
    }
  };

  const handleAutoSetup = async () => {
    setAutoSetupLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/auto-setup',
        method: 'POST',
        data: {},
      });
      const data = res.data as { success?: boolean; webhook_url?: string; message?: string };
      if (data?.success) {
        toast.success(data.message || 'Webhook registered!');
        await fetchWebhookInfo();
      } else {
        toast.error(data?.message || 'Auto-setup failed');
      }
    } catch (err: unknown) {
      if (is401Error(err)) {
        toast.error('Please log in first.');
      } else {
        toast.error(`Auto-setup failed: ${getErrorDetail(err)}`);
      }
    } finally {
      setAutoSetupLoading(false);
    }
  };

  // Load webhook info alongside bot info on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user) fetchWebhookInfo();
  }, [user]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Bot Settings</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Webhook Status — shown first because it's the #1 reason the bot doesn't respond */}
          <Card className={`border ${
            webhookInfo === null
              ? 'bg-[#1E293B] border-slate-700/50'
              : webhookInfo.is_registered
              ? 'bg-emerald-900/20 border-emerald-500/40'
              : 'bg-red-900/20 border-red-500/40'
          }`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Webhook className="h-5 w-5 text-purple-400" />
                <span>Webhook Status</span>
                {webhookInfo && (
                  <span className={`ml-auto text-xs font-normal px-2 py-0.5 rounded-full ${
                    webhookInfo.is_registered
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {webhookInfo.is_registered ? '✅ Registered' : '❌ Not Registered'}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {webhookInfoLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                </div>
              ) : !user ? (
                <p className="text-sm text-slate-400">Log in to see webhook status.</p>
              ) : webhookInfo ? (
                <>
                  {!webhookInfo.token_configured && (
                    <div className="flex items-start space-x-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-red-300">TELEGRAM_BOT_TOKEN is not set. The bot cannot work without it.</p>
                    </div>
                  )}
                  <div className="bg-slate-800/60 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-slate-400">Current webhook URL</p>
                    <p className="text-xs font-mono text-white break-all">
                      {webhookInfo.webhook_url || <span className="text-red-400 italic">none -- bot is silent</span>}
                    </p>
                  </div>
                  {webhookInfo.pending_update_count > 0 && (
                    <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                      <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-300">{webhookInfo.pending_update_count} pending update(s) — messages waiting to be delivered</p>
                    </div>
                  )}
                  {webhookInfo.last_error_message && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                      <p className="text-xs text-red-300">Last Telegram error: {webhookInfo.last_error_message}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">{webhookInfo.message}</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Could not load webhook status.</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleAutoSetup}
                  disabled={autoSetupLoading || !user}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                >
                  {autoSetupLoading ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Setting up…</>
                  ) : (
                    <><Zap className="h-3 w-3 mr-1" />Auto-Setup Webhook</>
                  )}
                </Button>
                <Button
                  onClick={fetchWebhookInfo}
                  disabled={webhookInfoLoading || !user}
                  variant="outline"
                  size="icon"
                  className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                  title="Refresh webhook status"
                >
                  <RefreshCw className={`h-3 w-3 ${webhookInfoLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bot Info */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Bot className="h-5 w-5 text-blue-400" />
                <span>Bot Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {botLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : botInfo ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <Bot className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{botInfo.first_name}</p>
                      <p className="text-sm text-slate-400">@{botInfo.username}</p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border ml-auto">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Bot ID</p>
                    <code className="text-sm text-white font-mono">{botInfo.id}</code>
                  </div>
                  <Button
                    onClick={fetchBotInfo}
                    variant="outline"
                    size="sm"
                    className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                  >
                    Refresh Info
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                  <p className="text-slate-400 mb-3">Bot not connected</p>
                  {botError ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3 text-left">
                      <p className="text-xs text-red-300 font-medium mb-1">Error Details:</p>
                      <p className="text-xs text-red-400 font-mono break-all">{botError}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mb-3">
                      Make sure TELEGRAM_BOT_TOKEN is configured
                    </p>
                  )}
                  {botError && botError.includes('Authentication required') && !user ? (
                    <Button
                      onClick={() => login()}
                      size="sm"
                      className="mt-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Log In to Connect Bot
                    </Button>
                  ) : (
                    <Button
                      onClick={fetchBotInfo}
                      variant="outline"
                      size="sm"
                      className="mt-1 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Bot Connection */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <FlaskConical className="h-5 w-5 text-green-400" />
                <span>Test Bot Connection</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">
                Run a quick connectivity check to confirm the bot token is configured and the Telegram API is reachable.
              </p>

              <Button
                onClick={handleTestBot}
                disabled={testLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              >
                {testLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <FlaskConical className="h-4 w-4 mr-2" />
                    Run Bot Test
                  </>
                )}
              </Button>

              {testRan && (
                <div className="space-y-2 pt-1">
                  {testChecks.map((check) => (
                    <div
                      key={check.name}
                      className={`flex items-start space-x-3 rounded-lg p-3 ${
                        check.passed
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-red-500/10 border border-red-500/20'
                      }`}
                    >
                      {check.passed ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${check.passed ? 'text-emerald-300' : 'text-red-300'}`}>
                          {check.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Setup */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Webhook className="h-5 w-5 text-purple-400" />
                <span>Webhook Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-2">
                <div className="flex items-start space-x-2">
                  <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-300 space-y-1">
                    <p className="font-semibold text-blue-200">⚡ Setup Steps:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li><strong>Publish</strong> this app first using the Publish button</li>
                      <li>Copy your published URL (e.g., <code className="bg-slate-800 px-1 rounded">https://your-app.atoms.dev</code>)</li>
                      <li>Set the webhook URL below to: <code className="bg-slate-800 px-1 rounded">https://your-app-url/api/v1/telegram/webhook</code></li>
                    </ol>
                    <p className="text-amber-300 mt-1">⚠️ The bot will only respond after the app is published and the webhook is configured.</p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-slate-300">Webhook URL</Label>
                <Input
                  placeholder="https://your-domain.com/api/v1/telegram/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <Button
                onClick={handleSetWebhook}
                disabled={webhookLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {webhookLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting Webhook...
                  </>
                ) : (
                  <>
                    <Webhook className="h-4 w-4 mr-2" />
                    Set Webhook
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Simulate Webhook */}
          <Card className="bg-[#1E293B] border-slate-700/50 md:col-span-2 ring-1 ring-amber-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <span>Simulate Webhook</span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 border text-[10px] ml-2">
                  TEST
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Radio className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-300">
                    Send a test payment event to verify real-time notifications on the Dashboard and Transactions pages.
                    No actual Xendit payment is required — this simulates a webhook callback.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-300">Transaction Type</Label>
                  <Select value={simType} onValueChange={setSimType}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="invoice" className="text-blue-400">Invoice</SelectItem>
                      <SelectItem value="qr_code" className="text-purple-400">QR Code</SelectItem>
                      <SelectItem value="payment_link" className="text-cyan-400">Payment Link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300">Target Status</Label>
                  <Select value={simStatus} onValueChange={setSimStatus}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="paid" className="text-emerald-400">
                        ✅ Paid
                      </SelectItem>
                      <SelectItem value="expired" className="text-red-400">
                        ❌ Expired
                      </SelectItem>
                      <SelectItem value="pending" className="text-amber-400">
                        ⏳ Pending
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300">Amount (₱)</Label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-300">Description (optional)</Label>
                <Input
                  placeholder="e.g., Test payment for order #123"
                  value={simDescription}
                  onChange={(e) => setSimDescription(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <Button
                onClick={handleSimulateWebhook}
                disabled={simLoading}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {simLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending Test Event...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Send Test Event
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Send Test Message */}
          <Card className="bg-[#1E293B] border-slate-700/50 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Send className="h-5 w-5 text-cyan-400" />
                <span>Send Test Message</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-300">Chat ID</Label>
                  <Input
                    placeholder="Enter Telegram chat ID"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-slate-300">Message</Label>
                  <div className="flex mt-1 space-x-2">
                    <Textarea
                      placeholder="Type your test message..."
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendLoading}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white flex-shrink-0"
                    >
                      {sendLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </Layout>
  );
}