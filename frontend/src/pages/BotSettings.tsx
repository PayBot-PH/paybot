import { useEffect, useState, useCallback } from 'react';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
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
  ChevronRight,
  ChevronLeft,
  X,
  MessageSquare,
  Sparkles,
  Key,
  Settings,
  ToggleLeft,
  FileText,
  Terminal,
  Save,
  RotateCcw,
  Power,
  Wrench,
  Globe,
  Hash,
  ChevronDown,
  ChevronUp,
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

interface BotConfig {
  id?: number;
  bot_status: string;
  maintenance_mode: string;
  welcome_message_en: string;
  welcome_message_zh: string;
  payment_success_message: string;
  payment_failed_message: string;
  payment_pending_message: string;
  maintenance_message: string;
  commands_enabled: string;
}

// Bot commands reference
const BOT_COMMANDS = [
  { cmd: '/start',      emoji: '\u{1F680}', category: 'General',   desc: 'Welcome message + language selection' },
  { cmd: '/help',       emoji: '\u2753',    category: 'General',   desc: 'Full command reference guide' },
  { cmd: '/balance',    emoji: '\u{1F4B0}', category: 'Wallet',    desc: 'View PHP wallet balance & history' },
  { cmd: '/usdbalance', emoji: '\u{1F4B5}', category: 'Wallet',    desc: 'USD wallet balance (USDT TRC20)' },
  { cmd: '/invoice',    emoji: '\u{1F4B3}', category: 'Payments',  desc: 'Create a Xendit payment invoice' },
  { cmd: '/qr',         emoji: '\u{1F4F1}', category: 'Payments',  desc: 'Generate a QR code payment' },
  { cmd: '/link',       emoji: '\u{1F517}', category: 'Payments',  desc: 'Create a payment link' },
  { cmd: '/va',         emoji: '\u{1F3E6}', category: 'Payments',  desc: 'Generate a virtual bank account' },
  { cmd: '/ewallet',    emoji: '\u{1F4F2}', category: 'Payments',  desc: 'GCash / Maya / GrabPay e-wallet' },
  { cmd: '/alipay',     emoji: '\u{1F534}', category: 'Payments',  desc: 'Alipay QR via PhotonPay' },
  { cmd: '/wechat',     emoji: '\u{1F4AC}', category: 'Payments',  desc: 'WeChat Pay QR via PhotonPay' },
  { cmd: '/disburse',   emoji: '\u{1F4B8}', category: 'Transfers', desc: 'Bank transfer disbursement' },
  { cmd: '/refund',     emoji: '\u21A9\uFE0F', category: 'Transfers', desc: 'Refund a completed payment' },
  { cmd: '/send',       emoji: '\u{1F4E4}', category: 'Transfers', desc: 'Send PHP to another user' },
  { cmd: '/sendusdt',   emoji: '\u20BF',    category: 'Transfers', desc: 'Send USDT to a TRC20 address' },
  { cmd: '/sendusd',    emoji: '\u{1F4B1}', category: 'Transfers', desc: 'Send USD to another user' },
  { cmd: '/topup',      emoji: '\u2B06\uFE0F', category: 'Transfers', desc: 'Top up PHP wallet via USDT' },
  { cmd: '/withdraw',   emoji: '\u2B07\uFE0F', category: 'Transfers', desc: 'Withdraw from wallet' },
  { cmd: '/deposit',    emoji: '\u{1F4E5}', category: 'Transfers', desc: 'Record a manual deposit' },
  { cmd: '/status',     emoji: '\u{1F50D}', category: 'Tools',     desc: 'Check a payment status by ID' },
  { cmd: '/list',       emoji: '\u{1F4CB}', category: 'Tools',     desc: 'Recent transactions list' },
  { cmd: '/report',     emoji: '\u{1F4CA}', category: 'Tools',     desc: 'Daily / weekly / monthly report' },
  { cmd: '/fees',       emoji: '\u{1F4B1}', category: 'Tools',     desc: 'Payment fee calculator' },
  { cmd: '/cancel',     emoji: '\u{1F6AB}', category: 'Tools',     desc: 'Cancel a pending payment' },
  { cmd: '/remind',     emoji: '\u{1F514}', category: 'Tools',     desc: 'Send a payment reminder' },
  { cmd: '/scanqr',     emoji: '\u{1F4F7}', category: 'Tools',     desc: 'Scan a QRPH code and pay' },
  { cmd: '/kyb',        emoji: '\u{1FAAA}', category: 'Tools',     desc: 'KYB (know-your-business) form' },
];

