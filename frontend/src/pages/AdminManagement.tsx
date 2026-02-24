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
  Check,
  X,
  Trash2,
  Power,
  PowerOff,
  UserPlus,
  AlertCircle,
} from 'lucide-react';

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
  added_by: string | null;
}

const PERMISSION_KEYS: { key: keyof AdminUser; label: string; color: string }[] = [
  { key: 'can_manage_payments', label: 'Payments', color: 'blue' },
  { key: 'can_manage_disbursements', label: 'Disbursements', color: 'emerald' },
  { key: 'can_view_reports', label: 'Reports', color: 'yellow' },
  { key: 'can_manage_wallet', label: 'Wallet', color: 'indigo' },
  { key: 'can_manage_transactions', label: 'Transactions', color: 'cyan' },
  { key: 'can_manage_bot', label: 'Bot Settings', color: 'slate' },
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
};

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

export default function AdminManagement() {
  const { isSuperAdmin } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin-users');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAdmins(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
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

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin Management</h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {admins.length} admin{admins.length !== 1 ? 's' : ''} — {activeAdmins.length} active
              </p>
            </div>
          </div>
          {isSuperAdmin && (
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
          </div>
        )}

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
                      className={`w-8 h-4.5 rounded-full relative transition-colors duration-200 cursor-pointer flex-shrink-0 ${form.is_super_admin ? 'bg-amber-500' : 'bg-slate-700'}`}
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
            {/* Active Admins */}
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

            {/* Inactive Admins */}
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
      </div>
    </Layout>
  );
}

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
          {/* Identity */}
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

          {/* Actions */}
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

        {/* Permissions */}
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
