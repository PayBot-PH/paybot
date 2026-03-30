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
import {
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  Info,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  MessageCircle,
  Settings,
  FlaskConical,
  Save,
  RotateCcw,
  Power,
  Wrench,
  Globe,
  Webhook,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

interface PageInfo {
  id: string;
  name: string;
}

interface MessengerConfig {
  id?: number;
  messenger_bot_status: string;
  messenger_page_id: string;
  messenger_page_access_token: string;
  messenger_app_id: string;
  messenger_app_secret: string;
  messenger_verify_token: string;
}

const EMPTY_CONFIG: MessengerConfig = {
  messenger_bot_status: 'inactive',
  messenger_page_id: '',
  messenger_page_access_token: '',
  messenger_app_id: '',
  messenger_app_secret: '',
  messenger_verify_token: '',
};

export default function MessengerPage() {
  const { user, login } = useAuth();

  const [config, setConfig] = useState<MessengerConfig | null>(null);
  const [localConfig, setLocalConfig] = useState<MessengerConfig>(EMPTY_CONFIG);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [recipientId, setRecipientId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  const getErr = (e: unknown) => {
    const err = e as { data?: { detail?: string; message?: string }; message?: string };
    return err?.data?.detail || err?.data?.message || err?.message || 'Unknown error';
  };
  const is401 = (e: unknown) => {
    const err = e as { status?: number; data?: { detail?: string } };
    return err?.status === 401 || (typeof err?.data?.detail === 'string' && err.data.detail.toLowerCase().includes('unauthorized'));
  };

  const fetchConfig = useCallback(async () => {
    if (!user) return;
    setConfigLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/messenger/bot-config', method: 'GET', data: {} });
      if (res.data?.success) {
        const cfg = res.data as MessengerConfig;
        setConfig(cfg);
        setLocalConfig(cfg);
      }
    } catch (e) {
      if (!is401(e)) toast.error(`Could not load Messenger config: ${getErr(e)}`);
    } finally {
      setConfigLoading(false);
    }
  }, [user]);

  const fetchPageInfo = async () => {
    setPageLoading(true);
    setPageError('');
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/messenger/page-info', method: 'GET', data: {} });
      if (res.data?.success) {
        setPageInfo(res.data.page as PageInfo);
      } else {
        setPageError(res.data?.error || 'Failed to get page info');
        toast.error(res.data?.error || 'Failed to get page info');
      }
    } catch (e) {
      const m = getErr(e);
      setPageError(m);
      toast.error(`Page info failed: ${m}`);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/messenger/bot-config', method: 'PUT', data: localConfig });
      if (res.data?.success) {
        const cfg = res.data as MessengerConfig;
        setConfig(cfg);
        setLocalConfig(cfg);
        toast.success('Messenger settings saved!');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (e) {
      toast.error(is401(e) ? 'Please log in first.' : getErr(e));
    } finally {
      setConfigSaving(false);
    }
  };

  const handleResetConfig = () => {
    if (config) setLocalConfig(config);
    else setLocalConfig(EMPTY_CONFIG);
    toast.info('Changes discarded');
  };

  const handleSendMessage = async () => {
    if (!recipientId || !testMessage) { toast.error('Enter recipient ID and message'); return; }
    setSendLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/messenger/send-message',
        method: 'POST',
        data: { recipient_id: recipientId, message: testMessage },
      });
      if (res.data?.success) { toast.success('Message sent!'); setTestMessage(''); }
      else toast.error(res.data?.error || 'Failed to send message');
    } catch (e) {
      toast.error(is401(e) ? 'Please log in first.' : getErr(e));
    } finally {
      setSendLoading(false);
    }
  };

  const copyToClipboard = (text: string, label = 'Copied!') => {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  const configChanged = JSON.stringify(localConfig) !== JSON.stringify(config);

  const statusColor = (s: string) =>
    s === 'active'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : s === 'maintenance'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30';

  const UnsavedBar = () =>
    configChanged ? (
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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-blue-400" /> Messenger Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure your Facebook Messenger channel</p>
          </div>
          {config && (
            <Badge className={`border text-xs ${statusColor(localConfig.messenger_bot_status)}`}>
              {localConfig.messenger_bot_status === 'active' ? (
                <CheckCircle className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {localConfig.messenger_bot_status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/60 border border-border p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="credentials" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <Key className="h-3.5 w-3.5" /> Credentials
            </TabsTrigger>
            <TabsTrigger value="testing" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Testing
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Setup Guide */}
              <Card className="md:col-span-2 bg-card border-blue-500/30 ring-1 ring-blue-500/15">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <MessageCircle className="h-4 w-4 text-blue-400" />
                    </div>
                    Connect a Facebook Page
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Facebook Page to receive and send Messenger messages. You'll need a Facebook App with the Messenger product enabled.
                  </p>
                  <div className="bg-muted/40 rounded-xl p-3 border border-border">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Quick steps</p>
                    <ol className="space-y-1">
                      {[
                        'Create a Facebook App at developers.facebook.com',
                        'Add the Messenger product to your app',
                        'Generate a Page Access Token for your Facebook Page',
                        'Set the webhook URL below and enter your verify token',
                        'Enter your credentials in the Credentials tab and save',
                      ].map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="h-4 w-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                </CardContent>
              </Card>

              {/* Webhook URL */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center space-x-2">
                    <Webhook className="h-5 w-5 text-purple-400" />
                    <span>Webhook URL</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Register this URL in your Facebook App's Messenger webhook settings. Facebook will send all Messenger events to this endpoint.
                  </p>
                  <div className="bg-muted/60 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Webhook URL</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-foreground break-all flex-1">
                        {window.location.origin}/api/v1/messenger/webhook
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `${window.location.origin}/api/v1/messenger/webhook`,
                            'Webhook URL copied'
                          )
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-300">
                      Subscribe to the <strong>messages</strong> and <strong>messaging_postbacks</strong> fields. Make sure to use the same verify token as configured in the Credentials tab.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Page Information */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center space-x-2">
                    <Globe className="h-5 w-5 text-blue-400" />
                    <span>Page Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pageLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                    </div>
                  ) : pageInfo ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <MessageCircle className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{pageInfo.name}</p>
                          <p className="text-sm text-muted-foreground">Page ID: {pageInfo.id}</p>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border ml-auto">
                          <CheckCircle className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      </div>
                      <Button onClick={fetchPageInfo} variant="outline" size="sm" className="w-full border-slate-500 text-slate-200 hover:text-foreground hover:bg-muted">
                        Refresh Info
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                      <p className="text-muted-foreground mb-3">Page not connected</p>
                      {pageError && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3 text-left">
                          <p className="text-xs text-red-400 font-mono break-all">{pageError}</p>
                        </div>
                      )}
                      <Button onClick={fetchPageInfo} variant="outline" size="sm" className="border-slate-500 text-slate-200 hover:text-foreground hover:bg-muted">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Check Connection
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bot Status */}
            {!user ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">Log in to manage Messenger settings</p>
                  <Button onClick={() => login()} className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button>
                </CardContent>
              </Card>
            ) : configLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <>
                <UnsavedBar />
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Power className="h-5 w-5 text-emerald-400" />
                      Channel Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Control whether this Messenger channel is active.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(['active', 'inactive'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setLocalConfig((prev) => ({ ...prev, messenger_bot_status: status }))}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            localConfig.messenger_bot_status === status
                              ? status === 'active'
                                ? 'border-emerald-500/60 bg-emerald-500/10'
                                : 'border-red-500/60 bg-red-500/10'
                              : 'border-border bg-muted/30 hover:border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {status === 'active' ? (
                              <CheckCircle className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400" />
                            )}
                            <span
                              className={`text-sm font-semibold capitalize ${
                                localConfig.messenger_bot_status === status
                                  ? status === 'active'
                                    ? 'text-emerald-300'
                                    : 'text-red-300'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {status}
                            </span>
                            {localConfig.messenger_bot_status === status && (
                              <CheckCircle className="h-3.5 w-3.5 ml-auto text-blue-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {status === 'active' ? 'Messenger channel is active' : 'Messenger channel is disabled'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleResetConfig} className="border-slate-500 text-slate-200 hover:text-foreground gap-1.5">
                    <RotateCcw className="h-4 w-4" /> Discard
                  </Button>
                  <Button onClick={handleSaveConfig} disabled={configSaving || !configChanged} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Settings
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* CREDENTIALS */}
          <TabsContent value="credentials" className="space-y-6 mt-0">
            {!user ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">Log in to manage credentials</p>
                  <Button onClick={() => login()} className="bg-blue-600 hover:bg-blue-700 text-white">Log In</Button>
                </CardContent>
              </Card>
            ) : configLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <>
                <UnsavedBar />
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-300">
                    Credentials are stored securely. Alternatively, you can set them as environment variables:
                    <code className="ml-1 bg-muted px-1 rounded">MESSENGER_PAGE_ACCESS_TOKEN</code>,
                    <code className="ml-1 bg-muted px-1 rounded">MESSENGER_APP_SECRET</code>,
                    <code className="ml-1 bg-muted px-1 rounded">MESSENGER_VERIFY_TOKEN</code>.
                  </p>
                </div>

                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Key className="h-5 w-5 text-violet-400" />
                      Facebook App Credentials
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">App ID</Label>
                      <Input
                        placeholder="123456789012345"
                        value={localConfig.messenger_app_id}
                        onChange={(e) => setLocalConfig((prev) => ({ ...prev, messenger_app_id: e.target.value }))}
                        className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground">App Secret</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          placeholder="App secret from developers.facebook.com"
                          value={localConfig.messenger_app_secret}
                          onChange={(e) => setLocalConfig((prev) => ({ ...prev, messenger_app_secret: e.target.value }))}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-9 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Used to verify incoming webhook signatures.</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-blue-400" />
                      Page Credentials
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Page ID</Label>
                      <Input
                        placeholder="Your Facebook Page numeric ID"
                        value={localConfig.messenger_page_id}
                        onChange={(e) => setLocalConfig((prev) => ({ ...prev, messenger_page_id: e.target.value }))}
                        className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Page Access Token</Label>
                      <div className="relative mt-1">
                        <Input
                          type={showToken ? 'text' : 'password'}
                          placeholder="EAA..."
                          value={localConfig.messenger_page_access_token}
                          onChange={(e) =>
                            setLocalConfig((prev) => ({ ...prev, messenger_page_access_token: e.target.value }))
                          }
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-9 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Generate this token from your Facebook Page settings → Advanced Messaging.
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Webhook Verify Token</Label>
                      <Input
                        placeholder="A secret string you choose (e.g. myverifytoken123)"
                        value={localConfig.messenger_verify_token}
                        onChange={(e) =>
                          setLocalConfig((prev) => ({ ...prev, messenger_verify_token: e.target.value }))
                        }
                        className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        This must match the <code className="bg-muted px-1 rounded">MESSENGER_VERIFY_TOKEN</code> environment variable (or the global setting) used to verify the webhook with Facebook.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleResetConfig} className="border-slate-500 text-slate-200 hover:text-foreground gap-1.5">
                    <RotateCcw className="h-4 w-4" /> Discard
                  </Button>
                  <Button onClick={handleSaveConfig} disabled={configSaving || !configChanged} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Credentials
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* TESTING */}
          <TabsContent value="testing" className="space-y-6 mt-0">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center space-x-2">
                  <FlaskConical className="h-5 w-5 text-green-400" />
                  <span>Test Page Connection</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Verify that your Page Access Token is valid and can reach the Facebook Graph API.
                </p>
                <Button
                  onClick={fetchPageInfo}
                  disabled={pageLoading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                >
                  {pageLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking...</>
                  ) : (
                    <><Globe className="h-4 w-4 mr-2" />Check Page Connection</>
                  )}
                </Button>
                {pageInfo && (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-300 font-semibold text-sm">Connected</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Page Name</p>
                        <p className="text-sm text-foreground font-medium">{pageInfo.name}</p>
                      </div>
                      <div className="bg-muted/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Page ID</p>
                        <p className="text-sm text-foreground font-mono">{pageInfo.id}</p>
                      </div>
                    </div>
                  </div>
                )}
                {pageError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-xs text-red-400 font-mono break-all">{pageError}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center space-x-2">
                  <Send className="h-5 w-5 text-cyan-400" />
                  <span>Send Test Message</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-300">
                    The recipient must have previously messaged your page. Enter their Page-Scoped User ID (PSID).
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Recipient PSID</Label>
                    <Input
                      placeholder="Page-Scoped User ID"
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Message</Label>
                    <div className="flex mt-1 space-x-2">
                      <Textarea
                        placeholder="Type your test message..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                        rows={1}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={sendLoading}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
                      >
                        {sendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Maintenance notice */}
                <div className="bg-muted/40 rounded-xl p-3 border border-border flex items-start gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold mb-1">Notes</p>
                    <ul className="space-y-0.5">
                      {[
                        'Message sending requires a valid Page Access Token in the Credentials tab.',
                        'The recipient must have sent at least one message to your Page within the last 24 hours (standard messaging window).',
                        'For production use, request the pages_messaging permission in your Facebook App.',
                      ].map((note, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-muted-foreground mt-0.5">•</span>
                          {note}
                        </li>
                      ))}
                    </ul>
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
