import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Bug,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

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

// ─── constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = ['invoice', 'payment_link', 'qr_code'];
const EVENT_STATUSES = ['paid', 'pending', 'failed', 'cancelled'];

const AVAILABLE_SCOPES = [
  { key: 'payments:read',       label: 'Payments Read',       color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  { key: 'payments:write',      label: 'Payments Write',      color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  { key: 'customers:read',      label: 'Customers Read',      color: 'bg-violet-500/10 text-violet-600 border-violet-500/30' },
  { key: 'customers:write',     label: 'Customers Write',     color: 'bg-violet-500/10 text-violet-600 border-violet-500/30' },
  { key: 'disbursements:read',  label: 'Disbursements Read',  color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  { key: 'disbursements:write', label: 'Disbursements Write', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  { key: 'wallet:read',         label: 'Wallet Read',         color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { key: 'wallet:write',        label: 'Wallet Write',        color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { key: 'webhooks:read',       label: 'Webhooks Read',       color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30' },
  { key: 'webhooks:manage',     label: 'Webhooks Manage',     color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30' },
] as const;

const SCOPE_TAGS: Record<string, string> = {
  'payments:read': 'pr', 'payments:write': 'pw',
  'customers:read': 'cr', 'customers:write': 'cw',
  'disbursements:read': 'dr', 'disbursements:write': 'dw',
  'wallet:read': 'wr', 'wallet:write': 'ww',
  'webhooks:read': 'hr', 'webhooks:manage': 'hm',
};

const SCOPE_PRESETS = [
  { label: 'Read-only',   scopes: ['payments:read', 'customers:read', 'wallet:read', 'webhooks:read'] },
  { label: 'Integration', scopes: ['payments:read', 'payments:write', 'customers:read', 'webhooks:manage'] },
  { label: 'Full Access', scopes: AVAILABLE_SCOPES.map((s) => s.key) as string[] },
];

const SECRET_RE = /(secret|token|api[_-]?key|private|password)/i;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

function maskValue(key: string, value: string) {
  if (!value || !SECRET_RE.test(key)) return value;
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 6)}${'*'.repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

function CopyBtn({ text, size = 'sm' }: { text: string; size?: 'sm' | 'xs' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };
  if (size === 'xs') {
    return (
      <button onClick={copy} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 h-7 px-2">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function ScopeTag({ scope }: { scope: string }) {
  const def = AVAILABLE_SCOPES.find((s) => s.key === scope);
  if (!def) return <Badge variant="outline" className="text-[10px] font-mono">{scope}</Badge>;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${def.color}`}>
      {def.label}
    </span>
  );
}

function ConfirmDelete({ onConfirm, onCancel, label }: { onConfirm: () => void; onCancel: () => void; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-500/10"><AlertCircle className="h-5 w-5 text-red-500" /></div>
          <div>
            <p className="font-semibold text-foreground text-sm">Delete config?</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-mono text-foreground">{label}</span> will be permanently removed. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DeveloperExperience() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ApiConfig | null>(null);
  const [simResult, setSimResult] = useState<'success' | 'error' | null>(null);

  // Create form state
  const [keyName, setKeyName] = useState('');
  const [serviceName, setServiceName] = useState('xend');
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['payments:read', 'payments:write', 'webhooks:read']);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Callback form state
  const [cbKey, setCbKey] = useState('');
  const [cbValue, setCbValue] = useState('');
  const [cbService, setCbService] = useState('xend');
  const [showCbForm, setShowCbForm] = useState(false);
  const [savingCb, setSavingCb] = useState(false);

  // Simulator state
  const [eventType, setEventType] = useState('invoice');
  const [eventStatus, setEventStatus] = useState('paid');
  const [eventAmount, setEventAmount] = useState('500');
  const [eventDescription, setEventDescription] = useState('Developer test event');

  // ── derived ──
  const apiKeys = useMemo(
    () => configs.filter(
      (c) => !/(callback|webhook|url)/i.test(c.config_key) &&
             !/_scopes$/i.test(c.config_key) &&
             !/_issued_at$/i.test(c.config_key)
    ),
    [configs]
  );

  const keyScopesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    configs.forEach((item) => {
      if (!/_scopes$/i.test(item.config_key)) return;
      const base = item.config_key.replace(/_scopes$/i, '');
      map.set(base, item.config_value.split(',').map((v) => v.trim()).filter(Boolean));
    });
    return map;
  }, [configs]);

  const issuedAtMap = useMemo(() => {
    const map = new Map<string, string>();
    configs.forEach((item) => {
      if (!/_issued_at$/i.test(item.config_key)) return;
      const base = item.config_key.replace(/_issued_at$/i, '');
      map.set(base, item.config_value);
    });
    return map;
  }, [configs]);

  const callbackConfigs = useMemo(
    () => configs.filter((c) => /(callback|webhook|url)/i.test(c.config_key)),
    [configs]
  );

  const activeKeyCount = apiKeys.filter((k) => k.is_active).length;

  // ── fetch ──
  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/v1/entities/api_configs?limit=200&sort=-updated_at&reveal=true');
      setConfigs((data?.items || []) as ApiConfig[]);
    } catch {
      toast.error('Failed to load configs');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookInfo = async () => {
    try {
      const data = await apiFetch('/api/v1/telegram/webhook-info');
      setWebhookInfo(data as WebhookInfo);
    } catch {
      setWebhookInfo(null);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchWebhookInfo();
  }, []);

  // ── key generation ──
  const generateKey = () => {
    if (selectedScopes.length === 0) { toast.error('Select at least one scope'); return; }
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const scopeTag = selectedScopes.map((s) => SCOPE_TAGS[s] || 'x').sort().join('');
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const prefix = (keyName.trim() || serviceName.trim() || 'xend').toLowerCase().replace(/\s+/g, '_');
    const generated = `${prefix}_live_${scopeTag}_${random}`;
    setConfigKey(`payment_api_key_${scopeTag}_${ts}`);
    setConfigValue(generated);
    toast.success('API key generated — review and save below');
  };

  const toggleScope = (scope: string) =>
    setSelectedScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);

  // ── create ──
  const createConfig = async () => {
    if (!serviceName.trim() || !configKey.trim() || !configValue.trim()) {
      toast.error('Service, key, and value are required');
      return;
    }
    try {
      setSaving(true);
      const isApiKey = /payment_api_key/i.test(configKey.trim());
      if (isApiKey) {
        if (selectedScopes.length === 0) { toast.error('Select at least one scope'); return; }
        await apiFetch('/api/v1/entities/api_configs/batch', {
          method: 'POST',
          body: JSON.stringify({
            items: [
              { service_name: serviceName.trim(), config_key: configKey.trim(), config_value: configValue.trim(), is_active: isActive },
              { service_name: serviceName.trim(), config_key: `${configKey.trim()}_scopes`, config_value: selectedScopes.slice().sort().join(','), is_active: true },
              { service_name: serviceName.trim(), config_key: `${configKey.trim()}_issued_at`, config_value: new Date().toISOString(), is_active: true },
            ],
          }),
        });
      } else {
        await apiFetch('/api/v1/entities/api_configs', {
          method: 'POST',
          body: JSON.stringify({ service_name: serviceName.trim(), config_key: configKey.trim(), config_value: configValue.trim(), is_active: isActive }),
        });
      }
      toast.success('Config saved');
      setConfigKey(''); setConfigValue(''); setKeyName('');
      setShowCreateForm(false);
      await fetchConfigs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  // ── save callback ──
  const saveCallback = async () => {
    if (!cbKey.trim() || !cbValue.trim()) { toast.error('Key and URL are required'); return; }
    try {
      setSavingCb(true);
      await apiFetch('/api/v1/entities/api_configs', {
        method: 'POST',
        body: JSON.stringify({ service_name: cbService.trim() || 'xend', config_key: cbKey.trim(), config_value: cbValue.trim(), is_active: true }),
      });
      toast.success('Callback URL saved');
      setCbKey(''); setCbValue('');
      setShowCbForm(false);
      await fetchConfigs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save callback URL');
    } finally {
      setSavingCb(false);
    }
  };

  // ── delete ──
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/v1/entities/api_configs/${deleteTarget.id}`, { method: 'DELETE' });
      // also remove associated _scopes and _issued_at entries
      const related = configs.filter(
        (c) => c.config_key === `${deleteTarget.config_key}_scopes` ||
               c.config_key === `${deleteTarget.config_key}_issued_at`
      );
      await Promise.all(related.map((r) =>
        apiFetch(`/api/v1/entities/api_configs/${r.id}`, { method: 'DELETE' }).catch(() => {})
      ));
      toast.success('Config deleted');
      setDeleteTarget(null);
      await fetchConfigs();
    } catch {
      toast.error('Failed to delete config');
    }
  };

  // ── simulate ──
  const simulateCallback = async () => {
    const amount = Number(eventAmount || '0');
    if (!amount || amount <= 0) { toast.error('Amount must be greater than zero'); return; }
    try {
      setSimulating(true);
      setSimResult(null);
      await apiFetch('/api/v1/events/simulate', {
        method: 'POST',
        body: JSON.stringify({ transaction_type: eventType, status: eventStatus, amount, description: eventDescription || undefined }),
      });
      setSimResult('success');
      toast.success('Test event dispatched');
    } catch {
      setSimResult('error');
      toast.error('Failed to dispatch test event');
    } finally {
      setSimulating(false);
    }
  };

  const toggleReveal = (id: number) =>
    setRevealedKeys((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      {deleteTarget && (
        <ConfirmDelete
          label={`${deleteTarget.service_name} · ${deleteTarget.config_key}`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="max-w-5xl mx-auto space-y-6 pb-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Code2 className="h-6 w-6 text-blue-500" />
              Developer Experience
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage API keys, callback URLs, and test your integration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/api-docs">
              <Button variant="outline" size="sm" className="gap-2">
                <BookOpen className="h-4 w-4" />
                API Docs
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => { fetchConfigs(); fetchWebhookInfo(); }} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'API Keys',
              value: apiKeys.length,
              sub: `${activeKeyCount} active`,
              icon: <KeyRound className="h-4 w-4 text-amber-500" />,
              accent: 'bg-amber-500/10 border-amber-500/20',
            },
            {
              label: 'Callback URLs',
              value: callbackConfigs.length,
              sub: 'endpoints',
              icon: <Globe className="h-4 w-4 text-cyan-500" />,
              accent: 'bg-cyan-500/10 border-cyan-500/20',
            },
            {
              label: 'Webhook',
              value: webhookInfo?.is_registered ? 'Active' : 'Inactive',
              sub: webhookInfo?.token_configured ? 'token set' : 'no token',
              icon: <Webhook className="h-4 w-4 text-violet-500" />,
              accent: webhookInfo?.is_registered ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-muted/60 border-border',
            },
            {
              label: 'Pending Updates',
              value: webhookInfo?.pending_update_count ?? 0,
              sub: 'webhook queue',
              icon: <Bug className="h-4 w-4 text-rose-500" />,
              accent: 'bg-rose-500/10 border-rose-500/20',
            },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.accent}`}>
              <div className="flex items-center gap-2 mb-1">
                {s.icon}
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="keys" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-10">
            <TabsTrigger value="keys" className="gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />API Keys
            </TabsTrigger>
            <TabsTrigger value="callbacks" className="gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />Callbacks
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />Test Tools
            </TabsTrigger>
          </TabsList>

          {/* ── API Keys tab ──────────────────────────────────────────────── */}
          <TabsContent value="keys" className="space-y-4 mt-4">

            {/* Create key panel */}
            <Card className="border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-500" />
                  Create API Key
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowCreateForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showCreateForm ? 'Cancel' : 'New Key'}
                </Button>
              </CardHeader>

              {showCreateForm && (
                <CardContent className="space-y-5 pt-0">
                  {/* Key name + service */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Key Name <span className="text-muted-foreground">(display label)</span></Label>
                      <Input
                        placeholder="e.g. Production Backend"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Service</Label>
                      <Input
                        placeholder="xend"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Scope selector */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Scopes</Label>
                      <div className="flex gap-1.5">
                        {SCOPE_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setSelectedScopes(p.scopes)}
                            className="px-2 py-0.5 rounded text-[10px] border border-border hover:border-blue-500/50 hover:text-blue-600 text-muted-foreground transition-colors"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {AVAILABLE_SCOPES.map((scope) => {
                        const active = selectedScopes.includes(scope.key);
                        return (
                          <button
                            key={scope.key}
                            type="button"
                            onClick={() => toggleScope(scope.key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              active ? scope.color : 'border-border/60 text-muted-foreground hover:border-border'
                            }`}
                          >
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${active ? 'bg-current' : 'bg-muted-foreground/40'}`} />
                            {scope.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Generate + key value */}
                  <div className="space-y-2.5">
                    <Button type="button" variant="outline" size="sm" className="gap-2 h-8" onClick={generateKey}>
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      Generate Key
                    </Button>
                    {configValue && (
                      <div className="relative">
                        <Label className="text-xs mb-1.5 block">Generated Key <span className="text-red-500 text-[10px]">— copy now, won't be shown again</span></Label>
                        <div className="flex gap-2">
                          <Input
                            value={configValue}
                            readOnly
                            className="h-9 text-xs font-mono bg-muted/40"
                          />
                          <CopyBtn text={configValue} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Config key (auto-filled) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Config Key <span className="text-muted-foreground">(auto-filled by generator)</span></Label>
                    <Input
                      placeholder="payment_api_key_..."
                      value={configKey}
                      onChange={(e) => setConfigKey(e.target.value)}
                      className="h-9 text-sm font-mono"
                    />
                  </div>

                  {/* Active toggle + save */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <div className="flex items-center gap-2">
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                      <span className="text-xs text-muted-foreground">Active on creation</span>
                    </div>
                    <Button onClick={createConfig} disabled={saving} size="sm" className="gap-2 h-8">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      Save Key
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Keys list */}
            <div className="space-y-2">
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <div className="p-3 rounded-xl bg-muted/60">
                    <KeyRound className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No API keys yet. Create one above.</p>
                </div>
              ) : (
                apiKeys.map((item) => {
                  const scopes = keyScopesMap.get(item.config_key) || [];
                  const issuedAt = issuedAtMap.get(item.config_key);
                  const revealed = revealedKeys.has(item.id);
                  const displayValue = revealed ? item.config_value : maskValue(item.config_key, item.config_value);

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/60 bg-card hover:border-border transition-all"
                    >
                      <div className="flex items-start gap-3 p-4">
                        <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
                          <KeyRound className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">{item.service_name}</span>
                            <span className="text-muted-foreground">·</span>
                            <code className="text-xs font-mono text-muted-foreground">{item.config_key}</code>
                            <Badge
                              variant={item.is_active ? 'default' : 'secondary'}
                              className={`text-[10px] ml-auto ${item.is_active ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border' : ''}`}
                            >
                              {item.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>

                          {scopes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {scopes.map((s) => <ScopeTag key={s} scope={s} />)}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded flex-1 min-w-0 truncate">
                              {displayValue}
                            </code>
                            <button
                              onClick={() => toggleReveal(item.id)}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                              title={revealed ? 'Hide' : 'Reveal'}
                            >
                              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <CopyBtn text={item.config_value} size="xs" />
                          </div>

                          {issuedAt && (
                            <p className="text-[10px] text-muted-foreground">
                              Issued {new Date(issuedAt).toLocaleString()}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* ── Callbacks tab ─────────────────────────────────────────────── */}
          <TabsContent value="callbacks" className="space-y-4 mt-4">

            {/* Webhook runtime status */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-violet-500" />
                  Webhook Runtime Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${webhookInfo?.is_registered ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span className="text-sm font-medium text-foreground">
                        {webhookInfo?.is_registered ? 'Registered' : 'Not Registered'}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
                    <p className="text-xs text-muted-foreground">Token</p>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${webhookInfo?.token_configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-sm font-medium text-foreground">
                        {webhookInfo?.token_configured ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
                {webhookInfo?.webhook_url && (
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-foreground break-all flex-1">{webhookInfo.webhook_url}</code>
                      <CopyBtn text={webhookInfo.webhook_url} size="xs" />
                    </div>
                  </div>
                )}
                {webhookInfo?.last_error_message && (
                  <div className="rounded-lg border border-red-500/30 p-3 bg-red-500/10 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{webhookInfo.last_error_message}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add callback URL */}
            <Card className="border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-500" />
                  Callback URLs
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowCbForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showCbForm ? 'Cancel' : 'Add URL'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {showCbForm && (
                  <div className="rounded-xl border border-border/60 p-4 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Service</Label>
                        <Input placeholder="xend" value={cbService} onChange={(e) => setCbService(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Key</Label>
                        <Input placeholder="callback_url" value={cbKey} onChange={(e) => setCbKey(e.target.value)} className="h-9 text-sm font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">URL</Label>
                        <Input placeholder="https://yourdomain.com/webhook" value={cbValue} onChange={(e) => setCbValue(e.target.value)} className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={saveCallback} disabled={savingCb} className="gap-2 h-8">
                        {savingCb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Save URL
                      </Button>
                    </div>
                  </div>
                )}

                {callbackConfigs.length === 0 ? (
                  <div className="py-8 flex flex-col items-center gap-2 text-center">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No callback URLs configured yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {callbackConfigs.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border/60 p-3 bg-card hover:border-border transition-all">
                        <Globe className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">{item.service_name}</span>
                            <span className="text-muted-foreground">·</span>
                            <code className="text-xs font-mono text-muted-foreground">{item.config_key}</code>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <code className="text-xs font-mono text-blue-500 break-all flex-1 min-w-0 truncate">{item.config_value}</code>
                            <CopyBtn text={item.config_value} size="xs" />
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tools tab ─────────────────────────────────────────────────── */}
          <TabsContent value="tools" className="space-y-4 mt-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-500" />
                  Event Simulator
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Fire a test webhook event to verify your callback URL is receiving and processing events correctly.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Event Type</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                    >
                      {EVENT_TYPES.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={eventStatus}
                      onChange={(e) => setEventStatus(e.target.value)}
                    >
                      {EVENT_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (PHP)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={eventAmount}
                      onChange={(e) => setEventAmount(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="Developer test event"
                    />
                  </div>
                </div>

                {/* Payload preview */}
                <div className="rounded-xl border border-border/60 bg-slate-900 p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Payload Preview</p>
                  <pre className="text-xs text-slate-300 font-mono leading-relaxed">
{`{
  "event": "${eventType}.${eventStatus}",
  "data": {
    "transaction_type": "${eventType}",
    "status": "${eventStatus}",
    "amount": ${eventAmount || 0},
    "description": "${eventDescription}"
  }
}`}
                  </pre>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={simulateCallback} disabled={simulating} className="gap-2 h-9">
                    {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Test Event
                  </Button>
                  {simResult === 'success' && (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                      <Check className="h-4 w-4" /> Dispatched successfully
                    </div>
                  )}
                  {simResult === 'error' && (
                    <div className="flex items-center gap-1.5 text-red-500 text-sm">
                      <AlertCircle className="h-4 w-4" /> Dispatch failed
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick reference */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-slate-500" />
                  Quick Reference
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl bg-slate-900 border border-slate-700/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/60 bg-slate-800/60">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">CURL</span>
                    <CopyBtn text={`curl -X POST /api/v1/xend/invoice \\\n  -H "X-API-Key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 500, "description": "Test order", "external_id": "order-001"}'`} size="xs" />
                  </div>
                  <pre className="p-4 text-xs text-slate-300 font-mono leading-relaxed overflow-x-auto">
{`curl -X POST /api/v1/xend/invoice \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 500,
    "description": "Test order",
    "external_id": "order-001"
  }'`}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  For the full API reference, visit the{' '}
                  <Link to="/api-docs" className="text-blue-500 hover:underline">API Documentation</Link> page.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
