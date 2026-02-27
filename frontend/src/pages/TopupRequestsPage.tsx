import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { CheckCircle, XCircle, Clock, Eye, RefreshCw, DollarSign } from 'lucide-react';

interface TopupRequest {
  id: number;
  chat_id: string;
  telegram_username: string | null;
  amount_usdt: number;
  receipt_file_id: string | null;
  status: string;
  note: string | null;
  approved_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const statusConfig: Record<string, { color: string; dot: string; icon: React.ReactNode }> = {
  pending:  { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',   dot: 'bg-amber-400',  icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { color: 'bg-red-500/15 text-red-400 border-red-500/25',         dot: 'bg-red-400',    icon: <XCircle className="h-3.5 w-3.5" /> },
};

const fmt_time = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

export default function TopupRequestsPage() {
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/v1/topup?status=${filter}` : '/api/v1/topup';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setRequests(d.items || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [filter]);

  const doAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id); setError('');
    try {
      const res = await fetch(`/api/v1/topup/${id}/${action}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || (action === 'approve' ? 'Approved' : 'Rejected by admin') }),
      });
      if (res.ok) {
        setNote(''); setActiveId(null);
        fetchRequests();
      } else {
        const d = await res.json();
        setError(d.detail || `Failed to ${action}`);
      }
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const pending_count = requests.filter(r => r.status === 'pending').length;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Topup Requests
              {pending_count > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending_count}</span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Review and approve USDT TRC20 wallet topups</p>
          </div>
          <button onClick={fetchRequests}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="overflow-x-auto [overflow-scrolling:touch]">
          <div className="flex gap-2 min-w-max">
          {['pending', 'approved', 'rejected', ''].map((s) => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-700/50" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-slate-700/50 rounded" />
                    <div className="h-3 w-48 bg-slate-700/30 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-12 flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
              <DollarSign className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">No {filter} requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const sc = statusConfig[req.status] || statusConfig.pending;
              const isActive = activeId === req.id;
              return (
                <div key={req.id} className="bg-[#0F172A] border border-slate-700/40 rounded-2xl overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <DollarSign className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">
                          {req.telegram_username ? `@${req.telegram_username}` : req.chat_id}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${sc.color}`}>
                          {sc.icon} {req.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-0.5">
                        <span className="text-emerald-400 font-bold">${req.amount_usdt.toFixed(2)} USDT</span>
                        {' · '}Request #{req.id}
                        {' · '}{fmt_time(req.created_at)}
                      </p>
                      {req.note && <p className="text-slate-500 text-xs mt-1">Note: {req.note}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs ${req.receipt_file_id ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {req.receipt_file_id ? '📎 Receipt uploaded' : '⚠️ No receipt yet'}
                        </span>
                        {req.receipt_file_id && (
                          <a href={`https://api.telegram.org/file/bot/PLACEHOLDER/${req.receipt_file_id}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition-colors">
                            <Eye className="h-3 w-3" /> View
                          </a>
                        )}
                      </div>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setActiveId(isActive ? null : req.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors">
                          {isActive ? 'Cancel' : 'Review'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action panel */}
                  {isActive && req.status === 'pending' && (
                    <div className="px-4 pb-4 border-t border-slate-700/40 pt-3">
                      <p className="text-slate-400 text-xs mb-2">Add a note (optional):</p>
                      <input
                        value={note} onChange={e => setNote(e.target.value)}
                        placeholder="e.g. Receipt verified, transaction confirmed"
                        className="w-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 mb-3"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => doAction(req.id, 'approve')}
                          disabled={actionLoading === req.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
                          {actionLoading === req.id ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          Approve & Credit Wallet
                        </button>
                        <button onClick={() => doAction(req.id, 'reject')}
                          disabled={actionLoading === req.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
                          <XCircle className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
