import { useEffect, useState } from 'react';
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
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  MessageSquare,
  Settings,
  Sparkles,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

const TUTORIAL_KEY = 'bot_settings_tutorial_done_v1';

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

interface CloneBotInfo {
  configured: boolean;
  bot_name?: string;
  bot_username?: string;
  bot_id?: string;
  webhook_url?: string;
  webhook_secret?: string;
}

// ─── Tutorial steps ───────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: <MessageSquare className="h-10 w-10 text-blue-400" />,
    title: 'Create a bot on BotFather',
    body: 'Open Telegram and search for @BotFather. Send /newbot, pick any display name, then choose a username that ends in "bot" (e.g. mypaybot). BotFather will give you a bot token — copy it.',
    tip: 'Keep your token safe. Anyone with the token can control your bot.',
    color: 'blue',
  },
  {
    icon: <Key className="h-10 w-10 text-violet-400" />,
    title: 'Enter your bot token',
    body: 'Scroll down to the "Clone Your Bot" section on this page. Paste your BotFather token into the input field, then click Validate Token to confirm it works.',
    tip: 'The token is stored securely and never shared.',
    color: 'violet',
  },
  {
    icon: <Webhook className="h-10 w-10 text-purple-400" />,
    title: 'Setup the webhook',
    body: 'After validating your token, click Setup Webhook. This registers your bot with this platform so all messages are handled automatically — no server required on your end.',
    tip: 'Webhook = the platform receives messages live, 24/7.',
    color: 'purple',
  },
  {
    icon: <Sparkles className="h-10 w-10 text-emerald-400" />,
    title: "You're ready!",
    body: 'Open Telegram, search for your bot, and send /start. Your bot has all commands: /invoice, /qr, /link, /alipay, /wechat, /balance, and more — identical to the main bot, under your own name.',
    tip: 'Tip: Share your bot link t.me/@username with your customers.',
    color: 'emerald',
  },
];

function TutorialOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  const colorMap: Record<string, string> = {
    blue:    'bg-blue-500/15 border-blue-500/30',
    violet:  'bg-violet-500/15 border-violet-500/30',
    purple:  'bg-purple-500/15 border-purple-500/30',
    emerald: 'bg-emerald-500/15 border-emerald-500/30',
  };
  const tipMap: Record<string, string> = {
    blue:    'bg-blue-500/10 border-blue-500/20 text-blue-300',
    violet:  'bg-violet-500/10 border-violet-500/20 text-violet-300',
    purple:  'bg-purple-500/10 border-purple-500/20 text-purple-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md bg-[#0F1B2D] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-400" />
            <span className="text-white font-bold text-sm">Bot Setup Guide</span>
          </div>
          <button onClick={onDone} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-5 pb-4">
          {TUTORIAL_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-blue-400' : i < step ? 'w-3 bg-blue-600' : 'w-3 bg-slate-700'
              }`}
            />
          ))}
          <span className="ml-auto text-[11px] text-slate-500">{step + 1} of {TUTORIAL_STEPS.length}</span>
        </div>

        {/* Step content */}
        <div className="px-5 pb-5">
          <div className={`flex items-center justify-center h-20 w-20 rounded-2xl border mx-auto mb-5 ${colorMap[s.color]}`}>
            {s.icon}
          </div>

          <h2 className="text-white font-bold text-lg text-center mb-3">{s.title}</h2>
          <p className="text-slate-400 text-sm text-center leading-relaxed mb-4">{s.body}</p>

          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 mb-6 ${tipMap[s.color]}`}>
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{s.tip}</p>
          </div>

          <div className="flex gap-3">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {step === 0 && (
              <Button
                variant="ghost"
                onClick={onDone}
                className="flex-1 text-slate-500 hover:text-slate-300"
              >
                Skip tutorial
              </Button>
            )}
            <Button
              onClick={isLast ? onDone : () => setStep(step + 1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLast ? (
                <><CheckCircle className="h-4 w-4 mr-1" /> Get Started</>
              ) : (
                <>Next <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BotSettings() {
  const { user, login } = useAuth();

  // Tutorial
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_KEY)) setShowTutorial(true);
  }, []);
  const dismissTutorial = () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    setShowTutorial(false);
  };

  // Clone-bot state
  const [cloneToken, setCloneToken]         = useState('');
  const [showToken, setShowToken]           = useState(false);
  const [cloneValidating, setCloneValidating] = useState(false);
  const [cloneSaving, setCloneSaving]       = useState(false);
  const [cloneValidated, setCloneValidated] = useState<BotInfo | null>(null);
  const [cloneInfo, setCloneInfo]           = useState<CloneBotInfo | null>(null);

  // Existing state
  const [botInfo, setBotInfo]               = useState<BotInfo | null>(null);
  const [botLoading, setBotLoading]         = useState(false);
  const [botError, setBotError]             = useState('');
  const [webhookUrl, setWebhookUrl]         = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [chatId, setChatId]                 = useState('');
  const [testMessage, setTestMessage]       = useState('');
  const [sendLoading, setSendLoading]       = useState(false);
  const [simType, setSimType]               = useState('invoice');
  const [simStatus, setSimStatus]           = useState('paid');
  const [simAmount, setSimAmount]           = useState('1000');
  const [simDescription, setSimDescription] = useState('');
  const [simLoading, setSimLoading]         = useState(false);
  const [testChecks, setTestChecks]         = useState<TestCheck[]>([]);
  const [testLoading, setTestLoading]       = useState(false);
  const [testRan, setTestRan]               = useState(false);
  const [webhookInfo, setWebhookInfo]       = useState<WebhookInfo | null>(null);
  const [webhookInfoLoading, setWebhookInfoLoading] = useState(false);
  const [autoSetupLoading, setAutoSetupLoading]     = useState(false);

  const getErr = (e: unknown) => {
    const err = e as { data?: { detail?: string; message?: string }; message?: string };
    return err?.data?.detail || err?.data?.message || err?.message || 'Unknown error';
  };
  const is401 = (e: unknown) => {
    const err = e as { status?: number; data?: { detail?: string } };
    return err?.status === 401 || (typeof err?.data?.detail === 'string' && err.data.detail.toLowerCase().includes('unauthorized'));
  };

  // ── Fetch default bot info ──────────────────────────────────────────────────
  const fetchBotInfo = async () => {
    setBotLoading(true); setBotError('');
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/bot-info', method: 'GET', data: {} });
      if (res.data?.success) setBotInfo(res.data.data as BotInfo);
      else { setBotError(res.data?.message || 'Failed'); toast.error(res.data?.message || 'Failed to get bot info'); }
    } catch (e) {
      if (is401(e)) setBotError('Authentication required.');
      else { const m = getErr(e); setBotError(m); toast.error(`Bot connection failed: ${m}`); }
    } finally { setBotLoading(false); }
  };

  const fetchWebhookInfo = async () => {
    setWebhookInfoLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/webhook-info', method: 'GET', data: {} });
      setWebhookInfo(res.data as WebhookInfo);
    } catch (e) { if (!is401(e)) toast.error(`Could not fetch webhook status: ${getErr(e)}`); }
    finally { setWebhookInfoLoading(false); }
  };

  const fetchCloneInfo = async () => {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/info', method: 'GET', data: {} });
      setCloneInfo(res.data as CloneBotInfo);
    } catch { /* silently ignore */ }
  };

  useEffect(() => { fetchBotInfo(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) { fetchWebhookInfo(); fetchCloneInfo(); } }, [user]);

  // ── Clone bot handlers ──────────────────────────────────────────────────────
  const handleCloneValidate = async () => {
    if (!cloneToken.trim()) { toast.error('Enter a bot token first'); return; }
    setCloneValidating(true); setCloneValidated(null);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/clone-bot/validate',
        method: 'POST',
        data: { bot_token: cloneToken.trim() },
      });
      if (res.data?.success) {
        setCloneValidated(res.data.bot as BotInfo);
        toast.success(`Token valid! Bot: @${(res.data.bot as BotInfo).username}`);
      } else toast.error(res.data?.message || 'Invalid token');
    } catch (e) { toast.error(getErr(e)); }
    finally { setCloneValidating(false); }
  };

  const handleCloneSave = async () => {
    if (!cloneToken.trim()) { toast.error('Validate your token first'); return; }
    setCloneSaving(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/clone-bot/save',
        method: 'POST',
        data: { bot_token: cloneToken.trim() },
      });
      if (res.data?.success) {
        toast.success('Bot saved and webhook registered!');
        await fetchCloneInfo();
        setCloneToken('');
        setCloneValidated(null);
      } else toast.error(res.data?.message || 'Save failed');
    } catch (e) { toast.error(getErr(e)); }
    finally { setCloneSaving(false); }
  };

  // ── Existing handlers ───────────────────────────────────────────────────────
  const handleSetWebhook = async () => {
    if (!webhookUrl) { toast.error('Enter a webhook URL'); return; }
    setWebhookLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/setup-webhook', method: 'POST', data: { webhook_url: webhookUrl } });
      if (res.data?.success) toast.success('Webhook configured!');
      else toast.error(res.data?.message || 'Failed');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : getErr(e)); }
    finally { setWebhookLoading(false); }
  };

  const handleSendMessage = async () => {
    if (!chatId || !testMessage) { toast.error('Enter chat ID and message'); return; }
    setSendLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/send-message', method: 'POST', data: { chat_id: chatId, message: testMessage } });
      if (res.data?.success) { toast.success('Message sent!'); setTestMessage(''); }
      else toast.error(res.data?.message || 'Failed');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : getErr(e)); }
    finally { setSendLoading(false); }
  };

  const handleSimulateWebhook = async () => {
    const amount = parseFloat(simAmount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSimLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/events/simulate', method: 'POST', data: { transaction_type: simType, status: simStatus, amount, description: simDescription } });
      if (res.data?.success) toast.success(`Test event sent!`, { description: `${simType} → ${simStatus.toUpperCase()} (₱${amount.toLocaleString()})`, duration: 5000 });
      else toast.error('Failed to simulate webhook');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : getErr(e)); }
    finally { setSimLoading(false); }
  };

  const handleTestBot = async () => {
    setTestLoading(true); setTestChecks([]); setTestRan(false);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/test', method: 'GET', data: {} });
      const data = res.data as { success?: boolean; checks?: TestCheck[] };
      if (Array.isArray(data?.checks)) {
        setTestChecks(data.checks); setTestRan(true);
        if (data.success) toast.success('Bot is working!');
        else toast.error('Some checks failed.');
      } else toast.error('Unexpected response');
    } catch (e) { toast.error(`Test failed: ${getErr(e)}`); }
    finally { setTestLoading(false); }
  };

  const handleAutoSetup = async () => {
    setAutoSetupLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/auto-setup', method: 'POST', data: {} });
      const data = res.data as { success?: boolean; message?: string };
      if (data?.success) { toast.success(data.message || 'Webhook registered!'); await fetchWebhookInfo(); }
      else toast.error(data?.message || 'Auto-setup failed');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : `Auto-setup failed: ${getErr(e)}`); }
    finally { setAutoSetupLoading(false); }
  };

  const copyToClipboard = (text: string, label = 'Copied!') => {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      {showTutorial && <TutorialOverlay onDone={dismissTutorial} />}

      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Bot Settings</h1>
            <p className="text-slate-400 text-sm mt-0.5">Configure and manage your Telegram payment bots</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTutorial(true)}
            className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800 gap-2"
          >
            <Info className="h-3.5 w-3.5" /> Setup Guide
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ═══ Clone Your Bot ═══════════════════════════════════════════════ */}
          <Card className="md:col-span-2 bg-gradient-to-br from-[#12203A] to-[#0F1B2D] border-blue-500/30 ring-1 ring-blue-500/15">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                Clone Your Bot
                <Badge className="ml-1 bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">NEW</Badge>
                <button
                  onClick={() => setShowTutorial(true)}
                  className="ml-auto text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-normal"
                >
                  <Info className="h-3 w-3" /> How it works
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">
                Use your own Telegram bot with this platform. Create a bot via <span className="text-blue-400 font-medium">@BotFather</span>, enter the token below, and your bot will support all payment commands — only the name differs.
              </p>

              {/* Existing clone bot info */}
              {cloneInfo?.configured && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold text-sm">Bot connected</span>
                    <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border text-[10px]">ACTIVE</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/60 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 mb-0.5">Bot Name</p>
                      <p className="text-sm text-white font-medium">{cloneInfo.bot_name}</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 mb-0.5">Username</p>
                      <p className="text-sm text-blue-400 font-mono">@{cloneInfo.bot_username}</p>
                    </div>
                  </div>
                  {cloneInfo.webhook_url && (
                    <div className="bg-slate-800/60 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-slate-500">Webhook URL</p>
                        <button onClick={() => copyToClipboard(cloneInfo.webhook_url!, 'Webhook URL copied')} className="text-slate-400 hover:text-white">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-[11px] font-mono text-slate-300 break-all">{cloneInfo.webhook_url}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">To switch bots, enter a new token below and click Setup Webhook.</p>
                </div>
              )}

              {/* Token input */}
              <div>
                <Label className="text-slate-300 mb-1.5 block">BotFather Token</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showToken ? 'text' : 'password'}
                      placeholder="1234567890:AAF..."
                      value={cloneToken}
                      onChange={(e) => { setCloneToken(e.target.value); setCloneValidated(null); }}
                      className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 pr-9 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={handleCloneValidate}
                    disabled={cloneValidating || !cloneToken.trim()}
                    variant="outline"
                    className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200 shrink-0"
                  >
                    {cloneValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                  </Button>
                </div>
              </div>

              {/* Validated bot preview */}
              {cloneValidated && (
                <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">{cloneValidated.first_name}</p>
                      <p className="text-blue-400 text-sm">@{cloneValidated.username}</p>
                    </div>
                    <Badge className="ml-auto bg-blue-500/20 text-blue-300 border-blue-500/30 border text-[10px]">
                      <CheckCircle className="h-3 w-3 mr-1" /> Valid
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">Your bot is ready. Click <strong className="text-white">Setup Webhook</strong> to connect it to this platform.</p>
                  <Button
                    onClick={handleCloneSave}
                    disabled={cloneSaving}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {cloneSaving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving & Registering Webhook…</>
                    ) : (
                      <><Webhook className="h-4 w-4 mr-2" />Setup Webhook</>
                    )}
                  </Button>
                </div>
              )}

              {/* Quick guide */}
              <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Quick steps</p>
                <ol className="space-y-1">
                  {['Open Telegram → @BotFather → /newbot', 'Choose a name and @username', 'Copy the token, paste above, click Validate', 'Click Setup Webhook — done!'].map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="h-4 w-4 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* ═══ Webhook Status ═══════════════════════════════════════════════ */}
          <Card className={`border ${
            webhookInfo === null ? 'bg-[#1E293B] border-slate-700/50'
            : webhookInfo.is_registered ? 'bg-emerald-900/20 border-emerald-500/40'
            : 'bg-red-900/20 border-red-500/40'
          }`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Webhook className="h-5 w-5 text-purple-400" />
                <span>Webhook Status</span>
                {webhookInfo && (
                  <span className={`ml-auto text-xs font-normal px-2 py-0.5 rounded-full ${webhookInfo.is_registered ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {webhookInfo.is_registered ? '✅ Registered' : '❌ Not Registered'}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {webhookInfoLoading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>
              ) : !user ? (
                <p className="text-sm text-slate-400">Log in to see webhook status.</p>
              ) : webhookInfo ? (
                <>
                  {!webhookInfo.token_configured && (
                    <div className="flex items-start space-x-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-300">TELEGRAM_BOT_TOKEN is not set. The bot cannot work without it.</p>
                    </div>
                  )}
                  <div className="bg-slate-800/60 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-slate-400">Current webhook URL</p>
                    <p className="text-xs font-mono text-white break-all">
                      {webhookInfo.webhook_url || <span className="text-red-400 italic">none — bot is silent</span>}
                    </p>
                  </div>
                  {webhookInfo.pending_update_count > 0 && (
                    <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-300">{webhookInfo.pending_update_count} pending update(s)</p>
                    </div>
                  )}
                  {webhookInfo.last_error_message && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                      <p className="text-xs text-red-300">Last error: {webhookInfo.last_error_message}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">{webhookInfo.message}</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Could not load webhook status.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleAutoSetup} disabled={autoSetupLoading || !user} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm">
                  {autoSetupLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Setting up…</> : <><Zap className="h-3 w-3 mr-1" />Auto-Setup Webhook</>}
                </Button>
                <Button onClick={fetchWebhookInfo} disabled={webhookInfoLoading || !user} variant="outline" size="icon" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700" title="Refresh">
                  <RefreshCw className={`h-3 w-3 ${webhookInfoLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ═══ Bot Information ══════════════════════════════════════════════ */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Bot className="h-5 w-5 text-blue-400" />
                <span>Bot Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {botLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
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
                      <CheckCircle className="h-3 w-3 mr-1" /> Connected
                    </Badge>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400">Bot ID</p>
                    <code className="text-sm text-white font-mono">{botInfo.id}</code>
                  </div>
                  <Button onClick={fetchBotInfo} variant="outline" size="sm" className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700">
                    Refresh Info
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                  <p className="text-slate-400 mb-3">Bot not connected</p>
                  {botError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3 text-left">
                      <p className="text-xs text-red-300 font-medium mb-1">Error:</p>
                      <p className="text-xs text-red-400 font-mono break-all">{botError}</p>
                    </div>
                  )}
                  {botError?.includes('Authentication required') && !user ? (
                    <Button onClick={() => login()} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button>
                  ) : (
                    <Button onClick={fetchBotInfo} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700">Retry</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Test Bot Connection ══════════════════════════════════════════ */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <FlaskConical className="h-5 w-5 text-green-400" />
                <span>Test Bot Connection</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">Run a quick check to confirm the bot token is configured and Telegram API is reachable.</p>
              <Button onClick={handleTestBot} disabled={testLoading} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium">
                {testLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Tests…</> : <><FlaskConical className="h-4 w-4 mr-2" />Run Bot Test</>}
              </Button>
              {testRan && (
                <div className="space-y-2 pt-1">
                  {testChecks.map((check) => (
                    <div key={check.name} className={`flex items-start space-x-3 rounded-lg p-3 ${check.passed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      {check.passed ? <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className={`text-sm font-medium ${check.passed ? 'text-emerald-300' : 'text-red-300'}`}>{check.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Webhook Configuration ════════════════════════════════════════ */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Webhook className="h-5 w-5 text-purple-400" />
                <span>Webhook Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-blue-300 space-y-1">
                    <p className="font-semibold text-blue-200">Manual setup</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>Publish the app and copy its URL</li>
                      <li>Set webhook URL to: <code className="bg-slate-800 px-1 rounded">https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook</code></li>
                    </ol>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-slate-300">Webhook URL</Label>
                <Input placeholder="https://paybot-backend-production-84b2.up.railway.app/api/v1/telegram/webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
              </div>
              <Button onClick={handleSetWebhook} disabled={webhookLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                {webhookLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Setting Webhook…</> : <><Webhook className="h-4 w-4 mr-2" />Set Webhook</>}
              </Button>
            </CardContent>
          </Card>

          {/* ═══ Simulate Webhook ════════════════════════════════════════════ */}
          <Card className="bg-[#1E293B] border-slate-700/50 md:col-span-2 ring-1 ring-amber-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <span>Simulate Webhook</span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 border text-[10px] ml-2">TEST</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start space-x-2">
                <Radio className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">Send a test payment event to verify real-time notifications on Dashboard and Transactions. No actual payment required.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-300">Transaction Type</Label>
                  <Select value={simType} onValueChange={setSimType}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="invoice" className="text-blue-400">Invoice</SelectItem>
                      <SelectItem value="qr_code" className="text-purple-400">QR Code</SelectItem>
                      <SelectItem value="payment_link" className="text-cyan-400">Payment Link</SelectItem>
                      <SelectItem value="alipay_qr" className="text-red-400">Alipay QR</SelectItem>
                      <SelectItem value="wechat_qr" className="text-green-400">WeChat QR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Target Status</Label>
                  <Select value={simStatus} onValueChange={setSimStatus}>
                    <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="paid" className="text-emerald-400">✅ Paid</SelectItem>
                      <SelectItem value="expired" className="text-red-400">❌ Expired</SelectItem>
                      <SelectItem value="pending" className="text-amber-400">⏳ Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Amount (₱)</Label>
                  <Input type="number" placeholder="1000" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" min="1" />
                </div>
              </div>
              <div>
                <Label className="text-slate-300">Description (optional)</Label>
                <Input placeholder="e.g., Test payment for order #123" value={simDescription} onChange={(e) => setSimDescription(e.target.value)} className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
              </div>
              <Button onClick={handleSimulateWebhook} disabled={simLoading} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium">
                {simLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Zap className="h-4 w-4 mr-2" />Send Test Event</>}
              </Button>
            </CardContent>
          </Card>

          {/* ═══ Send Test Message ════════════════════════════════════════════ */}
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
                  <Input placeholder="Telegram chat ID" value={chatId} onChange={(e) => setChatId(e.target.value)} className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-slate-300">Message</Label>
                  <div className="flex mt-1 space-x-2">
                    <Textarea placeholder="Type your test message..." value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 resize-none" rows={1} />
                    <Button onClick={handleSendMessage} disabled={sendLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                      {sendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
