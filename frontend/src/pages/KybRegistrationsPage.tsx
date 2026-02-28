import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { CheckCircle, XCircle, Clock, RefreshCw, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';

interface KybRegistration {
  id: number;
  chat_id: string;
  telegram_username: string | null;
  step: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  bank_name: string | null;
  id_photo_file_id: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending_review: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/25', icon: <Clock className="h-3.5 w-3.5" /> },
  in_progress:    { color: 'bg-blue-500/15 text-blue-400 border-blue-500/25',    icon: <Clock className="h-3.5 w-3.5" /> },
  approved:       { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected:       { color: 'bg-red-500/15 text-red-400 border-red-500/25',       icon: <XCircle className="h-3.5 w-3.5" /> },
};

const fmt_time = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

export default function KybRegistrationsPage() {
  const [registrations, setRegistrations] = useState<KybRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending_review');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = filter ? `/api/v1/kyb?status=${filter}` : '/api/v1/kyb';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setRegistrations(d.items || []);
      } else {
        setError('Failed to load KYB registrations. Please try again.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error while loading KYB registrations.');
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  const doAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id);
    setError('');
    try {
      const body = action === 'approve'
        ? { note: '' }
        : { reason: rejectReason || 'Rejected by admin.' };
      const res = await fetch(`/api/v1/kyb/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRejectReason('');
        setActiveId(null);
        setRejectMode(false);
        fetchRegistrations();
      } else {
        const d = await res.json();
        setError(d.detail || `Failed to ${action}`);
      }
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const pending_count = registrations.filter(r => r.status === 'pending_review').length;
  const filters = [
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'in_progress', label: 'In Progress' },
    { value: '', label: 'All' },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              KYB Registrations
              {pending_count > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending_count}</span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Review and manage KYB applications</p>
          </div>
          <button
            onClick={fetchRegistrations}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f.value
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-slate-800/60 border border-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : registrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-white font-semibold text-sm">No registrations found</p>
            <p className="text-slate-500 text-xs mt-1">
              {filter ? `No registrations with status "${filters.find(f => f.value === filter)?.label ?? filter}"` : 'No KYB registrations yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {registrations.map(reg => {
              const cfg = statusConfig[reg.status] ?? { color: 'bg-slate-700/50 text-slate-400 border-slate-600/50', icon: null };
              const isActive = activeId === reg.id;
              const isExpanded = expandedId === reg.id;

              return (
                <div key={reg.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                        {cfg.icon}
                        {reg.status.replace('_', ' ')}
                      </span>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {reg.full_name || `@${reg.telegram_username}` || reg.chat_id}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {reg.telegram_username ? `@${reg.telegram_username} · ` : ''}
                          {fmt_time(reg.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : reg.id)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:border-slate-400 transition-colors"
                      >
                        Details {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {reg.status === 'pending_review' && (
                        <button
                          onClick={() => { setActiveId(isActive ? null : reg.id); setRejectMode(false); setRejectReason(''); setError(''); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors"
                        >
                          {isActive ? 'Cancel' : 'Review'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* KYB Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-700/40 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Full Name</p>
                          <p className="text-white">{reg.full_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Phone</p>
                          <p className="text-white">{reg.phone || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Address</p>
                          <p className="text-white">{reg.address || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Bank Name</p>
                          <p className="text-white">{reg.bank_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Telegram Chat ID</p>
                          <p className="text-white font-mono text-xs">{reg.chat_id}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">ID Photo</p>
                          <p className={`text-xs font-medium ${reg.id_photo_file_id ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {reg.id_photo_file_id ? '📎 Uploaded' : '⚠️ Not uploaded'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action panel */}
                  {isActive && reg.status === 'pending_review' && (
                    <div className="px-4 pb-4 border-t border-slate-700/40 pt-3">
                      {rejectMode ? (
                        <>
                          <p className="text-slate-400 text-xs mb-2">Rejection reason:</p>
                          <input
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. Invalid ID photo, incomplete information"
                            className="w-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 mb-3"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setRejectMode(false)}
                              className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 hover:border-slate-400 text-sm transition-colors"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => doAction(reg.id, 'reject')}
                              disabled={actionLoading === reg.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                            >
                              {actionLoading === reg.id ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
                              Confirm Reject
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => doAction(reg.id, 'approve')}
                            disabled={actionLoading === reg.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                          >
                            {actionLoading === reg.id ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Approve & Grant Access
                          </button>
                          <button
                            onClick={() => setRejectMode(true)}
                            disabled={actionLoading === reg.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </div>
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
