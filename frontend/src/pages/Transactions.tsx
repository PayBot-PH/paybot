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
  Bot,
  BarChart3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  CopyPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

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

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  paid: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="h-3 w-3" /> },
  pending: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  expired: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { color: 'bg-slate-500/20 text-muted-foreground border-slate-500/30', icon: <XCircle className="h-3 w-3" /> },
};

const typeIcons: Record<string, React.ReactNode> = {
  invoice: <FileText className="h-4 w-4 text-blue-400" />,
  qr_code: <QrCode className="h-4 w-4 text-purple-400" />,
  payment_link: <LinkIcon className="h-4 w-4 text-cyan-400" />,
};

const typeLabels: Record<string, string> = {
  invoice: 'Invoice',
  qr_code: 'QR Code',
  payment_link: 'Payment Link',
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

  // Real-time payment events
  const { connected } = usePaymentEvents({
    enabled: !!user,
    onStatusChange: useCallback((event) => {
      // Refresh the transaction list
      fetchTransactions();
      // Highlight the updated row
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
    }, [fetchTransactions]),
    pollInterval: 5000,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchTransactions();
      setLoading(false);
    };
    load();
  }, [fetchTransactions]);

  const filteredTxns = searchTerm
    ? transactions.filter(
        (t) =>
          t.external_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : transactions;

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
    navigate(`/create-payment?${params.toString()}`);
  };

  return (
    <Layout connected={connected}>
      <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <Link to="/create-payment">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Payment
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="bg-card border-border mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, description, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-[140px] bg-muted border-border text-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="all" className="text-foreground">All Status</SelectItem>
                  <SelectItem value="paid" className="text-emerald-400">Paid</SelectItem>
                  <SelectItem value="pending" className="text-amber-400">Pending</SelectItem>
                  <SelectItem value="expired" className="text-red-400">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-[160px] bg-muted border-border text-foreground">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="all" className="text-foreground">All Types</SelectItem>
                  <SelectItem value="invoice" className="text-blue-400">Invoice</SelectItem>
                  <SelectItem value="qr_code" className="text-purple-400">QR Code</SelectItem>
                  <SelectItem value="payment_link" className="text-cyan-400">Payment Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transaction List */}
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredTxns.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3">ID</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3 hidden md:table-cell">Description</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3 hidden md:table-cell">Customer</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3">Amount</th>
                      <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3">Status</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-4 py-3 hidden lg:table-cell">Date</th>
                      <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 md:px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const isUpdated = updatedTxnIds.has(txn.id);
                      return (
                        <tr
                          key={txn.id}
                          className={`border-b border-border/30 transition-all duration-500 ${
                            isUpdated
                              ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <div className="flex items-center space-x-2">
                              {typeIcons[txn.transaction_type] || <FileText className="h-4 w-4 text-muted-foreground" />}
                              <span className="text-sm text-muted-foreground">{typeLabels[txn.transaction_type] || txn.transaction_type}</span>
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <div className="flex items-center space-x-1">
                              <code className="text-xs text-muted-foreground font-mono">{txn.external_id || `#${txn.id}`}</code>
                              {txn.external_id && (
                                <button onClick={() => copyToClipboard(txn.external_id)} className="text-muted-foreground hover:text-foreground">
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 hidden md:table-cell">
                            <span className="text-sm text-foreground">{txn.description || '-'}</span>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 hidden md:table-cell">
                            <div>
                              <span className="text-sm text-foreground">{txn.customer_name || '-'}</span>
                              {txn.customer_email && (
                                <p className="text-xs text-muted-foreground">{txn.customer_email}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                            <span className="text-sm font-mono font-medium text-foreground">
                              ₱{txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                            <Badge
                              className={`${sc.color} border text-xs transition-all duration-500 ${
                                isUpdated ? 'animate-pulse ring-2 ring-current scale-110' : ''
                              }`}
                            >
                              {sc.icon}
                              <span className="ml-1">{txn.status}</span>
                            </Badge>
                          </td>
                          <td className="px-3 md:px-4 py-3 md:py-4 hidden lg:table-cell">
                            <div className="text-xs text-muted-foreground">
                              {new Date(txn.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(txn.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              {txn.payment_url && (
                                <a href={txn.payment_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-8 w-8 p-0">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              )}
                              {txn.payment_url && (
                                <button onClick={() => copyToClipboard(txn.payment_url)} className="text-muted-foreground hover:text-foreground p-1">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => cloneTransaction(txn)}
                                title="Clone transaction"
                                className="text-muted-foreground hover:text-foreground p-1"
                              >
                                <CopyPlus className="h-3.5 w-3.5" />
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
    </Layout>
  );
}
