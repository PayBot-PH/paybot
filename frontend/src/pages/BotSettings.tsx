import { useEffect, useState, useCallback } from 'react';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { fmt } from '@/lib/format';

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
  whatsapp_number: string;
}

const BOT_COMMANDS = [
  { cmd: '/start',      emoji: '🚀', category: 'General',   desc: 'Welcome message + language selection' },
  { cmd: '/help',       emoji: '❓', category: 'General',   desc: 'Full command reference guide' },
  { cmd: '/balance',    emoji: '💰', category: 'Wallet',    desc: 'View PHP wallet balance & history' },
  { cmd: '/wallet',     emoji: '💳', category: 'Wallet',    desc: 'Manage your wallet (Send, Top-up, Withdraw)' },
  { cmd: '/invoice',    emoji: '📄', category: 'Payments',  desc: 'Create a payment invoice' },
  { cmd: '/qr',         emoji: '📱', category: 'Payments',  desc: 'Generate a QR code payment' },
  { cmd: '/pay',        emoji: '💳', category: 'Payments',  desc: 'Interactive payment menu' },
  { cmd: '/disburse',   emoji: '💸', category: 'Transfers', desc: 'Send money to bank account' },
  { cmd: '/send',       emoji: '📤', category: 'Transfers', desc: 'Send PHP to another user' },
  { cmd: '/topup',      emoji: '⬆️', category: 'Transfers', desc: 'Top up PHP wallet via USDT' },
  { cmd: '/status',     emoji: '🔍', category: 'Tools',     desc: 'Check a payment status by ID' },
  { cmd: '/list',       emoji: '📋', category: 'Tools',     desc: 'Recent transactions list' },
  { cmd: '/report',     emoji: '📊', category: 'Tools',     desc: 'Daily / weekly / monthly report' },
];

const COMMAND_CATEGORIES = ['General', 'Wallet', 'Payments', 'Transfers', 'Tools'];

