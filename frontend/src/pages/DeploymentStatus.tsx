pimport { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Bot,
  CreditCard,
  Globe,
  Server,
  Loader2,
  Activity,
} from 'lucide-react';
import Layout from '@/components/Layout';

interface ServiceStatus {
  configured: boolean;
  healthy?: boolean;
  status?: string;
  mode?: string;
  username?: string | null;
}

interface DeploymentData {
  status: string;
  environment: string;
  platform: string;
  app_name: string;
  version: string;
  services: {
    database: ServiceStatus;
    telegram: ServiceStatus;
    xendit: ServiceStatus;
    paymongo: ServiceStatus;
    photonpay: ServiceStatus;
    transfi: ServiceStatus;
  };
}

const SERVICE_META: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  database:  { label: 'Database',   icon: <Database className="h-5 w-5" />,   description: 'PostgreSQL / SQLite connection' },
  telegram:  { label: 'Telegram',   icon: <Bot className="h-5 w-5" />,         description: 'Telegram Bot API token' },
  xendit:    { label: 'Xendit',     icon: <CreditCard className="h-5 w-5" />,  description: 'Xendit payment gateway (PH)' },
  paymongo:  { label: 'PayMongo',   icon: <CreditCard className="h-5 w-5" />,  description: 'PayMongo payment gateway' },
  photonpay: { label: 'PhotonPay',  icon: <Globe className="h-5 w-5" />,       description: 'Alipay / WeChat Pay (via PhotonPay)' },
  transfi:   { label: 'TransFi',    icon: <Globe className="h-5 w-5" />,       description: 'USDT / crypto payment gateway' },
};

function StatusIcon({ ok, size = 'sm' }: { ok: boolean; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  return ok
    ? <CheckCircle className={`${cls} text-emerald-400`} />
    : <XCircle className={`${cls} text-red-400`} />;
}

function ServiceCard({ name, data }: { name: string; data: ServiceStatus }) {
  const meta = SERVICE_META[name] ?? { label: name, icon: <Server className="h-5 w-5" />, description: '' };

  const isHealthy =
    name === 'database'
      ? data.healthy === true
      : data.configured;

  const badgeText = name === 'database'
    ? (data.healthy ? 'Healthy' : 'Unhealthy')
    : (data.configured ? 'Configured' : 'Not configured');

  const badgeCls = isHealthy
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';

  return (
    <Card className="bg-muted/60 border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {meta.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{meta.label}</p>
              <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
              {data.mode && (
                <p className="text-xs text-muted-foreground mt-0.5">Mode: <span className="text-slate-300">{data.mode}</span></p>
              )}
              {data.username && (
                <p className="text-xs text-muted-foreground mt-0.5">Username: <span className="text-slate-300">@{data.username}</span></p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusIcon ok={isHealthy} />
            <Badge className={`text-xs border ${badgeCls}`}>{badgeText}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DeploymentStatus() {
  const [data, setData] = useState<DeploymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/health/deployment');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json: DeploymentData = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deployment status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const overallOk = data?.status === 'healthy';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 py-6">

          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <Activity className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Deployment Status</h1>
                <p className="text-sm text-muted-foreground">
                  {lastRefreshed
                    ? `Last checked at ${lastRefreshed.toLocaleTimeString()}`
                    : 'Checking services…'}
                </p>
              </div>
            </div>
            <Button
              onClick={fetchStatus}
              disabled={loading}
              variant="outline"
              className="border-slate-600 text-slate-200 hover:bg-slate-700"
              size="sm"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Refreshing…</>
                : <><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</>}
            </Button>
          </div>

          {/* Overall status banner */}
          {!loading && data && (
            <Card className={`border ${overallOk ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <StatusIcon ok={overallOk} size="lg" />
                <div>
                  <p className={`text-lg font-bold ${overallOk ? 'text-emerald-300' : 'text-red-300'}`}>
                    {overallOk ? 'All Systems Operational' : 'Service Degraded'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {data.app_name} v{data.version} · {data.environment} · {data.platform}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {!loading && error && (
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="bg-muted/60 border-border animate-pulse">
                  <CardContent className="p-4 h-20" />
                </Card>
              ))}
            </div>
          )}

          {/* Service cards */}
          {!loading && data && (
            <>
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Services</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(data.services).map(([name, svc]) => (
                    <ServiceCard key={name} name={name} data={svc} />
                  ))}
                </div>
              </div>

              {/* Summary counts */}
              <Card className="bg-muted/60 border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-slate-300">Summary</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-3 divide-x divide-slate-700">
                    {(() => {
                      const services = Object.entries(data.services);
                      const configured = services.filter(([n, s]) =>
                        n === 'database' ? s.healthy === true : s.configured
                      ).length;
                      const notConfigured = services.length - configured;
                      return (
                        <>
                          <div className="text-center pr-4">
                            <p className="text-2xl font-bold text-white">{services.length}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                          </div>
                          <div className="text-center px-4">
                            <p className="text-2xl font-bold text-emerald-400">{configured}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Healthy / Configured</p>
                          </div>
                          <div className="text-center pl-4">
                            <p className="text-2xl font-bold text-red-400">{notConfigured}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Issues</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
      </div>
    </Layout>
  );
}
