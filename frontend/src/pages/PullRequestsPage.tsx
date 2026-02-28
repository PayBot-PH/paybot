import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import {
  GitPullRequest,
  GitMerge,
  GitPullRequestClosed,
  RefreshCw,
  ExternalLink,
  Tag,
  Circle,
} from 'lucide-react';

interface PRUser {
  login: string;
  avatar_url: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  draft: boolean;
  merged: boolean;
  action: string;
  user: PRUser;
  labels: string[];
  head_ref: string;
  base_ref: string;
  created_at: string | null;
  updated_at: string | null;
  merged_at: string | null;
  closed_at: string | null;
  body: string;
  ingested_at: number;
}

const fmt_time = (s: string | null) =>
  s ? new Date(s).toLocaleString() : '—';

function PRStateIcon({ pr }: { pr: PullRequest }) {
  if (pr.merged) {
    return <GitMerge className="h-4 w-4 text-purple-400" />;
  }
  if (pr.state === 'closed') {
    return <GitPullRequestClosed className="h-4 w-4 text-red-400" />;
  }
  return (
    <GitPullRequest
      className={`h-4 w-4 ${pr.draft ? 'text-slate-400' : 'text-emerald-400'}`}
    />
  );
}

function prStateBadge(pr: PullRequest): { label: string; color: string } {
  if (pr.merged) {
    return { label: 'merged', color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' };
  }
  if (pr.state === 'closed') {
    return { label: 'closed', color: 'bg-red-500/15 text-red-400 border-red-500/25' };
  }
  if (pr.draft) {
    return { label: 'draft', color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' };
  }
  return { label: 'open', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
}

export default function PullRequestsPage() {
  const { user } = useAuth();
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [error, setError] = useState('');

  const fetchPRs = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const res = await fetch('/api/v1/github/pull-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPrs(data.items || []);
        setLastUpdated(data.last_updated || 0);
      } else if (res.status === 401 || res.status === 403) {
        setError('Unauthorized — please log in again.');
      } else {
        setError('Failed to load pull requests.');
      }
    } catch (e) {
      console.error('PR fetch error:', e);
      setError('Network error loading pull requests.');
    }
  }, [user]);

  // Initial load + periodic polling (every 30 s)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchPRs();
      setLoading(false);
    };
    load();
    const id = setInterval(fetchPRs, 30000);
    return () => clearInterval(id);
  }, [fetchPRs]);

  // Real-time push: re-fetch immediately when a PR update event arrives
  const { connected } = usePaymentEvents({
    enabled: !!user,
    onPrUpdate: useCallback(() => {
      fetchPRs();
    }, [fetchPRs]),
  });

  const openCount = prs.filter((p) => p.state === 'open' && !p.merged).length;

  return (
    <Layout connected={connected}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Pull Requests
              {openCount > 0 && (
                <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {openCount}
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              GitHub PRs — updated via webhook in real time
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchPRs().finally(() => setLoading(false)); }}
            disabled={loading}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm border border-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {lastUpdated > 0 && (
          <p className="text-slate-600 text-xs">
            Last synced:{' '}
            {new Date(lastUpdated * 1000).toLocaleString()}
          </p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-700/50" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-slate-700/50 rounded" />
                    <div className="h-3 w-1/2 bg-slate-700/30 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : prs.length === 0 ? (
          <div className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-12 flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-3">
              <GitPullRequest className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium">No pull requests tracked yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Configure the GitHub webhook to start receiving PR events.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {prs.map((pr) => {
              const badge = prStateBadge(pr);
              return (
                <div
                  key={pr.number}
                  className="bg-[#0F172A] border border-slate-700/40 rounded-2xl p-4"
                >
                  <div className="flex items-start gap-4">
                    {/* State icon */}
                    <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700/40 flex items-center justify-center shrink-0">
                      <PRStateIcon pr={pr} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={pr.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white font-semibold hover:text-blue-400 transition-colors flex items-center gap-1"
                        >
                          {pr.title}
                          <ExternalLink className="h-3 w-3 text-slate-500" />
                        </a>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${badge.color}`}
                        >
                          <Circle className="h-1.5 w-1.5 fill-current" />
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-slate-400 text-sm mt-0.5">
                        <span className="font-mono text-slate-500">#{pr.number}</span>
                        {' · '}
                        <span className="text-blue-400">{pr.user.login}</span>
                        {' · '}
                        <span className="font-mono text-slate-500">
                          {pr.head_ref}
                        </span>
                        {' → '}
                        <span className="font-mono text-slate-500">
                          {pr.base_ref}
                        </span>
                      </p>

                      {/* Labels */}
                      {pr.labels.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <Tag className="h-3 w-3 text-slate-500" />
                          {pr.labels.map((lbl) => (
                            <span
                              key={lbl}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Timestamps */}
                      <p className="text-slate-600 text-xs mt-1.5">
                        Created: {fmt_time(pr.created_at)}
                        {pr.merged_at && (
                          <span className="ml-3 text-purple-500">
                            Merged: {fmt_time(pr.merged_at)}
                          </span>
                        )}
                        {!pr.merged && pr.closed_at && (
                          <span className="ml-3 text-red-500">
                            Closed: {fmt_time(pr.closed_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
