import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { client } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Bug,
  Code2,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Webhook,
} from 'lucide-react';

interface ApiConfig {
  id: number;
  config_key: string;
  config_value: string;
  service_name: string;
  is_active?: boolean;
  updated_at?: string | null;
}

interface WebhookInfo {
  webhook_url: string;
  is_registered: boolean;
  pending_update_count: number;
  last_error_message: string;
  message: string;
  token_configured: boolean;
}

const EVENT_TYPES = ['invoice', 'payment_link', 'qr_code'];
const EVENT_STATUSES = ['paid', 'pending', 'failed', 'cancelled'];
const AVAILABLE_SCOPES = [
  { key: 'payments:read', label: 'Payments Read' },
  { key: 'payments:write', label: 'Payments Write' },
  { key: 'customers:read', label: 'Customers Read' },
  { key: 'customers:write', label: 'Customers Write' },
  { key: 'disbursements:read', label: 'Disbursements Read' },
  { key: 'disbursements:write', label: 'Disbursements Write' },
  { key: 'wallet:read', label: 'Wallet Read' },
  { key: 'wallet:write', label: 'Wallet Write' },
  { key: 'webhooks:read', label: 'Webhooks Read' },
  { key: 'webhooks:manage', label: 'Webhooks Manage' },
] as const;

const SCOPE_TAGS: Record<string, string> = {
  'payments:read': 'pr',
  'payments:write': 'pw',
  'customers:read': 'cr',
  'customers:write': 'cw',
  'disbursements:read': 'dr',
  'disbursements:write': 'dw',
  'wallet:read': 'wr',
  'wallet:write': 'ww',
  'webhooks:read': 'hr',
  'webhooks:manage': 'hm',
};

