import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Zap,
  ChevronDown,
  Clock,
  Mail,
  Wallet as WalletIcon,
  DollarSign,
  RefreshCw,
  Wrench,
  Key,
  Database,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmt, fmtUsd } from '@/lib/format';

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

type AdminTab = 'admins' | 'users' | 'keys' | 'wallets';

const PERMISSION_KEYS: { key: keyof AdminUser; label: string; color: string }[] = [
  { key: 'can_manage_payments', label: 'Payments', color: 'brand-blue' },
  { key: 'can_manage_disbursements', label: 'Payouts', color: 'emerald' },
  { key: 'can_view_reports', label: 'Reports', color: 'amber' },
  { key: 'can_manage_wallet', label: 'Wallet', color: 'indigo' },
  { key: 'can_manage_transactions', label: 'Ledger', color: 'cyan' },
  { key: 'can_manage_bot', label: 'Bot Ops', color: 'violet' },
  { key: 'can_approve_topups', label: 'Topups', color: 'teal' },
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

export default function AdminManagement() {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('admins');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(defaultForm);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin-users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setAdmins(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchMaintenance = async () => {
    try {
      const res = await fetch('/api/v1/app-settings/maintenance');
      if (res.ok) { const d = await res.json(); setMaintenanceMode(!!d.maintenance_mode); }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchAdmins();
    fetchMaintenance();
  }, []);

  const handleToggleActive = async (admin: AdminUser) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ is_active: !admin.is_active }),
      });
      if (res.ok) { toast.success(`Admin ${admin.is_active ? 'deactivated' : 'activated'}`); fetchAdmins(); }
    } catch { toast.error('Failed'); }
  };

  const handleTogglePermission = async (admin: AdminUser, key: keyof AdminUser) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch(`/api/v1/admin-users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ [key]: !admin[key] }),
      });
      if (res.ok) { toast.success('Permission updated'); fetchAdmins(); }
    } catch { toast.error('Update failed'); }
  };

  const handleAdd = async () => {
    if (!form.telegram_id.trim()) { toast.error('Telegram ID is required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(form),
      });
      if (res.ok) { toast.success('Admin added!'); setForm(defaultForm); setShowAdd(false); fetchAdmins(); }
      else { const d = await res.json(); toast.error(d.detail || 'Failed'); }
    } catch { toast.error('Error'); } finally { setSaving(false); }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Security Kernel</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Manage infrastructure access and administrative permissions</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                onClick={() => setShowAdd(!showAdd)}
                className={`${showAdd ? 'bg-muted text-foreground' : 'bg-brand-blue-500 text-white shadow-brand-blue-500/20'} font-black text-[10px] uppercase tracking-widest h-10 px-6 rounded-xl shadow-lg transition-all active:scale-95`}
              >
                {showAdd ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {showAdd ? 'Abort' : 'Register Admin'}
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)} className="space-y-8">
           <TabsList className="bg-muted/50 border border-border/60 p-1 h-auto flex-wrap sm:inline-flex gap-1 rounded-xl">
             <TabsTrigger value="admins" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[10px] uppercase tracking-widest">
               <ShieldCheck className="h-3.5 w-3.5 mr-2 text-brand-blue-500" /> Admins
             </TabsTrigger>
             <TabsTrigger value="users" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[10px] uppercase tracking-widest">
               <Users className="h-3.5 w-3.5 mr-2 text-cyan-500" /> Web Users
             </TabsTrigger>
             {isSuperAdmin && (
               <>
                 <TabsTrigger value="keys" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[10px] uppercase tracking-widest">
                   <Key className="h-3.5 w-3.5 mr-2 text-amber-500" /> API Keys
                 </TabsTrigger>
                 <TabsTrigger value="wallets" className="rounded-lg py-2 px-5 data-[state=active]:bg-card data-[state=active]:shadow-sm font-black text-[10px] uppercase tracking-widest">
                   <Database className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Ledger Audits
                 </TabsTrigger>
               </>
             )}
           </TabsList>

           <TabsContent value="admins" className="mt-0 space-y-6">
              {showAdd && isSuperAdmin && (
                <Card className="border-brand-blue-500/20 bg-brand-blue-50/10 shadow-xl overflow-hidden animate-in zoom-in-95">
                   <div className="h-1 bg-brand-blue-500 w-full" />
                   <CardHeader>
                     <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                       <UserPlus className="h-5 w-5 text-brand-blue-500" />
                       Administrative Onboarding
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Telegram ID</Label>
                           <Input placeholder="e.g. 123456789" value={form.telegram_id} onChange={e => setForm(f => ({...f, telegram_id: e.target.value}))} className="h-12 bg-muted/20 border-border/60 font-mono font-black rounded-xl" />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Username</Label>
                           <Input placeholder="@handle" value={form.telegram_username} onChange={e => setForm(f => ({...f, telegram_username: e.target.value}))} className="h-12 bg-muted/20 border-border/60 font-bold rounded-xl" />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                           <Input placeholder="John Doe" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="h-12 bg-muted/20 border-border/60 font-bold rounded-xl" />
                         </div>
                      </div>
                      <div className="space-y-4">
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Privilege Allocation</p>
                         <div className="flex flex-wrap gap-2">
                            <button onClick={() => setForm(f => ({...f, is_super_admin: !f.is_super_admin}))} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${form.is_super_admin ? 'bg-amber-500 border-amber-500 text-white' : 'bg-card border-border/60 text-muted-foreground'}`}>
                              <Crown className="h-3 w-3 inline mr-1.5" /> Super User
                            </button>
                            {PERMISSION_KEYS.map(p => (
                              <button key={p.key} onClick={() => setForm(f => ({...f, [p.key]: !f[p.key as any]}))} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${form[p.key as any] ? 'bg-brand-blue-500 border-brand-blue-500 text-white' : 'bg-card border-border/60 text-muted-foreground'}`}>
                                {p.label}
                              </button>
                            ))}
                         </div>
                      </div>
                      <Button onClick={handleAdd} disabled={saving} className="w-full h-14 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-lg shadow-brand-blue-500/20 active:scale-95 transition-all">
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Authorize Infrastructure Access'}
                      </Button>
                   </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {admins.map(admin => (
                  <Card key={admin.id} className={`border-border/60 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden ${!admin.is_active && 'opacity-60 grayscale'}`}>
                    {admin.is_super_admin && <div className="absolute top-0 right-0 p-1 bg-amber-400 text-amber-950 font-black text-[8px] px-3 uppercase tracking-tighter rounded-bl-xl shadow-sm z-10">Root</div>}
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4 mb-6">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 ${admin.is_super_admin ? 'bg-amber-50 border-amber-400/30 text-amber-600' : 'bg-brand-blue-50 border-brand-blue-400/30 text-brand-blue-600'}`}>
                           {admin.is_super_admin ? <Crown className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground uppercase tracking-tight truncate">{admin.name || 'Anonymous Kernel'}</p>
                          <p className="text-[11px] font-bold text-muted-foreground tracking-tighter uppercase">@{admin.telegram_username || admin.telegram_id}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          <button onClick={() => handleToggleActive(admin)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${admin.is_active ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'}`}>
                            {admin.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                         <div className="flex flex-wrap gap-1.5">
                            {PERMISSION_KEYS.map(p => {
                              const has = admin[p.key as keyof AdminUser] as boolean;
                              return (
                                <button
                                  key={p.key}
                                  onClick={() => handleTogglePermission(admin, p.key)}
                                  disabled={!isSuperAdmin || admin.telegram_id === user?.id}
                                  className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${has ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground/40 border-border/40'}`}
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
           </TabsContent>

           <TabsContent value="users" className="mt-0">
              <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-tight">Active Registrations</CardTitle>
                  <CardDescription className="text-xs font-medium">Merchant accounts with cloud dashboard access</CardDescription>
                </CardHeader>
                <CardContent className="p-0 border-t border-border/40">
                   <div className="flex flex-col items-center justify-center py-32 text-muted-foreground italic text-sm">
                      No web user records found.
                   </div>
                </CardContent>
              </Card>
           </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
