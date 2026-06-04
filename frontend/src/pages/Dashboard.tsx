import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Layout from '@/components/Layout';
import { APP_DESCRIPTION } from '@/lib/brand';
import { fmt, fmtShort, fmtUsd } from '@/lib/format';
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
  CalendarDays,
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

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-4 w-4 text-brand-blue-500" />,   bg: 'bg-brand-blue-50' },
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
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="bg-card border-border/60 shadow-sm hover:shadow-md transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className={`text-2xl font-black ${color}`}>
              {loading ? '---' : value}
            </p>
            {sub && <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-2xl bg-muted/30 flex items-center justify-center shrink-0">
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
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [recentLogs, setRecentLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedTxnIds, setUpdatedTxnIds] = useState<Set<number>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [usdWalletBalance, setUsdWalletBalance] = useState<number>(0);
  const [apiStatus, setApiStatus] = useState<'healthy' | 'degrading' | 'offline'>('healthy');

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
      ]);

      if (results[0].status === 'fulfilled') {
        const statsData = results[0].value?.data;
        if (statsData) setStats(statsData);
      } else {
        setApiStatus('degrading');
      }

      if (results[1].status === 'fulfilled') {
        const txnData = results[1].value?.data?.items;
        if (txnData) setRecentTxns(txnData);
      }

      if (isSuperAdmin && results[2] && results[2].status === 'fulfilled') {
        const walletData = results[2].value?.data;
        if (walletData?.balance != null) setWalletBalance(walletData.balance);
      }

      if (results[3].status === 'fulfilled') {
        const usdData = results[3].value?.data;
        if (usdData?.balance != null) setUsdWalletBalance(usdData.balance);
      }

      if (results[4].status === 'fulfilled') {
        const usdtData = results[4].value?.data;
        if (usdtData) setUsdtStats(usdtData);
      }

      if (results[5].status === 'fulfilled') {
        const logData = results[5].value?.data?.items;
        if (logData) setRecentLogs(logData);
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
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
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* ═══════════════════════════════════════════════
            HERO BANNER — Clean GCash Business style
        ═══════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-3xl mb-8 bg-gradient-to-r from-brand-blue-600 via-brand-blue-500 to-brand-blue-400 shadow-xl shadow-brand-blue-500/20">
          {/* Subtle decorative circles */}
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-white/5 blur-xl" />

          <div className="relative px-8 py-8 sm:py-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              {/* Left: Brand + greeting */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                    {greeting.icon}
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {greeting.text}{userName ? `, ${userName}` : ''}
                    </h1>
                    <p className="text-brand-blue-50/90 text-sm font-medium">
                      {APP_DESCRIPTION}
                    </p>
                  </div>
                </div>

                {/* Role badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border-0 ${
                    isSuperAdmin
                      ? 'bg-amber-400 text-amber-950'
                      : 'bg-white/20 text-white backdrop-blur-sm'
                  }`}>
                    {isSuperAdmin ? <Crown className="h-3 w-3 mr-1.5 inline" /> : <ShieldCheck className="h-3 w-3 mr-1.5 inline" />}
                    {isSuperAdmin ? 'Super Admin' : 'Admin'}
                  </Badge>
                  {!loading && stats.total_count > 0 && (
                    <Badge className="bg-emerald-400/90 text-emerald-950 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border-0">
                      <TrendingUp className="h-3 w-3 mr-1.5 inline" />
                      {successRate}% Success
                    </Badge>
                  )}
                </div>
              </div>

              {/* Right: Quick live stats */}
              <div className="flex items-center gap-3 self-end md:self-center">
                <div className="flex items-center gap-2 bg-black/10 backdrop-blur-md p-1 rounded-2xl border border-white/10">
                  <div className="text-center px-5 py-3">
                    <p className="text-xl sm:text-2xl font-black text-white">
                      {loading ? '---' : stats.total_count}
                    </p>
                    <p className="text-brand-blue-50/60 text-[9px] font-bold uppercase tracking-wider">Total</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-center px-5 py-3">
                    <p className="text-xl sm:text-2xl font-black text-emerald-300">
                      {loading ? '---' : stats.paid_count}
                    </p>
                    <p className="text-brand-blue-50/60 text-[9px] font-bold uppercase tracking-wider">Paid</p>
                  </div>
                </div>

                {/* Refresh */}
                <Button
                  variant="ghost"
                  onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
                  disabled={loading}
                  className="h-14 w-14 rounded-2xl bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all active:scale-95"
                >
                  <RefreshCw className={`h-6 w-6 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            WALLET CARDS ROW
        ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* PHP Wallet */}
          <Link to="/wallet" className="group block">
            <Card className="h-full bg-brand-blue-500 border-0 shadow-lg shadow-brand-blue-500/20 hover:shadow-brand-blue-500/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform">
                <Wallet className="h-20 w-20" />
              </div>
              <CardContent className="p-6 relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-[10px] font-black text-white/80 uppercase tracking-widest">Main Wallet (PHP)</p>
                </div>
                <p className="text-3xl font-black text-white tracking-tight">
                  {loading ? '₱ --.--' : `₱${fmt(walletBalance || 0)}`}
                </p>
                <div className="flex items-center gap-1.5 mt-4 text-white/90 text-xs font-bold group-hover:gap-2 transition-all">
                  <span>Manage Funds</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* USD Wallet */}
          <Link to="/wallet" className="group block">
            <Card className="h-full bg-emerald-600 border-0 shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform">
                <DollarSign className="h-20 w-20" />
              </div>
              <CardContent className="p-6 relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center">
                    <Zap className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-[10px] font-black text-white/80 uppercase tracking-widest">USDT TRC-20</p>
                </div>
                <p className="text-3xl font-black text-white tracking-tight">
                  {loading ? '$ --.--' : `$${fmtUsd(usdWalletBalance)}`}
                </p>
                <div className="flex items-center gap-1.5 mt-4 text-white/90 text-xs font-bold group-hover:gap-2 transition-all">
                  <span>Settlement</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <StatCard label="Total Volume" value={`₱${fmt(stats.total_amount || 0)}`} sub={`${stats.total_count} transactions`}
            icon={<Activity className="h-5 w-5 text-brand-blue-500" />} color="text-foreground" loading={loading} />

          <StatCard label="Success Rate" value={`${successRate}%`} sub={`${stats.paid_count} completed`}
            icon={<CheckCircle className="h-5 w-5 text-emerald-500" />} color="text-emerald-600 dark:text-emerald-400" loading={loading} />
        </div>

        {/* ═══════════════════════════════════════════════
            MAIN CONTENT GRID
        ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Quick Actions & Live Activity */}
          <div className="space-y-6">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-brand-blue-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { to: '/payments',      icon: CreditCard,   label: 'Payments',  bg: 'bg-brand-blue-50',     text: 'text-brand-blue-600' },
                    { to: '/disbursements', icon: Send,          label: 'Payouts',   bg: 'bg-emerald-50',        text: 'text-emerald-600' },
                    { to: '/transactions',  icon: FileText,      label: 'History',   bg: 'bg-cyan-50',           text: 'text-cyan-600' },
                    { to: '/wallet',        icon: Wallet,        label: 'Wallet',    bg: 'bg-indigo-50',         text: 'text-indigo-600' },
                    { to: '/reports',       icon: PieChart,      label: 'Insights',  bg: 'bg-violet-50',         text: 'text-violet-600' },
                    { to: '/bot-messages',  icon: MessageSquare, label: 'Messages',  bg: 'bg-pink-50',           text: 'text-pink-600' },
                  ].map(({ to, icon: Icon, label, bg, text }) => (
                    <Link key={label} to={to} className="block group">
                      <div className={`w-full flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 ${bg} ${text} hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow-md`}>
                        <Icon className="h-6 w-6" />
                        <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Bot className="h-4 w-4 text-brand-blue-500" />
                  Live Bot Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-6">
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/40 animate-pulse rounded-xl" />)}
                  </div>
                ) : recentLogs.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground italic text-xs">No recent activity</div>
                ) : (
                  <div className="space-y-4">
                    {recentLogs.map(log => (
                      <div key={log.id} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="h-8 w-8 rounded-full bg-brand-blue-50 flex items-center justify-center shrink-0 shadow-sm border border-brand-blue-100">
                          <MessageSquare className="h-3.5 w-3.5 text-brand-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground leading-tight">
                            <span className="font-black text-brand-blue-600">@{log.telegram_username}</span>
                            <span className="text-muted-foreground ml-1">used</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-primary text-[10px] ml-1 font-bold">{log.command}</code>
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1 font-medium">{formatTxnDate(log.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions List */}
          <div className="lg:col-span-2">
            <Card className="border-border/60 shadow-sm h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-4 pt-6 px-6">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-brand-blue-500" />
                  Recent Activity
                </CardTitle>
                <Link to="/transactions">
                  <Button variant="ghost" size="sm" className="text-brand-blue-600 hover:text-brand-blue-700 hover:bg-brand-blue-50 h-8 px-3 text-[10px] font-black uppercase tracking-wider gap-1.5 rounded-full">
                    View All
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="px-0 pb-6 flex-1 overflow-hidden">
                {loading ? (
                  <div className="px-6 space-y-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-muted/40 animate-pulse">
                        <div className="h-10 w-10 rounded-xl bg-muted/60 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted/60 rounded w-1/3" />
                          <div className="h-3 bg-muted/40 rounded w-1/4" />
                        </div>
                        <div className="h-6 w-20 bg-muted/60 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : recentTxns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                    <div className="h-20 w-20 rounded-3xl bg-brand-blue-50 flex items-center justify-center mb-6 border border-brand-blue-100">
                      <CreditCard className="h-10 w-10 text-brand-blue-300" />
                    </div>
                    <p className="text-foreground font-black text-lg">No transactions yet</p>
                    <p className="text-muted-foreground text-sm mt-1 mb-8 max-w-xs">Everything is ready! Create your first payment order to start receiving funds.</p>
                    <Link to="/payments">
                      <Button size="lg" className="bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black px-8 rounded-2xl shadow-lg shadow-brand-blue-500/20 active:scale-95 transition-all">
                        Create First Payment
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30 h-full overflow-y-auto px-2">
                    {recentTxns.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-3.5 w-3.5" />, bg: 'bg-muted' };
                      const isUpdated = updatedTxnIds.has(txn.id);
                      return (
                        <div
                          key={txn.id}
                          className={`flex items-center justify-between px-4 py-4 rounded-2xl transition-all duration-500 ${
                            isUpdated
                              ? 'bg-brand-blue-50 ring-1 ring-brand-blue-200 scale-[1.01] z-10'
                              : 'hover:bg-muted/40'
                          }`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`h-10 w-10 rounded-2xl ${tc.bg} flex items-center justify-center shrink-0 shadow-sm border border-black/5`}>
                              {tc.icon}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-foreground truncate leading-tight uppercase tracking-tight">
                                {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-bold mt-1.5 flex items-center gap-2">
                                <span className="text-brand-blue-500/80">{txn.external_id || `#${txn.id}`}</span>
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span>{formatTxnDate(txn.created_at)}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-sm font-black text-foreground tabular-nums">
                              ₱{fmt(txn.amount)}
                            </span>
                            <Badge
                              className={`${sc.color} border-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} mr-1.5`} />
                              {txn.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            SYSTEM HEALTH + REVENUE BREAKDOWN
        ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-3 border-border/60 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                    <DollarSign className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-foreground font-black text-base uppercase tracking-tight">Revenue Insights</h2>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Volume Distribution · Paid vs Pending</p>
                  </div>
                </div>
                <Link to="/reports" className="text-brand-blue-600 hover:text-brand-blue-700 text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                  View Analytics <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="flex rounded-full overflow-hidden h-3 mb-8 bg-muted/40">
                <div className="bg-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${(stats.paid_amount / (stats.total_amount || 1)) * 100}%` }} />
                <div className="bg-amber-400 transition-all duration-1000 ease-out"
                  style={{ width: `${(stats.pending_amount / (stats.total_amount || 1)) * 100}%` }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { label: 'Paid Revenue', amount: stats.paid_amount, count: stats.paid_count, color: 'text-emerald-600', dot: 'bg-emerald-500' },
                  { label: 'Pending Volume', amount: stats.pending_amount, count: stats.pending_count, color: 'text-amber-600', dot: 'bg-amber-400' },
                  { label: 'Lost / Expired', amount: 0, count: stats.expired_count, color: 'text-muted-foreground', dot: 'bg-muted-foreground/30' },
                ].map((r) => (
                  <div key={r.label} className="flex items-start gap-3 p-4 rounded-2xl bg-muted/20 border border-border/40">
                    <span className={`h-2.5 w-2.5 rounded-full ${r.dot} mt-1.5 shrink-0 shadow-sm`} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{r.label}</p>
                      <p className={`text-lg font-black ${r.color} tracking-tight`}>
                        {r.amount > 0 ? `₱${fmt(r.amount)}` : `${r.count} txns`}
                      </p>
                      {r.amount > 0 && <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">{r.count} orders processed</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm flex flex-col bg-muted/20">
            <CardContent className="p-6 flex flex-col h-full">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-6">Network Nodes</h2>
              <div className="space-y-5 flex-1">
                {[
                  { label: 'Maya Gateway', status: apiStatus === 'healthy' ? 'Active' : 'Degraded', color: apiStatus === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500' },
                  { label: 'Telegram Bot', status: 'Online', color: 'bg-emerald-500' },
                  { label: 'Cloud DB', status: 'Primary', color: 'bg-emerald-500' },
                ].map(node => (
                  <div key={node.label} className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground/80">{node.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{node.status}</span>
                      <div className={`h-2 w-2 rounded-full ${node.color} shadow-sm`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-border/60 flex items-center gap-3">
                <Clock className="h-4 w-4 text-brand-blue-500" />
                <div>
                  <p className="text-[10px] font-black text-foreground uppercase tracking-tighter">Sync Heartbeat</p>
                  <p className="text-[9px] font-bold text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
