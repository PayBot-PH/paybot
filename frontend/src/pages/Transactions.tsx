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
  Loader2,
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
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase">Transaction Ledger</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-2">
               <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
               Live monitoring of global payment volume
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-11 px-6 rounded-2xl border-border/50 font-black text-[10px] uppercase tracking-widest hover:bg-muted transition-all"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Link to="/payments">
              <Button size="sm" className="h-11 px-6 rounded-2xl bg-brand-blue-500 hover:bg-brand-blue-600 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-blue-500/20 transition-all active:scale-95">
                <Plus className="h-4 w-4 mr-2" />
                Initialize Order
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Toolbar */}
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reference, customer or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 h-12 bg-muted/20 border-border/50 rounded-xl font-medium focus:ring-primary/20"
                />
              </div>

              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="h-12 bg-muted/20 border-border/50 rounded-xl font-bold uppercase text-[10px] tracking-widest">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="All Channels" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-xl">
                  <SelectItem value="all">ALL CHANNELS</SelectItem>
                  <SelectItem value="invoice">INVOICE</SelectItem>
                  <SelectItem value="qr_code">QR CODE</SelectItem>
                  <SelectItem value="payment_link">UNIVERSAL LINK</SelectItem>
                  <SelectItem value="ewallet">E-WALLET</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="h-12 bg-muted/20 border-border/50 rounded-xl font-bold uppercase text-[10px] tracking-widest">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="All Status" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-xl">
                  <SelectItem value="all">ALL STATUS</SelectItem>
                  <SelectItem value="paid" className="text-emerald-500 font-bold">PAID</SelectItem>
                  <SelectItem value="pending" className="text-amber-500 font-bold">PENDING</SelectItem>
                  <SelectItem value="expired" className="text-rose-500 font-bold">EXPIRED</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                onClick={() => { setSearchTerm(''); setTypeFilter('all'); setStatusFilter('all'); }}
                className="h-12 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-muted"
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Syncing blockchain ledger...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-32 px-6">
                <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-6">
                  <Receipt className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="text-foreground font-black text-lg">Zero records found</p>
                <p className="text-muted-foreground text-sm mt-1 font-medium">Try adjusting your filters or search criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th className="px-6">Transaction / Channel</th>
                      <th>Reference</th>
                      <th>Customer</th>
                      <th className="text-right">Amount</th>
                      <th className="text-center">Status</th>
                      <th className="text-right px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const tc = typeIcons[txn.transaction_type] || { icon: <FileText className="h-4 w-4" />, bg: 'bg-muted' };
                      const isUpdated = updatedTxnIds.has(txn.id);

                      return (
                        <tr
                          key={txn.id}
                          className={`transition-all duration-500 ${isUpdated ? 'bg-primary/5 ring-1 ring-primary/20 scale-[0.99] z-10' : ''}`}
                        >
                          <td className="px-6">
                            <div className="flex items-center gap-4">
                              <div className={`h-11 w-11 rounded-2xl ${tc.bg} flex items-center justify-center shrink-0 border border-border/20 shadow-sm`}>
                                {tc.icon}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-foreground uppercase tracking-tight text-xs truncate max-w-[200px]">
                                  {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mt-1">
                                  {new Date(txn.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <code className="text-[10px] font-black text-brand-blue-500/80 bg-brand-blue-500/5 px-2 py-1 rounded-lg border border-brand-blue-500/10 uppercase tracking-tighter">
                              {txn.external_id || `#${txn.id}`}
                            </code>
                          </td>
                          <td>
                            {txn.customer_name ? (
                              <div className="min-w-0">
                                <p className="text-[11px] font-black text-foreground truncate">{txn.customer_name}</p>
                                <p className="text-[9px] font-bold text-muted-foreground truncate uppercase tracking-tighter">{txn.customer_email || 'No email'}</p>
                              </div>
                            ) : <span className="text-muted-foreground/60 font-black uppercase text-[9px] tracking-widest">Guest</span>}
                          </td>
                          <td className="text-right">
                            <span className="font-black text-foreground tracking-tighter tabular-nums">
                              ₱{fmt(txn.amount)}
                            </span>
                          </td>
                          <td>
                            <div className="flex justify-center">
                              <Badge className={`${sc.bg} ${sc.color} border-0 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} mr-2 shadow-sm`} />
                                {txn.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right px-6">
                            <div className="flex items-center justify-end gap-1">
                              {txn.payment_url && (
                                <a href={txn.payment_url} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all active:scale-90">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              <button
                                onClick={() => cloneTransaction(txn)}
                                className="p-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all active:scale-90"
                                title="Repeat Transaction"
                              >
                                <CopyPlus className="h-4 w-4" />
                              </button>
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
              <div className="px-8 py-6 border-t border-border/40 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Showing <span className="text-foreground">{page * limit + 1}–{Math.min((page + 1) * limit, total)}</span> of <span className="text-foreground">{total}</span> records
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-11 w-11 p-0 rounded-[1.25rem] border-border/50 transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="px-5 h-11 flex items-center justify-center bg-brand-blue-500 rounded-[1.25rem] shadow-lg shadow-brand-blue-500/30">
                    <span className="text-xs font-black text-white">
                      {page + 1}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages - 1}
                    onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-11 w-11 p-0 rounded-[1.25rem] border-border/50 transition-all"
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
