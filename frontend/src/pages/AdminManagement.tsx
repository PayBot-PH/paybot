import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Loader2,
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
  const { isSuperAdmin, user } = useAuth();
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
      if (res.ok) {
        const data = await res.json();
        setAdmins(Array.isArray(data) ? data : []);
      }
    } catch {
      setAdmins([]);
    } finally {
      setLoading(false);
    }
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
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase flex items-center gap-4">
               <div className="h-14 w-14 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20 shadow-inner">
                 <ShieldCheck className="h-8 w-8 text-brandblue-600" />
               </div>
               Security Kernel
            </h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Identity & Access Management (IAM)</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isSuperAdmin && (
              <Button
                onClick={() => setShowAdd(!showAdd)}
                className={`h-14 px-8 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl transition-all active:scale-95 border-2 ${
                  showAdd
                  ? 'bg-[#0A0F1E] border-white/10 text-white'
                  : 'bg-brandblue-600 hover:bg-brandblue-700 text-white border-brandblue-500/20'
                }`}
              >
                {showAdd ? <X className="h-5 w-5 mr-3" /> : <Plus className="h-5 w-5 mr-3" />}
                {showAdd ? 'ABORT_OPERATION' : 'REGISTER_NODE_ADMIN'}
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)} className="space-y-10">
           <TabsList className="bg-[#0A0F1E] border border-white/5 p-1.5 h-auto flex-wrap sm:inline-flex gap-2 rounded-[1.5rem] shadow-2xl">
             {[
               { id: 'admins', icon: ShieldCheck, label: 'Kernel_Admins', color: 'text-brandblue-500' },
               { id: 'users', icon: Users, label: 'Cloud_Users', color: 'text-cyan-500' },
               { id: 'keys', icon: Key, label: 'Access_Vault', color: 'text-amber-500', super: true },
               { id: 'wallets', icon: Database, label: 'Ledger_Audits', color: 'text-emerald-500', super: true },
             ].map(t => (!t.super || isSuperAdmin) && (
               <TabsTrigger key={t.id} value={t.id} className="rounded-xl py-3.5 px-8 data-[state=active]:bg-white/10 data-[state=active]:text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all text-white/30 border border-transparent data-[state=active]:border-white/10">
                 <t.icon className={`h-4 w-4 mr-3 ${t.color}`} /> {t.label}
               </TabsTrigger>
             ))}
           </TabsList>

           <TabsContent value="admins" className="mt-0 space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
              {showAdd && isSuperAdmin && (
                <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
                   <div className="h-2.5 bg-brandblue-500 w-full shadow-[0_0_15px_rgba(0,122,255,0.4)]" />
                   <CardHeader className="p-10 border-b border-border/10">
                     <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-4">
                       <UserPlus className="h-7 w-7 text-brand-blue-600" />
                       Administrative Onboarding
                     </CardTitle>
                     <CardDescription className="font-black text-[10px] uppercase tracking-widest text-muted-foreground/40 mt-2">Initialize new node supervisor credentials</CardDescription>
                   </CardHeader>
                   <CardContent className="p-10 space-y-10">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                         <div className="space-y-4">
                           <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Telegram Identifier</Label>
                           <Input placeholder="UID_64BIT" value={form.telegram_id} onChange={e => setForm(f => ({...f, telegram_id: e.target.value}))} className="h-16 bg-muted/20 border-border/40 font-mono font-black rounded-2xl px-6 border-2 shadow-inner" />
                         </div>
                         <div className="space-y-4">
                           <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Username Hub</Label>
                           <Input placeholder="@HANDLE" value={form.telegram_username} onChange={e => setForm(f => ({...f, telegram_username: e.target.value}))} className="h-16 bg-muted/20 border-border/40 font-black rounded-2xl px-6 uppercase border-2 shadow-inner" />
                         </div>
                         <div className="space-y-4">
                           <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Full Legal Alias</Label>
                           <Input placeholder="ENTITY_NAME" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="h-16 bg-muted/20 border-border/40 font-black rounded-2xl px-6 uppercase border-2 shadow-inner" />
                         </div>
                      </div>
                      <div className="space-y-6">
                         <p className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 ml-1">Privilege Allocation Protocol</p>
                         <div className="flex flex-wrap gap-3">
                            <button onClick={() => setForm(f => ({...f, is_super_admin: !f.is_super_admin}))} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-500 flex items-center gap-3 ${form.is_super_admin ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-muted/10 border-border/40 text-muted-foreground/60 hover:bg-muted/20'}`}>
                              <Crown className="h-4 w-4" /> SUPER_USER
                            </button>
                            {PERMISSION_KEYS.map(p => (
                              <button key={p.key} onClick={() => setForm(f => ({...f, [p.key]: !f[p.key as any]}))} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all duration-500 ${form[p.key as any] ? 'bg-brandblue-600 border-brandblue-600 text-white shadow-lg shadow-brandblue-500/20' : 'bg-muted/10 border-border/40 text-muted-foreground/60 hover:bg-muted/20'}`}>
                                {p.label.toUpperCase()}
                              </button>
                            ))}
                         </div>
                      </div>
                      <Button onClick={handleAdd} disabled={saving} className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-[2rem] uppercase tracking-[0.4em] shadow-2xl shadow-brandblue-500/30 active:scale-95 transition-all text-sm group">
                        {saving ? <Loader2 className="h-7 w-7 animate-spin mr-3" /> : <><ShieldCheck className="h-7 w-7 mr-4 group-hover:scale-110 transition-transform" /> AUTHORIZE_NODE_LEVEL_ACCESS</>}
                      </Button>
                   </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {Array.isArray(admins) && admins.map(admin => (
                  <Card key={admin.id} className={`fintech-card border-0 shadow-2xl overflow-hidden bg-card transition-all duration-700 relative group ${!admin.is_active && 'opacity-50 grayscale scale-[0.98]'}`}>
                    {admin.is_super_admin && <div className="absolute top-0 right-0 px-6 py-1.5 bg-amber-400 text-amber-950 font-black text-[9px] uppercase tracking-[0.3em] rounded-bl-[1.5rem] shadow-xl z-20">SYSTEM_ROOT</div>}
                    <CardContent className="p-10">
                      <div className="flex items-center gap-6 mb-10">
                        <div className={`h-20 w-20 rounded-[1.5rem] flex items-center justify-center border-2 shadow-2xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 ${admin.is_super_admin ? 'bg-amber-500/10 border-amber-400/30 text-amber-500' : 'bg-brandblue-500/10 border-brandblue-500/20 text-brandblue-600'}`}>
                           {admin.is_super_admin ? <Crown className="h-10 w-10 animate-float" /> : <ShieldCheck className="h-10 w-10" />}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-lg font-black text-foreground uppercase tracking-tight truncate group-hover:text-brandblue-600 transition-colors">{admin.name || 'ANONYMOUS_KERNEL'}</p>
                          <p className="text-[11px] font-black text-muted-foreground/40 tracking-[0.2em] uppercase">ID: {admin.telegram_id}</p>
                          <div className="flex items-center gap-2 pt-1">
                             <div className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                             <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">@{admin.telegram_username || 'NO_ALIAS'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          <button onClick={() => handleToggleActive(admin)} className={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 transition-all active:scale-90 shadow-lg ${admin.is_active ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}>
                            {admin.is_active ? <PowerOff className="h-5 w-5" /> : <Power className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6 pt-10 border-t border-border/10">
                         <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.4em] ml-1">Assigned Permissions</p>
                         <div className="flex flex-wrap gap-2">
                            {Array.isArray(PERMISSION_KEYS) && PERMISSION_KEYS.map(p => {
                              const has = admin[p.key as keyof AdminUser] as boolean;
                              return (
                                <button
                                  key={p.key}
                                  onClick={() => handleTogglePermission(admin, p.key)}
                                  disabled={!isSuperAdmin || admin.telegram_id === user?.id}
                                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all duration-300 ${has ? 'bg-brandblue-500/10 text-brandblue-600 border-brandblue-500/20 shadow-sm' : 'bg-muted/30 text-muted-foreground/30 border-transparent hover:border-border/40'}`}
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

           <TabsContent value="users" className="mt-0 animate-in fade-in slide-in-from-top-4 duration-500">
              <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60">
                <CardHeader className="p-10 border-b border-border/10 bg-[#0A0F1E]">
                  <CardTitle className="text-xl font-black uppercase tracking-tight text-white/80">Cloud Infrastructure Registrations</CardTitle>
                  <CardDescription className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Merchant accounts with verified dashboard access</CardDescription>
                </CardHeader>
                <CardContent className="p-0 bg-card">
                   <div className="flex flex-col items-center justify-center py-48 text-center space-y-8 px-10">
                      <div className="h-24 w-24 rounded-[2.5rem] bg-muted/20 flex items-center justify-center shadow-inner border border-border/10 opacity-20">
                         <Users className="h-12 w-12" />
                      </div>
                      <div className="space-y-2">
                         <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Zero Record set</h3>
                         <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">No external merchant identity detected on this node</p>
                      </div>
                   </div>
                </CardContent>
              </Card>
           </TabsContent>

           <TabsContent value="keys" className="mt-0 animate-in fade-in slide-in-from-top-4 duration-500">
              <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60">
                <CardHeader className="p-10 border-b border-border/10 bg-[#0A0F1E]">
                  <CardTitle className="text-xl font-black uppercase tracking-tight text-white/80">API Vault & Access Keys</CardTitle>
                  <CardDescription className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Encrypted credential storage for external gateway nodes</CardDescription>
                </CardHeader>
                <CardContent className="p-0 bg-card">
                   <div className="flex flex-col items-center justify-center py-48 text-center space-y-8 px-10">
                      <div className="h-24 w-24 rounded-[2.5rem] bg-muted/20 flex items-center justify-center shadow-inner border border-border/10 opacity-20">
                         <Key className="h-12 w-12" />
                      </div>
                      <div className="space-y-2">
                         <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Vault Locked</h3>
                         <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">No external API credentials configured in the secure storage</p>
                      </div>
                   </div>
                </CardContent>
              </Card>
           </TabsContent>

           <TabsContent value="wallets" className="mt-0 animate-in fade-in slide-in-from-top-4 duration-500">
              <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60">
                <CardHeader className="p-10 border-b border-border/10 bg-[#0A0F1E]">
                  <CardTitle className="text-xl font-black uppercase tracking-tight text-white/80">System-Wide Ledger Audit</CardTitle>
                  <CardDescription className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Global liquidity overview across all merchant nodes</CardDescription>
                </CardHeader>
                <CardContent className="p-0 bg-card">
                   <div className="flex flex-col items-center justify-center py-48 text-center space-y-8 px-10">
                      <div className="h-24 w-24 rounded-[2.5rem] bg-muted/20 flex items-center justify-center shadow-inner border border-border/10 opacity-20">
                         <Database className="h-12 w-12" />
                      </div>
                      <div className="space-y-2">
                         <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter">Zero Balance Detected</h3>
                         <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">No active ledger entries found in the audit trail</p>
                      </div>
                   </div>
                </CardContent>
              </Card>
           </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
