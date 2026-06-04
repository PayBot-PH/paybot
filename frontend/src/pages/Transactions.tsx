import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  QrCode,
  LinkIcon,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  ExternalLink,
  Copy,
  Plus,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ArrowUpDown,
  Filter,
  Download,
  Receipt,
  Smartphone,
  Building2,
  Store,
  CreditCard,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmt } from '@/lib/format';

interface Transaction {
  id: number;
  transaction_type: string;
  external_id: string;
  xendit_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  customer_name: string;
  customer_email: string;
  payment_url: string;
  qr_code_url: string;
  telegram_chat_id: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { color: string; dot: string; bg: string }> = {
  paid:    { color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
  pending: { color: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',   bg: 'bg-amber-500/10' },
  expired: { color: 'text-rose-600 dark:text-rose-400',       dot: 'bg-rose-500',    bg: 'bg-rose-500/10' },
  cancelled: { color: 'text-muted-foreground',               dot: 'bg-muted-foreground/40', bg: 'bg-muted/40' },
};

const typeIcons: Record<string, { icon: React.ReactNode; bg: string }> = {
  invoice:      { icon: <FileText className="h-4 w-4 text-brand-blue-500" />,   bg: 'bg-brand-blue-50' },
  qr_code:      { icon: <QrCode className="h-4 w-4 text-purple-500" />,     bg: 'bg-purple-50' },
  payment_link: { icon: <LinkIcon className="h-4 w-4 text-cyan-500" />,     bg: 'bg-cyan-50' },
  virtual_account: { icon: <Building2 className="h-4 w-4 text-emerald-500" />, bg: 'bg-emerald-50' },
  ewallet:      { icon: <Smartphone className="h-4 w-4 text-orange-500" />, bg: 'bg-orange-50' },
  alipay_qr:    { icon: <Store className="h-4 w-4 text-rose-500" />,       bg: 'bg-rose-50' },
  wechat_qr:    { icon: <Store className="h-4 w-4 text-green-500" />,      bg: 'bg-green-50' },
};

export default function Transactions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [updatedTxnIds, setUpdatedTxnIds] = useState<Set<number>>(new Set());
  const limit = 10;

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const query: Record<string, string> = {};
      if (statusFilter !== 'all') query.status = statusFilter;
      if (typeFilter !== 'all') query.transaction_type = typeFilter;

      const res = await client.entities.transactions.query({
        query,
        sort: '-created_at',
        limit,
        skip: page * limit,
      });
      setTransactions(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    }
  }, [user, page, statusFilter, typeFilter]);

