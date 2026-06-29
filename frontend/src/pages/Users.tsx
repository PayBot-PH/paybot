import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { client } from '@/lib/api';

interface UserItem {
  id: number;
  name?: string;
  username?: string;
  email?: string;
  created_at?: string;
}

export default function Users() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(12);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<UserItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; username: string; email: string }>({ name: '', username: '', email: '' });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; email?: string; name?: string }>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const nameErrorId = 'user-name-error';
  const usernameErrorId = 'user-username-error';
  const emailErrorId = 'user-email-error';

  const openEdit = (u: UserItem) => { setSelected(u); setForm({ name: u.name || '', username: u.username || '', email: u.email || '' }); setFormOpen(true); };

  const submitForm = async () => {
    const newErrors: typeof errors = {};
    if (!form.username || !form.username.trim()) newErrors.username = 'Username is required';
    if (!form.email || !form.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Invalid email';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) { toast.error('Please fix form errors'); return; }

    setSubmitLoading(true);
    try {
      if (selected) {
        const res = await client.apiCall.invoke({ url: `/api/v1/users/${selected.id}`, method: 'PUT', data: form });
        if (res.data?.success) toast.success('User updated'); else toast.error(res.data?.message || 'Update failed');
      } else {
        const res = await client.apiCall.invoke({ url: '/api/v1/users', method: 'POST', data: form });
        if (res.data?.success) toast.success('User created'); else toast.error(res.data?.message || 'Create failed');
      }
      setFormOpen(false);
      fetchUsers();
    } catch (err) { console.warn(err); toast.error('Request failed'); }
    setSubmitLoading(false);
  };

  const fetchUsers = async (q = query, p = page, sField: string | null = sortField, sDir: 'asc' | 'desc' | null = sortDir) => {
    setLoading(true);
    try {
      const url = new URL('/api/v1/users', window.location.origin);
      url.searchParams.set('page', String(p));
      url.searchParams.set('limit', String(perPage));
      if (sField && sDir) {
        const sortParam = `${sDir === 'desc' ? '-' : ''}${sField}`;
        url.searchParams.set('sort', sortParam);
      }
      if (q) url.searchParams.set('q', q);
      const res = await client.apiCall.invoke({ url: url.toString(), method: 'GET', data: {} });
      const data = res.data || {};
      setUsers(Array.isArray(data?.items) ? data.items : (data?.items || []));
      setTotal(Number(data?.total || data?.count || data?.meta?.total || 0));
    } catch (err) {
      console.warn('Failed to load users', err);
      toast.error('Failed to load users');
      setUsers([]);
      setTotal(0);
    } finally { setLoading(false); }
  };

  const handleSort = (field: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    if (sortField === field) nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    fetchUsers(query, 1, field, nextDir);
  };

  useEffect(() => { fetchUsers(); /* eslint-disable-next-line */ }, [page]);

  const handleSearch = () => { setPage(1); fetchUsers(query, 1); };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Users</h1>
          <div className="flex items-center gap-3">
            <Input placeholder="Search users" aria-label="Search users" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button onClick={handleSearch}>Search</Button>
            <Button onClick={() => { setSelected(null); setForm({ name: '', username: '', email: '' }); setFormOpen(true); }} variant="secondary">Create</Button>
          </div>
        </div>

        <Card>
          <div className="p-4">
            {loading && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && users.length === 0 && (
              <p className="text-sm text-muted-foreground">No users found.</p>
            )}

            {!loading && users.length > 0 && (
              <div className="overflow-x-auto">
                <table id="users-table" className="modern-table w-full" role="table" aria-label="Users list">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th
                        tabIndex={0}
                        role="button"
                        onClick={() => handleSort('name')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('name'); } }}
                        aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer focus:ring-2 focus:ring-brandblue-500 focus:ring-offset-1"
                      >Name</th>
                      <th
                        tabIndex={0}
                        role="button"
                        onClick={() => handleSort('username')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('username'); } }}
                        aria-sort={sortField === 'username' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer focus:ring-2 focus:ring-brandblue-500 focus:ring-offset-1"
                      >Username</th>
                      <th
                        tabIndex={0}
                        role="button"
                        onClick={() => handleSort('created_at')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('created_at'); } }}
                        aria-sort={sortField === 'created_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer focus:ring-2 focus:ring-brandblue-500 focus:ring-offset-1 text-right"
                      >Joined</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.name || '-'}</td>
                        <td>{u.username || u.email || '-'}</td>
                        <td className="text-right text-xs">{u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Dialog open={!!selected && selected.id === u.id} onOpenChange={(open) => { if (!open) setSelected(null); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" aria-label={`View user ${u.id}`} onClick={() => setSelected(u)}>View</Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md bg-[#0A0F1E] border-white/10 rounded-[2.5rem] shadow-3xl text-white">
                                <DialogHeader className="space-y-3">
                                  <DialogTitle className="text-2xl font-black">{selected?.name || selected?.username}</DialogTitle>
                                  <div className="text-sm text-white/40">ID: {selected?.id}</div>
                                </DialogHeader>
                                <div className="p-6">
                                  <p className="text-sm">Email: {selected?.email || '-'}</p>
                                  <p className="text-sm mt-2">Username: {selected?.username || '-'}</p>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button size="sm" aria-label={`Edit user ${u.id}`} onClick={() => openEdit(u)}>Edit</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-sm text-muted-foreground" aria-live="polite">Showing {users.length} of {total} users</div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end">
              <Pagination aria-label="users-pagination">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink as="button" onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">Prev</PaginationLink>
                  </PaginationItem>
                  {Array.from({ length: Math.max(1, Math.ceil(total / perPage)) }).slice(Math.max(0, page - 4), page + 3).map((_, i) => {
                    const pIdx = i + Math.max(1, page - 3);
                    return (
                      <PaginationItem key={pIdx}>
                        <PaginationLink isActive={pIdx === page} as="button" onClick={() => setPage(pIdx)} aria-label={`Go to page ${pIdx}`} aria-current={pIdx === page ? 'page' : undefined}>{pIdx}</PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationLink as="button" onClick={() => setPage((p) => p + 1)} aria-label="Next page">Next</PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </Card>
        {/* Create / Edit Dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-md bg-[#0A0F1E] border-white/10 rounded-[2.5rem] shadow-3xl text-white">
            <DialogHeader className="space-y-3 px-6 pt-6">
              <DialogTitle className="text-2xl font-black">{selected ? 'Edit User' : 'Create User'}</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div>
                <Input placeholder="Full name" value={form.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? nameErrorId : undefined} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                {errors.name && <div id={nameErrorId} className="text-sm text-rose-400 mt-1">{errors.name}</div>}
              </div>
              <div>
                <Input placeholder="Username" value={form.username} aria-invalid={!!errors.username} aria-describedby={errors.username ? usernameErrorId : undefined} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
                {errors.username && <div id={usernameErrorId} className="text-sm text-rose-400 mt-1">{errors.username}</div>}
              </div>
              <div>
                <Input placeholder="Email" value={form.email} aria-invalid={!!errors.email} aria-describedby={errors.email ? emailErrorId : undefined} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                {errors.email && <div id={emailErrorId} className="text-sm text-rose-400 mt-1">{errors.email}</div>}
              </div>
              <div className="flex justify-end gap-3">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button onClick={submitForm} disabled={submitLoading} aria-busy={submitLoading} aria-live="polite">
                  {submitLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{selected ? 'Saving...' : 'Creating...'}</> : (selected ? 'Save' : 'Create')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
