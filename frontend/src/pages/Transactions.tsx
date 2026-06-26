import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

      const items = res.data?.items;
      setTransactions(Array.isArray(items) ? items : []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    }
  }, [user, page, statusFilter, typeFilter]);

  const handleExport = () => {
    if (transactions.length === 0) {
      toast.error("No transactions to export");
      return;
    }

    const headers = ["ID", "External ID", "Type", "Amount", "Currency", "Status", "Created At"];
    const rows = transactions.map(t => [
      t.id, t.external_id, t.transaction_type, t.amount, t.currency, t.status, t.created_at
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `paybot_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Ledger exported to CSV");
  };

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
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground">Transaction Ledger</h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Regional Node: Southeast Asia (Mainnet)</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-14 px-8 rounded-2xl border-border/60 font-black text-[11px] uppercase tracking-widest hover:bg-muted transition-all shadow-sm"
            >
              <Download className="h-5 w-5 mr-3" />
              EXPORT_CSV
            </Button>
            <Link to="/payments">
              <Button size="sm" className="h-14 px-8 rounded-2xl bg-brandblue-600 hover:bg-brandblue-700 font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-brandblue-500/20 transition-all active:scale-95">
                <Plus className="h-5 w-5 mr-3" />
                NEW_REQUISITION
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Toolbar */}
        <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
          <CardContent className="p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
              <div className="lg:col-span-2 space-y-3 relative group">
                <Label htmlFor="transactions-search" className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 ml-1">Universal Search</Label>
                <div className="relative">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-brandblue-500 transition-colors" />
                   <Input
                     id="transactions-search"
                     placeholder="Reference, Entity, Metadata..."
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-14 h-16 bg-muted/20 border-border/40 rounded-2xl font-black uppercase text-sm focus:ring-brandblue-500/10 border-2 transition-all shadow-sm"
                   />
                </div>
              </div>

              <div className="space-y-3">
                 <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 ml-1">Channel</Label>
                 <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                   <SelectTrigger className="h-16 bg-muted/20 border-border/40 rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 border-2">
                     <div className="flex items-center gap-3">
                       <Filter className="h-4 w-4 text-muted-foreground/60" />
                       <SelectValue placeholder="All Channels" />
                     </div>
                   </SelectTrigger>
                   <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2">
                     <SelectItem value="all" className="py-3 font-black rounded-xl mb-1">ALL_CHANNELS</SelectItem>
                     <SelectItem value="invoice" className="py-3 font-black rounded-xl mb-1">INVOICE</SelectItem>
                     <SelectItem value="qr_code" className="py-3 font-black rounded-xl mb-1">QR_CODE</SelectItem>
                     <SelectItem value="payment_link" className="py-3 font-black rounded-xl mb-1">UNIVERSAL_LINK</SelectItem>
                     <SelectItem value="ewallet" className="py-3 font-black rounded-xl mb-1">E_WALLET</SelectItem>
                   </SelectContent>
                 </Select>
              </div>

              <div className="space-y-3">
                 <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 ml-1">Node State</Label>
                 <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                   <SelectTrigger className="h-16 bg-muted/20 border-border/40 rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 border-2">
                     <div className="flex items-center gap-3">
                       <Zap className="h-4 w-4 text-muted-foreground/60" />
                       <SelectValue placeholder="All Status" />
                     </div>
                   </SelectTrigger>
                   <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2">
                     <SelectItem value="all" className="py-3 font-black rounded-xl mb-1">ALL_STATUS</SelectItem>
                     <SelectItem value="paid" className="py-3 font-black rounded-xl mb-1 text-emerald-500">PAID_SETTLED</SelectItem>
                     <SelectItem value="pending" className="py-3 font-black rounded-xl mb-1 text-amber-500">PENDING_CLEARANCE</SelectItem>
                     <SelectItem value="expired" className="py-3 font-black rounded-xl mb-1 text-rose-500">EXPIRED_LOST</SelectItem>
                   </SelectContent>
                 </Select>
              </div>

              <Button
                variant="ghost"
                onClick={() => { setSearchTerm(''); setTypeFilter('all'); setStatusFilter('all'); }}
                className="h-16 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-muted/40 text-muted-foreground/60 hover:text-foreground border border-transparent hover:border-border/20 transition-all mb-[0.1rem]"
              >
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card className="fintech-card border-0 shadow-2xl overflow-hidden">
          <CardContent className="p-0 bg-card">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-48 space-y-6">
                <Loader2 className="h-12 w-12 animate-spin text-brandblue-500 opacity-20" />
                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 animate-pulse">Synchronizing Ledger Protocol...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-48 px-10">
                <div className="h-28 w-28 rounded-[2.5rem] bg-muted/20 flex items-center justify-center mx-auto mb-10 shadow-inner border border-border/10">
                  <Receipt className="h-14 w-14 text-muted-foreground/10" />
                </div>
                <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Zero Record Set</h3>
                <p className="text-[10px] text-muted-foreground/40 mt-4 font-black uppercase tracking-[0.3em]">Adjust transmission parameters or filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="modern-table">
                  <thead>
                    <tr className="bg-[#0A0F1E]">
                      <th className="px-10 py-8 text-white/30 border-white/5">Protocol / Node</th>
                      <th className="text-white/30 border-white/5">Ledger Reference</th>
                      <th className="text-white/30 border-white/5">Transmission Identity</th>
                      <th className="text-right text-white/30 border-white/5">Asset Value</th>
                      <th className="text-center text-white/30 border-white/5">Network State</th>
                      <th className="text-right px-10 text-white/30 border-white/5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {Array.isArray(transactions) && transactions.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const tc = typeIcons[txn.transaction_type] || { icon: <FileText className="h-5 w-5" />, bg: 'bg-muted' };
                      const isUpdated = updatedTxnIds.has(txn.id);

                      return (
                        <tr
                          key={txn.id}
                          className={`transition-all duration-700 group hover:bg-muted/10 ${isUpdated ? 'bg-brandblue-500/5 ring-1 ring-brandblue-500/20' : ''}`}
                        >
                          <td className="px-10 py-10">
                            <div className="flex items-center gap-6">
                              <div className={`h-16 w-16 rounded-[1.5rem] ${tc.bg} flex items-center justify-center shrink-0 border border-black/5 shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                                {tc.icon}
                              </div>
                              <div className="min-w-0 space-y-2">
                                <p className="font-black text-foreground uppercase tracking-tight text-sm truncate max-w-[240px]">
                                  {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  {new Date(txn.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-10">
                            <div className="flex items-center gap-3">
                               <code className="text-[10px] font-black text-brandblue-600 bg-brandblue-500/5 px-3 py-1.5 rounded-lg border border-brandblue-500/10 uppercase tracking-tighter shadow-sm">
                                 {txn.external_id || `#${txn.id}`}
                               </code>
                               <button onClick={() => copyToClipboard(txn.external_id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-brandblue-500"><Copy className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                          <td className="py-10">
                            {txn.customer_name ? (
                              <div className="min-w-0 space-y-1">
                                <p className="text-[11px] font-black text-foreground/80 truncate uppercase tracking-tight">{txn.customer_name}</p>
                                <p className="text-[9px] font-bold text-muted-foreground/40 truncate uppercase tracking-widest">{txn.customer_email || 'NODESTINATION'}</p>
                              </div>
                            ) : <div className="fintech-badge bg-muted/20 text-muted-foreground/40 border-0 inline-block px-3">GUEST_USER</div>}
                          </td>
                          <td className="text-right py-10">
                            <span className="text-xl font-black text-foreground tracking-tighter tabular-nums group-hover:text-brandblue-600 transition-colors">
                              ₱{fmt(txn.amount)}
                            </span>
                          </td>
                          <td className="py-10">
                            <div className="flex justify-center">
                               <div className={`${sc.bg} ${sc.color} inline-flex items-center gap-2 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm group-hover:scale-105 transition-transform duration-500`}>
                                 <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} animate-pulse`} />
                                 {txn.status}
                               </div>
                            </div>
                          </td>
                          <td className="text-right px-10 py-10">
                            <div className="flex items-center justify-end gap-2">
                              {txn.payment_url && (
                                <a href={txn.payment_url} target="_blank" rel="noopener noreferrer" className="h-12 w-12 rounded-2xl bg-white/5 border border-border/40 flex items-center justify-center text-muted-foreground/60 hover:text-brandblue-600 hover:bg-brandblue-50 hover:border-brandblue-500/20 transition-all active:scale-90 shadow-sm">
                                  <ExternalLink className="h-5 w-5" />
                                </a>
                              )}
                              <button
                                onClick={() => cloneTransaction(txn)}
                                className="h-12 w-12 rounded-2xl bg-white/5 border border-border/40 flex items-center justify-center text-muted-foreground/60 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500/20 transition-all active:scale-90 shadow-sm"
                                title="Repeat Node Transmission"
                              >
                                <CopyPlus className="h-5 w-5" />
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
              <div className="px-10 py-10 border-t border-border/10 bg-muted/5 flex flex-col sm:flex-row items-center justify-between gap-8">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
                  Transmitting sequence <span className="text-foreground/60">{page * limit + 1}–{Math.min((page + 1) * limit, total)}</span> / <span className="text-foreground/60">{total}</span> assets
                </p>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-14 w-14 p-0 rounded-[1.5rem] border-border/40 transition-all hover:bg-brandblue-50 hover:text-brandblue-600 shadow-sm"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="px-8 h-14 flex items-center justify-center bg-brandblue-600 rounded-[1.5rem] shadow-2xl shadow-brandblue-500/30">
                    <span className="text-sm font-black text-white tabular-nums tracking-widest">
                      {page + 1}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages - 1}
                    onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-14 w-14 p-0 rounded-[1.5rem] border-border/40 transition-all hover:bg-brandblue-50 hover:text-brandblue-600 shadow-sm"
                  >
                    <ChevronRight className="h-5 w-5" />
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