  const { connected } = usePaymentEvents({
    enabled: !!user,
    onStatusChange: useCallback((event) => {
      fetchTransactions();
      if (event.transaction_id) {
        setUpdatedTxnIds((prev) => new Set(prev).add(event.transaction_id!));
        setTimeout(() => setUpdatedTxnIds((prev) => { const n = new Set(prev); n.delete(event.transaction_id!); return n; }), 3000);
      }
    }, [fetchTransactions]),
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchTransactions();
      setLoading(false);
    };
    load();
  }, [fetchTransactions]);

  const totalPages = Math.ceil(total / limit);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const cloneTransaction = (txn: Transaction) => {
    const params = new URLSearchParams();
    params.set('type', txn.transaction_type);
    params.set('amount', String(txn.amount));
    if (txn.description) params.set('description', txn.description);
    if (txn.customer_name) params.set('customer_name', txn.customer_name);
    if (txn.customer_email) params.set('customer_email', txn.customer_email);
    navigate(`/payments?${params.toString()}`);
  };

  return (
    <Layout connected={connected}>
      <div className="max-w-7xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Transactions</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Order history and payment status tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-border/60 font-bold text-[11px] uppercase tracking-widest h-10 rounded-xl hidden sm:flex">
              <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
            </Button>
            <Link to="/payments">
              <Button className="bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black h-10 px-5 rounded-xl shadow-lg shadow-brand-blue-500/20 active:scale-95 transition-all">
                <Plus className="h-4 w-4 mr-2" />
                NEW PAYMENT
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-card border-border/60 shadow-sm mb-6 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-brand-blue-500 transition-colors" />
                <Input
                  placeholder="Search by reference, description or customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 bg-muted/20 border-border/60 text-sm font-medium rounded-xl"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 px-3 h-12 bg-muted/20 border border-border/60 rounded-xl">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="border-0 bg-transparent focus:ring-0 w-[130px] font-bold text-[11px] uppercase tracking-widest h-full">
                      <SelectValue placeholder="STATUS" />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="paid" className="text-emerald-500 font-bold">PAID</SelectItem>
                      <SelectItem value="pending" className="text-amber-500 font-bold">PENDING</SelectItem>
                      <SelectItem value="expired" className="text-rose-500 font-bold">EXPIRED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 px-3 h-12 bg-muted/20 border border-border/60 rounded-xl">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                    <SelectTrigger className="border-0 bg-transparent focus:ring-0 w-[140px] font-bold text-[11px] uppercase tracking-widest h-full">
                      <SelectValue placeholder="CHANNEL" />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      <SelectItem value="all">ALL CHANNELS</SelectItem>
                      <SelectItem value="invoice">INVOICE</SelectItem>
                      <SelectItem value="qr_code">QR CODE</SelectItem>
                      <SelectItem value="payment_link">UNIVERSAL LINK</SelectItem>
                      <SelectItem value="ewallet">E-WALLET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="bg-card border-border/60 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-blue-500" />
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">Syncing ledger...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-32 px-6">
                <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-6">
                  <Receipt className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-foreground font-black text-lg">No records found</p>
                <p className="text-muted-foreground text-sm mt-1 font-medium">Try adjusting your filters or search term</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/40">
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4">Transaction / Channel</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4 hidden sm:table-cell">Reference</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4 hidden lg:table-cell">Customer</th>
                      <th className="text-right text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4">Amount</th>
                      <th className="text-center text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4">Status</th>
                      <th className="text-right text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {transactions.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const tc = typeIcons[txn.transaction_type] || { icon: <FileText className="h-4 w-4" />, bg: 'bg-muted' };
                      const isUpdated = updatedTxnIds.has(txn.id);
                      return (
                        <tr
                          key={txn.id}
                          className={`group transition-all duration-300 ${
                            isUpdated
                              ? 'bg-brand-blue-50 ring-1 ring-inset ring-brand-blue-200'
                              : 'hover:bg-muted/40'
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className={`h-10 w-10 rounded-2xl ${tc.bg} flex items-center justify-center shrink-0 shadow-sm border border-black/5`}>
                                {tc.icon}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-foreground uppercase tracking-tight truncate leading-tight">
                                  {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground mt-1 tracking-tighter">
                                  {new Date(txn.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <code className="text-[11px] font-black text-brand-blue-600 bg-brand-blue-50/50 px-2 py-0.5 rounded tracking-tighter">{txn.external_id || `#${txn.id}`}</code>
                              <button onClick={() => copyToClipboard(txn.external_id)} className="text-muted-foreground hover:text-brand-blue-500 opacity-0 group-hover:opacity-100 transition-all">
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 hidden lg:table-cell">
                            {txn.customer_name ? (
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">{txn.customer_name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{txn.customer_email || 'No email'}</p>
                              </div>
                            ) : <span className="text-muted-foreground italic text-xs">Guest</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-black text-foreground tabular-nums">
                              ₱{fmt(txn.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center">
                              <Badge className={`${sc.bg} ${sc.color} border-0 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all duration-500 ${isUpdated ? 'scale-110 shadow-lg' : ''}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} mr-2 shadow-sm`} />
                                {txn.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {txn.payment_url && (
                                <a href={txn.payment_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-brand-blue-500 rounded-lg">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </a>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cloneTransaction(txn)}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-cyan-500 rounded-lg"
                                title="Repeat transaction"
                              >
                                <CopyPlus className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between px-8 py-5 border-t border-border/40 bg-muted/10">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} <span className="mx-1 opacity-50">/</span> {total} records
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="px-3 h-8 flex items-center justify-center bg-brand-blue-500 rounded-lg">
                    <span className="text-xs font-black text-white">
                      {page + 1}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
