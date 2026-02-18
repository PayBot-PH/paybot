import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';
import { toast } from 'sonner';

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
  cancelled: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: <XCircle className="h-3 w-3" /> },
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

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-[#0F172A]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Link to="/" className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">PayBot</span>
              </Link>
              {/* Real-time connection indicator */}
              <div className="flex items-center space-x-1 ml-2">
                {connected ? (
                  <div className="flex items-center space-x-1 text-emerald-400">
                    <Wifi className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-slate-500">
                    <WifiOff className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">Offline</span>
                  </div>
                )}
              </div>
            </div>
            <nav className="flex items-center space-x-1">
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link to="/transactions">
                <Button variant="ghost" size="sm" className="text-white bg-slate-700/50">
                  <FileText className="h-4 w-4 mr-2" />
                  Transactions
                </Button>
              </Link>
              <Link to="/create-payment">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </Link>
              <Link to="/bot-settings">
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <Bot className="h-4 w-4 mr-2" />
                  Bot
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <Link to="/create-payment">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Payment
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="bg-[#1E293B] border-slate-700/50 mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by ID, description, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white">All Status</SelectItem>
                  <SelectItem value="paid" className="text-emerald-400">Paid</SelectItem>
                  <SelectItem value="pending" className="text-amber-400">Pending</SelectItem>
                  <SelectItem value="expired" className="text-red-400">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[160px] bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white">All Types</SelectItem>
                  <SelectItem value="invoice" className="text-blue-400">Invoice</SelectItem>
                  <SelectItem value="qr_code" className="text-purple-400">QR Code</SelectItem>
                  <SelectItem value="payment_link" className="text-cyan-400">Payment Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transaction List */}
        <Card className="bg-[#1E293B] border-slate-700/50">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : filteredTxns.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No transactions found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">ID</th>
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Description</th>
                      <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Customer</th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Amount</th>
                      <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Status</th>
                      <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn) => {
                      const sc = statusConfig[txn.status] || statusConfig.pending;
                      const isUpdated = updatedTxnIds.has(txn.id);
                      return (
                        <tr
                          key={txn.id}
                          className={`border-b border-slate-700/30 transition-all duration-500 ${
                            isUpdated
                              ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30'
                              : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              {typeIcons[txn.transaction_type] || <FileText className="h-4 w-4 text-slate-400" />}
                              <span className="text-sm text-slate-300">{typeLabels[txn.transaction_type] || txn.transaction_type}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-1">
                              <code className="text-xs text-slate-400 font-mono">{txn.external_id || `#${txn.id}`}</code>
                              {txn.external_id && (
                                <button onClick={() => copyToClipboard(txn.external_id)} className="text-slate-500 hover:text-slate-300">
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-white">{txn.description || '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <span className="text-sm text-white">{txn.customer_name || '-'}</span>
                              {txn.customer_email && (
                                <p className="text-xs text-slate-500">{txn.customer_email}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-mono font-medium text-white">
                              ₱{txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge
                              className={`${sc.color} border text-xs transition-all duration-500 ${
                                isUpdated ? 'animate-pulse ring-2 ring-current scale-110' : ''
                              }`}
                            >
                              {sc.icon}
                              <span className="ml-1">{txn.status}</span>
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              {txn.payment_url && (
                                <a href={txn.payment_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-8 w-8 p-0">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              )}
                              {txn.payment_url && (
                                <button onClick={() => copyToClipboard(txn.payment_url)} className="text-slate-500 hover:text-slate-300 p-1">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              )}
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
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50">
                <p className="text-sm text-slate-400">
                  Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-400">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="text-slate-400 hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}