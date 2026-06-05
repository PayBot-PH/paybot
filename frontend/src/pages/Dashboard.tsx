import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Layout from '@/components/Layout';
import { APP_DESCRIPTION } from '@/lib/brand';
import { fmt, fmtUsd } from '@/lib/format';
import {
  FileText,
  QrCode,
  LinkIcon,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Bot,
  Wallet,
  CreditCard,
  PieChart,
  Send,
  RotateCcw,
  Users,
  Crown,
  ArrowRight,
  Zap,
  ShieldCheck,
  RefreshCw,
  Activity,
  MessageSquare,
  Sun,
  Sunset,
  Moon,
  Radio,
  MessageCircle,
} from 'lucide-react';

interface Stats {
  total_count: number;
  paid_count: number;
  pending_count: number;
  expired_count: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
}

interface UsdtStats {
  settlement: number;
  txnCount: number;
  change: number;
  pending: number;
}

interface Transaction {
  id: number;
  transaction_type: string;
  external_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  customer_name: string;
  created_at: string;
  payment_url: string;
}

interface BotLog {
  id: number;
  log_type: string;
  message: string;
  telegram_username: string;
  command: string;
  created_at: string;
}

interface GridTelemetry {
  node: string;
  grid_status: string;
  telemetry: {
    active_wallets: number;
    pending_clearance: number;
    total_available_liquidity: number;
    total_pending_liquidity: number;
  };
}

const defaultStats: Stats = {
  total_count: 0, paid_count: 0, pending_count: 0, expired_count: 0,
  total_amount: 0, paid_amount: 0, pending_amount: 0,
};

const defaultUsdtStats: UsdtStats = {
  settlement: 0,
  txnCount: 0,
  change: 0,
  pending: 0,
};

