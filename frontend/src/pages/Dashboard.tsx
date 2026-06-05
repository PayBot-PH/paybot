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
    <Card className="glass-card hover:scale-[1.02] active:scale-[0.98] transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70">{label}</p>
            <div className={`text-3xl font-black tracking-tight ${color}`}>
              {loading ? <div className="h-8 w-24 bg-muted animate-pulse rounded-lg" /> : value}
            </div>
            {sub && (
              <div className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-primary/40" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{sub}</p>
              </div>
            )}
          </div>
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/80 flex items-center justify-center shrink-0 shadow-inner border border-white/5">
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
      ]);

      if (results[0].status === 'fulfilled') {
        const statsData = results[0].value?.data;
        if (statsData) setStats(statsData);
      } else {
        setApiStatus('degrading');
      }

      if (results[1].status === 'fulfilled') {
        const txnData = results[1].value?.data?.items;
        setRecentTxns(Array.isArray(txnData) ? txnData : []);
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
        setRecentLogs(Array.isArray(logData) ? logData : []);
      }

      if (results[6].status === 'fulfilled') {
        const rateData = results[6].value?.data;
        if (rateData?.usdt_php_rate) setExchangeRate(rateData.usdt_php_rate);
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
        <div className="relative overflow-hidden rounded-[2.5rem] mb-10 bg-gradient-to-br from-brand-blue-600 via-brand-blue-500 to-brand-blue-700 shadow-2xl shadow-brand-blue-500/30 group">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-[100px] group-hover:scale-110 transition-transform duration-1000" />
          <div className="absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-brand-blue-300/20 blur-[80px] group-hover:scale-110 transition-transform duration-1000" />

          <div className="relative px-10 py-10 sm:py-12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="space-y-6">
                <div className="flex items-center gap-5">
                  <div className="h-16 w-16 rounded-[1.5rem] bg-white/15 backdrop-blur-2xl flex items-center justify-center shadow-2xl border border-white/20 ring-1 ring-white/10">
                    {greeting.icon}
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter">
                      {greeting.text}{userName ? `, ${userName}` : ''}
                    </h1>
                    <p className="text-brand-blue-50/70 text-base font-semibold tracking-tight">
                      {APP_DESCRIPTION}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-0 shadow-lg ${
                    isSuperAdmin ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-amber-950' : 'bg-white/10 text-white'
                  }`}>
                    {isSuperAdmin ? <Crown className="h-3 w-3 mr-2 inline" /> : <ShieldCheck className="h-3 w-3 mr-2 inline" />}
                    {isSuperAdmin ? 'Full System Access' : 'Administrative Account'}
                  </Badge>
                  <Badge className="bg-white/10 text-white px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-0">
                    <Radio className="h-3 w-3 mr-2 inline text-brand-blue-300 animate-pulse" />
                    Maya Mainnet: Stable
                  </Badge>
                  {!loading && stats.total_count > 0 && (
                    <Badge className="bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40 px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-0">
                      <TrendingUp className="h-3 w-3 mr-2 inline" />
                      {successRate}% Success Rate
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 self-start lg:self-center">
                <div className="flex items-center gap-2 bg-black/20 backdrop-blur-2xl p-1.5 rounded-[2rem] border border-white/10 shadow-2xl">
                      <div className="text-center px-8 py-4">
                        <p className="text-2xl sm:text-3xl font-black text-white tracking-tighter tabular-nums">
                          {loading ? '---' : stats.total_count}
                        </p>
                        <p className="text-brand-blue-50/40 text-[9px] font-black uppercase tracking-widest mt-1">Total</p>
                      </div>
                      <div className="w-px h-12 bg-white/10 mx-1" />
                      <div className="text-center px-8 py-4">
                        <p className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tighter tabular-nums">
                          {loading ? '---' : stats.paid_count}
                        </p>
                        <p className="text-brand-blue-50/40 text-[9px] font-black uppercase tracking-widest mt-1">Success</p>
                      </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
                  disabled={loading}
                  className="h-16 w-16 rounded-[1.5rem] bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-all active:scale-90 shadow-lg"
                >
                  <RefreshCw className={`h-7 w-7 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* WALLET CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <Link to="/wallet" className="group block">
            <Card className="h-full bg-brand-blue-500 border-0 shadow-2xl shadow-brand-blue-500/20 group-hover:-translate-y-2 transition-all duration-500 overflow-hidden relative rounded-[2rem]">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 group-hover:scale-150 transition-all duration-700"><Wallet className="h-32 w-32" /></div>
              <CardContent className="p-8 relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner"><Wallet className="h-5 w-5 text-white" /></div>
                  <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">PHP Wallet</p>
                </div>
                <p className="text-4xl font-black text-white tracking-tighter tabular-nums">
                  {loading ? '₱ --.--' : `₱${fmt(walletBalance || 0)}`}
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/wallet" className="group block">
            <Card className="h-full bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 shadow-2xl shadow-emerald-600/20 group-hover:-translate-y-2 transition-all duration-500 overflow-hidden relative rounded-[2rem]">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:-rotate-12 group-hover:scale-150 transition-all duration-700"><DollarSign className="h-32 w-32" /></div>
              <CardContent className="p-8 relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner"><Zap className="h-5 w-5 text-white" /></div>
                  <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">USDT Vault</p>
                </div>
                <p className="text-4xl font-black text-white tracking-tighter tabular-nums">
                  {loading ? '$ --.--' : `$${fmtUsd(usdWalletBalance)}`}
                </p>
              </CardContent>
            </Card>
          </Link>

          <StatCard label="Settled Revenue" value={`₱${fmt(stats.paid_amount || 0)}`} sub={`From ${stats.paid_count} sales`}
            icon={<TrendingUp className="h-6 w-6 text-brand-blue-500" />} color="text-foreground" loading={loading} />

          <StatCard label="Success Index" value={`${successRate}%`} sub="Payment Reliability"
            icon={<CheckCircle className="h-6 w-6 text-emerald-500" />} color="text-emerald-500" loading={loading} />
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="space-y-8">
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-4 pt-8 px-8"><CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 flex items-center gap-3">Controls</CardTitle></CardHeader>
              <CardContent className="px-6 pb-8">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { to: '/create-payment', icon: CreditCard, label: 'Charge', bg: 'bg-brand-blue-500/10', text: 'text-brand-blue-500' },
                    { to: '/disbursements', icon: Send, label: 'Payout', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
                    { to: '/transactions', icon: FileText, label: 'Ledger', bg: 'bg-cyan-500/10', text: 'text-cyan-500' },
                    { to: '/wallet', icon: Wallet, label: 'Vault', bg: 'bg-indigo-500/10', text: 'text-indigo-500' },
                  ].map(({ to, icon: Icon, label, bg, text }) => (
                    <Link key={label} to={to} className="block group">
                      <div className={`w-full flex flex-col items-center gap-3 p-5 rounded-[1.5rem] transition-all duration-300 ${bg} ${text} hover:scale-[1.05] border border-transparent hover:border-white/20`}>
                        <Icon className="h-7 w-7" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-4 pt-8 px-8"><CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 flex items-center gap-3">Bot Control</CardTitle></CardHeader>
              <CardContent className="px-6 pb-8 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-blue-500/5 border border-brand-blue-500/10">
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-brand-blue-500 flex items-center justify-center">
                         <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div>
                         <p className="text-xs font-black uppercase">PayBot AI</p>
                         <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Active & Online</p>
                      </div>
                   </div>
                   <Button size="sm" variant="outline" className="h-8 px-3 text-[9px] font-black uppercase tracking-widest border-brand-blue-500/20 text-brand-blue-500 hover:bg-brand-blue-500 hover:text-white transition-all">
                      Restart
                   </Button>
                </div>

                <div className="space-y-3">
                {Array.isArray(recentLogs) && recentLogs.map(log => (
                  <div key={log.id} className="flex gap-4 items-center p-3 rounded-2xl bg-muted/20 border border-border/40 hover:bg-muted/30 transition-all duration-300">
                    <MessageSquare className="h-4 w-4 text-brand-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground truncate">@{log.telegram_username} <span className="font-medium opacity-60">triggered</span> {log.command}</p>
                      <p className="text-[9px] font-black uppercase text-muted-foreground/50 mt-1 tracking-tighter">{formatTxnDate(log.created_at)}</p>
                    </div>
                  </div>
                ))}
                </div>
                {(!Array.isArray(recentLogs) || recentLogs.length === 0) && <p className="text-center py-10 text-muted-foreground text-xs italic">System standby...</p>}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="glass-card h-full flex flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-6 pt-8 px-8"><CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 flex items-center gap-3">Global Activity</CardTitle><Link to="/transactions"><Button variant="ghost" size="sm" className="h-10 px-5 text-[10px] font-black uppercase tracking-[0.2em] text-brand-blue-500">View Ledger <ArrowRight className="h-3 w-3 ml-2" /></Button></Link></CardHeader>
              <CardContent className="px-4 pb-8 flex-1 overflow-hidden space-y-2">
                {Array.isArray(recentTxns) && recentTxns.map((txn) => {
                  const sc = statusConfig[txn.status] || statusConfig.pending;
                  const tc = typeConfig[txn.transaction_type] || { icon: <FileText className="h-4 w-4" />, bg: 'bg-muted' };
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-5 rounded-[1.5rem] transition-all duration-700 border border-transparent hover:bg-muted/30 hover:border-border/40">
                      <div className="flex items-center gap-5 min-w-0">
                        <div className={`h-11 w-11 rounded-2xl ${tc.bg} flex items-center justify-center shrink-0 border border-black/5`}>{tc.icon}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground truncate uppercase">{txn.description || txn.transaction_type}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">{formatTxnDate(txn.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-base font-black text-foreground tracking-tighter">₱{fmt(txn.amount)}</p>
                        <Badge className={`${sc.color} border-0 text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full mt-2`}>{txn.status}</Badge>
                      </div>
                    </div>
                  );
                })}
                {(!Array.isArray(recentTxns) || recentTxns.length === 0) && !loading && (
                  <div className="flex flex-col items-center justify-center py-20 opacity-30"><CreditCard className="h-12 w-12 mb-4" /><p className="text-xs font-black uppercase tracking-widest">No activity</p></div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* SYSTEM STATUS */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <Card className="lg:col-span-3 glass-card p-8">
             <div className="flex items-center justify-between mb-10">
                <h2 className="text-foreground font-black text-lg uppercase tracking-tight">Revenue Dynamics</h2>
                <div className={`h-2.5 w-2.5 rounded-full ${apiStatus === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
             </div>
             <div className="flex rounded-full overflow-hidden h-4 mb-10 bg-muted/40 p-0.5">
                <div className="bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${(stats.paid_amount / (stats.total_amount || 1)) * 100}%` }} />
                <div className="bg-amber-400 rounded-full transition-all duration-1000 mx-0.5" style={{ width: `${(stats.pending_amount / (stats.total_amount || 1)) * 100}%` }} />
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {[
                  { label: 'Settled', amount: stats.paid_amount, color: 'text-emerald-500' },
                  { label: 'Pending', amount: stats.pending_amount, color: 'text-amber-500' },
                  { label: 'Lost', amount: 0, count: stats.expired_count, color: 'text-muted-foreground/60' },
                ].map((r) => (
                  <div key={r.label} className="p-6 rounded-[2rem] bg-muted/20 border border-border/30">
                    <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.3em] mb-2">{r.label}</p>
                    <p className={`text-2xl font-black ${r.color} tracking-tighter tabular-nums`}>{r.amount > 0 ? `₱${fmt(r.amount)}` : `${r.count || 0} OPS`}</p>
                  </div>
                ))}
             </div>
          </Card>

          <Card className="glass-card p-8 flex flex-col bg-muted/10">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/50 mb-10">Grid Status</h2>
              <div className="space-y-8 flex-1">
                {[
                  { label: 'Maya API Node', ok: apiStatus === 'healthy', detail: 'T+0 Enabled' },
                  { label: 'USDT Gateway', ok: true, detail: `₱${exchangeRate.toFixed(2)} Rate` },
                  { label: 'Telegram Relay', ok: true, detail: '142ms latency' },
                  { label: 'Cloud Webhook', ok: apiStatus !== 'offline', detail: 'Stable' },
                ].map(node => (
                  <div key={node.label} className="flex items-center justify-between group/node">
                    <div>
                      <span className="text-xs font-black text-foreground/80 uppercase block">{node.label}</span>
                      <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{node.detail}</span>
                    </div>
                    <div className={`h-2.5 w-2.5 rounded-full ${node.ok ? 'bg-emerald-500 shadow-emerald-500/40' : 'bg-rose-500 shadow-rose-500/40'} shadow-lg ring-4 ring-white/5 transition-transform group-hover/node:scale-150`} />
                  </div>
                ))}
              </div>
              <div className="mt-10 pt-10 border-t border-border/40 flex items-center gap-4">
                <Clock className="h-6 w-6 text-brand-blue-500" />
                <div>
                  <p className="text-[10px] font-black text-foreground uppercase tracking-[0.2em] mb-1">Last Sync</p>
                  <p className="text-[11px] font-black text-brand-blue-500/80 tracking-widest tabular-nums">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
          </Card>
        </div>
        <div className="h-12" />
      </div>
    </Layout>
  );
}