const COMMAND_CATEGORIES = ['General', 'Wallet', 'Payments', 'Transfers', 'Tools'];

const DEFAULT_TEMPLATES = {
  welcome_message_en: `\u{1F44B} Welcome to PayBot PH!\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nHi {name}! \u{1F389} Your all-in-one Philippine payment gateway is ready.\n\n\u{1F4B3} /invoice \u00B7 /qr \u00B7 /link \u00B7 /va \u00B7 /ewallet\n\u{1F4B8} /disburse \u00B7 /refund \u00B7 /send\n\u{1F4B0} /balance \u00B7 /topup \u00B7 /withdraw\n\u{1F4CA} /report \u00B7 /list \u00B7 /fees\n\nType /help for the full command guide.`,
  welcome_message_zh: `\u{1F44B} \u6B22\u8FCE\u4F7F\u7528 PayBot PH\uFF01\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u5C4F {name}\uFF01\u{1F389} \u60A8\u7684\u4E00\u7AD9\u5F0F\u83F2\u5F8B\u5EB3\u652F\u4ED8\u673A\u5668\u4EBA\u5DF2\u5C31\u7EEA\u3002\n\n\u{1F4B3} /invoice \u00B7 /qr \u00B7 /link \u00B7 /va \u00B7 /ewallet\n\u{1F4B8} /disburse \u00B7 /refund \u00B7 /send\n\u{1F4B0} /balance \u00B7 /topup \u00B7 /withdraw\n\u{1F4CA} /report \u00B7 /list \u00B7 /fees\n\n\u8F93\u5165 /help \u67E5\u770B\u5B8C\u6574\u547D\u4EE4\u3002`,
  payment_success_message: `\u2705 Payment Successful!\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u{1F4B0} Amount: \u20B1{amount}\n\u{1F4DD} Description: {description}\n\u{1F194} Reference: {external_id}\n\nThank you for your payment! \u{1F389}`,
  payment_failed_message: `\u274C Payment Failed\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u{1F4B0} Amount: \u20B1{amount}\n\u{1F4DD} Description: {description}\n\u{1F194} Reference: {external_id}\n\nPlease try again or contact support.`,
  payment_pending_message: `\u23F3 Payment Pending\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u{1F4B0} Amount: \u20B1{amount}\n\u{1F4DD} Description: {description}\n\u{1F194} Reference: {external_id}\n\nWaiting for payment confirmation...`,
  maintenance_message: `\u{1F527} Bot is under maintenance\nWe'll be back shortly. Thank you for your patience!`,
};

const TUTORIAL_STEPS = [
  {
    icon: <MessageSquare className="h-10 w-10 text-blue-400" />,
    title: 'Create a bot on BotFather',
    body: 'Open Telegram and search for @BotFather. Send /newbot, pick any display name, then choose a username that ends in "bot". BotFather will give you a bot token.',
    tip: 'Keep your token safe. Anyone with the token can control your bot.',
    color: 'blue',
  },
  {
    icon: <Key className="h-10 w-10 text-violet-400" />,
    title: 'Enter your bot token',
    body: 'Go to the Overview tab. Paste your BotFather token into the input field, then click Validate Token to confirm it works.',
    tip: 'The token is stored securely and never shared.',
    color: 'violet',
  },
  {
    icon: <Webhook className="h-10 w-10 text-purple-400" />,
    title: 'Setup the webhook',
    body: 'After validating your token, click Setup Webhook. This registers your bot with this platform so all messages are handled automatically.',
    tip: 'Webhook = the platform receives messages live, 24/7.',
    color: 'purple',
  },
  {
    icon: <Sparkles className="h-10 w-10 text-emerald-400" />,
    title: "You're ready!",
    body: 'Open Telegram, find your bot, and send /start. Customise welcome messages in the Messages tab and check available commands in the Commands tab.',
    tip: 'Share your bot link t.me/yourbotusername with customers.',
    color: 'emerald',
  },
];

function TutorialOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/15 border-blue-500/30', violet: 'bg-violet-500/15 border-violet-500/30',
    purple: 'bg-purple-500/15 border-purple-500/30', emerald: 'bg-emerald-500/15 border-emerald-500/30',
  };
  const tipMap: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300', violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300', emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-blue-400" /><span className="text-foreground font-bold text-sm">Bot Setup Guide</span></div>
          <button onClick={onDone} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 px-5 pb-4">
          {TUTORIAL_STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-blue-400' : i < step ? 'w-3 bg-blue-600' : 'w-3 bg-muted'}`} />
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{step + 1} of {TUTORIAL_STEPS.length}</span>
        </div>
        <div className="px-5 pb-5">
          <div className={`flex items-center justify-center h-20 w-20 rounded-2xl border mx-auto mb-5 ${colorMap[s.color]}`}>{s.icon}</div>
          <h2 className="text-foreground font-bold text-lg text-center mb-3">{s.title}</h2>
          <p className="text-muted-foreground text-sm text-center leading-relaxed mb-4">{s.body}</p>
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 mb-6 ${tipMap[s.color]}`}>
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /><p className="text-xs leading-relaxed">{s.tip}</p>
          </div>
          <div className="flex gap-3">
            {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 border-border text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>}
            {step === 0 && <Button variant="ghost" onClick={onDone} className="flex-1 text-muted-foreground hover:text-foreground">Skip tutorial</Button>}
            <Button onClick={isLast ? onDone : () => setStep(step + 1)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {isLast ? <><CheckCircle className="h-4 w-4 mr-1" /> Get Started</> : <>Next <ChevronRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BotSettings() {
  const { user, login } = useAuth();
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => { if (!localStorage.getItem(TUTORIAL_KEY)) setShowTutorial(true); }, []);
  const dismissTutorial = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setShowTutorial(false); };

  const [cloneToken, setCloneToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [cloneValidating, setCloneValidating] = useState(false);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneValidated, setCloneValidated] = useState<BotInfo | null>(null);
  const [cloneInfo, setCloneInfo] = useState<CloneBotInfo | null>(null);

  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [webhookInfoLoading, setWebhookInfoLoading] = useState(false);
  const [autoSetupLoading, setAutoSetupLoading] = useState(false);

  const [chatId, setChatId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [simType, setSimType] = useState('invoice');
  const [simStatus, setSimStatus] = useState('paid');
  const [simAmount, setSimAmount] = useState('1000');
  const [simDescription, setSimDescription] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [testChecks, setTestChecks] = useState<TestCheck[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testRan, setTestRan] = useState(false);

  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<BotConfig>({
    bot_status: 'inactive', maintenance_mode: 'off',
    welcome_message_en: '', welcome_message_zh: '',
    payment_success_message: '', payment_failed_message: '',
    payment_pending_message: '', maintenance_message: '', commands_enabled: '',
  });

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(COMMAND_CATEGORIES.map(c => [c, true]))
  );

  const getErr = (e: unknown) => {
    const err = e as { data?: { detail?: string; message?: string }; message?: string };
    return err?.data?.detail || err?.data?.message || err?.message || 'Unknown error';
  };
  const is401 = (e: unknown) => {
    const err = e as { status?: number; data?: { detail?: string } };
    return err?.status === 401 || (typeof err?.data?.detail === 'string' && err.data.detail.toLowerCase().includes('unauthorized'));
  };

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

  const fetchBotConfig = useCallback(async () => {
    if (!user) return;
    setConfigLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/bot-config', method: 'GET', data: {} });
      if (res.data?.success) { const cfg = res.data as BotConfig; setBotConfig(cfg); setLocalConfig(cfg); }
    } catch (e) { if (!is401(e)) toast.error(`Could not load bot config: ${getErr(e)}`); }
    finally { setConfigLoading(false); }
  }, [user]);

  useEffect(() => { fetchBotInfo(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) { fetchWebhookInfo(); fetchCloneInfo(); fetchBotConfig(); } }, [user]);

  const handleCloneValidate = async () => {
    if (!cloneToken.trim()) { toast.error('Enter a bot token first'); return; }
    setCloneValidating(true); setCloneValidated(null);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/validate', method: 'POST', data: { bot_token: cloneToken.trim() } });
      if (res.data?.success) { setCloneValidated(res.data.bot as BotInfo); toast.success(`Token valid! Bot: @${(res.data.bot as BotInfo).username}`); }
      else toast.error(res.data?.message || 'Invalid token');
    } catch (e) { toast.error(getErr(e)); } finally { setCloneValidating(false); }
  };

  const handleCloneSave = async () => {
    if (!cloneToken.trim()) { toast.error('Validate your token first'); return; }
    setCloneSaving(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/save', method: 'POST', data: { bot_token: cloneToken.trim() } });
      if (res.data?.success) { toast.success('Bot saved and webhook registered!'); await fetchCloneInfo(); setCloneToken(''); setCloneValidated(null); }
      else toast.error(res.data?.message || 'Save failed');
    } catch (e) { toast.error(getErr(e)); } finally { setCloneSaving(false); }
  };

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
      if (res.data?.success) toast.success('Test event sent!', { description: `${simType} -> ${simStatus.toUpperCase()} (amount: ${amount.toLocaleString()})`, duration: 5000 });
      else toast.error('Failed to simulate webhook');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : getErr(e)); }
    finally { setSimLoading(false); }
  };

  const handleTestBot = async () => {
    setTestLoading(true); setTestChecks([]); setTestRan(false);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/test', method: 'GET', data: {} });
      const data = res.data as { success?: boolean; checks?: TestCheck[] };
      if (Array.isArray(data?.checks)) { setTestChecks(data.checks); setTestRan(true); if (data.success) toast.success('Bot is working!'); else toast.error('Some checks failed.'); }
      else toast.error('Unexpected response');
    } catch (e) { toast.error(`Test failed: ${getErr(e)}`); } finally { setTestLoading(false); }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/bot-config', method: 'PUT', data: localConfig });
      if (res.data?.success) { const cfg = res.data as BotConfig; setBotConfig(cfg); setLocalConfig(cfg); toast.success('Bot settings saved!'); }
      else toast.error('Failed to save settings');
    } catch (e) { toast.error(is401(e) ? 'Please log in first.' : getErr(e)); }
    finally { setConfigSaving(false); }
  };

  const handleResetConfig = () => {
    if (botConfig) setLocalConfig(botConfig);
    else setLocalConfig({ bot_status: 'inactive', maintenance_mode: 'off', welcome_message_en: '', welcome_message_zh: '', payment_success_message: '', payment_failed_message: '', payment_pending_message: '', maintenance_message: '', commands_enabled: '' });
    toast.info('Changes discarded');
  };

  const setDefaultTemplate = (field: keyof typeof DEFAULT_TEMPLATES) => {
    setLocalConfig(prev => ({ ...prev, [field]: DEFAULT_TEMPLATES[field] }));
    toast.success('Default template applied');
  };

  const copyToClipboard = (text: string, label = 'Copied!') => {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  const configChanged = JSON.stringify(localConfig) !== JSON.stringify(botConfig);

  const statusColor = (s: string) =>
    s === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : s === 'maintenance' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';

  const UnsavedBar = () => configChanged ? (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
      <Info className="h-4 w-4 text-blue-400 shrink-0" />
      <p className="text-sm text-blue-300 flex-1">You have unsaved changes</p>
      <Button size="sm" variant="outline" onClick={handleResetConfig} className="border-slate-500 text-slate-200 hover:text-white gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" /> Discard
      </Button>
      <Button size="sm" onClick={handleSaveConfig} disabled={configSaving} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
        {configSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
      </Button>
    </div>
  ) : null;

  return (
    <Layout>
      {showTutorial && <TutorialOverlay onDone={dismissTutorial} />}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-6 w-6 text-blue-400" /> Bot Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure your Telegram payment bot</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {botConfig && (
              <Badge className={`border text-xs ${statusColor(localConfig.bot_status)}`}>
                {localConfig.bot_status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : localConfig.bot_status === 'maintenance' ? <Wrench className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                {localConfig.bot_status === 'active' ? 'Active' : localConfig.bot_status === 'maintenance' ? 'Maintenance' : 'Inactive'}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowTutorial(true)} className="border-slate-500 text-slate-200 hover:text-foreground hover:bg-muted gap-2">
              <Info className="h-3.5 w-3.5" /> Setup Guide
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/60 border border-border p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="controls" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <ToggleLeft className="h-3.5 w-3.5" /> Controls
            </TabsTrigger>
            <TabsTrigger value="messages" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Messages
            </TabsTrigger>
            <TabsTrigger value="commands" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> Commands
            </TabsTrigger>
            <TabsTrigger value="testing" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Testing
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Clone Your Bot */}
              <Card className="md:col-span-2 bg-card border-blue-500/30 ring-1 ring-blue-500/15">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center"><Bot className="h-4 w-4 text-blue-400" /></div>
                    Clone Your Bot
                    <Badge className="ml-1 bg-blue-500/15 text-blue-300 border-blue-500/30 border text-[10px]">NEW</Badge>
                    <button onClick={() => setShowTutorial(true)} className="ml-auto text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-normal">
                      <Info className="h-3 w-3" /> How it works
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Use your own Telegram bot with this platform. Create a bot via <span className="text-blue-400 font-medium">@BotFather</span>, enter the token below, and your bot will support all payment commands.</p>
                  {cloneInfo?.configured && (
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-300 font-semibold text-sm">Bot connected</span>
                        <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border text-[10px]">ACTIVE</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/60 rounded-lg p-2.5"><p className="text-[10px] text-muted-foreground mb-0.5">Bot Name</p><p className="text-sm text-foreground font-medium">{cloneInfo.bot_name}</p></div>
                        <div className="bg-muted/60 rounded-lg p-2.5"><p className="text-[10px] text-muted-foreground mb-0.5">Username</p><p className="text-sm text-blue-400 font-mono">@{cloneInfo.bot_username}</p></div>
                      </div>
                      {cloneInfo.webhook_url && (
                        <div className="bg-muted/60 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-muted-foreground">Webhook URL</p>
                            <button onClick={() => copyToClipboard(cloneInfo.webhook_url!, 'Webhook URL copied')} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground break-all">{cloneInfo.webhook_url}</p>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">To switch bots, enter a new token below and click Setup Webhook.</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground mb-1.5 block">BotFather Token</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input type={showToken ? 'text' : 'password'} placeholder="1234567890:AAF..." value={cloneToken}
                          onChange={(e) => { setCloneToken(e.target.value); setCloneValidated(null); }}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-9 font-mono text-sm" />
                        <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button onClick={handleCloneValidate} disabled={cloneValidating || !cloneToken.trim()} variant="outline" className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200 shrink-0">
                        {cloneValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                      </Button>
                    </div>
                  </div>
                  {cloneValidated && (
                    <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center"><Bot className="h-5 w-5 text-blue-400" /></div>
                        <div><p className="text-foreground font-semibold">{cloneValidated.first_name}</p><p className="text-blue-400 text-sm">@{cloneValidated.username}</p></div>
                        <Badge className="ml-auto bg-blue-500/20 text-blue-300 border-blue-500/30 border text-[10px]"><CheckCircle className="h-3 w-3 mr-1" /> Valid</Badge>
                      </div>
                      <Button onClick={handleCloneSave} disabled={cloneSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium">
                        {cloneSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Webhook className="h-4 w-4 mr-2" />Setup Webhook</>}
                      </Button>
                    </div>
                  )}
                  <div className="bg-muted/40 rounded-xl p-3 border border-border">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Quick steps</p>
                    <ol className="space-y-1">
                      {['Open Telegram -> @BotFather -> /newbot', 'Choose a name and @username', 'Copy the token, paste above, click Validate', 'Click Setup Webhook -- done!'].map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="h-4 w-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>{s}
                        </li>
                      ))}
                    </ol>
                  </div>
                </CardContent>
              </Card>

              {/* Webhook Status */}
              <Card className={`border ${webhookInfo === null ? 'bg-card border-border' : webhookInfo.is_registered ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-red-900/20 border-red-500/40'}`}>
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center space-x-2">
                    <Webhook className="h-5 w-5 text-purple-400" /><span>Webhook Status</span>
                    {webhookInfo && <span className={`ml-auto text-xs font-normal px-2 py-0.5 rounded-full ${webhookInfo.is_registered ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{webhookInfo.is_registered ? 'Registered' : 'Not Registered'}</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {webhookInfoLoading ? <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>
                  : !user ? <p className="text-sm text-muted-foreground">Log in to see webhook status.</p>
                  : webhookInfo ? (
                    <>
                      {!webhookInfo.token_configured && <div className="flex items-start space-x-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3"><AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" /><p className="text-xs text-red-300">TELEGRAM_BOT_TOKEN is not set.</p></div>}
                      <div className="bg-muted/60 rounded-lg p-3 space-y-1"><p className="text-xs text-muted-foreground">Current webhook URL</p><p className="text-xs font-mono text-foreground break-all">{webhookInfo.webhook_url || <span className="text-red-400 italic">none</span>}</p></div>
                      {webhookInfo.pending_update_count > 0 && <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2"><AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" /><p className="text-xs text-amber-300">{webhookInfo.pending_update_count} pending update(s)</p></div>}
                      {webhookInfo.last_error_message && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2"><p className="text-xs text-red-300">Last error: {webhookInfo.last_error_message}</p></div>}
                      <p className="text-xs text-muted-foreground">{webhookInfo.message}</p>
                    </>
                  ) : <p className="text-xs text-muted-foreground">Could not load webhook status.</p>}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleAutoSetup} disabled={autoSetupLoading || !user} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm">
                      {autoSetupLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Setting up...</> : <><Zap className="h-3 w-3 mr-1" />Auto-Setup</>}
                    </Button>
                    <Button onClick={fetchWebhookInfo} disabled={webhookInfoLoading || !user} variant="outline" size="icon" className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                      <RefreshCw className={`h-3 w-3 ${webhookInfoLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Bot Information */}
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="text-foreground flex items-center space-x-2"><Bot className="h-5 w-5 text-blue-400" /><span>Bot Information</span></CardTitle></CardHeader>
                <CardContent>
                  {botLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
                  : botInfo ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 bg-blue-500/20 rounded-full flex items-center justify-center"><Bot className="h-6 w-6 text-blue-400" /></div>
                        <div><p className="font-medium text-foreground">{botInfo.first_name}</p><p className="text-sm text-muted-foreground">@{botInfo.username}</p></div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border ml-auto"><CheckCircle className="h-3 w-3 mr-1" /> Connected</Badge>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground">Bot ID</p><code className="text-sm text-foreground font-mono">{botInfo.id}</code></div>
                      <Button onClick={fetchBotInfo} variant="outline" size="sm" className="w-full border-slate-500 text-slate-200 hover:text-foreground hover:bg-muted">Refresh Info</Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                      <p className="text-muted-foreground mb-3">Bot not connected</p>
                      {botError && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3 text-left"><p className="text-xs text-red-400 font-mono break-all">{botError}</p></div>}
                      {botError?.includes('Authentication required') && !user
                        ? <Button onClick={() => login()} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button>
                        : <Button onClick={fetchBotInfo} variant="outline" size="sm" className="border-slate-500 text-slate-200 hover:text-foreground hover:bg-muted">Retry</Button>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CONTROLS */}
          <TabsContent value="controls" className="space-y-6 mt-0">
            {!user ? (
              <Card className="bg-card border-border"><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">Log in to manage bot controls</p><Button onClick={() => login()} className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button></CardContent></Card>
            ) : configLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            : (
              <>
                <UnsavedBar />

                {/* Bot Status */}
                <Card className="bg-card border-border">
                  <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Power className="h-5 w-5 text-emerald-400" />Bot Status</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Control whether your bot is accepting commands from users.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(['active', 'inactive', 'maintenance'] as const).map((status) => (
                        <button key={status} onClick={() => setLocalConfig(prev => ({ ...prev, bot_status: status }))}
                          className={`rounded-xl border p-4 text-left transition-all ${localConfig.bot_status === status ? status === 'active' ? 'border-emerald-500/60 bg-emerald-500/10' : status === 'maintenance' ? 'border-amber-500/60 bg-amber-500/10' : 'border-red-500/60 bg-red-500/10' : 'border-border bg-muted/30 hover:border-border'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {status === 'active' && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                            {status === 'inactive' && <XCircle className="h-4 w-4 text-red-400" />}
                            {status === 'maintenance' && <Wrench className="h-4 w-4 text-amber-400" />}
                            <span className={`text-sm font-semibold capitalize ${localConfig.bot_status === status ? status === 'active' ? 'text-emerald-300' : status === 'maintenance' ? 'text-amber-300' : 'text-red-300' : 'text-muted-foreground'}`}>{status}</span>
                            {localConfig.bot_status === status && <CheckCircle className="h-3.5 w-3.5 ml-auto text-blue-400" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{status === 'active' ? 'Bot responds to all commands' : status === 'inactive' ? 'Bot ignores all messages' : 'Bot sends maintenance message only'}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Maintenance Mode */}
                <Card className="bg-card border-border">
                  <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-400" />Maintenance Mode</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground text-sm font-medium">Enable maintenance mode</p>
                        <p className="text-muted-foreground text-xs mt-0.5">Bot sends the maintenance message to all users</p>
                      </div>
                      <Switch checked={localConfig.maintenance_mode === 'on'} onCheckedChange={(checked) => setLocalConfig(prev => ({ ...prev, maintenance_mode: checked ? 'on' : 'off', bot_status: checked ? 'maintenance' : prev.bot_status === 'maintenance' ? 'inactive' : prev.bot_status }))} />
                    </div>
                    {localConfig.maintenance_mode === 'on' && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-300">Maintenance mode is active. Edit the message in the <strong>Messages</strong> tab.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Webhook Configuration */}
                <Card className="bg-card border-border">
                  <CardHeader><CardTitle className="text-foreground flex items-center space-x-2"><Webhook className="h-5 w-5 text-purple-400" /><span>Webhook Configuration</span></CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start space-x-2">
                      <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-300">Set webhook to: <code className="bg-muted px-1 rounded">https://your-app-url/api/v1/telegram/webhook</code></p>
                    </div>
                    <div><Label className="text-muted-foreground">Webhook URL</Label><Input placeholder="https://your-domain.com/api/v1/telegram/webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                    <Button onClick={handleSetWebhook} disabled={webhookLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                      {webhookLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Setting Webhook...</> : <><Webhook className="h-4 w-4 mr-2" />Set Webhook</>}
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleResetConfig} className="border-slate-500 text-slate-200 hover:text-foreground gap-1.5"><RotateCcw className="h-4 w-4" /> Discard</Button>
                  <Button onClick={handleSaveConfig} disabled={configSaving || !configChanged} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* MESSAGES */}
          <TabsContent value="messages" className="space-y-6 mt-0">
            {!user ? (
              <Card className="bg-card border-border"><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">Log in to edit message templates</p><Button onClick={() => login()} className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button></CardContent></Card>
            ) : configLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            : (
              <>
                <UnsavedBar />
                <div className="bg-muted/40 rounded-xl p-3 border border-border flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Supported placeholders: <code className="bg-muted px-1 rounded text-muted-foreground">{'{name}'}</code> <code className="bg-muted px-1 rounded text-muted-foreground">{'{amount}'}</code> <code className="bg-muted px-1 rounded text-muted-foreground">{'{description}'}</code> <code className="bg-muted px-1 rounded text-muted-foreground">{'{external_id}'}</code>. Leave any field empty to use the built-in default.</p>
                </div>

                {[
                  { field: 'welcome_message_en' as const, title: 'Welcome Message (English)', icon: <Globe className="h-4 w-4 text-blue-400" />, desc: 'Shown when a user sends /start and selects English.', rows: 7 },
                  { field: 'welcome_message_zh' as const, title: 'Welcome Message (Chinese)', icon: <Globe className="h-4 w-4 text-red-400" />, desc: 'Shown when a user sends /start and selects Chinese.', rows: 7 },
                  { field: 'payment_success_message' as const, title: 'Payment Success Message', icon: <CheckCircle className="h-4 w-4 text-emerald-400" />, desc: 'Sent when a payment is confirmed as paid.', rows: 6 },
                  { field: 'payment_failed_message' as const, title: 'Payment Failed / Expired Message', icon: <XCircle className="h-4 w-4 text-red-400" />, desc: 'Sent when a payment expires or fails.', rows: 6 },
                  { field: 'payment_pending_message' as const, title: 'Payment Pending Message', icon: <Loader2 className="h-4 w-4 text-amber-400" />, desc: 'Sent when a payment is awaiting confirmation.', rows: 6 },
                  { field: 'maintenance_message' as const, title: 'Maintenance Message', icon: <Wrench className="h-4 w-4 text-amber-400" />, desc: 'Sent to all users when bot is in maintenance mode.', rows: 4 },
                ].map(({ field, title, icon, desc, rows }) => (
                  <Card key={field} className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-foreground flex items-center gap-2 text-base">{icon}{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">{desc}</p>
                      <Textarea value={localConfig[field]} onChange={(e) => setLocalConfig(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder="Leave empty to use default..." className="bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-xs resize-y" rows={rows} />
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-muted-foreground">{localConfig[field].length} chars</span>
                        <Button size="sm" variant="outline" onClick={() => setDefaultTemplate(field)} className="border-slate-500 text-muted-foreground hover:text-foreground text-xs gap-1">
                          <RotateCcw className="h-3 w-3" /> Use Default
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleResetConfig} className="border-slate-500 text-slate-200 hover:text-foreground gap-1.5"><RotateCcw className="h-4 w-4" /> Discard</Button>
                  <Button onClick={handleSaveConfig} disabled={configSaving || !configChanged} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Messages
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* COMMANDS */}
          <TabsContent value="commands" className="space-y-4 mt-0">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Terminal className="h-5 w-5 text-cyan-400" />Available Bot Commands</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">All commands built into your bot. These are always active for users.</p>
                <div className="space-y-3">
                  {COMMAND_CATEGORIES.map((cat) => {
                    const cmds = BOT_COMMANDS.filter(c => c.category === cat);
                    const isExpanded = expandedCategories[cat];
                    return (
                      <div key={cat} className="border border-border rounded-xl overflow-hidden">
                        <button onClick={() => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                          className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-foreground font-medium text-sm">{cat}</span>
                            <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">{cmds.length}</Badge>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        {isExpanded && (
                          <div className="divide-y divide-slate-700/40">
                            {cmds.map(({ cmd, emoji, desc }) => (
                              <div key={cmd} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                                <span className="text-lg w-6 text-center">{emoji}</span>
                                <code className="text-blue-400 font-mono text-sm font-medium w-28 shrink-0">{cmd}</code>
                                <p className="text-muted-foreground text-sm flex-1">{desc}</p>
                                <button onClick={() => copyToClipboard(cmd, `${cmd} copied!`)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-blue-400" />Register with BotFather</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Paste the list below to @BotFather using <code className="bg-muted px-1 rounded">/setcommands</code> to enable autocomplete for users.</p>
                <div className="relative">
                  <pre className="bg-background border border-border rounded-lg p-4 text-[11px] text-muted-foreground font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                    {BOT_COMMANDS.map(c => `${c.cmd.replace('/', '')} - ${c.desc}`).join('\n')}
                  </pre>
                  <button onClick={() => copyToClipboard(BOT_COMMANDS.map(c => `${c.cmd.replace('/', '')} - ${c.desc}`).join('\n'), 'Command list copied!')}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-foreground bg-muted rounded p-1.5"><Copy className="h-3.5 w-3.5" /></button>
                </div>
                <ol className="space-y-1">
                  {['Open Telegram -> @BotFather', 'Send /setcommands and select your bot', 'Paste the list above and send'].map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="h-4 w-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>{s}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TESTING */}
          <TabsContent value="testing" className="space-y-6 mt-0">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground flex items-center space-x-2"><FlaskConical className="h-5 w-5 text-green-400" /><span>Test Bot Connection</span></CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Confirm the bot token is configured and Telegram API is reachable.</p>
                <Button onClick={handleTestBot} disabled={testLoading} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium">
                  {testLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Tests...</> : <><FlaskConical className="h-4 w-4 mr-2" />Run Bot Test</>}
                </Button>
                {testRan && (
                  <div className="space-y-2 pt-1">
                    {testChecks.map((check) => (
                      <div key={check.name} className={`flex items-start space-x-3 rounded-lg p-3 ${check.passed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        {check.passed ? <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                        <div><p className={`text-sm font-medium ${check.passed ? 'text-emerald-300' : 'text-red-300'}`}>{check.name}</p><p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border ring-1 ring-amber-500/20">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-amber-400" /><span>Simulate Webhook</span>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 border text-[10px] ml-2">TEST</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start space-x-2">
                  <Radio className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-300">Send a test payment event to verify real-time notifications. No actual payment required.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Transaction Type</Label>
                    <Select value={simType} onValueChange={setSimType}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        <SelectItem value="invoice" className="text-blue-400">Invoice</SelectItem>
                        <SelectItem value="qr_code" className="text-purple-400">QR Code</SelectItem>
                        <SelectItem value="payment_link" className="text-cyan-400">Payment Link</SelectItem>
                        <SelectItem value="alipay_qr" className="text-red-400">Alipay QR</SelectItem>
                        <SelectItem value="wechat_qr" className="text-green-400">WeChat QR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Target Status</Label>
                    <Select value={simStatus} onValueChange={setSimStatus}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        <SelectItem value="paid" className="text-emerald-400">Paid</SelectItem>
                        <SelectItem value="expired" className="text-red-400">Expired</SelectItem>
                        <SelectItem value="pending" className="text-amber-400">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Amount (PHP)</Label>
                    <Input type="number" placeholder="1000" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" min="1" />
                  </div>
                </div>
                <div><Label className="text-muted-foreground">Description (optional)</Label><Input placeholder="Test payment for order #123" value={simDescription} onChange={(e) => setSimDescription(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                <Button onClick={handleSimulateWebhook} disabled={simLoading} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium">
                  {simLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><Zap className="h-4 w-4 mr-2" />Send Test Event</>}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground flex items-center space-x-2"><Send className="h-5 w-5 text-cyan-400" /><span>Send Test Message</span></CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><Label className="text-muted-foreground">Chat ID</Label><Input placeholder="Telegram chat ID" value={chatId} onChange={(e) => setChatId(e.target.value)} className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" /></div>
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Message</Label>
                    <div className="flex mt-1 space-x-2">
                      <Textarea placeholder="Type your test message..." value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none" rows={1} />
                      <Button onClick={handleSendMessage} disabled={sendLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
                        {sendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
