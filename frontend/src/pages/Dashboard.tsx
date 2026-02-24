import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
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
  ArrowRight,
  ArrowUpRight,
  Banknote,
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
  paid:    { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
  pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',    dot: 'bg-amber-400' },
  expired: { color: 'bg-red-500/15 text-red-400 border-red-500/25',          dot: 'bg-red-400' },
};

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-3.5 w-3.5 text-blue-400" />,   bg: 'bg-blue-500/10' },
  qr_code:      { icon: <QrCode className="h-3.5 w-3.5 text-purple-400" />,   bg: 'bg-purple-500/10' },
  payment_link: { icon: <LinkIcon className="h-3.5 w-3.5 text-cyan-400" />,   bg: 'bg-cyan-500/10' },
  alipay_qr:    { icon: <QrCode className="h-3.5 w-3.5 text-red-400" />,      bg: 'bg-red-500/10' },
  wechat_qr:    { icon: <QrCode className="h-3.5 w-3.5 text-green-400" />,    bg: 'bg-green-500/10' },
};

const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 });

export default function Dashboard() {
  const { user, loading: authLoading, login } = useAuth();
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
        client.entities.transactions.query({ query: {}, sort: '-created_at', limit: 8 }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance', method: 'GET', data: {} }),
      ]);
      if (results[0].status === 'fulfilled') { const d = results[0].value?.data; if (d) setStats(d); }
      if (results[1].status === 'fulfilled') { const d = results[1].value?.data?.items; if (d) setRecentTxns(d); }
      if (results[2].status === 'fulfilled') { const d = results[2].value?.data; if (d?.balance != null) setWalletBalance(d.balance); }
    } catch (err) { console.error(err); }
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

  if (authLoading) return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center">
      <div className="h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/30">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">PayBot <span className="text-blue-400">Admin</span></h1>
          <p className="text-slate-400 mt-2 text-sm">Telegram Bot & Payment Management Dashboard</p>
        </div>
        <button onClick={() => login()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20">
          <LogIn className="h-5 w-5" /> Sign In with Telegram
        </button>
        <Link to="/features" className="block text-slate-500 hover:text-blue-400 text-sm transition-colors">
          Learn about features →
        </Link>
      </div>
    </div>
  );

  const statCards = [
    { label: 'Total Revenue', value: `₱${fmt(stats.paid_amount)}`, sub: `${stats.paid_count} paid txns`, icon: <TrendingUp className="h-5 w-5" />, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: 'Wallet Balance', value: `₱${fmt(walletBalance)}`, sub: 'Available balance', icon: <Wallet className="h-5 w-5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', href: '/wallet' },
    { label: 'Pending', value: `₱${fmt(stats.pending_amount)}`, sub: `${stats.pending_count} awaiting`, icon: <Clock className="h-5 w-5" />, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { label: 'Total Transactions', value: String(stats.total_count), sub: `${stats.expired_count} expired`, icon: <Banknote className="h-5 w-5" />, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  ];

  const quickActions = [
    { to: '/payments',      icon: <CreditCard className="h-4 w-4" />,    label: 'Payments Hub',       color: 'text-blue-400',    bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20' },
    { to: '/wallet',        icon: <Wallet className="h-4 w-4" />,         label: 'Wallet',             color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20' },
    { to: '/disbursements', icon: <Send className="h-4 w-4" />,           label: 'Disbursements',      color: 'text-sky-400',     bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20' },
    { to: '/disbursements', icon: <RotateCcw className="h-4 w-4" />,      label: 'Refunds',            color: 'text-orange-400',  bg: 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20' },
    { to: '/disbursements', icon: <CalendarDays className="h-4 w-4" />,   label: 'Subscriptions',      color: 'text-purple-400',  bg: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20' },
    { to: '/disbursements', icon: <Users className="h-4 w-4" />,          label: 'Customers',          color: 'text-cyan-400',    bg: 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20' },
    { to: '/reports',       icon: <PieChart className="h-4 w-4" />,       label: 'Reports',            color: 'text-yellow-400',  bg: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20' },
    { to: '/bot-settings',  icon: <Bot className="h-4 w-4" />,            label: 'Bot Settings',       color: 'text-slate-300',   bg: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20' },
    { to: '/transactions',  icon: <Building2 className="h-4 w-4" />,      label: 'All Transactions',   color: 'text-indigo-400',  bg: 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20' },
  ];

  return (
    <Layout connected={connected}>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-500 text-sm mt-0.5">Welcome back{user?.name ? `, ${user.name}` : ''} 👋</p>
          </div>
          <Link to="/payments"
            className="hidden sm:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-500/20">
            <CreditCard className="h-4 w-4" /> New Payment
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className={`relative bg-[#0F172A] border ${s.border} rounded-2xl p-4 overflow-hidden ${s.href ? 'cursor-pointer hover:border-opacity-60 transition-colors' : ''}`}
              onClick={s.href ? () => window.location.href = s.href! : undefined}>
              <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full blur-2xl translate-x-8 -translate-y-8 pointer-events-none`} />
              <div className="relative">
                <div className={`inline-flex p-2 ${s.bg} border ${s.border} rounded-xl mb-3`}>
                  <span className={s.color}>{s.icon}</span>
                </div>
                <p className="text-2xl font-bold text-white leading-none mb-1">
                  {loading ? <span className="inline-block h-7 w-24 bg-slate-700/50 rounded animate-pulse" /> : s.value}
                </p>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{loading ? '' : s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent Transactions */}
          <div className="lg:col-span-2 bg-[#0F172A] border border-slate-700/40 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
              <div>
                <h2 className="text-white font-semibold">Recent Transactions</h2>
                <p className="text-slate-500 text-xs mt-0.5">Latest payment activity</p>
              </div>
              <Link to="/transactions"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-3">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 animate-pulse">
                      <div className="h-8 w-8 rounded-lg bg-slate-700/50 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 bg-slate-700/50 rounded" />
                        <div className="h-2.5 w-20 bg-slate-700/30 rounded" />
                      </div>
                      <div className="h-4 w-16 bg-slate-700/50 rounded" />
                    </div>
                  ))}
                </div>
              ) : recentTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
                    <DollarSign className="h-6 w-6 text-slate-600" />
                  </div>
                  <p className="text-slate-400 font-medium text-sm">No transactions yet</p>
                  <p className="text-slate-600 text-xs mt-1 mb-4">Your payment history will appear here</p>
                  <Link to="/payments"
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                    Create First Payment <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentTxns.map((txn) => {
                    const sc = statusConfig[txn.status] || statusConfig.pending;
                    const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-3.5 w-3.5 text-slate-400" />, bg: 'bg-slate-500/10' };
                    const isUpdated = updatedTxnIds.has(txn.id);
                    return (
                      <div key={txn.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
                          isUpdated ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-slate-800/50'
                        }`}>
                        <div className={`h-8 w-8 rounded-lg ${tc.bg} flex items-center justify-center shrink-0`}>
                          {tc.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{txn.external_id || `#${txn.id}`}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-white font-mono">
                            ₱{fmt(txn.amount)}
                          </span>
                          <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${sc.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {txn.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#0F172A] border border-slate-700/40 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40">
              <h2 className="text-white font-semibold">Quick Actions</h2>
              <p className="text-slate-500 text-xs mt-0.5">Navigate to key sections</p>
            </div>
            <div className="p-3 grid grid-cols-1 gap-1">
              {quickActions.map((a) => (
                <Link key={a.to + a.label} to={a.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all group ${a.bg}`}>
                  <span className={a.color}>{a.icon}</span>
                  <span className={`text-sm font-medium ${a.color} flex-1`}>{a.label}</span>
                  <ArrowUpRight className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue breakdown mini-bar */}
        {!loading && stats.total_amount > 0 && (
          <div className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold">Revenue Breakdown</h2>
                <p className="text-slate-500 text-xs mt-0.5">Paid vs Pending vs Expired</p>
              </div>
              <Link to="/reports"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors">
                Full report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex rounded-full overflow-hidden h-2.5 mb-4 bg-slate-800">
              {stats.total_amount > 0 && (
                <>
                  <div className="bg-emerald-400 transition-all duration-700" style={{ width: `${(stats.paid_amount / stats.total_amount) * 100}%` }} />
                  <div className="bg-amber-400 transition-all duration-700" style={{ width: `${(stats.pending_amount / stats.total_amount) * 100}%` }} />
                  <div className="bg-slate-600 flex-1" />
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Paid', amount: stats.paid_amount, count: stats.paid_count, color: 'text-emerald-400', dot: 'bg-emerald-400' },
                { label: 'Pending', amount: stats.pending_amount, count: stats.pending_count, color: 'text-amber-400', dot: 'bg-amber-400' },
                { label: 'Expired', amount: 0, count: stats.expired_count, color: 'text-slate-500', dot: 'bg-slate-600' },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.dot} mt-1 shrink-0`} />
                  <div>
                    <p className="text-xs text-slate-500">{r.label}</p>
                    <p className={`text-sm font-semibold ${r.color}`}>{r.count} txns</p>
                    {r.amount > 0 && <p className="text-xs text-slate-600">₱{fmt(r.amount)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
