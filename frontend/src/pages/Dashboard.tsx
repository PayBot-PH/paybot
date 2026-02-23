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
      // Use Promise.allSettled so individual failures don't break everything
      const results = await Promise.allSettled([
        client.apiCall.invoke({ url: '/api/v1/xendit/transaction-stats', method: 'GET', data: {} }),
        client.entities.transactions.query({ query: {}, sort: '-created_at', limit: 5 }),
        client.apiCall.invoke({ url: '/api/v1/wallet/balance', method: 'GET', data: {} }),
      ]);

      // Handle stats result
      if (results[0].status === 'fulfilled') {
        const statsData = results[0].value?.data;
        if (statsData) setStats(statsData);
      } else {
        console.warn('Failed to fetch transaction stats:', results[0].reason);
      }

      // Handle transactions result
      if (results[1].status === 'fulfilled') {
        const txnData = results[1].value?.data?.items;
        if (txnData) setRecentTxns(txnData);
      } else {
        console.warn('Failed to fetch recent transactions:', results[1].reason);
      }

      // Handle wallet result
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

  // Real-time payment events
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
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
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
            onClick={login}
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

  return (
    <Layout connected={connected}>
      <>
      {/* Wallet Balance + Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Link to="/wallet" className="block col-span-2 lg:col-span-1">
            <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-0 h-full hover:scale-[1.02] transition-transform cursor-pointer">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-200">Wallet Balance</p>
                    <p className="text-2xl sm:text-3xl font-bold text-white mt-1 transition-all duration-300">
                      {loading ? '...' : `₱${(walletBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                </div>
                <p className="text-xs text-blue-200 mt-2">Tap to manage →</p>
              </CardContent>
            </Card>
          </Link>
          <Card className="bg-[#1E293B] border-slate-700/50 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-2xl font-bold text-white mt-0.5 transition-all duration-300">
                    {loading ? '...' : stats.total_count}
                  </p>
                </div>
                <div className="h-9 w-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                ₱{loading ? '...' : (stats.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1E293B] border-slate-700/50 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Paid</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-0.5 transition-all duration-300">
                    {loading ? '...' : stats.paid_count}
                  </p>
                </div>
                <div className="h-9 w-9 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                ₱{loading ? '...' : (stats.paid_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1E293B] border-slate-700/50 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Pending</p>
                  <p className="text-2xl font-bold text-amber-400 mt-0.5 transition-all duration-300">
                    {loading ? '...' : stats.pending_count}
                  </p>
                </div>
                <div className="h-9 w-9 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                ₱{loading ? '...' : (stats.pending_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1E293B] border-slate-700/50 transition-all duration-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Expired</p>
                  <p className="text-2xl font-bold text-red-400 mt-0.5 transition-all duration-300">
                    {loading ? '...' : stats.expired_count}
                  </p>
                </div>
                <div className="h-9 w-9 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Recent Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Quick Actions */}
          <Card className="bg-[#1E293B] border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/payments" className="block">
                <Button className="w-full justify-start bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 h-9 text-sm">
                  <CreditCard className="h-4 w-4 mr-3" />
                  Payments Hub
                </Button>
              </Link>
              <Link to="/disbursements" className="block">
                <Button className="w-full justify-start bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 h-9 text-sm">
                  <Send className="h-4 w-4 mr-3" />
                  Disbursements
                </Button>
              </Link>
              <Link to="/disbursements" className="block">
                <Button className="w-full justify-start bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 h-9 text-sm">
                  <RotateCcw className="h-4 w-4 mr-3" />
                  Refunds
                </Button>
              </Link>
              <Link to="/disbursements" className="block">
                <Button className="w-full justify-start bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 h-9 text-sm">
                  <CalendarDays className="h-4 w-4 mr-3" />
                  Subscriptions
                </Button>
              </Link>
              <Link to="/disbursements" className="block">
                <Button className="w-full justify-start bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 h-9 text-sm">
                  <Users className="h-4 w-4 mr-3" />
                  Customers
                </Button>
              </Link>
              <Link to="/reports" className="block">
                <Button className="w-full justify-start bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-500/30 h-9 text-sm">
                  <PieChart className="h-4 w-4 mr-3" />
                  Reports & Analytics
                </Button>
              </Link>
              <Link to="/wallet" className="block">
                <Button className="w-full justify-start bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 h-9 text-sm">
                  <Wallet className="h-4 w-4 mr-3" />
                  Wallet
                </Button>
              </Link>
              <Link to="/bot-settings" className="block">
                <Button className="w-full justify-start bg-slate-600/20 hover:bg-slate-600/30 text-slate-300 border border-slate-500/30 h-9 text-sm">
                  <Bot className="h-4 w-4 mr-3" />
                  Bot Settings
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card className="bg-[#1E293B] border-slate-700/50 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-white text-base">Recent Transactions</CardTitle>
              <Link to="/transactions">
                <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-7 text-xs">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : recentTxns.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No transactions yet</p>
                  <Link to="/payments">
                    <Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700 text-white">
                      Create Your First Payment
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentTxns.map((txn) => {
                    const sc = statusConfig[txn.status] || statusConfig.pending;
                    const isUpdated = updatedTxnIds.has(txn.id);
                    return (
                      <div
                        key={txn.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-500 ${
                          isUpdated
                            ? 'bg-blue-500/10 ring-1 ring-blue-500/40 scale-[1.01]'
                            : 'bg-slate-800/50 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                            {typeIcons[txn.transaction_type] || <FileText className="h-4 w-4 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {txn.description || txn.transaction_type.replace('_', ' ')}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {txn.external_id || `#${txn.id}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-2 shrink-0">
                          <span className="text-sm font-mono font-medium text-white">
                            ₱{txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                          <Badge
                            className={`${sc.color} border text-xs transition-all duration-500 hidden sm:flex ${
                              isUpdated ? 'animate-pulse ring-2 ring-current' : ''
                            }`}
                          >
                            {sc.icon}
                            <span className="ml-1">{txn.status}</span>
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

        {/* Feature Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
          <Card className="bg-[#1E293B] border-slate-700/50 overflow-hidden">
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/368645/2026-02-18/708b853e-3a23-4415-8775-d6be2fe19508.png"
              alt="Telegram Bot"
              className="w-full h-24 object-cover"
            />
            <CardContent className="p-3">
              <h3 className="font-semibold text-white text-sm">Telegram Bot</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Create payments from Telegram chat
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#1E293B] border-slate-700/50 overflow-hidden">
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/368645/2026-02-18/bf6f862a-d725-4930-8bde-904d239336f7.png"
              alt="Xendit Integration"
              className="w-full h-24 object-cover"
            />
            <CardContent className="p-3">
              <h3 className="font-semibold text-white text-sm">Xendit Payments</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Invoices, QR codes & payment links
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#1E293B] border-slate-700/50 overflow-hidden col-span-2 md:col-span-1">
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/368645/2026-02-18/aae06fae-2855-4dcc-aacd-03c555f1f7ac.png"
              alt="QR Payments"
              className="w-full h-24 object-cover"
            />
            <CardContent className="p-3">
              <h3 className="font-semibold text-white text-sm">QR Payments</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate QR codes for mobile payments
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    </Layout>
  );
}