export default function DeveloperExperience() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);

  const [serviceName, setServiceName] = useState('paymongo');
  const [configKey, setConfigKey] = useState('payment_api_key');
  const [configValue, setConfigValue] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'payments:read',
    'payments:write',
    'webhooks:read',
  ]);

  const [eventType, setEventType] = useState('invoice');
  const [eventStatus, setEventStatus] = useState('paid');
  const [eventAmount, setEventAmount] = useState('100');
  const [eventDescription, setEventDescription] = useState('Developer test callback');

  const secretKeyRegex = /(secret|token|api[_-]?key|private|password)/i;

  const apiKeys = useMemo(
    () => configs.filter(
      (c) =>
        !/(callback|webhook|url)/i.test(c.config_key) &&
        !/_scopes$/i.test(c.config_key) &&
        !/_issued_at$/i.test(c.config_key)
    ),
    [configs]
  );

  const keyScopesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    configs.forEach((item) => {
      if (!/_scopes$/i.test(item.config_key)) return;
      const baseKey = item.config_key.replace(/_scopes$/i, '');
      const scopes = item.config_value
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      map.set(baseKey, scopes);
    });
    return map;
  }, [configs]);

  const callbackConfigs = useMemo(
    () => configs.filter((c) => /(callback|webhook|url)/i.test(c.config_key)),
    [configs]
  );

  const maskedValue = (key: string, value: string) => {
    if (!value) return '';
    if (!secretKeyRegex.test(key)) return value;
    if (value.length <= 8) return '*'.repeat(value.length);
    return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
  };

  const generateApiKey = () => {
    if (selectedScopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const prefix = serviceName.trim().toLowerCase() || 'payment';
    const scopeTag = selectedScopes
      .map((scope) => SCOPE_TAGS[scope] || 'x')
      .sort()
      .join('');
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const generated = `${prefix}_live_${scopeTag}_${random}`;
    setConfigKey(`payment_api_key_${scopeTag}_${timestamp}`);
    setConfigValue(generated);
    toast.success('Scoped payment API key generated');
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      if (prev.includes(scope)) {
        return prev.filter((item) => item !== scope);
      }
      return [...prev, scope];
    });
  };

  const applyScopePreset = (preset: 'readonly' | 'integration' | 'full') => {
    if (preset === 'readonly') {
      setSelectedScopes(['payments:read', 'customers:read', 'wallet:read', 'webhooks:read']);
      return;
    }
    if (preset === 'integration') {
      setSelectedScopes(['payments:read', 'payments:write', 'customers:read', 'webhooks:manage']);
      return;
    }
    setSelectedScopes(AVAILABLE_SCOPES.map((scope) => scope.key));
  };

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/entities/api_configs?limit=200&sort=-updated_at&reveal=true',
        method: 'GET',
        data: {},
      });
      setConfigs((res.data?.items || []) as ApiConfig[]);
    } catch {
      toast.error('Failed to load developer configs');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookInfo = async () => {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/telegram/webhook-info',
        method: 'GET',
        data: {},
      });
      setWebhookInfo(res.data as WebhookInfo);
    } catch {
      setWebhookInfo(null);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchWebhookInfo();
  }, []);

  const createConfig = async () => {
    if (!serviceName.trim() || !configKey.trim() || !configValue.trim()) {
      toast.error('Service, key, and value are required');
      return;
    }

    try {
      setSaving(true);
      const normalizedService = serviceName.trim();
      const normalizedKey = configKey.trim();
      const normalizedValue = configValue.trim();
      const isGeneratedApiKey = /payment_api_key/i.test(normalizedKey);

      if (isGeneratedApiKey) {
        if (selectedScopes.length === 0) {
          toast.error('Select at least one scope for generated API key');
          return;
        }
        await client.apiCall.invoke({
          url: '/api/v1/entities/api_configs/batch',
          method: 'POST',
          data: {
            items: [
              {
                service_name: normalizedService,
                config_key: normalizedKey,
                config_value: normalizedValue,
                is_active: isActive,
              },
              {
                service_name: normalizedService,
                config_key: `${normalizedKey}_scopes`,
                config_value: selectedScopes.slice().sort().join(','),
                is_active: true,
              },
              {
                service_name: normalizedService,
                config_key: `${normalizedKey}_issued_at`,
                config_value: new Date().toISOString(),
                is_active: true,
              },
            ],
          },
        });
      } else {
        await client.apiCall.invoke({
          url: '/api/v1/entities/api_configs',
          method: 'POST',
          data: {
            service_name: normalizedService,
            config_key: normalizedKey,
            config_value: normalizedValue,
            is_active: isActive,
          },
        });
      }

      toast.success('Developer config saved');
      setConfigValue('');
      await fetchConfigs();
    } catch (err: any) {
      toast.error(err?.data?.detail || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async (id: number) => {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/api_configs/${id}`,
        method: 'DELETE',
        data: {},
      });
      toast.success('Config removed');
      await fetchConfigs();
    } catch {
      toast.error('Failed to remove config');
    }
  };

  const simulateCallback = async () => {
    const amount = Number(eventAmount || '0');
    if (!amount || amount <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    try {
      setSimulating(true);
      await client.apiCall.invoke({
        url: '/api/v1/events/simulate',
        method: 'POST',
        data: {
          transaction_type: eventType,
          status: eventStatus,
          amount,
          description: eventDescription || undefined,
        },
      });
      toast.success('Callback simulation dispatched');
    } catch {
      toast.error('Failed to simulate callback');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Code2 className="h-6 w-6 text-blue-400" />
              Developer Experience
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage API keys, callback URLs, and webhook testing tools in one place.
            </p>
          </div>
          <Button variant="outline" onClick={() => { fetchConfigs(); fetchWebhookInfo(); }} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-4 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">Webhook Status</div>
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-cyan-400" />
                  {webhookInfo?.is_registered ? 'Registered' : 'Not Registered'}
                </div>
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">API Config Entries</div>
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-400" />
                  {configs.length}
                </div>
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/20">
                <div className="text-xs text-muted-foreground mb-1">Pending Webhook Updates</div>
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Bug className="h-4 w-4 text-violet-400" />
                  {webhookInfo?.pending_update_count ?? 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="configs" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configs">API Configs</TabsTrigger>
            <TabsTrigger value="callbacks">Callbacks</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="configs" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Create API Config</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border p-3 bg-muted/20 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Generate Payment Integration API Key</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Creates a strong key with selected scopes and pre-fills config fields for saving.</p>
                  </div>
                  <Button type="button" variant="outline" className="gap-2" onClick={generateApiKey}>
                    <KeyRound className="h-4 w-4" />
                    Generate Key
                  </Button>
                </div>
                <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScopePreset('readonly')}>Read-only</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScopePreset('integration')}>Integration</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScopePreset('full')}>Full Access</Button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">API Key Scopes</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {AVAILABLE_SCOPES.map((scope) => {
                        const active = selectedScopes.includes(scope.key);
                        return (
                          <button
                            key={scope.key}
                            type="button"
                            onClick={() => toggleScope(scope.key)}
                            className={`px-2 py-1 rounded-md border text-xs transition ${active ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'bg-background border-border text-muted-foreground'}`}
                          >
                            {scope.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Service Name</Label>
                    <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="paymongo" />
                  </div>
                  <div>
                    <Label>Config Key</Label>
                    <Input value={configKey} onChange={(e) => setConfigKey(e.target.value)} placeholder="api_key" />
                  </div>
                </div>
                <div>
                  <Label>Config Value</Label>
                  <Input value={configValue} onChange={(e) => setConfigValue(e.target.value)} placeholder="Paste value" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
                <Button onClick={createConfig} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Save Config
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Stored API Keys</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : apiKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No API key configs yet.</p>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-3 bg-muted/20">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">{item.service_name} · {item.config_key}</div>
                            {keyScopesMap.get(item.config_key)?.length ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {keyScopesMap.get(item.config_key)!.map((scope) => (
                                  <Badge key={scope} variant="secondary" className="text-[10px]">{scope}</Badge>
                                ))}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground break-all mt-1">{maskedValue(item.config_key, item.config_value)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'active' : 'inactive'}</Badge>
                            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(item.config_value).then(() => toast.success('Copied'))}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteConfig(item.id)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="callbacks" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Callback URLs</CardTitle>
              </CardHeader>
              <CardContent>
                {callbackConfigs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No callback/webhook URL configs found.</p>
                ) : (
                  <div className="space-y-3">
                    {callbackConfigs.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-3 bg-muted/20 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Globe className="h-4 w-4 text-cyan-400" />
                            {item.service_name} · {item.config_key}
                          </div>
                          <div className="text-xs text-muted-foreground break-all mt-1">{item.config_value}</div>
                        </div>
                        <Button size="sm" variant="destructive" onClick={() => deleteConfig(item.id)}>Delete</Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Webhook Runtime Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Status: <span className="text-foreground">{webhookInfo?.is_registered ? 'Registered' : 'Not Registered'}</span></p>
                <p>Webhook URL: <span className="text-foreground break-all">{webhookInfo?.webhook_url || 'N/A'}</span></p>
                {webhookInfo?.last_error_message ? (
                  <p className="text-red-400">Last Error: {webhookInfo.last_error_message}</p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tools" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Callback Simulator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Event Type</Label>
                    <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                      {EVENT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={eventStatus} onChange={(e) => setEventStatus(e.target.value)}>
                      {EVENT_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" min="1" value={eventAmount} onChange={(e) => setEventAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} />
                  </div>
                </div>
                <Button onClick={simulateCallback} disabled={simulating} className="gap-2">
                  {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Test Callback
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
