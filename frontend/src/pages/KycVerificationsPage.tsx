import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { CheckCircle, XCircle, Clock, RefreshCw, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface KycVerification {
  id: number;
  chat_id: string;
  telegram_username: string | null;
  step: string;
  full_name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  id_photo_file_id: string | null;
  selfie_file_id: string | null;
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

export default function KycVerificationsPage() {
  const [verifications, setVerifications] = useState<KycVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending_review');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchVerifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = filter ? `/api/v1/kyc?status=${filter}` : '/api/v1/kyc';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setVerifications(d.items || []);
      } else {
        setError('Failed to load KYC verifications. Please try again.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error while loading KYC verifications.');
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchVerifications();
    const id = setInterval(fetchVerifications, 30000);
    return () => clearInterval(id);
  }, [fetchVerifications]);

  const doAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id);
    setError('');
    try {
      const body = action === 'approve'
        ? { note: '' }
        : { reason: rejectReason || 'Rejected by admin.' };
      const res = await fetch(`/api/v1/kyc/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRejectReason('');
        setActiveId(null);
        setRejectMode(false);
        fetchVerifications();
      } else {
        const d = await res.json();
        setError(d.detail || `Failed to ${action}`);
      }
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const pending_count = verifications.filter(v => v.status === 'pending_review').length;
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
              KYC Verifications
              {pending_count > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending_count}</span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Review and approve Know Your Customer identity verification submissions</p>
          </div>
          <button
            onClick={fetchVerifications}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm border border-border px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="overflow-x-auto [overflow-scrolling:touch]">
          <div className="flex gap-2 min-w-max">
            {filters.map(({ value, label }) => (
              <button
                key={value || 'all'}
                onClick={() => setFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {label}
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
              <div key={i} className="bg-[#0F172A] border border-border/40 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-700/50" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 bg-slate-700/50 rounded" />
                    <div className="h-3 w-56 bg-slate-700/30 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : verifications.length === 0 ? (
          <div className="bg-[#0F172A] border border-border/40 rounded-2xl p-12 flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
              <UserCheck className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">
              No {(filters.find(f => f.value === filter)?.label ?? filter).toLowerCase()} verifications
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {verifications.map(kyc => {
              const sc = statusConfig[kyc.status] || statusConfig.pending_review;
              const isActive = activeId === kyc.id;
              const isExpanded = expandedId === kyc.id;

              return (
                <div key={kyc.id} className="bg-[#0F172A] border border-border/40 rounded-2xl overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <UserCheck className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">
                          {kyc.full_name || (kyc.telegram_username ? `@${kyc.telegram_username}` : kyc.chat_id)}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${sc.color}`}>
                          {sc.icon} {kyc.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-0.5">
                        {kyc.telegram_username ? `@${kyc.telegram_username}` : `ID: ${kyc.chat_id}`}
                        {' · '}Verification #{kyc.id}
                        {' · '}{fmt_time(kyc.created_at)}
                      </p>
                      {kyc.rejection_reason && (
                        <p className="text-red-400 text-xs mt-1">Rejection reason: {kyc.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : kyc.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border text-slate-300 hover:border-slate-400 transition-colors flex items-center gap-1"
                      >
                        Details {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {kyc.status === 'pending_review' && (
                        <button
                          onClick={() => { setActiveId(isActive ? null : kyc.id); setRejectMode(false); setRejectReason(''); setError(''); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border text-slate-300 hover:border-slate-400 transition-colors"
                        >
                          {isActive ? 'Cancel' : 'Review'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* KYC Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/40 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Full Name</p>
                          <p className="text-white">{kyc.full_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Date of Birth</p>
                          <p className="text-white">{kyc.date_of_birth || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Nationality</p>
                          <p className="text-white">{kyc.nationality || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">ID Type</p>
                          <p className="text-white capitalize">{kyc.id_type ? kyc.id_type.replace('_', ' ') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">ID Number</p>
                          <p className="text-white font-mono text-xs">{kyc.id_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Telegram Chat ID</p>
                          <p className="text-white font-mono text-xs">{kyc.chat_id}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">ID Photo</p>
                          <p className={`text-xs font-medium ${kyc.id_photo_file_id ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {kyc.id_photo_file_id ? '📎 Uploaded' : '⚠️ Not uploaded'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">Selfie</p>
                          <p className={`text-xs font-medium ${kyc.selfie_file_id ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {kyc.selfie_file_id ? '📎 Uploaded' : '⚠️ Not uploaded'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action panel */}
                  {isActive && kyc.status === 'pending_review' && (
                    <div className="px-4 pb-4 border-t border-border/40 pt-3">
                      {rejectMode ? (
                        <>
                          <p className="text-slate-400 text-xs mb-2">Rejection reason:</p>
                          <input
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. Invalid ID photo, blurry selfie, mismatched information"
                            className="w-full bg-muted/60 border border-border/40 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 mb-3"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setRejectMode(false)}
                              className="flex-1 py-2 rounded-xl border border-border text-slate-300 hover:border-slate-400 text-sm transition-colors"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => doAction(kyc.id, 'reject')}
                              disabled={actionLoading === kyc.id}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                            >
                              {actionLoading === kyc.id ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
                              Confirm Reject
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => doAction(kyc.id, 'approve')}
                            disabled={actionLoading === kyc.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                          >
                            {actionLoading === kyc.id ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Approve & Verify Identity
                          </button>
                          <button
                            onClick={() => setRejectMode(true)}
                            disabled={actionLoading === kyc.id}
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