const DEFAULT_TEMPLATES = {
  welcome_message_en: `👋 Welcome to PayBot PH!\n━━━━━━━━━━━━━━━━━━━━\nHi {name}! 🎉 Your all-in-one Philippine payment gateway is ready.\n\n📄 /invoice · 📱 /qr · 🔗 /link\n💸 /disburse · 📤 /send · 💰 /wallet\n\nType /help for the full guide.`,
  welcome_message_zh: `👋 欢迎使用 PayBot PH！\n━━━━━━━━━━━━━━━━━━━━\n嗨 {name}！🎉 您的一站式菲律宾支付机器人已就绪。\n\n📄 /invoice · 📱 /qr · 🔗 /link\n💸 /disburse · 📤 /send · 💰 /wallet\n\n输入 /help 查看完整参考。`,
  payment_success_message: `✅ Payment Successful!\n━━━━━━━━━━━━━━━━━━━━\n💰 Amount: ₱{amount}\n📝 Description: {description}\n🆔 Ref: {external_id}\n\nThank you for your payment! 🎉`,
  payment_failed_message: `❌ Payment Failed\n━━━━━━━━━━━━━━━━━━━━\n💰 Amount: ₱{amount}\n📝 Description: {description}\n🆔 Ref: {external_id}\n\nPlease try again or contact support.`,
  payment_pending_message: `⏳ Payment Pending\n━━━━━━━━━━━━━━━━━━━━\n💰 Amount: ₱{amount}\n📝 Description: {description}\n🆔 Ref: {external_id}\n\nWaiting for confirmation...`,
  maintenance_message: `🛠️ Bot is under maintenance\nWe'll be back shortly. Thank you for your patience!`,
};

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
    whatsapp_number: '',
  });

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
      else setBotError(res.data?.message || 'Failed');
    } catch (e) {
      if (!is401(e)) setBotError(getErr(e));
    } finally { setBotLoading(false); }
  };

  const fetchWebhookInfo = async () => {
    setWebhookInfoLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/webhook-info', method: 'GET', data: {} });
      setWebhookInfo(res.data as WebhookInfo);
    } catch { /* ignore */ }
    finally { setWebhookInfoLoading(false); }
  };

  const fetchCloneInfo = async () => {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/info', method: 'GET', data: {} });
      setCloneInfo(res.data as CloneBotInfo);
    } catch { /* ignore */ }
  };

  const fetchBotConfig = useCallback(async () => {
    if (!user) return;
    setConfigLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/bot-config', method: 'GET', data: {} });
      if (res.data?.success) { const cfg = res.data as BotConfig; setBotConfig(cfg); setLocalConfig(cfg); }
    } catch { /* ignore */ }
    finally { setConfigLoading(false); }
  }, [user]);

  useEffect(() => { fetchBotInfo(); }, []);
  useEffect(() => { if (user) { fetchWebhookInfo(); fetchCloneInfo(); fetchBotConfig(); } }, [user, fetchBotConfig]);

  const handleCloneValidate = async () => {
    if (!cloneToken.trim()) return;
    setCloneValidating(true); setCloneValidated(null);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/validate', method: 'POST', data: { bot_token: cloneToken.trim() } });
      if (res.data?.success) { setCloneValidated(res.data.bot as BotInfo); toast.success('Token verified'); }
      else toast.error('Invalid token');
    } catch (e) { toast.error(getErr(e)); } finally { setCloneValidating(false); }
  };

  const handleCloneSave = async () => {
    setCloneSaving(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/clone-bot/save', method: 'POST', data: { bot_token: cloneToken.trim() } });
      if (res.data?.success) { toast.success('Bot successfully cloned'); await fetchCloneInfo(); setCloneToken(''); setCloneValidated(null); }
    } catch (e) { toast.error(getErr(e)); } finally { setCloneSaving(false); }
  };

  const handleAutoSetup = async () => {
    setAutoSetupLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/auto-setup', method: 'POST', data: {} });
      if ((res.data as any)?.success) { toast.success('Webhook auto-registered'); await fetchWebhookInfo(); }
    } catch (e) { toast.error(getErr(e)); }
    finally { setAutoSetupLoading(false); }
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/telegram/bot-config', method: 'PUT', data: localConfig });
      if (res.data?.success) { const cfg = res.data as BotConfig; setBotConfig(cfg); setLocalConfig(cfg); toast.success('Settings saved'); }
    } catch (e) { toast.error(getErr(e)); }
    finally { setConfigSaving(false); }
  };

  const configChanged = JSON.stringify(localConfig) !== JSON.stringify(botConfig);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
              <Bot className="h-8 w-8 text-brand-blue-500" />
              Bot Intelligence
            </h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Configure your Telegram merchant bot and automated messages</p>
          </div>
          <div className="flex items-center gap-2">
            {localConfig.bot_status === 'active' && (
              <Badge className="bg-emerald-500 text-white border-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                <CheckCircle className="h-3 w-3 mr-1.5 inline" /> Live
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowTutorial(true)} className="border-border/60 font-bold text-[10px] uppercase tracking-widest h-9 rounded-xl">
              <Info className="h-3.5 w-3.5 mr-2" /> Help Guide
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="bg-muted/50 border border-border/60 p-1 h-auto flex-wrap sm:inline-flex gap-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[11px] uppercase tracking-widest">
              <Settings className="h-3.5 w-3.5 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="messages" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[11px] uppercase tracking-widest">
              <MessageSquare className="h-3.5 w-3.5 mr-2" /> Messages
            </TabsTrigger>
            <TabsTrigger value="commands" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[11px] uppercase tracking-widest">
              <Terminal className="h-3.5 w-3.5 mr-2" /> Commands
            </TabsTrigger>
            <TabsTrigger value="testing" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[11px] uppercase tracking-widest">
              <FlaskConical className="h-3.5 w-3.5 mr-2" /> Testing
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-border/60 shadow-sm overflow-hidden">
                  <div className="h-1.5 bg-brand-blue-500 w-full" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-black uppercase tracking-tight">Merchant Bot Token</CardTitle>
                    <CardDescription className="font-medium text-xs">Register your custom bot from @BotFather to handle payments</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-6">
                    {cloneInfo?.configured && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-emerald-100 text-emerald-500">
                            <Bot className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-emerald-900 uppercase tracking-tight">{cloneInfo.bot_name}</p>
                            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">@{cloneInfo.bot_username}</p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-500 text-white border-0 font-black text-[9px] uppercase tracking-widest px-3">Connected</Badge>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">BotFather API Token</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1 group">
                          <Input
                            type={showToken ? 'text' : 'password'}
                            placeholder="1234567890:AAF..."
                            value={cloneToken}
                            onChange={(e) => { setCloneToken(e.target.value); setCloneValidated(null); }}
                            className="bg-muted/20 border-border/60 h-12 font-mono text-xs pr-10 rounded-xl"
                          />
                          <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-brand-blue-500 transition-colors">
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button onClick={handleCloneValidate} disabled={cloneValidating || !cloneToken.trim()} variant="outline" className="h-12 border-border/60 font-black text-xs px-6 rounded-xl uppercase tracking-widest">
                          {cloneValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                        </Button>
                      </div>
                    </div>

                    {cloneValidated && (
                      <div className="bg-brand-blue-50 border border-brand-blue-100 rounded-2xl p-5 animate-in zoom-in-95">
                         <div className="flex items-center gap-4 mb-5">
                            <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-brand-blue-500">
                              <Sparkles className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-black text-brand-blue-900 uppercase">{cloneValidated.first_name}</p>
                              <p className="text-xs font-bold text-brand-blue-600">@{cloneValidated.username}</p>
                            </div>
                         </div>
                         <Button onClick={handleCloneSave} disabled={cloneSaving} className="w-full h-12 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-xl uppercase tracking-widest shadow-lg shadow-brand-blue-500/20 transition-all">
                           {cloneSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Webhook className="h-4 w-4 mr-2" />}
                           Complete Installation
                         </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm overflow-hidden">
                   <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-black uppercase tracking-tight">Cloud Webhook</CardTitle>
                    <CardDescription className="font-medium text-xs">Bridge your bot to our cloud payment processors</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="bg-muted/20 border border-border/60 rounded-2xl p-5">
                       <div className="flex items-center justify-between mb-4">
                         <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Deployment Status</p>
                         {webhookInfo?.is_registered ? (
                           <Badge className="bg-emerald-500 text-white border-0 font-black text-[8px] uppercase px-2">Healthy</Badge>
                         ) : <Badge className="bg-rose-500 text-white border-0 font-black text-[8px] uppercase px-2">Disconnected</Badge>}
                       </div>
                       <code className="block p-4 bg-black/5 dark:bg-white/5 rounded-xl text-[11px] font-bold text-foreground break-all border border-black/5">
                         {webhookInfo?.webhook_url || 'https://---'}
                       </code>
                    </div>
                    <Button onClick={handleAutoSetup} disabled={autoSetupLoading} className="w-full h-12 bg-muted/60 hover:bg-muted border border-border/60 text-foreground font-black rounded-xl uppercase tracking-[0.15em] transition-all">
                       {autoSetupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2 text-amber-500" />}
                       Auto-Repair Connection
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Bot Engine Control</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {(['active', 'inactive', 'maintenance'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setLocalConfig(prev => ({ ...prev, bot_status: s }))}
                          className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                            localConfig.bot_status === s
                              ? 'bg-brand-blue-50 border-brand-blue-500 shadow-sm'
                              : 'bg-card border-border/40 hover:border-brand-blue-200'
                          }`}
                        >
                          <div className="text-left">
                            <p className={`text-xs font-black uppercase tracking-widest ${localConfig.bot_status === s ? 'text-brand-blue-600' : 'text-muted-foreground'}`}>{s}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">{s === 'active' ? 'Full response mode' : s === 'maintenance' ? 'Hold pattern' : 'Offline'}</p>
                          </div>
                          {localConfig.bot_status === s && <CheckCircle className="h-4 w-4 text-brand-blue-500" />}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm bg-muted/20">
                  <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">CRM Integration</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">WhatsApp Business</Label>
                      <Input
                        placeholder="639171234567"
                        value={localConfig.whatsapp_number}
                        onChange={e => setLocalConfig(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                        className="bg-card border-border/60 h-11 text-sm font-bold rounded-xl"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {configChanged && (
              <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8">
                <Card className="bg-brand-blue-600 border-0 shadow-2xl p-4 flex items-center gap-6 rounded-2xl min-w-[320px]">
                  <p className="text-white text-xs font-black uppercase tracking-widest flex-1">Configuration has unsaved changes</p>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => setLocalConfig(botConfig!)} variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 font-bold text-xs uppercase tracking-tighter h-9 px-4">Discard</Button>
                    <Button onClick={handleSaveConfig} disabled={configSaving} className="bg-white text-brand-blue-600 hover:bg-white/90 font-black text-xs uppercase tracking-widest h-9 px-6 rounded-xl shadow-sm">
                      {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* MESSAGES */}
          <TabsContent value="messages" className="mt-0 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { field: 'welcome_message_en' as const, label: 'EN | Welcome', icon: '🇺🇸' },
                  { field: 'welcome_message_zh' as const, label: 'ZH | 欢迎', icon: '🇨🇳' },
                  { field: 'payment_success_message' as const, label: 'Success Notification', icon: '✅' },
                  { field: 'payment_pending_message' as const, label: 'Pending Notification', icon: '⏳' },
                  { field: 'payment_failed_message' as const, label: 'Failure / Expiry', icon: '❌' },
                  { field: 'maintenance_message' as const, label: 'Maintenance Notice', icon: '🛠️' },
                ].map(m => (
                  <Card key={m.field} className="border-border/60 shadow-sm overflow-hidden">
                    <div className="bg-muted/30 border-b border-border/40 px-5 py-3 flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <span>{m.icon}</span> {m.label}
                      </p>
                      <button onClick={() => setLocalConfig(prev => ({...prev, [m.field]: DEFAULT_TEMPLATES[m.field]}))} className="text-[9px] font-black text-brand-blue-500 uppercase tracking-tighter hover:underline">Reset to Default</button>
                    </div>
                    <CardContent className="p-4">
                      <Textarea
                        value={localConfig[m.field]}
                        onChange={e => setLocalConfig(prev => ({...prev, [m.field]: e.target.value}))}
                        className="min-h-[160px] bg-muted/10 border-border/40 text-xs font-bold leading-relaxed resize-none rounded-xl"
                      />
                    </CardContent>
                  </Card>
                ))}
             </div>
          </TabsContent>

          {/* COMMANDS */}
          <TabsContent value="commands" className="mt-0">
             <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-tight">Active Commands</CardTitle>
                  <CardDescription className="text-xs font-medium">Built-in operations supported by the PayBot Kernel</CardDescription>
                </CardHeader>
                <CardContent className="p-0 border-t border-border/40">
                  <div className="divide-y divide-border/30">
                    {BOT_COMMANDS.map(c => (
                      <div key={c.cmd} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                        <div className="h-10 w-10 rounded-2xl bg-brand-blue-50 flex items-center justify-center shrink-0 border border-brand-blue-100 text-xl shadow-sm">
                          {c.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <code className="text-sm font-black text-brand-blue-600 bg-brand-blue-50/50 px-2 py-0.5 rounded-lg tracking-tight">{c.cmd}</code>
                          <p className="text-[11px] text-muted-foreground font-bold mt-1 uppercase tracking-tight">{c.desc}</p>
                        </div>
                        <Badge className="bg-muted text-muted-foreground border-0 font-black text-[8px] uppercase tracking-widest">{c.category}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
             </Card>
          </TabsContent>

          {/* TESTING */}
          <TabsContent value="testing" className="mt-0">
             <Card className="border-border/60 shadow-sm overflow-hidden">
                <div className="h-1.5 bg-emerald-500 w-full" />
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-tight">Kernel diagnostics</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <Button onClick={handleTestBot} disabled={testLoading} className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
                    {testLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <FlaskConical className="h-5 w-5 mr-2" />}
                    Initialize Full System Test
                  </Button>

                  {testRan && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                      {testChecks.map(check => (
                        <div key={check.name} className={`p-4 rounded-2xl border-2 ${check.passed ? 'bg-emerald-50 border-emerald-500/30' : 'bg-rose-50 border-rose-500/30'}`}>
                           <div className="flex items-center gap-2 mb-2">
                             {check.passed ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                             <p className="text-[10px] font-black uppercase tracking-widest text-foreground">{check.name}</p>
                           </div>
                           <p className="text-[11px] font-bold text-muted-foreground leading-tight">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
           <Card className="max-w-md border-0 bg-card shadow-2xl rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="bg-brand-blue-500 p-10 flex flex-col items-center text-center">
                 <div className="h-20 w-20 rounded-[2rem] bg-white/20 backdrop-blur-md flex items-center justify-center mb-6 shadow-inner border border-white/20">
                   <Sparkles className="h-10 w-10 text-white animate-pulse" />
                 </div>
                 <h2 className="text-2xl font-black text-white uppercase tracking-tight">Command Your Bot</h2>
                 <p className="text-brand-blue-50 text-sm font-bold mt-2 uppercase tracking-widest opacity-80">PayBot Intelligence Engine</p>
              </div>
              <CardContent className="p-10 space-y-6">
                 <div className="space-y-4">
                    {[
                      { icon: Key, title: 'Bot Token', desc: 'Secure your API token from @BotFather' },
                      { icon: Webhook, title: 'Cloud Bridge', desc: 'Auto-setup takes only 2 seconds' },
                      { icon: MessageSquare, title: 'Personalize', desc: 'Edit welcome messages in EN/ZH' },
                    ].map((step, i) => (
                      <div key={i} className="flex gap-4 items-start">
                         <div className="h-10 w-10 rounded-2xl bg-muted/50 flex items-center justify-center shrink-0 border border-border/40">
                           <step.icon className="h-5 w-5 text-brand-blue-500" />
                         </div>
                         <div>
                           <p className="text-xs font-black uppercase tracking-widest text-foreground">{step.title}</p>
                           <p className="text-xs font-medium text-muted-foreground mt-0.5">{step.desc}</p>
                         </div>
                      </div>
                    ))}
                 </div>
                 <Button onClick={dismissTutorial} className="w-full h-14 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl shadow-xl shadow-brand-blue-500/20 uppercase tracking-widest transition-all active:scale-95 mt-4">
                    Get Started
                 </Button>
              </CardContent>
           </Card>
        </div>
      )}
    </Layout>
  );
}
