import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { client } from '@/lib/api';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { fmt } from '@/lib/format';

interface Merchant {
  id: number;
  name: string;
  email?: string;
  status?: string;
  created_at?: string;
  balance?: number;
}

export default function Merchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(12);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const fetchMerchants = async (q = query, p = page, sField: string | null = sortField, sDir: 'asc' | 'desc' | null = sortDir) => {
    setLoading(true);
    try {
      const url = new URL('/api/v1/merchants', window.location.origin);
      url.searchParams.set('page', String(p));
      url.searchParams.set('limit', String(perPage));
      if (sField && sDir) {
        // follow existing convention: prefix '-' for descending
        const sortParam = `${sDir === 'desc' ? '-' : ''}${sField}`;
        url.searchParams.set('sort', sortParam);
      }
      if (q) url.searchParams.set('q', q);
      const res = await client.apiCall.invoke({ url: url.toString(), method: 'GET', data: {} });
      const data = res.data || {};
      setMerchants(Array.isArray(data?.items) ? data.items : (data?.items || []));
      setTotal(Number(data?.total || data?.count || data?.meta?.total || 0));
    } catch (err) {
      console.warn('Failed to load merchants', err);
      toast.error('Failed to load merchants');
      setMerchants([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    if (sortField === field) nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    // fetch page 1 with new sort
    setPage(1);
    fetchMerchants(query, 1, field, nextDir);
  };

  useEffect(() => { fetchMerchants(); /* eslint-disable-next-line */ }, [page]);

  const handleSearch = () => { setPage(1); fetchMerchants(query, 1); };

  const toggleActive = async (id: number, activate: boolean) => {
    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/merchants/${id}/${activate ? 'activate' : 'deactivate'}`, method: 'POST', data: {} });
      if (res.data?.success) {
        toast.success(activate ? 'Merchant activated' : 'Merchant deactivated');
      } else {
        toast.error(res.data?.message || 'Failed to change status');
      }
      fetchMerchants();
    } catch (err) { console.warn(err); toast.error('Failed to change status'); }
  };

  // Create / Edit form
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; status?: string }>({ name: '', email: '', status: 'active' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const nameErrorId = 'merchant-name-error';
  const emailErrorId = 'merchant-email-error';

  const openCreate = () => { setEditingId(null); setForm({ name: '', email: '', status: 'active' }); setFormOpen(true); };
  const openEdit = (m: Merchant) => { setEditingId(m.id); setForm({ name: m.name || '', email: m.email || '', status: m.status || 'active' }); setFormOpen(true); };

  const validateEmail = (e?: string) => {
    if (!e) return true;
    // simple email regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  };

  const submitForm = async () => {
    const newErrors: typeof errors = {};
    if (!form.name || !form.name.trim()) newErrors.name = 'Name is required';
    if (form.email && !validateEmail(form.email)) newErrors.email = 'Invalid email';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fix form errors');
      return;
    }

    setSubmitLoading(true);
    try {
      if (editingId) {
        const res = await client.apiCall.invoke({ url: `/api/v1/merchants/${editingId}`, method: 'PUT', data: form });
        if (res.data?.success) toast.success('Merchant updated'); else toast.error(res.data?.message || 'Update failed');
      } else {
        const res = await client.apiCall.invoke({ url: '/api/v1/merchants', method: 'POST', data: form });
        if (res.data?.success) toast.success('Merchant created'); else toast.error(res.data?.message || 'Create failed');
      }
      setFormOpen(false);
      fetchMerchants();
    } catch (err) { console.warn(err); toast.error('Request failed'); }
    setSubmitLoading(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Merchants</h1>
          <div className="flex items-center gap-3">
            <Input placeholder="Search merchants" aria-label="Search merchants" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button onClick={handleSearch}>Search</Button>
            <Button onClick={openCreate} variant="secondary">Create</Button>
          </div>
        </div>

        <Card>
          <div className="p-4">
            {loading && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && merchants.length === 0 && (
              <p className="text-sm text-muted-foreground">No merchants found.</p>
            )}

            {!loading && merchants.length > 0 && (
              <div className="overflow-x-auto">
                <table id="merchants-table" className="modern-table w-full" role="table" aria-label="Merchants list">
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
                        onClick={() => handleSort('status')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('status'); } }}
                        aria-sort={sortField === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer focus:ring-2 focus:ring-brandblue-500 focus:ring-offset-1"
                      >Status</th>
                      <th className="text-right"
                        tabIndex={0}
                        role="button"
                        onClick={() => handleSort('balance')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('balance'); } }}
                        aria-sort={sortField === 'balance' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer focus:ring-2 focus:ring-brandblue-500 focus:ring-offset-1 text-right"
                      >Balance</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchants.map((m) => (
                      <tr key={m.id}>
                        <td>{m.id}</td>
                        <td>{m.name}{m.email ? ` — ${m.email}` : ''}</td>
                        <td>{m.status || 'unknown'}</td>
                        <td className="text-right">{m.balance != null ? `₱ ${fmt(m.balance)}` : '-'}</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" aria-label={`View merchant ${m.id}`} onClick={() => { setSelected(m); }}>View</Button>
                            <Button size="sm" aria-label={`Edit merchant ${m.id}`} onClick={() => openEdit(m)}>Edit</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-sm text-muted-foreground" aria-live="polite">Showing {merchants.length} of {total} merchants</div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end">
              <Pagination aria-label="merchants-pagination">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink as="button" onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                      Prev
                    </PaginationLink>
                  </PaginationItem>
                  {Array.from({ length: Math.max(1, Math.ceil(total / perPage)) }).slice(Math.max(0, page - 4), page + 3).map((_, i) => {
                    const pIdx = i + Math.max(1, page - 3);
                    return (
                      <PaginationItem key={pIdx}>
                        <PaginationLink isActive={pIdx === page} as="button" onClick={() => setPage(pIdx)} aria-label={`Go to page ${pIdx}`} aria-current={pIdx === page ? 'page' : undefined}>
                          {pIdx}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationLink as="button" onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                      Next
                    </PaginationLink>
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
              <DialogTitle className="text-2xl font-black">{editingId ? 'Edit Merchant' : 'Create Merchant'}</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div>
                <Input placeholder="Name" value={form.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? nameErrorId : undefined} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                {errors.name && <div id={nameErrorId} className="text-sm text-rose-400 mt-1">{errors.name}</div>}
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
                  {submitLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{editingId ? 'Saving...' : 'Creating...'}</> : (editingId ? 'Save' : 'Create')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
