import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

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

const PERMISSION_KEYS: { key: keyof AdminUser; label: string }[] = [
  { key: 'can_manage_payments', label: 'Payments' },
  { key: 'can_manage_disbursements', label: 'Disbursements' },
  { key: 'can_view_reports', label: 'Reports' },
  { key: 'can_manage_wallet', label: 'Wallet' },
  { key: 'can_manage_transactions', label: 'Transactions' },
  { key: 'can_manage_bot', label: 'Bot Settings' },
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

  return (
    <Layout>
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Admin Management</h1>
            <p className="text-sm text-gray-500">Manage who can access the admin dashboard</p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
            >
              + Add Admin
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Add Admin Form */}
        {showAdd && isSuperAdmin && (
          <div className="bg-white rounded-xl shadow p-4 mb-4 border border-blue-100">
            <h2 className="font-semibold mb-3">New Admin</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Telegram ID *</label>
                <input
                  type="text"
                  placeholder="e.g. 123456789"
                  value={form.telegram_id}
                  onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
                  className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Username</label>
                <input
                  type="text"
                  placeholder="@username"
                  value={form.telegram_username}
                  onChange={e => setForm(f => ({ ...f, telegram_username: e.target.value }))}
                  className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Display Name</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-600 mb-2 block font-medium">Permissions</label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_super_admin}
                    onChange={e => setForm(f => ({ ...f, is_super_admin: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-purple-700 font-medium">Super Admin</span>
                </label>
                {PERMISSION_KEYS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[key as keyof typeof form] as boolean}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || !form.telegram_id.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? 'Adding…' : 'Add Admin'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setForm(defaultForm); }}
                className="text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Admins Table */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading admins…</div>
        ) : admins.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No admins found. Add one to get started.</div>
        ) : (
          <div className="space-y-3">
            {admins.map(admin => (
              <div
                key={admin.id}
                className={`bg-white rounded-xl shadow p-4 border ${admin.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {admin.name || admin.telegram_username || `ID: ${admin.telegram_id}`}
                      </span>
                      {admin.telegram_username && (
                        <span className="text-blue-600 text-xs">@{admin.telegram_username}</span>
                      )}
                      <span className="text-gray-400 text-xs">TG: {admin.telegram_id}</span>
                      {admin.is_super_admin && (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          Super Admin
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${admin.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={() => handleToggleActive(admin)}
                        className={`text-xs px-2 py-1 rounded-lg transition ${admin.is_active ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {admin.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(admin)}
                        className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Permission toggles */}
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_KEYS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleTogglePermission(admin, key)}
                      disabled={!isSuperAdmin}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        admin[key]
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-gray-50 text-gray-400 border-gray-200'
                      } ${isSuperAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                    >
                      {admin[key] ? '✓' : '✗'} {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
