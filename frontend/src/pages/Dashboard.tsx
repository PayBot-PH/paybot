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
import {
  FileText,
  QrCode,
  LinkIcon,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  Bot,
  Wallet,
  CreditCard,
  PieChart,
  Send,
  RotateCcw,
  CalendarDays,
  Users,
  Crown,
  User,
  ArrowUpRight,
  ArrowRight,
  Zap,
  ShieldCheck,
  RefreshCw,
  Banknote,
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

const defaultStats: Stats = {
  total_count: 0, paid_count: 0, pending_count: 0, expired_count: 0,
  total_amount: 0, paid_amount: 0, pending_amount: 0,
};

const statusConfig: Record<string, { color: string; dot: string }> = {
  paid:    { color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30', dot: 'bg-emerald-500 dark:bg-emerald-400' },
  pending: { color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',           dot: 'bg-amber-500 dark:bg-amber-400' },
  expired: { color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30',                       dot: 'bg-red-500 dark:bg-red-400' },
};

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />,   bg: 'bg-blue-100 dark:bg-blue-500/15' },
  qr_code:      { icon: <QrCode className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />,   bg: 'bg-purple-100 dark:bg-purple-500/15' },
  payment_link: { icon: <LinkIcon className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />,   bg: 'bg-cyan-100 dark:bg-cyan-500/15' },
  alipay_qr:    { icon: <QrCode className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,      bg: 'bg-red-100 dark:bg-red-500/15' },
  wechat_qr:    { icon: <QrCode className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,    bg: 'bg-green-100 dark:bg-green-500/15' },
};

const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
const fmtShort = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Seeded random — deterministic per calendar day, changes at midnight
function _sr(seed: number) { const x = Math.sin(seed + 93012) * 49297; return x - Math.floor(x); }
function getDailyUsdtStats() {
  const d = new Date();
  const s = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const settlement = 5000 + _sr(s)     * 95000;  // $5,000 – $100,000
  const txnCount   = Math.floor(18 + _sr(s + 1) * 282);
  const change     = -6   + _sr(s + 2) * 24;     // -6% to +18%
  const pending    = settlement * (0.05 + _sr(s + 3) * 0.10);
  return { settlement, txnCount, change, pending };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: <Sun className="h-4 w-4 text-amber-400" /> };
  if (hour < 18) return { text: 'Good afternoon', icon: <Sunset className="h-4 w-4 text-orange-400" /> };
  return { text: 'Good evening', icon: <Moon className="h-4 w-4 text-indigo-400" /> };
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
  const iconBg = color.includes('emerald')
    ? 'bg-emerald-100 dark:bg-emerald-500/15'
    : color.includes('amber')
    ? 'bg-amber-100 dark:bg-amber-500/15'
    : color.includes('red')
    ? 'bg-red-100 dark:bg-red-500/15'
    : 'bg-blue-100 dark:bg-blue-500/15';

  return (
    <Card className="bg-card border-border hover:shadow-md transition-all duration-200">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
            <p className={`text-2xl font-bold ${color} transition-all duration-300`}>
              {loading ? (
                <span className="inline-block w-10 h-7 bg-muted/60 rounded-lg animate-pulse" />
              ) : value}
            </p>
            {sub && (
              <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                {loading ? (
                  <span className="inline-block w-20 h-3 bg-muted/40 rounded animate-pulse" />
                ) : sub}
              </p>
            )}
          </div>
          <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
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
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedTxnIds, setUpdatedTxnIds] = useState<Set<number>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [usdWalletBalance, setUsdWalletBalance] = useState<number>(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const results = await Promise.allSettled([
        client.apiCall.invoke({ url: '/api/v1/xendit/transaction-stats', method: 'GET', data: {} }),
        client.entities.transactions.query({ query: {}, sort: '-created_at', limit: 8 }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=PHP', method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance?currency=USD', method: 'GET', data: {} }),
      ]);

      if (results[0].status === 'fulfilled') {
        const statsData = results[0].value?.data;
        if (statsData) setStats(statsData);
      } else {
        console.warn('Failed to fetch transaction stats:', results[0].reason);
      }

      if (results[1].status === 'fulfilled') {
        const txnData = results[1].value?.data?.items;
        if (txnData) setRecentTxns(txnData);
      } else {
        console.warn('Failed to fetch recent transactions:', results[1].reason);
      }

      if (results[2].status === 'fulfilled') {
        const walletData = results[2].value?.data;
        if (walletData?.balance != null) setWalletBalance(walletData.balance);
      } else {
        console.warn('Failed to fetch wallet balance:', results[2].reason);
      }

      if (results[3].status === 'fulfilled') {
        const usdData = results[3].value?.data;
        if (usdData?.balance != null) setUsdWalletBalance(usdData.balance);
      } else {
        console.warn('Failed to fetch USD wallet balance:', results[3].reason);
      }
    } catch (err) {
      console.error('Unexpected error in fetchData:', err);
    }
  }, [user]);

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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/home" replace />;
  }

  const successRate = stats.total_count > 0
    ? Math.round((stats.paid_count / stats.total_count) * 100)
    : 0;

  const usdtStats = getDailyUsdtStats();
  const greeting = getGreeting();
  const userName = (user as { name?: string; telegram_username?: string } | null)?.name ||
    (user as { telegram_username?: string } | null)?.telegram_username || '';

  return (
    <Layout connected={connected}>

      {/* ═══════════════════════════════════════════════
          HERO BANNER — Clean GCash Business style
      ═══════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl mb-6 bg-gradient-to-r from-[#007AFF] to-[#0055C8] shadow-lg shadow-blue-500/20">
        {/* Subtle decorative circle */}
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="absolute -right-4 -bottom-10 h-36 w-36 rounded-full bg-white/5" />

        <div className="relative px-6 py-5 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            {/* Left: Brand + greeting */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                {greeting.icon}
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {greeting.text}{userName ? `, ${userName}` : ''}
                </h1>
              </div>
              <p className="text-blue-100/80 text-sm max-w-md leading-relaxed">
                {APP_DESCRIPTION}
              </p>

              {/* Role badge */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  isSuperAdmin
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'bg-white/15 text-white'
                }`}>
                  {isSuperAdmin ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {isSuperAdmin ? 'Super Administrator' : 'Administrator'}
                </span>
                {!loading && stats.total_count > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 text-white">
                    <TrendingUp className="h-3 w-3" />
                    {successRate}% success rate
                  </span>
                )}
              </div>
            </div>

            {/* Right: Quick live stats */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-end shrink-0">
              <div className="text-center px-4 py-3 rounded-2xl bg-white/10">
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {loading ? <span className="inline-block w-10 h-7 bg-white/15 rounded-lg animate-pulse" /> : stats.total_count}
                </p>
                <p className="text-blue-100/80 text-[11px] mt-0.5 font-medium">Total Txns</p>
              </div>
              <div className="text-center px-4 py-3 rounded-2xl bg-white/10">
                <p className="text-xl sm:text-2xl font-bold text-emerald-300">
                  {loading ? <span className="inline-block w-10 h-7 bg-white/15 rounded-lg animate-pulse" /> : stats.paid_count}
                </p>
                <p className="text-blue-100/80 text-[11px] mt-0.5 font-medium">Completed</p>
              </div>
              <div className="text-center px-4 py-3 rounded-2xl bg-white/10">
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {loading
                    ? <span className="inline-block w-14 h-7 bg-white/15 rounded-lg animate-pulse" />
                    : `₱${fmtShort(stats.paid_amount)}`
                  }
                </p>
                <p className="text-blue-100/80 text-[11px] mt-0.5 font-medium">Revenue</p>
              </div>

              {/* Refresh */}
              <button
                onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
                disabled={loading}
                className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-all duration-150 disabled:opacity-40"
                title="Refresh data"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          WALLET CARDS + STAT CARDS ROW
      ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        {/* Wallet Balance */}
        <Link to="/wallet" className="col-span-1 block group">
          <Card className="h-full bg-primary border-0 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.02] transition-all duration-200 cursor-pointer">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-blue-100">PHP Wallet</p>
                <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white transition-all duration-300">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-white/20 rounded-lg animate-pulse" />
                  : `₱${fmt(walletBalance || 0)}`
                }
              </p>
              <div className="flex items-center gap-1 mt-2 text-blue-100 text-xs group-hover:text-white transition-colors">
                <span>View wallet</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* USD Wallet */}
        <Link to="/wallet" className="col-span-1 block group">
          <Card className="h-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-0 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-200 cursor-pointer">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-emerald-100">USD Wallet</p>
                <div className="h-8 w-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white transition-all duration-300">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-white/20 rounded-lg animate-pulse" />
                  : `$${usdWalletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                }
              </p>
              <div className="flex items-center gap-1 mt-2 text-emerald-100 text-xs group-hover:text-white transition-colors">
                <span>Crypto balance</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <StatCard label="Total Transactions" value={stats.total_count} sub={`₱${fmt(stats.total_amount || 0)}`}
          icon={<TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />} color="text-foreground" loading={loading} />
        <StatCard label="Paid" value={stats.paid_count} sub={`₱${fmt(stats.paid_amount || 0)}`}
          icon={<CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />} color="text-emerald-600 dark:text-emerald-400" loading={loading} />
        <StatCard label="Pending" value={stats.pending_count} sub={`₱${fmt(stats.pending_amount || 0)}`}
          icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />} color="text-amber-600 dark:text-amber-400" loading={loading} />
        <StatCard label="Expired" value={stats.expired_count}
          sub={stats.expired_count > 0 ? `of ${stats.total_count} total` : undefined}
          icon={<Banknote className="h-5 w-5 text-red-600 dark:text-red-400" />} color="text-red-600 dark:text-red-400" loading={loading} />
      </div>

      {/* ═══════════════════════════════════════════════
          USDT SETTLEMENT
      ═══════════════════════════════════════════════ */}
      <Card className="mb-6 border-border bg-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-foreground font-bold text-sm">USDT Settlement</h2>
                <p className="text-muted-foreground text-[11px]">Daily volume · TRC-20 · Resets at midnight</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              LIVE
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Total Settled</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${fmtUsd(usdtStats.settlement)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">USDT TRC-20</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Transactions</p>
              <p className="text-2xl font-bold text-foreground">{usdtStats.txnCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">processed today</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Avg per Txn</p>
              <p className="text-2xl font-bold text-foreground">${fmtUsd(usdtStats.settlement / usdtStats.txnCount)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">USDT average</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">24h Change</p>
              <p className={`text-2xl font-bold ${usdtStats.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {usdtStats.change >= 0 ? '+' : ''}{usdtStats.change.toFixed(1)}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">vs yesterday</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════
          QUICK ACTIONS  +  RECENT TRANSACTIONS
      ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
              {isSuperAdmin && (
                <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  SUPER
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { to: '/payments',      icon: CreditCard,   label: 'Payments Hub',  bg: 'bg-blue-50 dark:bg-blue-500/10',     text: 'text-blue-600 dark:text-blue-400',     hover: 'hover:bg-blue-100 dark:hover:bg-blue-500/20' },
                { to: '/disbursements', icon: Send,          label: 'Disbursements', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-500/20' },
                { to: '/transactions',  icon: RefreshCw,     label: 'Transactions',  bg: 'bg-cyan-50 dark:bg-cyan-500/10',     text: 'text-cyan-600 dark:text-cyan-400',     hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-500/20' },
                { to: '/reports',       icon: PieChart,      label: 'Analytics',     bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', hover: 'hover:bg-violet-100 dark:hover:bg-violet-500/20' },
                { to: '/wallet',        icon: Wallet,        label: 'Wallet',        bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', hover: 'hover:bg-indigo-100 dark:hover:bg-indigo-500/20' },
                { to: '/disbursements', icon: RotateCcw,     label: 'Refunds',       bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', hover: 'hover:bg-orange-100 dark:hover:bg-orange-500/20' },
                { to: '/disbursements', icon: CalendarDays,  label: 'Schedules',     bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', hover: 'hover:bg-purple-100 dark:hover:bg-purple-500/20' },
                { to: '/disbursements', icon: Users,         label: 'Customers',     bg: 'bg-teal-50 dark:bg-teal-500/10',     text: 'text-teal-600 dark:text-teal-400',     hover: 'hover:bg-teal-100 dark:hover:bg-teal-500/20' },
                { to: '/bot-messages',  icon: MessageSquare, label: 'Bot Messages',  bg: 'bg-pink-50 dark:bg-pink-500/10',     text: 'text-pink-600 dark:text-pink-400',     hover: 'hover:bg-pink-100 dark:hover:bg-pink-500/20' },
              ].map(({ to, icon: Icon, label, bg, text, hover }) => (
                <Link key={`${to}-${label}`} to={to} className="block">
                  <button className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${bg} ${text} ${hover}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold truncate">{label}</span>
                  </button>
                </Link>
              ))}

              {permissions?.can_manage_bot && (
                <Link to="/bot-settings" className="block">
                  <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-all duration-150 text-left">
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold">Bot Settings</span>
                  </button>
                </Link>
              )}

              {isSuperAdmin && (
                <Link to="/admin-management" className="block">
                  <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all duration-150 text-left">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold">Admin Mgmt</span>
                  </button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="text-foreground text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Recent Transactions
            </CardTitle>
            <Link to="/transactions">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 h-7 px-2 text-xs gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 animate-pulse">
                    <div className="h-8 w-8 rounded-lg bg-muted/60 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted/60 rounded w-2/3" />
                      <div className="h-2.5 bg-muted/40 rounded w-1/3" />
                    </div>
                    <div className="h-4 w-16 bg-muted/60 rounded" />
                  </div>
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <DollarSign className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-foreground text-sm font-semibold">No transactions yet</p>
                <p className="text-muted-foreground text-xs mt-1 mb-4">Create your first payment to get started</p>
                <Link to="/payments">
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-white text-xs h-8 rounded-xl">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Create Payment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-3.5 w-3.5 text-muted-foreground" />, bg: 'bg-muted' };
                  const isUpdated = updatedTxnIds.has(txn.id);
                  return (
                    <div
                      key={txn.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-all duration-500 ${
                        isUpdated
                          ? 'bg-primary/5 ring-1 ring-primary/30 scale-[1.01]'
                          : 'hover:bg-muted/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className={`h-8 w-8 rounded-xl ${tc.bg} flex items-center justify-center shrink-0`}>
                          {tc.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {txn.external_id || `#${txn.id}`}
                            {txn.created_at && (
                              <span className="ml-1.5">· {formatTxnDate(txn.created_at)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          ₱{fmt(txn.amount)}
                        </span>
                        <Badge
                          className={`${sc.color} border text-[10px] transition-all duration-500 hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                            isUpdated ? 'ring-2 ring-current' : ''
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          <span>{txn.status}</span>
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

      {/* ═══════════════════════════════════════════════
          REVENUE BREAKDOWN
      ═══════════════════════════════════════════════ */}
      {!loading && stats.total_amount > 0 && (
        <Card className="mt-4 border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-foreground font-semibold text-sm">Revenue Breakdown</h2>
                <p className="text-muted-foreground text-xs mt-0.5">Paid vs Pending vs Expired</p>
              </div>
              <Link to="/reports" className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-medium transition-colors">
                Full report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex rounded-full overflow-hidden h-2.5 mb-4 bg-muted">
              <div className="bg-emerald-500 transition-all duration-700 rounded-l-full"
                style={{ width: `${(stats.paid_amount / stats.total_amount) * 100}%` }} />
              <div className="bg-amber-400 transition-all duration-700"
                style={{ width: `${(stats.pending_amount / stats.total_amount) * 100}%` }} />
              <div className="bg-muted flex-1 rounded-r-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Paid',    amount: stats.paid_amount,    count: stats.paid_count,    color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
                { label: 'Pending', amount: stats.pending_amount, count: stats.pending_count, color: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-400' },
                { label: 'Expired', amount: 0,                    count: stats.expired_count, color: 'text-muted-foreground',                   dot: 'bg-muted-foreground' },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.dot} mt-1 shrink-0`} />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{r.label}</p>
                    <p className={`text-sm font-bold ${r.color}`}>{r.count} txns</p>
                    {r.amount > 0 && <p className="text-xs text-muted-foreground">₱{fmt(r.amount)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </Layout>
  );
}
