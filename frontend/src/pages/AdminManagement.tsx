import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  Plus,
  Crown,
  User,
  Users,
  Check,
  X,
  Trash2,
  Power,
  PowerOff,
  UserPlus,
  AlertCircle,
  Shield,
  ChevronDown,
  Clock,
  Mail,
  Tag,
  Bitcoin,
  CheckCircle,
  XCircle,
  WrenchIcon,
  Wallet as WalletIcon,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface RegisteredUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string | null;
  last_login: string | null;
}

interface CryptoTopupRequest {
  id: number;
  user_id: string;
  amount_usdt: number;
  tx_hash: string;
  network: string;
  status: string;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

type AdminTab = 'admins' | 'users' | 'roles' | 'crypto' | 'usd-wallets';

// ── Constants ─────────────────────────────────────────────────────────────────

const PERMISSION_KEYS: { key: keyof AdminUser; label: string; color: string }[] = [
  { key: 'can_manage_payments', label: 'Payments', color: 'blue' },
  { key: 'can_manage_disbursements', label: 'Disbursements', color: 'emerald' },
  { key: 'can_view_reports', label: 'Reports', color: 'yellow' },
  { key: 'can_manage_wallet', label: 'Wallet', color: 'indigo' },
  { key: 'can_manage_transactions', label: 'Transactions', color: 'cyan' },
  { key: 'can_manage_bot', label: 'Bot Settings', color: 'slate' },
  { key: 'can_approve_topups', label: 'Approve Topups', color: 'teal' },
];

const defaultForm = {
  telegram_id: '',
  telegram_username: '',
  name: '',
  is_super_admin: false,
  can_manage_payments: true,
  can_manage_disbursements: true,
  can_view_reports: true,
  can_manage_wallet: true,
  can_manage_transactions: true,
  can_manage_bot: false,
  can_approve_topups: false,
};

interface RolePreset {
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  permissions: {
    is_super_admin: boolean;
    can_manage_payments: boolean;
    can_manage_disbursements: boolean;
    can_view_reports: boolean;
    can_manage_wallet: boolean;
    can_manage_transactions: boolean;
    can_manage_bot: boolean;
    can_approve_topups: boolean;
  };
}

const ROLE_PRESETS: RolePreset[] = [
  {
    name: 'Super Admin',
    description: 'Full access to all features including admin management.',
    color: 'amber',
    icon: <Crown className="h-4 w-4 text-amber-400" />,
    permissions: {
      is_super_admin: true,
      can_manage_payments: true,
      can_manage_disbursements: true,
      can_view_reports: true,
      can_manage_wallet: true,
      can_manage_transactions: true,
      can_manage_bot: true,
      can_approve_topups: true,
    },
  },
  {
    name: 'Manager',
    description: 'Full operational access without bot settings or admin management.',
    color: 'blue',
    icon: <ShieldCheck className="h-4 w-4 text-blue-400" />,
    permissions: {
      is_super_admin: false,
      can_manage_payments: true,
      can_manage_disbursements: true,
      can_view_reports: true,
      can_manage_wallet: true,
      can_manage_transactions: true,
      can_manage_bot: false,
      can_approve_topups: true,
    },
  },
  {
    name: 'Cashier',
    description: 'Can create payments and view transactions only.',
    color: 'emerald',
    icon: <Shield className="h-4 w-4 text-emerald-400" />,
    permissions: {
      is_super_admin: false,
      can_manage_payments: true,
      can_manage_disbursements: false,
      can_view_reports: false,
      can_manage_wallet: false,
      can_manage_transactions: true,
      can_manage_bot: false,
      can_approve_topups: false,
    },
  },
  {
    name: 'Reporter',
    description: 'Read-only access to reports and transactions.',
    color: 'yellow',
    icon: <Tag className="h-4 w-4 text-yellow-400" />,
    permissions: {
      is_super_admin: false,
      can_manage_payments: false,
      can_manage_disbursements: false,
      can_view_reports: true,
      can_manage_wallet: false,
      can_manage_transactions: true,
      can_manage_bot: false,
      can_approve_topups: false,
    },
  },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function PermissionBadge({
  active,
  label,
  color,
  onClick,
  interactive,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick?: () => void;
  interactive: boolean;
}) {
  const activeStyles: Record<string, string> = {
    blue: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    yellow: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    indigo: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400',
    cyan: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
    slate: 'bg-slate-500/15 border-slate-500/30 text-slate-300',
    teal: 'bg-teal-500/15 border-teal-500/30 text-teal-400',
  };

  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-all duration-150
        ${active
          ? activeStyles[color] || 'bg-blue-500/15 border-blue-500/30 text-blue-400'
          : 'bg-slate-800/60 border-slate-700/40 text-slate-500'
        }
        ${interactive ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
    >
      {active ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {label}
    </button>
  );
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; icon: React.ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-6">
      {/* Mobile: 2-column grid — all tabs visible at a glance, no horizontal scroll */}
      <div className="sm:hidden grid grid-cols-2 gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-150
              ${tabs.length % 2 !== 0 && idx === tabs.length - 1 ? 'col-span-2' : ''}
              ${active === tab.id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              }`}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                active === tab.id ? 'bg-slate-600 text-slate-200' : 'bg-slate-700/60 text-slate-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop: horizontal scrollable row with hidden scrollbar */}
      <div className="hidden sm:flex items-center gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0
              ${active === tab.id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                active === tab.id ? 'bg-slate-600 text-slate-200' : 'bg-slate-700/60 text-slate-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Admin Users Tab ───────────────────────────────────────────────────────────

function AdminCard({
  admin,
  isSuperAdmin,
  onToggleActive,
  onTogglePermission,
  onDelete,
}: {
  admin: AdminUser;
  isSuperAdmin: boolean;
  onToggleActive: (a: AdminUser) => void;
  onTogglePermission: (a: AdminUser, key: keyof AdminUser) => void;
  onDelete: (a: AdminUser) => void;
}) {
  return (
    <Card className={`border transition-all duration-200 ${
      admin.is_active
        ? 'bg-[#1E293B] border-slate-700/50 hover:border-slate-600/60'
        : 'bg-slate-900/50 border-slate-700/30 opacity-60'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
              admin.is_super_admin
                ? 'bg-amber-500/15 border border-amber-500/25'
                : 'bg-blue-500/15 border border-blue-500/25'
            }`}>
              {admin.is_super_admin
                ? <Crown className="h-4 w-4 text-amber-400" />
                : <User className="h-4 w-4 text-blue-400" />
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-sm text-white truncate">
                  {admin.name || admin.telegram_username || `ID: ${admin.telegram_id}`}
                </span>
                {admin.telegram_username && (
                  <span className="text-blue-400 text-xs">@{admin.telegram_username}</span>
                )}
                {admin.is_super_admin && (
                  <Badge className="bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[9px] px-1.5 py-0 h-4">
                    SUPER
                  </Badge>
                )}
                <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${
                  admin.is_active
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                    : 'bg-slate-700/40 border-slate-600/40 text-slate-500'
                }`}>
                  {admin.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">TG: {admin.telegram_id}</p>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onToggleActive(admin)}
                title={admin.is_active ? 'Deactivate' : 'Activate'}
                className={`p-1.5 rounded-lg transition-colors text-xs ${
                  admin.is_active
                    ? 'text-orange-400 hover:bg-orange-500/10'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {admin.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              </button>
              <button
                onClick={() => onDelete(admin)}
                title="Remove admin"
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PERMISSION_KEYS.map(({ key, label, color }) => (
            <PermissionBadge
              key={key}
              active={admin[key] as boolean}
              label={label}
              color={color}
              onClick={() => onTogglePermission(admin, key)}
              interactive={isSuperAdmin}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── User Management Tab ───────────────────────────────────────────────────────

function UserManagementTab({
  isSuperAdmin,
  onError,
}: {
  isSuperAdmin: boolean;
  onError: (msg: string) => void;
}) {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/users');
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json());
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (user: RegisteredUser, role: string) => {
    if (!isSuperAdmin) return;
    setUpdatingId(user.id);
    try {
      const res = await fetch(`/api/v1/users/${encodeURIComponent(user.id)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchUsers();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-[#1E293B] border border-slate-700/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <Card className="bg-[#1E293B] border-slate-700/50">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-700/40 flex items-center justify-center mb-3">
            <Users className="h-7 w-7 text-slate-500" />
          </div>
          <p className="text-white font-semibold text-sm">No users yet</p>
          <p className="text-slate-500 text-xs mt-1">Users will appear here once they log in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <span>User</span>
        <span className="text-right">Created</span>
        <span className="text-right">Last Login</span>
        <span className="text-right w-24">Role</span>
      </div>
      {users.map((user) => (
        <Card key={user.id} className="bg-[#1E293B] border-slate-700/50 hover:border-slate-600/60 transition-all duration-150">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                  user.role === 'admin'
                    ? 'bg-blue-500/15 border border-blue-500/25'
                    : 'bg-slate-700/50 border border-slate-600/40'
                }`}>
                  {user.role === 'admin'
                    ? <ShieldCheck className="h-4 w-4 text-blue-400" />
                    : <User className="h-4 w-4 text-slate-400" />
                  }
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white truncate">
                      {user.name || user.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Mail className="h-3 w-3 text-slate-500 shrink-0" />
                    <span className="text-[11px] text-slate-500 truncate">{user.email}</span>
                  </div>
                </div>
              </div>

              {/* Meta + Role */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    {formatDate(user.created_at)}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Last: {formatDate(user.last_login)}
                  </div>
                </div>

                {isSuperAdmin ? (
                  <RoleSelector
                    currentRole={user.role}
                    loading={updatingId === user.id}
                    onChange={(role) => handleRoleChange(user, role)}
                  />
                ) : (
                  <Badge className={`text-[10px] px-2 h-5 border ${
                    user.role === 'admin'
                      ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
                      : 'bg-slate-700/40 border-slate-600/40 text-slate-400'
                  }`}>
                    {user.role}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RoleSelector({
  currentRole,
  loading,
  onChange,
}: {
  currentRole: string;
  loading: boolean;
  onChange: (role: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const roles = [
    { value: 'admin', label: 'Admin', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/25' },
    { value: 'user', label: 'User', color: 'text-slate-400', bg: 'bg-slate-700/40 border-slate-600/40' },
  ];
  const current = roles.find((r) => r.value === currentRole) || roles[1];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all duration-150 ${current.bg} ${current.color} hover:opacity-80 disabled:opacity-50`}
      >
        {loading ? (
          <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : null}
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-slate-800 border border-slate-700/60 rounded-lg shadow-xl overflow-hidden min-w-[100px]">
            {roles.map((r) => (
              <button
                key={r.value}
                onClick={() => { setOpen(false); if (r.value !== currentRole) onChange(r.value); }}
                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-700/60 ${r.color} ${r.value === currentRole ? 'bg-slate-700/40' : ''}`}
              >
                {r.label}
                {r.value === currentRole && <Check className="inline h-3 w-3 ml-1 opacity-60" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Role Management Tab ───────────────────────────────────────────────────────

const PRESET_BADGE_COLORS: Record<string, string> = {
  amber: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
  blue: 'bg-blue-500/15 border-blue-500/25 text-blue-400',
  emerald: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
  yellow: 'bg-yellow-500/15 border-yellow-500/25 text-yellow-400',
  purple: 'bg-purple-500/15 border-purple-500/25 text-purple-400',
};

function RoleManagementTab({
  admins,
  isSuperAdmin,
  onError,
  onRefreshAdmins,
}: {
  admins: AdminUser[];
  isSuperAdmin: boolean;
  onError: (msg: string) => void;
  onRefreshAdmins: () => void;
}) {
  const [applying, setApplying] = useState<string | null>(null); // "{presetName}-{adminId}"

  const applyRole = async (preset: RolePreset, admin: AdminUser) => {
    const key = `${preset.name}-${admin.id}`;
    setApplying(key);
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset.permissions),
      });
      if (!res.ok) throw new Error(await res.text());
      onRefreshAdmins();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to apply role');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3">
        <Shield className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Role presets are permission templates. Applying a preset to an admin instantly updates all their permissions to match the role. You can still fine-tune individual permissions afterward in the Admin Users tab.
        </p>
      </div>

      {/* Role preset cards */}
      {ROLE_PRESETS.map((preset) => {
        const colorCls = PRESET_BADGE_COLORS[preset.color] || PRESET_BADGE_COLORS['blue'];
        const activeAdmins = admins.filter((a) => a.is_active);

        return (
          <Card key={preset.name} className="bg-[#1E293B] border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${colorCls}`}>
                    {preset.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{preset.name}</span>
                      <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${colorCls}`}>
                        PRESET
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{preset.description}</p>
                  </div>
                </div>
              </div>

              {/* Permission summary */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {preset.permissions.is_super_admin && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-amber-500/15 border-amber-500/30 text-amber-400 text-xs font-medium">
                    <Crown className="h-2.5 w-2.5" /> Super Admin
                  </span>
                )}
                {PERMISSION_KEYS.map(({ key, label, color }) => (
                  <PermissionBadge
                    key={key}
                    active={preset.permissions[key as keyof typeof preset.permissions] as boolean}
                    label={label}
                    color={color}
                    interactive={false}
                  />
                ))}
              </div>

              {/* Apply to admin */}
              {isSuperAdmin && activeAdmins.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                    Apply to admin
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeAdmins.map((admin) => {
                      const key = `${preset.name}-${admin.id}`;
                      const isApplying = applying === key;
                      return (
                        <button
                          key={admin.id}
                          onClick={() => applyRole(preset, admin)}
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
              )}

              {isSuperAdmin && activeAdmins.length === 0 && (
                <p className="text-xs text-slate-600 italic">No active admins to apply this role to.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Crypto Requests Tab ───────────────────────────────────────────────────────

function RequestCard({
  req,
  canApproveTopups,
  actionId,
  onAction,
}: {
  req: CryptoTopupRequest;
  canApproveTopups: boolean;
  actionId: number | null;
  onAction: (id: number, action: 'approve' | 'reject') => void;
}) {
  const isPending = req.status === 'pending';
  const isProcessing = actionId === req.id;
  return (
    <Card className={`border transition-colors duration-150 ${
      isPending
        ? 'bg-[#1E293B] border-slate-700/50 hover:border-teal-500/30'
        : 'bg-slate-900/40 border-slate-700/30'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
              req.status === 'approved'
                ? 'bg-emerald-500/15 border-emerald-500/25'
                : req.status === 'rejected'
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-teal-500/10 border-teal-500/20'
            }`}>
              {req.status === 'approved'
                ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                : req.status === 'rejected'
                ? <XCircle className="h-4 w-4 text-red-400" />
                : <Clock className="h-4 w-4 text-amber-400" />
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-white">${req.amount_usdt.toFixed(2)} USDT</span>
                <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${
                  req.status === 'approved'
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                    : req.status === 'rejected'
                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}>
                  {req.status.toUpperCase()}
                </Badge>
                <Badge className="bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[9px] px-1.5 py-0 h-4">
                  {req.network}
                </Badge>
              </div>
              <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5" title={req.tx_hash}>
                TX: {req.tx_hash}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-slate-600">User: {req.user_id}</span>
                {req.created_at && (
                  <span className="text-[10px] text-slate-600">{formatDate(req.created_at)}</span>
                )}
              </div>
            </div>
          </div>

          {isPending && canApproveTopups && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                disabled={!!actionId}
                onClick={() => onAction(req.id, 'approve')}
                className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isProcessing
                  ? <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve</>}
              </Button>
              <Button
                size="sm"
                disabled={!!actionId}
                onClick={() => onAction(req.id, 'reject')}
                className="h-7 px-2.5 text-xs bg-slate-700 hover:bg-red-600/80 text-slate-300 hover:text-white"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />Reject
              </Button>
            </div>
          )}

          {!isPending && req.reviewed_by && (
            <div className="text-right shrink-0 text-[10px] text-slate-600">
              <p>By: {req.reviewed_by}</p>
              {req.reviewed_at && <p>{formatDate(req.reviewed_at)}</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CryptoRequestsTab({
  canApproveTopups,
  onError,
}: {
  canApproveTopups: boolean;
  onError: (msg: string) => void;
}) {
  const [requests, setRequests] = useState<CryptoTopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/wallet/crypto-topup-requests');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRequests(data.items || []);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to load crypto requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, 30000);
    return () => clearInterval(id);
  }, []);

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    if (!canApproveTopups) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/v1/wallet/crypto-topup-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Action failed');
      }
      await fetchRequests();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionId(null);
    }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending');

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-[#1E293B] border border-slate-700/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="bg-[#1E293B] border-slate-700/50">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="h-14 w-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-3">
            <Bitcoin className="h-7 w-7 text-teal-500" />
          </div>
          <p className="text-white font-semibold text-sm">No crypto top-up requests</p>
          <p className="text-slate-500 text-xs mt-1">Requests submitted by users will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!canApproveTopups && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">You have view-only access. Wallet management permission is required to approve or reject requests.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400 mb-2 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Pending ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                canApproveTopups={canApproveTopups}
                actionId={actionId}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
            Reviewed ({reviewed.length})
          </p>
          <div className="space-y-2">
            {reviewed.slice(0, 20).map(req => (
              <RequestCard
                key={req.id}
                req={req}
                canApproveTopups={canApproveTopups}
                actionId={actionId}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── USD Wallets Tab (Super Admin Only) ───────────────────────────────────────

interface UsdWalletEntry {
  user_id: string;
  telegram_username: string | null;
  balance: number;
  wallet_id: number;
}

function UsdWalletsTab({ onError }: { onError: (msg: string) => void }) {
  const [wallets, setWallets] = useState<UsdWalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<Record<string, string>>({});
  const [adjustNote, setAdjustNote] = useState<Record<string, string>>({});

  const fetchWallets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/wallet/admin/usd-wallets');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWallets(data.items || []);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to load USD wallets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWallets(); }, []);

  const handleAdjust = async (userId: string, isCredit: boolean) => {
    const rawAmt = parseFloat(adjustAmount[userId] || '0');
    if (!rawAmt || rawAmt <= 0) { onError('Enter a valid positive amount'); return; }
    const amount = isCredit ? rawAmt : -rawAmt;
    setAdjusting(userId);
    try {
      const encoded = encodeURIComponent(userId);
      const res = await fetch(`/api/v1/wallet/admin/usd-wallets/${encoded}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: adjustNote[userId] || '' }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.detail || 'Adjustment failed'); return; }
      setAdjustAmount(prev => ({ ...prev, [userId]: '' }));
      setAdjustNote(prev => ({ ...prev, [userId]: '' }));
      await fetchWallets();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setAdjusting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl bg-[#1E293B] border border-slate-700/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <Card className="bg-[#1E293B] border-slate-700/50">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-700/40 flex items-center justify-center mb-3">
            <WalletIcon className="h-7 w-7 text-slate-500" />
          </div>
          <p className="text-white font-semibold text-sm">No USD wallets yet</p>
          <p className="text-slate-500 text-xs mt-1">USD wallets are created when users top up their balance.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-xs">
        {wallets.length} USD wallet{wallets.length !== 1 ? 's' : ''} — use Credit/Debit to adjust balances
      </p>
      {wallets.map(w => (
        <Card key={w.wallet_id} className="bg-[#1E293B] border-slate-700/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-teal-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {w.telegram_username ? `@${w.telegram_username}` : w.user_id}
                  </p>
                  <p className="text-slate-500 text-xs">{w.user_id}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-teal-400 font-bold text-lg">${w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <p className="text-slate-500 text-[10px]">USD</p>
              </div>
            </div>

            {/* Adjust form */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={adjustAmount[w.user_id] || ''}
                onChange={e => setAdjustAmount(prev => ({ ...prev, [w.user_id]: e.target.value }))}
                className="flex-1 bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/40 transition-colors"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={adjustNote[w.user_id] || ''}
                onChange={e => setAdjustNote(prev => ({ ...prev, [w.user_id]: e.target.value }))}
                className="flex-1 bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/40 transition-colors"
              />
              <Button
                size="sm"
                onClick={() => handleAdjust(w.user_id, true)}
                disabled={adjusting === w.user_id}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3"
              >
                {adjusting === w.user_id ? '...' : '+ Credit'}
              </Button>
              <Button
                size="sm"
                onClick={() => handleAdjust(w.user_id, false)}
                disabled={adjusting === w.user_id}
                className="bg-red-700 hover:bg-red-800 text-white text-xs px-3"
              >
                {adjusting === w.user_id ? '...' : '− Debit'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminManagement() {
  const { isSuperAdmin, permissions } = useAuth();
  const canApproveTopups = isSuperAdmin || !!permissions?.can_approve_topups;
  const [activeTab, setActiveTab] = useState<AdminTab>('admins');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceUpdating, setMaintenanceUpdating] = useState(false);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin-users');
      if (!res.ok) throw new Error(await res.text());
      setAdmins(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaintenanceMode = async () => {
    try {
      setMaintenanceLoading(true);
      const res = await fetch('/api/v1/app-settings/maintenance');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMaintenanceMode(!!data.maintenance_mode);
    } catch {
      // silently ignore
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    if (!isSuperAdmin || maintenanceUpdating) return;
    setMaintenanceUpdating(true);
    try {
      const res = await fetch('/api/v1/app-settings/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !maintenanceMode }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMaintenanceMode(!!data.maintenance_mode);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update maintenance mode');
    } finally {
      setMaintenanceUpdating(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchMaintenanceMode();
    const id = setInterval(fetchAdmins, 30000);
    return () => clearInterval(id);
  }, []);

  const handleAdd = async () => {
    if (!form.telegram_id.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setForm(defaultForm);
      setShowAdd(false);
      await fetchAdmins();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add admin');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (admin: AdminUser) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !admin.is_active }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAdmins();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update admin');
    }
  };

  const handleTogglePermission = async (admin: AdminUser, key: keyof AdminUser) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: !admin[key] }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAdmins();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update permission');
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    if (!isSuperAdmin) return;
    if (!confirm(`Remove @${admin.telegram_username || admin.telegram_id} as admin?`)) return;
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await fetchAdmins();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete admin');
    }
  };

  const activeAdmins = admins.filter((a) => a.is_active);
  const inactiveAdmins = admins.filter((a) => !a.is_active);

  const tabs = [
    {
      id: 'admins',
      label: 'Admin Users',
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      count: admins.length,
    },
    {
      id: 'users',
      label: 'User Management',
      icon: <Users className="h-3.5 w-3.5" />,
    },
    {
      id: 'roles',
      label: 'Role Management',
      icon: <Shield className="h-3.5 w-3.5" />,
      count: ROLE_PRESETS.length,
    },
    ...(canApproveTopups ? [{
      id: 'crypto',
      label: 'Crypto Requests',
      icon: <Bitcoin className="h-3.5 w-3.5" />,
    }] : []),
    ...(isSuperAdmin ? [{
      id: 'usd-wallets',
      label: 'USD Wallets',
      icon: <WalletIcon className="h-3.5 w-3.5" />,
    }] : []),
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto w-full min-w-0">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white truncate">Admin Management</h1>
              <p className="text-slate-500 text-xs mt-0.5 truncate">
                {admins.length} admin{admins.length !== 1 ? 's' : ''} — {activeAdmins.length} active
              </p>
            </div>
          </div>
          {activeTab === 'admins' && isSuperAdmin && (
            <Button
              onClick={() => setShowAdd(!showAdd)}
              size="sm"
              className={`gap-1.5 text-xs ${showAdd ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showAdd ? 'Cancel' : 'Add Admin'}
            </Button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Maintenance Mode Toggle (super admin only) */}
        {isSuperAdmin && (
          <Card className={`mb-5 border ${maintenanceMode ? 'bg-amber-950/30 border-amber-500/30' : 'bg-[#1E293B] border-slate-700/50'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    maintenanceMode
                      ? 'bg-amber-500/15 border-amber-500/30'
                      : 'bg-slate-700/40 border-slate-600/40'
                  }`}>
                    <WrenchIcon className={`h-4 w-4 ${maintenanceMode ? 'text-amber-400' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">Maintenance Mode</span>
                      {!maintenanceLoading && (
                        <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${
                          maintenanceMode
                            ? 'bg-amber-500/15 border-amber-500/25 text-amber-400'
                            : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                        }`}>
                          {maintenanceMode ? 'ON' : 'OFF'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {maintenanceMode
                        ? 'All pages are currently disabled — users see the maintenance notice.'
                        : 'System is operational. Toggle on to show a maintenance notice to all users.'}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleToggleMaintenance}
                  disabled={maintenanceLoading || maintenanceUpdating}
                  size="sm"
                  className={`gap-1.5 text-xs shrink-0 ${
                    maintenanceMode
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {maintenanceUpdating ? (
                    <div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : maintenanceMode ? (
                    <><Power className="h-3.5 w-3.5" /><span className="hidden sm:inline">Disable </span>Maintenance</>
                  ) : (
                    <><WrenchIcon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Enable </span>Maintenance</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={(id) => {
            setActiveTab(id as typeof activeTab);
            setShowAdd(false);
            setError('');
          }}
        />

        {/* ── Admin Users Tab ── */}
        {activeTab === 'admins' && (
          <>
            {/* Add Admin Form */}
            {showAdd && isSuperAdmin && (
              <Card className="bg-[#1E293B] border-blue-500/20 mb-5 shadow-lg shadow-blue-900/10">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-blue-400" />
                    New Admin
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Telegram ID <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        placeholder="e.g. 123456789"
                        value={form.telegram_id}
                        onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
                        className="w-full bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Username</label>
                      <input
                        type="text"
                        placeholder="@username"
                        value={form.telegram_username}
                        onChange={e => setForm(f => ({ ...f, telegram_username: e.target.value }))}
                        className="w-full bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1.5 block">Display Name</label>
                      <input
                        type="text"
                        placeholder="Full name"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-medium">Permissions</label>
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setForm(f => ({ ...f, is_super_admin: !f.is_super_admin }))}
                          className={`w-8 h-5 rounded-full relative transition-colors duration-200 cursor-pointer flex-shrink-0 ${form.is_super_admin ? 'bg-amber-500' : 'bg-slate-700'}`}
                        >
                          <div className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${form.is_super_admin ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </div>
                        <span className={`text-xs font-semibold ${form.is_super_admin ? 'text-amber-400' : 'text-slate-400'}`}>Super Admin</span>
                      </label>
                      {PERMISSION_KEYS.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={form[key as keyof typeof form] as boolean}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0"
                          />
                          <span className="text-xs text-slate-300">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      onClick={handleAdd}
                      disabled={saving || !form.telegram_id.trim()}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:opacity-50"
                    >
                      {saving ? 'Adding…' : 'Add Admin'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowAdd(false); setForm(defaultForm); }}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Admins List */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-[#1E293B] border border-slate-700/50 animate-pulse" />
                ))}
              </div>
            ) : admins.length === 0 ? (
              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-slate-700/40 flex items-center justify-center mb-3">
                    <ShieldCheck className="h-7 w-7 text-slate-500" />
                  </div>
                  <p className="text-white font-semibold text-sm">No admins yet</p>
                  <p className="text-slate-500 text-xs mt-1">Add your first admin to grant dashboard access.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {activeAdmins.map(admin => (
                  <AdminCard
                    key={admin.id}
                    admin={admin}
                    isSuperAdmin={isSuperAdmin}
                    onToggleActive={handleToggleActive}
                    onTogglePermission={handleTogglePermission}
                    onDelete={handleDelete}
                  />
                ))}

                {inactiveAdmins.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-px flex-1 bg-slate-700/50" />
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Inactive</span>
                      <div className="h-px flex-1 bg-slate-700/50" />
                    </div>
                    {inactiveAdmins.map(admin => (
                      <AdminCard
                        key={admin.id}
                        admin={admin}
                        isSuperAdmin={isSuperAdmin}
                        onToggleActive={handleToggleActive}
                        onTogglePermission={handleTogglePermission}
                        onDelete={handleDelete}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── User Management Tab ── */}
        {activeTab === 'users' && (
          <UserManagementTab isSuperAdmin={isSuperAdmin} onError={setError} />
        )}

        {/* ── Role Management Tab ── */}
        {activeTab === 'roles' && (
          <RoleManagementTab
            admins={admins}
            isSuperAdmin={isSuperAdmin}
            onError={setError}
            onRefreshAdmins={fetchAdmins}
          />
        )}

        {/* ── Crypto Requests Tab ── */}
        {activeTab === 'crypto' && canApproveTopups && (
          <CryptoRequestsTab canApproveTopups={canApproveTopups} onError={setError} />
        )}

        {/* ── USD Wallets Tab ── */}
        {activeTab === 'usd-wallets' && isSuperAdmin && (
          <UsdWalletsTab onError={setError} />
        )}
      </div>
    </Layout>
  );
}
