import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { CheckCircle, XCircle, Clock, RefreshCw, Send, ShieldAlert } from 'lucide-react';

interface UsdtSendRequest {
  id: number;
  user_id: string;
  to_address: string;
  amount: number;
  note: string | null;
  status: string;
  denial_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending:  { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',       icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  denied:   { color: 'bg-red-500/15 text-red-400 border-red-500/25',             icon: <XCircle className="h-3.5 w-3.5" /> },
};

const fmt_time = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

export default function UsdtSendRequestsPage() {
  const [requests, setRequests] = useState<UsdtSendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [denialReason, setDenialReason] = useState('');
  const [denyMode, setDenyMode] = useState(false);
  const [error, setError] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/wallet/usdt-send-requests', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        const items: UsdtSendRequest[] = d.items || [];
        setRequests(filter ? items.filter(r => r.status === filter) : items);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, 30000);
    return () => clearInterval(id);
  }, [fetchRequests]);

  const openReview = (id: number, deny: boolean) => {
    setActiveId(id);
    setDenyMode(deny);
    setDenialReason('');
    setError('');
  };

  const cancelReview = () => {
    setActiveId(null);
    setDenyMode(false);
    setDenialReason('');
    setError('');
  };

  const doApprove = async (id: number) => {
    setActionLoading(id); setError('');
    try {
      const res = await fetch(`/api/v1/wallet/usdt-send-requests/${id}/approve`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        cancelReview();
        fetchRequests();
      } else {
        const d = await res.json();
        setError(d.detail || 'Failed to approve');
      }
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const doDeny = async (id: number) => {
    if (!denialReason.trim()) { setError('Denial reason is required.'); return; }
    setActionLoading(id); setError('');
    try {
      const res = await fetch(`/api/v1/wallet/usdt-send-requests/${id}/deny`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: denialReason.trim() }),
      });
      if (res.ok) {
        cancelReview();
        fetchRequests();
      } else {
        const d = await res.json();
        setError(d.detail || 'Failed to deny');
      }
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
              <Send className="h-5 w-5 text-teal-400 shrink-0" />
              <span>USDT Send Requests</span>
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Approve or deny USDT TRC20 outgoing transfer requests</p>
          </div>
          <button onClick={fetchRequests}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm border border-slate-700 px-3 py-1.5 rounded-lg transition-colors shrink-0">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="overflow-x-auto [overflow-scrolling:touch]">
          <div className="flex gap-2 min-w-max">
          {['pending', 'approved', 'denied', ''].map((s) => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</p>
        )}

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
              <Send className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">No {filter || ''} send requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const sc = statusConfig[req.status] || statusConfig.pending;
              const isActive = activeId === req.id;
              const shortAddr = `${req.to_address.slice(0, 10)}...${req.to_address.slice(-6)}`;
              return (
                <div key={req.id} className="bg-[#0F172A] border border-slate-700/40 rounded-2xl overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                      <Send className="h-5 w-5 text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold font-mono text-sm">{shortAddr}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${sc.color}`}>
                          {sc.icon} {req.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-0.5">
                        <span className="text-teal-400 font-bold">${req.amount.toFixed(2)} USDT</span>
                        {' · '}Request #{req.id}
                        {' · '}{fmt_time(req.created_at)}
                      </p>
                      <p className="text-slate-600 text-xs mt-0.5 font-mono break-all">{req.to_address}</p>
                      {req.note && <p className="text-slate-500 text-xs mt-1">Note: {req.note}</p>}
                      {req.status === 'denied' && req.denial_reason && (
                        <div className="flex items-start gap-1.5 mt-1.5">
                          <ShieldAlert className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-red-400 text-xs">Denial reason: {req.denial_reason}</p>
                        </div>
                      )}
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex flex-row items-center gap-2 shrink-0">
                        {!isActive ? (
                          <>
                            <button onClick={() => openReview(req.id, false)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors whitespace-nowrap">
                              Approve
                            </button>
                            <button onClick={() => openReview(req.id, true)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors whitespace-nowrap">
                              Deny
                            </button>
                          </>
                        ) : (
                          <button onClick={cancelReview}
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors">
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action panel */}
                  {isActive && req.status === 'pending' && (
                    <div className="px-4 pb-4 border-t border-slate-700/40 pt-3">
                      {denyMode ? (
                        <>
                          <p className="text-red-400 text-sm font-medium mb-2 flex items-center gap-1.5">
                            <ShieldAlert className="h-4 w-4" />
                            Denial reason <span className="text-red-500">*</span>
                          </p>
                          <textarea
                            value={denialReason}
                            onChange={e => setDenialReason(e.target.value)}
                            placeholder="Explain why this request is being denied (required)…"
                            rows={3}
                            className="w-full bg-slate-800/60 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60 mb-3 resize-none"
                          />
                          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
                          <div className="flex gap-2">
                            <button onClick={cancelReview}
                              className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 hover:border-slate-400 text-sm transition-colors">
                              Cancel
                            </button>
                            <button onClick={() => doDeny(req.id)}
                              disabled={actionLoading === req.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
                              {actionLoading === req.id
                                ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <XCircle className="h-4 w-4" />}
                              Confirm Deny
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-slate-400 text-sm mb-3">
                            Approve sending <span className="text-teal-400 font-bold">${req.amount.toFixed(2)} USDT</span> to{' '}
                            <span className="font-mono text-slate-300">{shortAddr}</span>? This will deduct from the user's USD wallet.
                          </p>
                          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
                          <div className="flex gap-2">
                            <button onClick={cancelReview}
                              className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 hover:border-slate-400 text-sm transition-colors">
                              Cancel
                            </button>
                            <button onClick={() => doApprove(req.id)}
                              disabled={actionLoading === req.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm">
                              {actionLoading === req.id
                                ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <CheckCircle className="h-4 w-4" />}
                              Approve & Deduct Wallet
                            </button>
                          </div>
                        </>
                      )}
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
