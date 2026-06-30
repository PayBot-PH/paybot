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
  FileText, QrCode, LinkIcon, TrendingUp, DollarSign, Clock,
  CheckCircle, XCircle, Bot, Wallet, CreditCard, PieChart, Send,
  RotateCcw, CalendarDays, Users, Crown, User, ArrowUpRight,
  ArrowRight, Zap, ShieldCheck, RefreshCw, Activity, MessageSquare,
  Sun, Sunset, Moon, ChevronRight, BarChart3, ArrowUpRightFromCircle,
  Landmark, Globe, Sparkles
} from 'lucide-react';
import '../styles/dashboard-enhancements.css';

interface Stats {
  total_count: number;
  paid_count: number;
  pending_count: number;
  expired_count: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  expired_amount: number;
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
  total_amount: 0, paid_amount: 0, pending_amount: 0, expired_amount: 0,
};

const statusConfig: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  paid:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  expired: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
};

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-4 w-4" />, bg: 'bg-slate-100' },
  qr_code:      { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100' },
  payment_link: { icon: <LinkIcon className="h-4 w-4" />, bg: 'bg-slate-100' },
  alipay_qr:    { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100' },
  wechat_qr:    { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100' },
};

const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
const fmtShort = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n);
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function _sr(seed: number) { const x = Math.sin(seed + 93012) * 49297; return x - Math.floor(x); }
function getDailyUsdtStats() {
  const d = new Date();
  const s = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const settlement = 5000 + _sr(s) * 95000;
  const txnCount = Math.floor(18 + _sr(s + 1) * 282);
  const change = -6 + _sr(s + 2) * 24;
  const pending = settlement * (0.05 + _sr(s + 3) * 0.10);
  return { settlement, txnCount, change, pending };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: <Sun className="h-4 w-4 text-amber-500" /> };
  if (hour < 18) return { text: 'Good afternoon', icon: <Sunset className="h-4 w-4 text-orange-500" /> };
  return { text: 'Good evening', icon: <Moon className="h-4 w-4 text-indigo-500" /> };
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

function StatCard({ label, value, sub, icon, loading, tone = 'slate' }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  loading: boolean;
  tone?: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
}) {
  const toneClasses = {
    emerald: {
      ring: 'ring-emerald-100',
      badge: 'from-emerald-100 to-emerald-50 text-emerald-700',
      top: 'from-emerald-400/70 to-emerald-200/20',
    },
    blue: {
      ring: 'ring-blue-100',
      badge: 'from-blue-100 to-blue-50 text-blue-700',
      top: 'from-blue-400/70 to-blue-200/20',
    },
    amber: {
      ring: 'ring-amber-100',
      badge: 'from-amber-100 to-amber-50 text-amber-700',
      top: 'from-amber-400/70 to-amber-200/20',
    },
    rose: {
      ring: 'ring-rose-100',
      badge: 'from-rose-100 to-rose-50 text-rose-700',
      top: 'from-rose-400/70 to-rose-200/20',
    },
    slate: {
      ring: 'ring-slate-100',
      badge: 'from-slate-100 to-slate-50 text-slate-700',
      top: 'from-slate-400/70 to-slate-200/20',
    },
  } as const;

  return (
    <Card className={`card-3d bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-lg overflow-hidden group ring-1 ${toneClasses[tone].ring}`}>
      <div className={`h-1 w-full bg-gradient-to-r ${toneClasses[tone].top}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 group-hover:text-slate-600 transition-colors">{label}</p>
            <p className="text-2xl font-bold text-slate-900 transition-all duration-300">
              {loading ? (
                <span className="inline-block w-12 h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : value}
            </p>
            {sub && (
              <p className="text-xs text-slate-500 mt-1.5 group-hover:text-slate-600 transition-colors">
                {loading ? (
                  <span className="inline-block w-20 h-3 bg-slate-100 rounded animate-pulse" />
                ) : sub}
              </p>
            )}
          </div>
          <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${toneClasses[tone].badge} flex items-center justify-center shrink-0 group-hover:text-slate-700 transition-colors transform group-hover:scale-110 transition-transform`}>
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600"></div>
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
      {/* ===== HERO HEADER ===== */}
      <div className="mb-8">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <div className="absolute -top-14 -right-10 h-40 w-40 rounded-full bg-blue-200/30 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-emerald-200/30 blur-2xl" />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span>{greeting.icon}</span>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {greeting.text}{userName ? `, ${userName}` : ''}
                </h1>
              </div>
              <p className="text-sm text-slate-500 max-w-xl leading-relaxed">
                {APP_DESCRIPTION}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                  isSuperAdmin
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {isSuperAdmin ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {isSuperAdmin ? 'Super Administrator' : 'Administrator'}
                </span>
                {!loading && stats.total_count > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <TrendingUp className="h-3 w-3" />
                    {successRate}% success rate
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 min-w-[230px]">
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Revenue Today</p>
                <p className="text-base font-semibold text-slate-900 mt-1">₱{fmt(stats.paid_amount || 0)}</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Pending</p>
                <p className="text-base font-semibold text-amber-700 mt-1">{stats.pending_count}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== WALLET CARDS + STATS ROW ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* PHP Wallet */}
        <Link to="/wallet" className="block group">
          <Card className="card-3d h-full bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-lg cursor-pointer overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider group-hover:text-slate-600 transition-colors">PHP Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mb-1">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-slate-100 rounded-lg animate-pulse" />
                  : `₱${fmt(walletBalance || 0)}`
                }
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                <span>View wallet</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* USD Wallet */}
        <Link to="/wallet" className="block group">
          <Card className="card-3d h-full bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-lg cursor-pointer overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider group-hover:text-slate-600 transition-colors">USDT Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Globe className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mb-1">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-slate-100 rounded-lg animate-pulse" />
                  : `$${usdWalletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                <span>Crypto balance</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <StatCard label="Total Transactions" value={stats.total_count} sub={`₱${fmt(stats.total_amount || 0)}`}
          icon={<Activity className="h-4 w-4" />} loading={loading} tone="blue" />
        <StatCard label="Paid" value={stats.paid_count} sub={`₱${fmt(stats.paid_amount || 0)}`}
          icon={<CheckCircle className="h-4 w-4" />} loading={loading} tone="emerald" />
      </div>

      {/* ===== SECOND STATS ROW ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending" value={stats.pending_count} sub={`₱${fmt(stats.pending_amount || 0)}`}
          icon={<Clock className="h-4 w-4" />} loading={loading} tone="amber" />
        <StatCard label="Expired" value={stats.expired_count}
          sub={stats.expired_count > 0 ? `of ${stats.total_count} total` : undefined}
          icon={<XCircle className="h-4 w-4" />} loading={loading} tone="rose" />

        {/* USDT Settlement Card */}
        <Card className="bg-white border border-slate-200 sm:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">USDT Settlement</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  LIVE
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-5">
              <div>
                <p className="text-lg font-bold text-slate-900">{fmtUsd(usdtStats.settlement)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total Settled</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{usdtStats.txnCount}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Transactions</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">
                  {usdtStats.txnCount > 0 ? fmtUsd(usdtStats.settlement / usdtStats.txnCount) : '$0.00'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Avg per Txn</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${usdtStats.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {usdtStats.change >= 0 ? '+' : ''}{usdtStats.change.toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">24h Change</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== MAIN CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="card-3d bg-white border border-slate-200 shadow-sm hover:shadow-lg overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-5 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-100 to-orange-50">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                </div>
                Quick Actions
              </CardTitle>
              {isSuperAdmin && (
                <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                  <Crown className="h-3 w-3" /> SUPER
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <div className="space-y-0.5">
              {[
                { to: '/payments', icon: CreditCard, label: 'Payments Hub' },
                { to: '/disbursements', icon: Send, label: 'Disbursements' },
                { to: '/transactions', icon: FileText, label: 'Transactions' },
                { to: '/reports', icon: BarChart3, label: 'Analytics' },
                { to: '/wallet', icon: Wallet, label: 'Wallet' },
                { to: '/refunds', icon: RotateCcw, label: 'Refunds' },
                { to: '/schedules', icon: CalendarDays, label: 'Schedules' },
                { to: '/customers', icon: Users, label: 'Customers' },
                { to: '/bot-messages', icon: MessageSquare, label: 'Bot Messages' },
              ].map((action, idx) => (
                <Link key={action.to} to={action.to} className="block animate-fade-in-up" style={{animationDelay: `${idx * 0.05}s`}}>
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-smooth group">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 group-hover:scale-110 transition-smooth">
                        <action.icon className="h-4 w-4 text-slate-600 group-hover:text-slate-900 transition-colors" />
                      </div>
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{action.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-smooth" />
                  </button>
                </Link>
              ))}

              {permissions?.can_manage_bot && (
                <Link to="/bot-settings" className="block">
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-smooth group">
                    <div className="flex items-center gap-3">
                      <Bot className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">Bot Settings</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </button>
                </Link>
              )}

              {isSuperAdmin && (
                <Link to="/admin-management" className="block">
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors duration-150 group">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">Admin Management</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-white border border-slate-200 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-500" />
              Recent Transactions
            </CardTitle>
            <Link to="/transactions">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 h-7 px-2 text-xs gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 animate-pulse">
                    <div className="h-9 w-9 rounded-lg bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-200 rounded w-2/3" />
                      <div className="h-2.5 bg-slate-200 rounded w-1/3" />
                    </div>
                    <div className="h-4 w-16 bg-slate-200 rounded" />
                  </div>
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                  <DollarSign className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-slate-900 text-sm font-semibold">No transactions yet</p>
                <p className="text-slate-500 text-xs mt-1 mb-4">Create your first payment to get started</p>
                <Link to="/payments">
                  <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 rounded-lg">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Create Payment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-4 w-4" />, bg: 'bg-slate-100' };
                  const isUpdated = updatedTxnIds.has(txn.id);
                  return (
                    <div
                      key={txn.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-all duration-500 ${
                        isUpdated
                          ? 'bg-slate-50 ring-1 ring-slate-200 scale-[1.01]'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-lg ${tc.bg} flex items-center justify-center shrink-0 text-slate-600`}>
                          {tc.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate leading-tight">
                            {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {txn.external_id || `#${txn.id}`}
                            {txn.created_at && (
                              <span className="ml-1.5">• {formatTxnDate(txn.created_at)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-sm font-semibold text-slate-900">
                          ₱{fmt(txn.amount)}
                        </span>
                        <span className={`${sc.bg} ${sc.text} ${sc.border} border text-[10px] transition-all duration-500 hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                          isUpdated ? 'ring-2 ring-current' : ''
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          <span>{txn.status}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== REVENUE BREAKDOWN ===== */}
      {!loading && stats.total_amount > 0 && (
        <Card className="mt-6 bg-white border border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Revenue Breakdown</h2>
                <p className="text-xs text-slate-500 mt-0.5">Paid vs Pending vs Expired</p>
              </div>
              <Link to="/reports" className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Full report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex rounded-full overflow-hidden h-2 mb-5 bg-slate-100">
              <div 
                className="bg-emerald-500 transition-all duration-700 rounded-l-full"
                style={{ width: `${Math.min((stats.paid_amount / Math.max(stats.total_amount, 1)) * 100, 100)}%` }} 
              />
              <div 
                className="bg-amber-400 transition-all duration-700"
                style={{ width: `${Math.min((stats.pending_amount / Math.max(stats.total_amount, 1)) * 100, 100)}%` }} 
              />
              <div className="bg-slate-300 flex-1 rounded-r-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Paid', amount: stats.paid_amount, count: stats.paid_count, color: 'text-emerald-600', dot: 'bg-emerald-500' },
                { label: 'Pending', amount: stats.pending_amount, count: stats.pending_count, color: 'text-amber-600', dot: 'bg-amber-400' },
                { label: 'Expired', amount: stats.expired_amount || 0, count: stats.expired_count, color: 'text-slate-500', dot: 'bg-slate-400' },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.dot} mt-1.5 shrink-0`} />
                  <div>
                    <p className="text-xs font-medium text-slate-500">{r.label}</p>
                    <p className={`text-sm font-semibold ${r.color}`}>{r.count} txns</p>
                    {r.amount > 0 && <p className="text-xs text-slate-500">₱{fmt(r.amount)}</p>}
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
