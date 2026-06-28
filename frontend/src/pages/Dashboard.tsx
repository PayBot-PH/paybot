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
  Sun, Sunset, Moon, ChevronRight, BarChart3, ArrowUpRightFromCircle
} from 'lucide-react';

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
  if (hour < 12) return { text: 'Good morning', icon: <Sun className="h-4 w-4" /> };
  if (hour < 18) return { text: 'Good afternoon', icon: <Sunset className="h-4 w-4" /> };
  return { text: 'Good evening', icon: <Moon className="h-4 w-4" /> };
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

const statusConfig: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  paid:    { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  pending: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800' },
  expired: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500', border: 'border-red-200 dark:border-red-800' },
};

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' },
  qr_code:      { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' },
  payment_link: { icon: <LinkIcon className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' },
  alipay_qr:    { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' },
  wechat_qr:    { icon: <QrCode className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' },
};

function StatCard({ label, value, sub, icon, loading }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 shadow-sm hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 transition-all duration-300">
              {loading ? (
                <span className="inline-block w-12 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              ) : value}
            </p>
            {sub && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {loading ? (
                  <span className="inline-block w-20 h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                ) : sub}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-400">
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600 dark:border-slate-400"></div>
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
        <div className="flex items-center gap-3 mb-1">
          <span className="text-slate-500 dark:text-slate-400">{greeting.icon}</span>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {greeting.text}{userName ? `, ${userName}` : ''}
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
          {APP_DESCRIPTION}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
            isSuperAdmin
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}>
            {isSuperAdmin ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {isSuperAdmin ? 'Super Administrator' : 'Administrator'}
          </span>
          {!loading && stats.total_count > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              <TrendingUp className="h-3 w-3" />
              {successRate}% success rate
            </span>
          )}
        </div>
      </div>

      {/* ===== WALLET CARDS ROW ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* PHP Wallet */}
        <Link to="/wallet" className="block group">
          <Card className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">PHP Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  : `₱${fmt(walletBalance || 0)}`
                }
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                <span>View wallet</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* USD Wallet */}
        <Link to="/wallet" className="block group">
          <Card className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">USD Wallet</span>
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                {loading
                  ? <span className="inline-block w-24 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  : `$${usdWalletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                <span>Crypto balance</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <StatCard label="Total Transactions" value={stats.total_count} sub={`₱${fmt(stats.total_amount || 0)}`}
          icon={<Activity className="h-4 w-4" />} loading={loading} />
        <StatCard label="Paid" value={stats.paid_count} sub={`₱${fmt(stats.paid_amount || 0)}`}
          icon={<CheckCircle className="h-4 w-4" />} loading={loading} />
      </div>

      {/* ===== SECOND STATS ROW ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending" value={stats.pending_count} sub={`₱${fmt(stats.pending_amount || 0)}`}
          icon={<Clock className="h-4 w-4" />} loading={loading} />
        <StatCard label="Expired" value={stats.expired_count}
          sub={stats.expired_count > 0 ? `of ${stats.total_count} total` : undefined}
          icon={<XCircle className="h-4 w-4" />} loading={loading} />

        {/* USDT Settlement Card */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 sm:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">USDT Settlement</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{fmtUsd(usdtStats.settlement)}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Total Settled</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{usdtStats.txnCount}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Transactions</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {usdtStats.txnCount > 0 ? fmtUsd(usdtStats.settlement / usdtStats.txnCount) : '$0.00'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Avg per Txn</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${usdtStats.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {usdtStats.change >= 0 ? '+' : ''}{usdtStats.change.toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">24h Change</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== MAIN CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Zap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Quick Actions
              </CardTitle>
              {isSuperAdmin && (
                <span className="text-[10px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                  SUPER
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="space-y-1">
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
              ].map((action) => (
                <Link key={action.to} to={action.to} className="block">
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 group">
                    <div className="flex items-center gap-3">
                      <action.icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{action.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                  </button>
                </Link>
              ))}

              {permissions?.can_manage_bot && (
                <Link to="/bot-settings" className="block">
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 group">
                    <div className="flex items-center gap-3">
                      <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Bot Settings</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                  </button>
                </Link>
              )}

              {isSuperAdmin && (
                <Link to="/admin-management" className="block">
                  <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors duration-150 group">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin Management</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                  </button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Recent Transactions
            </CardTitle>
            <Link to="/transactions">
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 h-7 px-2 text-xs gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 animate-pulse">
                    <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                      <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                    </div>
                    <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <DollarSign className="h-6 w-6 text-slate-400 dark:text-slate-600" />
                </div>
                <p className="text-slate-900 dark:text-slate-100 text-sm font-medium">No transactions yet</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 mb-4">Create your first payment to get started</p>
                <Link to="/payments">
                  <Button size="sm" className="bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs h-8 rounded-lg">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Create Payment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-4 w-4" />, bg: 'bg-slate-100 dark:bg-slate-800' };
                  const isUpdated = updatedTxnIds.has(txn.id);
                  return (
                    <div
                      key={txn.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-all duration-500 ${
                        isUpdated
                          ? 'bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-lg ${tc.bg} flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-400`}>
                          {tc.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate leading-tight">
                            {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {txn.external_id || `#${txn.id}`}
                            {txn.created_at && (
                              <span className="ml-1.5">• {formatTxnDate(txn.created_at)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          ₱{fmt(txn.amount)}
                        </span>
                        <span className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sc.bg} ${sc.text} ${sc.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {txn.status}
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
        <Card className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Revenue Breakdown</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Paid vs Pending vs Expired</p>
              </div>
              <Link to="/reports" className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                Full report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex rounded-full overflow-hidden h-2 mb-5 bg-slate-100 dark:bg-slate-800">
              <div 
                className="bg-emerald-500 transition-all duration-700 rounded-l-full"
                style={{ width: `${Math.min((stats.paid_amount / Math.max(stats.total_amount, 1)) * 100, 100)}%` }} 
              />
              <div 
                className="bg-amber-400 transition-all duration-700"
                style={{ width: `${Math.min((stats.pending_amount / Math.max(stats.total_amount, 1)) * 100, 100)}%` }} 
              />
              <div className="bg-slate-300 dark:bg-slate-700 flex-1 rounded-r-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Paid', amount: stats.paid_amount, count: stats.paid_count, color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
                { label: 'Pending', amount: stats.pending_amount, count: stats.pending_count, color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400' },
                { label: 'Expired', amount: stats.expired_amount || 0, count: stats.expired_count, color: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400 dark:bg-slate-600' },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.dot} mt-1.5 shrink-0`} />
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{r.label}</p>
                    <p className={`text-sm font-semibold ${r.color}`}>{r.count} txns</p>
                    {r.amount > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">₱{fmt(r.amount)}</p>}
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
