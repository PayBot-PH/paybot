import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
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
  LogIn,
  Wallet,
  CreditCard,
  Building2,
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
  total_count: 0,
  paid_count: 0,
  pending_count: 0,
  expired_count: 0,
  total_amount: 0,
  paid_amount: 0,
  pending_amount: 0,
};

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  paid: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="h-3 w-3" /> },
  pending: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  expired: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" /> },
};

const typeIcons: Record<string, React.ReactNode> = {
  invoice: <FileText className="h-4 w-4 text-blue-400" />,
  qr_code: <QrCode className="h-4 w-4 text-purple-400" />,
  payment_link: <LinkIcon className="h-4 w-4 text-cyan-400" />,
};

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
    <Card className="bg-[#1E293B] border-slate-700/50 hover:border-slate-600/60 transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color} transition-all duration-300`}>
              {loading ? (
                <span className="inline-block w-10 h-7 bg-slate-700/60 rounded animate-pulse" />
              ) : value}
            </p>
            {sub && (
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                {loading ? (
                  <span className="inline-block w-20 h-3 bg-slate-700/40 rounded animate-pulse" />
                ) : sub}
              </p>
            )}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color.includes('emerald') ? 'bg-emerald-500/15' : color.includes('amber') ? 'bg-amber-500/15' : color.includes('red') ? 'bg-red-500/15' : 'bg-blue-500/15'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading, login, isSuperAdmin, permissions } = useAuth();
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedTxnIds, setUpdatedTxnIds] = useState<Set<number>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number>(0);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const results = await Promise.allSettled([
        client.apiCall.invoke({ url: '/api/v1/xendit/transaction-stats', method: 'GET', data: {} }),
        client.entities.transactions.query({ query: {}, sort: '-created_at', limit: 5 }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance', method: 'GET', data: {} }),
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
        setTimeout(() => {
          setUpdatedTxnIds((prev) => {
            const next = new Set(prev);
            next.delete(event.transaction_id!);
            return next;
          });
        }, 3000);
      }
    }, [fetchData]),
    onWalletUpdate: useCallback(() => {
      fetchData();
    }, [fetchData]),
    pollInterval: 10000,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    load();
  }, [user, fetchData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-center space-y-6 max-w-sm px-6">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/368645/2026-02-18/b7a3226a-8029-4dad-a8fe-3bfcd3bda329.png"
              alt="Payment Dashboard"
              className="relative rounded-2xl shadow-2xl border border-slate-700/50 w-full"
            />
          </div>
          <h1 className="text-3xl font-bold text-white">
            PayBot <span className="text-blue-400">Admin</span>
          </h1>
          <p className="text-slate-400">
            Telegram Bot & Xendit Payment Management Dashboard
          </p>
          <Button
            onClick={() => login()}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <LogIn className="h-5 w-5 mr-2" />
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  const successRate = stats.total_count > 0
    ? Math.round((stats.paid_count / stats.total_count) * 100)
    : 0;

  return (
    <Layout connected={connected}>
      {/* Page Header */}
      <div className="mb-6">
        <div className={`relative overflow-hidden rounded-xl border px-5 py-4 ${
          isSuperAdmin
            ? 'bg-gradient-to-r from-amber-950/40 to-amber-900/20 border-amber-500/20'
            : 'bg-gradient-to-r from-blue-950/40 to-blue-900/20 border-blue-500/20'
        }`}>
          {/* Decorative glow */}
          <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full blur-3xl pointer-events-none opacity-20 ${isSuperAdmin ? 'bg-amber-500' : 'bg-blue-500'}`} />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                isSuperAdmin ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-blue-500/20 border border-blue-500/30'
              }`}>
                {isSuperAdmin
                  ? <Crown className="h-5 w-5 text-amber-400" />
                  : <User className="h-5 w-5 text-blue-400" />
                }
              </div>
              <div className="min-w-0">
                <h1 className={`text-base font-bold ${isSuperAdmin ? 'text-amber-300' : 'text-blue-300'}`}>
                  {isSuperAdmin ? 'Super Admin Dashboard' : 'Admin Dashboard'}
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  {isSuperAdmin
                    ? 'Full access — manage admins, bot settings, and all financial data.'
                    : 'Manage payments, wallet, disbursements, and reports.'}
                </p>
              </div>
            </div>

            {/* Success rate chip */}
            {!loading && stats.total_count > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg shrink-0">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">{successRate}%</span>
                <span className="text-xs text-emerald-500">success</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
        {/* Wallet Balance - spans 2 cols on small, 1 on xl */}
        <Link to="/wallet" className="col-span-2 xl:col-span-1 block group">
          <Card className="h-full bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 border-0 shadow-lg shadow-blue-900/30 hover:shadow-blue-700/40 hover:scale-[1.02] transition-all duration-200 cursor-pointer">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-blue-200">Wallet Balance</p>
                <div className="h-9 w-9 bg-white/15 rounded-xl flex items-center justify-center">
                  <Wallet className="h-4.5 w-4.5 text-white" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white transition-all duration-300">
                {loading
                  ? <span className="inline-block w-28 h-8 bg-blue-500/40 rounded animate-pulse" />
                  : `₱${(walletBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                }
              </p>
              <div className="flex items-center gap-1 mt-2 text-blue-200 text-xs group-hover:text-white transition-colors">
                <span>Manage wallet</span>
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <StatCard
          label="Total Transactions"
          value={stats.total_count}
          sub={`₱${(stats.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          icon={<TrendingUp className="h-5 w-5 text-blue-400" />}
          color="text-white"
          loading={loading}
        />
        <StatCard
          label="Paid"
          value={stats.paid_count}
          sub={`₱${(stats.paid_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          icon={<CheckCircle className="h-5 w-5 text-emerald-400" />}
          color="text-emerald-400"
          loading={loading}
        />
        <StatCard
          label="Pending"
          value={stats.pending_count}
          sub={`₱${(stats.pending_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          icon={<Clock className="h-5 w-5 text-amber-400" />}
          color="text-amber-400"
          loading={loading}
        />
        <StatCard
          label="Expired"
          value={stats.expired_count}
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          color="text-red-400"
          loading={loading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <Card className="bg-[#1E293B] border-slate-700/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                Quick Actions
              </CardTitle>
              {isSuperAdmin && (
                <span className="text-[9px] font-bold bg-amber-500/10 border border-amber-500/25 text-amber-400 px-1.5 py-0.5 rounded-full">
                  SUPER
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { to: '/payments', icon: CreditCard, label: 'Payments Hub', color: 'blue' },
                { to: '/disbursements', icon: Send, label: 'Disbursements', color: 'emerald' },
                { to: '/transactions', icon: RefreshCw, label: 'Transactions', color: 'cyan' },
                { to: '/reports', icon: PieChart, label: 'Analytics', color: 'yellow' },
                { to: '/wallet', icon: Wallet, label: 'Wallet', color: 'indigo' },
                { to: '/disbursements', icon: RotateCcw, label: 'Refunds', color: 'orange' },
                { to: '/disbursements', icon: CalendarDays, label: 'Schedules', color: 'purple' },
                { to: '/disbursements', icon: Users, label: 'Customers', color: 'teal' },
              ].map(({ to, icon: Icon, label, color }) => (
                <Link key={`${to}-${label}`} to={to} className="block">
                  <button className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all duration-150 text-left group
                    ${color === 'blue' ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/40' : ''}
                    ${color === 'emerald' ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20 hover:border-emerald-500/40' : ''}
                    ${color === 'cyan' ? 'bg-cyan-600/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-600/20 hover:border-cyan-500/40' : ''}
                    ${color === 'yellow' ? 'bg-yellow-600/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-600/20 hover:border-yellow-500/40' : ''}
                    ${color === 'indigo' ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/20 hover:border-indigo-500/40' : ''}
                    ${color === 'orange' ? 'bg-orange-600/10 border-orange-500/20 text-orange-400 hover:bg-orange-600/20 hover:border-orange-500/40' : ''}
                    ${color === 'purple' ? 'bg-purple-600/10 border-purple-500/20 text-purple-400 hover:bg-purple-600/20 hover:border-purple-500/40' : ''}
                    ${color === 'teal' ? 'bg-teal-600/10 border-teal-500/20 text-teal-400 hover:bg-teal-600/20 hover:border-teal-500/40' : ''}
                  `}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium truncate">{label}</span>
                  </button>
                </Link>
              ))}

              {permissions?.can_manage_bot && (
                <Link to="/bot-settings" className="block">
                  <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-slate-600/10 border-slate-500/20 text-slate-300 hover:bg-slate-600/20 hover:border-slate-500/40 transition-all duration-150 text-left">
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">Bot Settings</span>
                  </button>
                </Link>
              )}

              {isSuperAdmin && (
                <Link to="/admin-management" className="block">
                  <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-amber-600/10 border-amber-500/20 text-amber-400 hover:bg-amber-600/20 hover:border-amber-500/40 transition-all duration-150 text-left">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">Admin Mgmt</span>
                  </button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-[#1E293B] border-slate-700/50 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              Recent Transactions
            </CardTitle>
            <Link to="/transactions">
              <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-7 px-2 text-xs gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 animate-pulse">
                    <div className="h-8 w-8 rounded-lg bg-slate-700/60 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-700/60 rounded w-2/3" />
                      <div className="h-2.5 bg-slate-700/40 rounded w-1/3" />
                    </div>
                    <div className="h-4 w-16 bg-slate-700/60 rounded" />
                  </div>
                ))}
              </div>
            ) : recentTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-2xl bg-slate-700/40 flex items-center justify-center mb-3">
                  <DollarSign className="h-6 w-6 text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm font-medium">No transactions yet</p>
                <p className="text-slate-600 text-xs mt-1 mb-4">Create your first payment to get started</p>
                <Link to="/payments">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Create Payment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const isUpdated = updatedTxnIds.has(txn.id);
                  return (
                    <div
                      key={txn.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-500 ${
                        isUpdated
                          ? 'bg-blue-500/10 ring-1 ring-blue-500/40 scale-[1.01]'
                          : 'bg-slate-800/50 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-slate-700/60 flex items-center justify-center shrink-0 border border-slate-600/30">
                          {typeIcons[txn.transaction_type] || <FileText className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate leading-tight">
                            {txn.description || txn.transaction_type.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {txn.external_id || `#${txn.id}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-sm font-mono font-semibold text-white">
                          ₱{txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                        <Badge
                          className={`${sc.color} border text-[10px] transition-all duration-500 hidden sm:flex items-center gap-1 px-1.5 py-0.5 ${
                            isUpdated ? 'animate-pulse ring-2 ring-current' : ''
                          }`}
                        >
                          {sc.icon}
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
    </Layout>
  );
}
