import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Crown,
  ShieldCheck,
  Tag,
  User,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RolePermissions {
  is_super_admin: boolean;
  can_manage_payments: boolean;
  can_manage_disbursements: boolean;
  can_view_reports: boolean;
  can_manage_wallet: boolean;
  can_manage_transactions: boolean;
  can_manage_bot: boolean;
  can_approve_topups: boolean;
}

interface RolePreset {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: RolePermissions;
}

interface AdminUser {
  id: number;
  telegram_id: string;
  telegram_username: string | null;
  name: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  can_manage_payments: boolean;
  can_manage_disbursements: boolean;
  can_view_reports: boolean;
  can_manage_wallet: boolean;
  can_manage_transactions: boolean;
  can_manage_bot: boolean;
  can_approve_topups: boolean;
  added_by: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERMISSION_KEYS: { key: keyof RolePermissions; label: string; color: string }[] = [
  { key: 'can_manage_payments', label: 'Payments', color: 'blue' },
  { key: 'can_manage_disbursements', label: 'Disbursements', color: 'emerald' },
  { key: 'can_view_reports', label: 'Reports', color: 'yellow' },
  { key: 'can_manage_wallet', label: 'Wallet', color: 'indigo' },
  { key: 'can_manage_transactions', label: 'Transactions', color: 'cyan' },
  { key: 'can_manage_bot', label: 'Bot Settings', color: 'slate' },
  { key: 'can_approve_topups', label: 'Approve Topups', color: 'teal' },
];

const BADGE_COLORS: Record<string, string> = {
  amber: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
  blue: 'bg-blue-500/15 border-blue-500/25 text-blue-400',
  emerald: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
  yellow: 'bg-yellow-500/15 border-yellow-500/25 text-yellow-400',
  indigo: 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400',
  cyan: 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400',
  slate: 'bg-slate-500/15 border-slate-500/25 text-slate-400',
  teal: 'bg-teal-500/15 border-teal-500/25 text-teal-400',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  super_admin: <Crown className="h-4 w-4 text-amber-400" />,
  manager: <ShieldCheck className="h-4 w-4 text-blue-400" />,
  cashier: <Shield className="h-4 w-4 text-emerald-400" />,
  reporter: <Tag className="h-4 w-4 text-yellow-400" />,
};

// ── PermissionBadge ────────────────────────────────────────────────────────────

function PermissionBadge({ active, label, color }: { active: boolean; label: string; color: string }) {
  const colorCls = BADGE_COLORS[color] || BADGE_COLORS['blue'];
  if (active) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium ${colorCls}`}>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium bg-slate-800/40 border-slate-700/30 text-slate-600 line-through">
      {label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { isSuperAdmin } = useAuth();
  const [roles, setRoles] = useState<RolePreset[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await fetch('/api/v1/roles');
      if (!res.ok) throw new Error(await res.text());
      setRoles(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load roles');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const fetchAdmins = useCallback(async () => {
    setAdminsLoading(true);
    try {
      const res = await fetch('/api/v1/admin-users');
      if (!res.ok) throw new Error(await res.text());
      setAdmins(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
    fetchAdmins();
  }, [fetchRoles, fetchAdmins]);

  const applyRole = async (role: RolePreset, admin: AdminUser) => {
    const key = `${role.id}-${admin.id}`;
    setApplying(key);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role.permissions),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess(`Applied "${role.name}" to ${admin.name || admin.telegram_username || `ID: ${admin.telegram_id}`}`);
      await fetchAdmins();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to apply role');
    } finally {
      setApplying(null);
    }
  };

  const activeAdmins = admins.filter((a) => a.is_active);
  const isLoading = rolesLoading || adminsLoading;

  const handleRefresh = useCallback(() => {
    fetchRoles();
    fetchAdmins();
  }, [fetchRoles, fetchAdmins]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto w-full min-w-0">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white truncate">Role Management</h1>
              <p className="text-slate-500 text-xs mt-0.5 truncate">
                {rolesLoading
                  ? 'Loading…'
                  : `${roles.length} role preset${roles.length !== 1 ? 's' : ''} available`}
              </p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="text-slate-400 hover:text-white gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-lg px-4 py-3 mb-4 text-sm">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="ml-auto shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Info Banner */}
        <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3 mb-5">
          <Shield className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            Role presets are permission templates fetched from the server. Applying a preset to an admin instantly
            updates all their permissions to match the role. You can still fine-tune individual permissions afterward
            in the Admin Management page.
          </p>
        </div>

        {/* Loading Skeletons */}
        {rolesLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 rounded-xl bg-[#1E293B] border border-slate-700/50 animate-pulse" />
            ))}
          </div>
        )}

        {/* Role Cards */}
        {!rolesLoading && (
          <div className="space-y-4">
            {roles.map((role) => {
              const colorCls = BADGE_COLORS[role.color] || BADGE_COLORS['blue'];
              const icon = ROLE_ICONS[role.id] ?? <Shield className="h-4 w-4 text-blue-400" />;

              return (
                <Card key={role.id} className="bg-[#1E293B] border-slate-700/50">
                  <CardContent className="p-4">
                    {/* Role header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${colorCls}`}>
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{role.name}</span>
                          <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${colorCls}`}>
                            PRESET
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{role.description}</p>
                      </div>
                    </div>

                    {/* Permission summary */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {role.permissions.is_super_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-amber-500/15 border-amber-500/30 text-amber-400 text-[10px] font-medium">
                          <Crown className="h-2.5 w-2.5" /> Super Admin
                        </span>
                      )}
                      {PERMISSION_KEYS.map(({ key, label, color }) => (
                        <PermissionBadge
                          key={key}
                          active={role.permissions[key]}
                          label={label}
                          color={color}
                        />
                      ))}
                    </div>

                    {/* Apply to admin — super admin only */}
                    {isSuperAdmin && (
                      adminsLoading ? (
                        <div className="h-8 rounded-lg bg-slate-800/40 animate-pulse" />
                      ) : activeAdmins.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                            Apply to admin
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {activeAdmins.map((admin) => {
                              const key = `${role.id}-${admin.id}`;
                              const isApplying = applying === key;
                              return (
                                <button
                                  key={admin.id}
                                  onClick={() => applyRole(role, admin)}
                                  disabled={!!applying}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all duration-150 disabled:opacity-50"
                                >
                                  {isApplying ? (
                                    <div className="h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                                  ) : (
                                    <User className="h-3 w-3 text-slate-500" />
                                  )}
                                  {admin.name || admin.telegram_username || `ID: ${admin.telegram_id}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 italic">No active admins to apply this role to.</p>
                      )
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