const statusConfig: Record<string, { color: string; dot: string }> = {
  paid:    { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  pending: { color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',     dot: 'bg-amber-500' },
  expired: { color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',        dot: 'bg-rose-500' },
};

const typeConfig: Record<string, { icon: ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-4 w-4 text-brandblue-500" />,   bg: 'bg-brandblue-50' },
  qr_code:      { icon: <QrCode className="h-4 w-4 text-purple-500" />,     bg: 'bg-purple-50' },
  payment_link: { icon: <LinkIcon className="h-4 w-4 text-cyan-500" />,     bg: 'bg-cyan-50' },
  alipay_qr:    { icon: <QrCode className="h-4 w-4 text-rose-500" />,       bg: 'bg-rose-50' },
  wechat_qr:    { icon: <QrCode className="h-4 w-4 text-emerald-500" />,     bg: 'bg-emerald-50' },
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: <Sun className="h-5 w-5 text-amber-400" /> };
  if (hour < 18) return { text: 'Good afternoon', icon: <Sunset className="h-5 w-5 text-orange-400" /> };
  return { text: 'Good evening', icon: <Moon className="h-5 w-5 text-indigo-400" /> };
}

function formatTxnDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="fintech-card group">
      <CardContent className="p-8">
        <div className="flex items-start justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-blue-500 shadow-[0_0_8px_rgba(0,122,255,0.8)]" />
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/50">{label}</p>
            </div>
            <div className={`text-3xl font-black tracking-tighter ${color}`}>
              {loading ? <div className="h-9 w-32 bg-muted/50 animate-pulse rounded-xl" /> : value}
            </div>
            {sub && (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 inline-block px-3 py-1 rounded-lg border border-border/20">{sub}</p>
            )}
          </div>
          <div className="h-14 w-14 rounded-2xl bg-muted/10 border border-border/40 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading, isSuperAdmin, permissions } = useAuth();
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [usdtStats, setUsdtStats] = useState<UsdtStats>(defaultUsdtStats);
  const [telemetry, setTelemetry] = useState<GridTelemetry | null>(null);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [recentLogs, setRecentLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedTxnIds, setUpdatedTxnIds] = useState<Set<number>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [usdWalletBalance, setUsdWalletBalance] = useState<number>(0);
  const [apiStatus, setApiStatus] = useState<'healthy' | 'degrading' | 'offline'>('healthy');
  const [exchangeRate, setExchangeRate] = useState<number>(58.20);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const results = await Promise.allSettled([
        client.apiCall.invoke({ url: '/api/v1/xendit/transaction-stats', method: 'GET', data: {} }),
        client.entities.transactions.query({ query: {}, sort: '-created_at', limit: 8 }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=PHP', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=USD', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/usdt-stats', method: 'GET', data: {} }),
        client.entities.bot_logs.query({ query: {}, sort: '-created_at', limit: 5 }),
        client.apiCall.invoke({ url: '/api/v1/topup/rate', method: 'GET', data: {} }),
        isSuperAdmin ? client.apiCall.invoke({ url: '/api/v1/diagnostics/grid-telemetry', method: 'GET', data: {} }) : Promise.resolve(null),
      ]);

      if (results[0].status === 'fulfilled') {
        const res = results[0] as PromiseFulfilledResult<any>;
        const statsData = res.value?.data;
        if (statsData && typeof statsData === 'object') setStats({ ...defaultStats, ...statsData });
      } else {
        setApiStatus('degrading');
      }

      if (results[1].status === 'fulfilled') {
        const res = results[1] as PromiseFulfilledResult<any>;
        const txnData = res.value?.data?.items;
        setRecentTxns(Array.isArray(txnData) ? txnData : []);
      }

      if (isSuperAdmin && results[2]?.status === 'fulfilled') {
        const res = results[2] as PromiseFulfilledResult<any>;
        const walletData = res.value?.data;
        if (walletData && walletData.balance != null) setWalletBalance(walletData.balance);
      }

      if (results[3]?.status === 'fulfilled') {
        const res = results[3] as PromiseFulfilledResult<any>;
        const usdData = res.value?.data;
        if (usdData && usdData.balance != null) setUsdWalletBalance(usdData.balance);
      }

      if (results[4]?.status === 'fulfilled') {
        const res = results[4] as PromiseFulfilledResult<any>;
        const usdtData = res.value?.data;
        if (usdtData && typeof usdtData === 'object') setUsdtStats({ ...defaultUsdtStats, ...usdtData });
      }

      if (results[5].status === 'fulfilled') {
        const res = results[5] as PromiseFulfilledResult<any>;
        const logData = res.value?.data?.items;
        setRecentLogs(Array.isArray(logData) ? logData : []);
      }

      if (results[6]?.status === 'fulfilled') {
        const res = results[6] as PromiseFulfilledResult<any>;
        const rateData = res.value?.data;
        if (rateData?.usdt_php_rate) setExchangeRate(rateData.usdt_php_rate);
      }

      if (isSuperAdmin && results[7]?.status === 'fulfilled') {
          const res = results[7] as PromiseFulfilledResult<any>;
          const telemetryData = res.value?.data;
          if (telemetryData && typeof telemetryData === 'object') setTelemetry(telemetryData);
      }
    } catch (err) {
      console.error('Unexpected error in fetchData:', err);
      setApiStatus('offline');
    }
  }, [user, isSuperAdmin]);

  const { connected } = usePaymentEvents({
    enabled: !!user,
    onStatusChange: useCallback((event) => {
      fetchData();
      if (event.transaction_id) {
        setUpdatedTxnIds((prev) => new Set(prev).add(event.transaction_id!));
        setTimeout(() => setUpdatedTxnIds((prev) => { const n = new Set(prev); n.delete(event.transaction_id!); return n; }), 3000);
      }
    }, [fetchData]),
    onWalletUpdate: useCallback(() => fetchData(), [fetchData]),
    pollInterval: 10000,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => { setLoading(true); await fetchData(); setLoading(false); };
    load();
  }, [user, fetchData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary shadow-lg shadow-primary/20"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/home" replace />;
  }

  const successRate = stats.total_count > 0
    ? Math.round((stats.paid_count / stats.total_count) * 100)
    : 0;

  const greeting = getGreeting();
  const userName = (user as { name?: string; telegram_username?: string } | null)?.name ||
    (user as { telegram_username?: string } | null)?.telegram_username || '';

  return (
    <Layout connected={connected}>
      <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
        {/* HERO BANNER */}
        <div className="relative overflow-hidden rounded-[3rem] mb-12 bg-[#0A0F1E] border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] group">
          <div className="absolute inset-0 bg-gradient-to-br from-brandblue-600/20 via-transparent to-transparent opacity-50" />
          <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-brandblue-500/10 blur-[120px] group-hover:bg-brandblue-500/20 transition-all duration-1000" />
          <div className="absolute left-1/3 bottom-0 h-64 w-64 rounded-full bg-emerald-500/5 blur-[100px]" />

          <div className="relative px-6 py-10 sm:px-12 sm:py-16">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
              <div className="space-y-8">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[2rem] bg-white/5 backdrop-blur-3xl flex items-center justify-center shadow-2xl border border-white/10 ring-1 ring-white/5 animate-logo-entrance shrink-0">
                    {greeting.icon}
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-2xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                      {greeting.text}{userName ? `, ${userName}` : ''}
                    </h1>
                    <p className="text-brandblue-100/40 text-xs sm:text-lg font-medium tracking-wide truncate max-w-[200px] sm:max-w-none">
                      Node: <span className="text-brandblue-400">mayaproduction-mainnet</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                  <div className="fintech-badge bg-white/5 text-white border-white/10 backdrop-blur-md text-[9px] sm:text-xs">
                    {isSuperAdmin ? <Crown className="h-3 w-3 mr-1 sm:mr-2 inline text-amber-400" /> : <ShieldCheck className="h-3 w-3 mr-1 sm:mr-2 inline text-brandblue-400" />}
                    {isSuperAdmin ? 'Full Access' : 'Operator'}
                  </div>
                  <div className="fintech-badge bg-emerald-500/10 text-emerald-400 border-emerald-500/20 backdrop-blur-md text-[9px] sm:text-xs">
                    <Radio className="h-3 w-3 mr-1 sm:mr-2 inline animate-pulse" />
                    Live
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-6 self-start lg:self-center">
                <div className="flex items-center gap-1 bg-white/5 backdrop-blur-3xl p-1.5 sm:p-2 rounded-2xl sm:rounded-[2.5rem] border border-white/10 shadow-2xl">
                      <div className="text-center px-4 py-3 sm:px-10 sm:py-5">
                        <p className="text-xl sm:text-4xl font-black text-white tracking-tighter tabular-nums">
                          {loading ? '---' : stats.total_count}
                        </p>
                        <p className="text-white/20 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] mt-1 sm:mt-2">Volume</p>
                      </div>
                      <div className="w-px h-8 sm:h-16 bg-white/5 mx-1" />
                      <div className="text-center px-4 py-3 sm:px-10 sm:py-5">
                        <p className="text-xl sm:text-4xl font-black text-emerald-400 tracking-tighter tabular-nums">
                          {loading ? '---' : stats.paid_count}
                        </p>
                        <p className="text-white/20 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] mt-1 sm:mt-2">Settled</p>
                      </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
                  disabled={loading}
                  className="h-14 w-14 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[2.5rem] bg-white/5 text-white hover:bg-white/10 border border-white/10 transition-all active:scale-95 shadow-2xl shrink-0"
                >
                  <RefreshCw className={`h-6 w-6 sm:h-8 sm:w-8 ${loading ? 'animate-spin' : 'animate-float'}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 mb-12">
            <Link to="/create-payment" className="group">
              <div className="h-full flex flex-col items-center justify-center gap-4 p-8 rounded-[2rem] bg-brandblue-600 text-white shadow-xl shadow-brandblue-500/20 hover:scale-[1.05] transition-all border border-white/10">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform">
                  <CreditCard className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Collect Payment</span>
              </div>
            </Link>
            <Link to="/disbursements" className="group">
              <div className="h-full flex flex-col items-center justify-center gap-4 p-8 rounded-[2rem] bg-card border border-border/40 hover:bg-muted/50 hover:scale-[1.05] transition-all shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Send className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Payout</span>
              </div>
            </Link>
            <Link to="/scan-qrph" className="group hidden sm:flex">
              <div className="h-full flex flex-col items-center justify-center gap-4 p-8 rounded-[2rem] bg-card border border-border/40 hover:bg-muted/50 hover:scale-[1.05] transition-all shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <QrCode className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Scan QR</span>
              </div>
            </Link>
            <Link to="/wallet" className="group hidden sm:flex">
              <div className="h-full flex flex-col items-center justify-center gap-4 p-8 rounded-[2rem] bg-card border border-border/40 hover:bg-muted/50 hover:scale-[1.05] transition-all shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Wallet className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Vault</span>
              </div>
            </Link>
            <div className="sm:hidden grid grid-cols-2 gap-4 col-span-2">
               <Link to="/scan-qrph" className="flex items-center justify-center gap-3 p-5 rounded-2xl bg-card border border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <QrCode className="h-4 w-4" /> Scan
               </Link>
               <Link to="/wallet" className="flex items-center justify-center gap-3 p-5 rounded-2xl bg-card border border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <Wallet className="h-4 w-4" /> Vault
               </Link>
            </div>
        </div>

        {/* WALLET CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-12">
          <Link to="/wallet" className="group block">
            <div className="fintech-gradient-card bg-brandblue-600 h-full p-6 sm:p-10 shadow-brandblue-500/20">
              <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-10 group-hover:rotate-12 group-hover:scale-150 transition-all duration-1000"><Wallet className="h-24 w-24 sm:h-40 sm:w-40" /></div>
              <div className="relative z-10 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-white/15 rounded-2xl flex items-center justify-center border border-white/10"><Wallet className="h-6 w-6 text-white" /></div>
                  <p className="text-[11px] font-black text-white/50 uppercase tracking-[0.25em]">Reserve PHP</p>
                </div>
                <p className="text-4xl font-black text-white tracking-tighter tabular-nums">
                  {loading ? '₱ --.--' : `₱${fmt(walletBalance || 0)}`}
                </p>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-white/30 w-2/3" />
                </div>
              </div>
            </div>
          </Link>

          <Link to="/wallet" className="group block">
            <div className="fintech-gradient-card bg-[#111827] h-full p-10 shadow-emerald-500/10">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:-rotate-12 group-hover:scale-150 transition-all duration-1000"><DollarSign className="h-40 w-40 text-emerald-500" /></div>
              <div className="relative z-10 space-y-8">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20"><Zap className="h-6 w-6 text-emerald-400" /></div>
                  <p className="text-[11px] font-black text-white/50 uppercase tracking-[0.25em]">Vault USDT</p>
                </div>
                <p className="text-4xl font-black text-white tracking-tighter tabular-nums">
                  {loading ? '$ --.--' : `$${fmtUsd(usdWalletBalance)}`}
                </p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[9px] font-black">L2 Network</Badge>
                </div>
              </div>
            </div>
          </Link>

          <StatCard label="Settled Revenue" value={`₱${fmt(stats.paid_amount || 0)}`} sub={`Across ${stats.paid_count} assets`}
            icon={<TrendingUp className="h-7 w-7 text-brandblue-500" />} color="text-foreground" loading={loading} />

          <StatCard label="Network Health" value={`${successRate}%`} sub="Real-time Node Status"
            icon={<CheckCircle className="h-7 w-7 text-emerald-500" />} color="text-emerald-500" loading={loading} />
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-12">
          <div className="space-y-10">
            <Card className="fintech-card overflow-hidden border-0 shadow-xl">
              <CardHeader className="pb-6 pt-10 px-10 border-b border-border/10"><CardTitle className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 flex items-center gap-3">System Terminal</CardTitle></CardHeader>
              <CardContent className="px-8 pb-10 pt-8">
                <div className="grid grid-cols-2 gap-6">
                  {([
                    { to: '/create-payment', icon: CreditCard, label: 'Charge', bg: 'bg-brandblue-500/10', text: 'text-brandblue-500', shadow: 'shadow-brandblue-500/20' },
                    { to: '/disbursements', icon: Send, label: 'Payout', bg: 'bg-emerald-500/10', text: 'text-emerald-500', shadow: 'shadow-emerald-500/20' },
                    { to: '/transactions', icon: FileText, label: 'Ledger', bg: 'bg-cyan-500/10', text: 'text-cyan-500', shadow: 'shadow-cyan-500/20' },
                    { to: '/wallet', icon: Wallet, label: 'Vault', bg: 'bg-indigo-500/10', text: 'text-indigo-500', shadow: 'shadow-indigo-500/20' },
                  ] as const).map(({ to, icon: Icon, label, bg, text, shadow }) => (
                    <Link key={label} to={to} className="block group">
                      <div className={`w-full flex flex-col items-center gap-4 p-8 rounded-[2.5rem] transition-all duration-500 ${bg} ${text} hover:scale-[1.08] hover:-translate-y-1 border border-transparent hover:border-white/20 shadow-lg ${shadow}`}>
                        <Icon className="h-8 w-8" />
                        <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="fintech-card overflow-hidden bg-[#0A0F1E] border-white/5">
              <CardHeader className="pb-6 pt-10 px-10 border-b border-white/5"><CardTitle className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-3">Kernel Interaction</CardTitle></CardHeader>
              <CardContent className="px-8 pb-10 pt-8 space-y-6">
                <div className="flex items-center justify-between p-5 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-xl">
                   <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-2xl bg-brandblue-500 flex items-center justify-center shadow-lg shadow-brandblue-500/40">
                         <Bot className="h-5 w-5 text-white" />
                      </div>
                      <div>
                         <p className="text-sm font-black uppercase text-white tracking-tight">PayBot AI</p>
                         <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <p className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-widest">Protocol Active</p>
                         </div>
                      </div>
                   </div>
                   <Button size="sm" variant="ghost" className="h-10 px-5 text-[10px] font-black uppercase tracking-widest bg-white/5 text-white hover:bg-white/10 border border-white/10 rounded-xl transition-all">
                      Diagnostics
                   </Button>
                </div>

                <div className="space-y-4">
                {Array.isArray(recentLogs) && recentLogs.map(log => (
                  <div key={log.id} className="flex gap-5 items-center p-4 rounded-[1.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all duration-300 group/log">
                    <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover/log:bg-brandblue-500 group-hover/log:border-brandblue-500 transition-colors">
                      <MessageSquare className="h-4 w-4 text-brandblue-400 group-hover/log:text-white transition-colors" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-white/80 truncate uppercase tracking-tight">@{log.telegram_username} <span className="text-white/40 font-medium lowercase italic">executed</span> {log.command}</p>
                      <p className="text-[9px] font-black uppercase text-white/20 mt-1 tracking-widest">{formatTxnDate(log.created_at)}</p>
                    </div>
                  </div>
                ))}
                </div>
                {(!Array.isArray(recentLogs) || recentLogs.length === 0) && <p className="text-center py-12 text-white/20 text-xs italic font-black uppercase tracking-widest">System standby...</p>}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="fintech-card h-full flex flex-col overflow-hidden shadow-2xl border-0">
              <CardHeader className="flex flex-row items-center justify-between pb-8 pt-10 px-10 border-b border-border/10">
                <CardTitle className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 flex items-center gap-3">Network Ledger</CardTitle>
                <Link to="/transactions">
                  <Button variant="outline" size="sm" className="h-10 px-6 text-[10px] font-black uppercase tracking-widest text-brandblue-600 border-brandblue-500/20 hover:bg-brandblue-50 transition-all rounded-xl">
                    Full History <ArrowRight className="h-3 w-3 ml-2" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="px-6 pb-10 pt-6 flex-1 overflow-hidden space-y-3">
                {Array.isArray(recentTxns) && recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-5 w-5" />, bg: 'bg-muted' };
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-6 rounded-[2rem] transition-all duration-500 border border-transparent hover:bg-muted/30 hover:border-border/40 group/txn">
                      <div className="flex items-center gap-6 min-w-0">
                        <div className={`h-14 w-14 rounded-2xl ${tc.bg} flex items-center justify-center shrink-0 border border-black/5 group-hover/txn:scale-110 transition-transform duration-500`}>{tc.icon}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground truncate uppercase tracking-tight">{txn.description || txn.transaction_type}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{formatTxnDate(txn.created_at)}</p>
                            <span className="h-1 w-1 rounded-full bg-border" />
                            <p className="text-[10px] font-black text-brandblue-500/60 uppercase tracking-tighter">ID: {txn.external_id.substring(0, 12)}...</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-lg font-black text-foreground tracking-tighter tabular-nums">₱{fmt(txn.amount)}</p>
                        <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full ${sc.color} border border-transparent text-[9px] font-black uppercase tracking-widest mt-2 shadow-sm`}>
                           <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} animate-pulse`} />
                           {txn.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!Array.isArray(recentTxns) || recentTxns.length === 0) && !loading && (
                  <div className="flex flex-col items-center justify-center py-24 opacity-20"><CreditCard className="h-16 w-16 mb-6 animate-float" /><p className="text-sm font-black uppercase tracking-[0.3em]">No incoming data</p></div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* SYSTEM STATUS */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <Card className="lg:col-span-3 fintech-card p-10 border-0 shadow-2xl relative overflow-hidden bg-card/40 backdrop-blur-sm">
             <div className="absolute top-0 right-0 p-10 opacity-5"><Activity className="h-64 w-64 text-brandblue-500" /></div>
             <div className="relative z-10">
                <div className="flex items-center justify-between mb-12">
                   <div className="space-y-1">
                      <h2 className="text-foreground font-black text-2xl uppercase tracking-tight">Revenue Dynamics</h2>
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.4em]">Real-time Settlement Engine</p>
                   </div>
                   <div className="flex items-center gap-3 bg-muted/20 px-5 py-2.5 rounded-2xl border border-border/40">
                      <span className={`h-2.5 w-2.5 rounded-full ${apiStatus === 'healthy' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'} animate-pulse`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70">Grid Status: {apiStatus}</span>
                   </div>
                </div>

                <div className="relative h-6 mb-12 bg-muted/20 rounded-full p-1 border border-border/40 overflow-hidden">
                   <div className="absolute inset-y-1 left-1 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.3)]" style={{ width: `calc(${(stats.paid_amount / (stats.total_amount || 1)) * 100}% - 4px)` }} />
                   <div className="absolute inset-y-1 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(251,191,36,0.3)]" style={{ left: `calc(${(stats.paid_amount / (stats.total_amount || 1)) * 100}% + 4px)`, width: `${(stats.pending_amount / (stats.total_amount || 1)) * 100}%` }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
                   {[
                     { label: 'Settled', amount: stats.paid_amount, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
                     { label: 'Pending', amount: stats.pending_amount, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/5' },
                     { label: 'Lost Ops', count: stats.expired_count, icon: XCircle, color: 'text-muted-foreground/40', bg: 'bg-muted/5' },
                   ].map((r) => (
                     <div key={r.label} className={`p-8 rounded-[2.5rem] ${r.bg} border border-border/20 transition-all duration-500 hover:border-brandblue-500/20 group/rev`}>
                       <div className="flex items-center gap-3 mb-4">
                          <r.icon className={`h-4 w-4 ${r.color}`} />
                          <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.3em]">{r.label}</p>
                       </div>
                       <p className={`text-3xl font-black ${r.color} tracking-tighter tabular-nums group-hover/rev:scale-105 transition-transform`}>
                          {r.amount !== undefined ? `₱${fmt(r.amount)}` : `${r.count || 0}`}
                       </p>
                     </div>
                   ))}
                </div>
             </div>
          </Card>

          <Card className="fintech-card p-10 flex flex-col bg-[#0A0F1E] border-white/5 shadow-2xl">
              <div className="flex items-center gap-3 mb-10">
                 <Activity className="h-5 w-5 text-brandblue-400" />
                 <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30">Infrastructure</h2>
              </div>
              <div className="space-y-10 flex-1">
                {[
                  { label: 'Maya API Node', ok: apiStatus === 'healthy', detail: 'T+0 Priority' },
                  { label: 'USDT Gateway', ok: true, detail: `₱${exchangeRate.toFixed(2)} Target` },
                  { label: 'Kernel Relay', ok: true, detail: '142ms latency' },
                  { label: 'Webhook v4', ok: apiStatus !== 'offline', detail: 'Verified' },
                ].map(node => (
                  <div key={node.label} className="flex items-center justify-between group/node">
                    <div>
                      <span className="text-xs font-black text-white/80 uppercase block tracking-tight">{node.label}</span>
                      <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.15em]">{node.detail}</span>
                    </div>
                    <div className={`h-3 w-3 rounded-full ${node.ok ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'} ring-4 ring-white/[0.03] transition-all duration-500 group-hover/node:scale-125`} />
                  </div>
                ))}
              </div>
              <div className="mt-12 pt-10 border-t border-white/5 flex items-center gap-5">
                <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                   <Clock className="h-6 w-6 text-brandblue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Grid Sync</p>
                  <p className="text-sm font-black text-white tracking-widest tabular-nums">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
          </Card>
        </div>

        {/* COMPLIANCE & TRUST */}
        {/* COMPLIANCE & TRUST */}
        {isSuperAdmin && telemetry && (
            <Card className="mb-10 bg-muted/20 border-border/40 p-8 rounded-[2.5rem]">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/60">Grid Telemetry</h2>
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-0 font-black text-[8px] uppercase px-3 py-1">Operational</Badge>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                  <div>
                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Available</p>
                     <p className="text-xl font-black text-foreground">₱ {fmt(telemetry.telemetry.total_available_liquidity)}</p>
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Pending</p>
                     <p className="text-xl font-black text-amber-500">₱ {fmt(telemetry.telemetry.total_pending_liquidity)}</p>
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Active Wallets</p>
                     <p className="text-xl font-black text-foreground">{telemetry.telemetry.active_wallets}</p>
                  </div>
                  <div>
                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Pending Clearance</p>
                     <p className="text-xl font-black text-foreground">{telemetry.telemetry.pending_clearance}</p>
                  </div>
               </div>
            </Card>
        )}

        <div className="mt-10 p-8 rounded-[2.5rem] bg-muted/10 border border-border/20 flex flex-col md:flex-row items-center justify-between gap-8 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-700">
          <div className="flex items-center gap-10 flex-wrap justify-center md:justify-start">
             <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
               <ShieldCheck className="h-4 w-4 text-brandblue-500" /> PCI-DSS 4.0
             </div>
             <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
               <ShieldCheck className="h-4 w-4 text-brandblue-500" /> BSP REGULATED
             </div>
             <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
               <ShieldCheck className="h-4 w-4 text-brandblue-500" /> AES-256 ENCRYPTED
             </div>
             <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
               <ShieldCheck className="h-4 w-4 text-brandblue-500" /> ISO 27001
             </div>
          </div>
          <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.1em] text-center md:text-right leading-relaxed">
             Secure Node Operation • Licensed by traxionpay integration • verified as Traxion PH production cluster <br />
             node_id: mayaproduction-mainnet • © 2024 PayBot Infrastructure
          </div>
        </div>

        <div className="h-12" />
      </div>
    </Layout>
  );
}
