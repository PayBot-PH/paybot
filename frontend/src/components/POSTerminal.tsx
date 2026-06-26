import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, Plus,
  Smartphone, ShieldCheck, Zap, ChevronRight, Activity, Terminal as TerminalIcon,
  Globe, Lock, Cpu
} from 'lucide-react';
import { fmtCurrencyPhp } from '@/lib/format';

const transactionSchema = z.object({
  description: z.string().min(1, 'Description required'),
  amount: z.number().positive('Amount must be positive'),
  payment_method: z.enum(['maya', 'card', 'gcash', 'grabpay']),
  customer_name: z.string().optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface Terminal {
  id: number;
  terminal_code: string;
  terminal_name: string;
  status: string;
  is_active: boolean;
  location: string;
  enabled_payment_methods: string[];
}

interface Transaction {
  id: number;
  order_id: string;
  description: string;
  amount: number;
  payment_method: string;
  status: string;
  customer_name: string;
  created_at: string;
  payment_url: string;
}

const api = {
  getTerminals: async () => {
    const response = await fetch('/api/v1/pos-terminals/', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch terminals');
    return response.json();
  },

  getTransactions: async (terminalId: number) => {
    const response = await fetch(`/api/v1/pos-terminals/${terminalId}/transactions`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  },

  createTransaction: async (terminalId: number, data: TransactionFormData) => {
    const response = await fetch(`/api/v1/pos-terminals/${terminalId}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create transaction');
    return response.json();
  },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variants: Record<string, { icon: React.ReactNode; color: string }> = {
    completed: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    pending: { icon: <Clock className="w-3 h-3" />, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    failed: { icon: <XCircle className="w-3 h-3" />, color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
    active: { icon: <CheckCircle2 className="w-3 h-3" />, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    inactive: { icon: <XCircle className="w-3 h-3" />, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
  };

  const variant = variants[status] || { icon: null, color: 'bg-slate-500/10 text-slate-500' };

  return (
    <Badge className={`flex items-center gap-1.5 px-3 py-1 text-[9px] font-black uppercase tracking-widest border ${variant.color} rounded-full`}>
      {variant.icon}
      {status}
    </Badge>
  );
};

const CreateTransactionForm: React.FC<{ terminalId: number; onSuccess: () => void }> = ({
  terminalId,
  onSuccess,
}) => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: 0,
      payment_method: 'card',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TransactionFormData) => api.createTransaction(terminalId, data),
    onSuccess: (data) => {
      if (data.success && data.checkout_url) {
        window.open(data.checkout_url, '_blank');
        onSuccess();
      }
    },
  });

  const amount = watch('amount');

  return (
    <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6 pt-4">
      <div className="space-y-3">
        <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Specification</Label>
        <Input {...register('description')} placeholder="ITEM_DESCRIPTOR" className="bg-muted/20 border-border/40 h-14 rounded-xl px-4 font-black uppercase tracking-widest border-2" />
        {errors.description && <span className="text-rose-500 text-[10px] font-black uppercase">{errors.description.message}</span>}
      </div>

      <div className="space-y-3">
        <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Quota (PHP)</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brandblue-500 font-black">₱</span>
          <Input
            {...register('amount', { valueAsNumber: true })}
            type="number"
            step="0.01"
            className="pl-8 h-14 bg-muted/20 border-border/40 text-xl font-black rounded-xl tabular-nums border-2"
          />
        </div>
        {errors.amount && <span className="text-rose-500 text-[10px] font-black uppercase">{errors.amount.message}</span>}
      </div>

      <div className="space-y-3">
        <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Node Method</Label>
        <select {...register('payment_method')} className="w-full h-14 bg-muted/20 border-border/40 rounded-xl px-4 font-black uppercase tracking-widest border-2 focus:ring-brandblue-500/20">
          <option value="card">MAYA_CARD_NODE</option>
          <option value="maya">MAYA_WALLET_DIRECT</option>
          <option value="gcash">GCASH_QR_PH</option>
          <option value="grabpay">GRABPAY_HUB</option>
        </select>
      </div>

      <Button type="submit" className="w-full h-16 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-2xl shadow-xl shadow-brandblue-500/20 transition-all active:scale-95 uppercase tracking-[0.3em]" disabled={createMutation.isPending}>
        {createMutation.isPending ? (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 animate-spin" />
            SYNCHRONIZING...
          </div>
        ) : `COMMIT_ORDER (₱${amount.toFixed(2)})`}
      </Button>
    </form>
  );
};

const TerminalCard: React.FC<{ terminal: Terminal }> = ({ terminal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const transactionsQuery = useQuery({
    queryKey: ['transactions', terminal.id],
    queryFn: () => api.getTransactions(terminal.id),
    enabled: isOpen,
  });

  return (
    <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/40 backdrop-blur-sm group">
      <div className="h-2 bg-brandblue-500 w-full group-hover:h-3 transition-all" />
      <CardHeader className="bg-[#0A0F1E] p-8 border-b border-white/5">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20 shadow-inner">
                <TerminalIcon className="h-5 w-5 text-brandblue-500" />
              </div>
              <CardTitle className="text-xl font-black text-white uppercase tracking-tight">{terminal.terminal_name}</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <code className="text-[9px] font-black text-brandblue-400 bg-brandblue-500/5 px-2 py-1 rounded border border-brandblue-500/10 tracking-[0.2em]">{terminal.terminal_code}</code>
              <span className="text-[9px] font-black text-white/60 uppercase tracking-widest flex items-center gap-1.5">
                <Globe className="h-3 w-3" /> {terminal.location || 'GLOBAL_NODE'}
              </span>
            </div>
          </div>
          <StatusBadge status={terminal.is_active ? 'active' : 'inactive'} />
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="bg-[#0A0F1E] rounded-xl p-1.5 border border-white/5 w-full grid grid-cols-2 h-auto mb-8">
            <TabsTrigger value="transactions" className="rounded-lg py-3 font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-white/10 data-[state=active]:text-white">OPERATIONS</TabsTrigger>
            <TabsTrigger value="new" className="rounded-lg py-3 font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-white/10 data-[state=active]:text-white">EMIT_SIGNAL</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            {transactionsQuery.isLoading ? (
               <div className="py-12 flex flex-col items-center gap-4 opacity-20">
                  <Activity className="h-10 w-10 animate-pulse text-brandblue-500" />
                  <span className="text-[9px] font-black uppercase tracking-[0.4em]">Aggregating_Logs...</span>
               </div>
            ) : Array.isArray(transactionsQuery.data?.data) && transactionsQuery.data.data.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {transactionsQuery.data.data.map((txn: Transaction) => (
                  <div key={txn.id} className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-2xl p-5 flex justify-between items-center transition-all group/txn">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-black text-white uppercase tracking-tight group-hover/txn:text-brandblue-400 transition-colors">{txn.description}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-black text-white tabular-nums">₱{(txn.amount / 100).toFixed(2)}</p>
                        <span className="h-1 w-1 rounded-full bg-white/10" />
                        <p className="text-[9px] font-black text-white/60 tracking-widest uppercase">
                          {new Date(txn.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={txn.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center space-y-4 opacity-20">
                 <ShieldCheck className="h-12 w-12 mx-auto" />
                 <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero_Transmission_History</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="new">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="w-full h-16 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl border border-white/10 uppercase tracking-[0.4em] group">
                  <Plus className="w-5 h-5 mr-3 group-hover:scale-125 transition-transform" />
                  INIT_PAYMENT_NODE
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-[#0A0F1E] border-white/10 rounded-[2.5rem] shadow-3xl text-white">
                  <DialogHeader className="space-y-3">
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brandblue-500/20 flex items-center justify-center border border-brandblue-500/40">
                      <Zap className="h-6 w-6 text-brandblue-400" />
                    </div>
                    Create_Payment_Order
                  </DialogTitle>
                  <DialogDescription className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">
                    Deploying encrypted order to node: <span className="text-brandblue-400">{terminal.terminal_name}</span>
                  </DialogDescription>
                </DialogHeader>
                <CreateTransactionForm
                  terminalId={terminal.id}
                  onSuccess={() => {
                    setIsOpen(false);
                    transactionsQuery.refetch();
                  }}
                />
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export const POSTerminalDashboard: React.FC = () => {
  const terminalsQuery = useQuery({
    queryKey: ['terminals'],
    queryFn: api.getTerminals,
  });

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div className="space-y-3">
          <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase">Terminal Network</h1>
          <p className="text-muted-foreground font-medium flex items-center gap-3">
             <span className="flex h-2 w-2 rounded-full bg-brandblue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)] animate-pulse" />
             <span className="uppercase tracking-[0.2em] text-[10px] font-black">Virtualized POS Infrastructure & Node Fleet</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
           <div className="fintech-badge bg-[#0A0F1E] text-white border-white/10 px-6 py-2.5 backdrop-blur-md shadow-sm group">
             <Activity className="h-4 w-4 mr-2 inline text-brandblue-400 group-hover:scale-110 transition-transform" />
             <span className="opacity-80">Network Status:</span> <span className="text-emerald-400 ml-1">ENCRYPTED_LIVE</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {[
          { icon: Cpu, label: 'Kernel Version', val: 'V4.2_LTS', color: 'text-brandblue-400' },
          { icon: Lock, label: 'Security Layer', val: 'AES_256_GCM', color: 'text-emerald-400' },
          { icon: Smartphone, label: 'Edge Devices', val: terminalsQuery.data?.data?.length || '0', color: 'text-purple-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#0A0F1E] border border-white/5 rounded-[2rem] p-8 flex items-center gap-6 shadow-xl group hover:border-white/10 transition-all">
             <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-brandblue-500/10 transition-all">
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
             </div>
             <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-1">{stat.label}</p>
                <p className="text-xl font-black text-white tracking-widest">{stat.val}</p>
             </div>
          </div>
        ))}
      </div>

      {terminalsQuery.isLoading ? (
        <div className="h-[400px] flex flex-col items-center justify-center gap-8 px-10">
          <Activity className="h-20 w-20 animate-spin text-brandblue-500 opacity-20" />
          <p className="text-[11px] font-black uppercase tracking-[0.5em] text-muted-foreground/70 animate-pulse">Synchronizing Fleet Metadata...</p>
        </div>
      ) : terminalsQuery.isError ? (
        <Card className="bg-rose-500/5 border-2 border-rose-500/20 rounded-[2.5rem] p-12 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-rose-500 mb-6" />
          <h3 className="text-xl font-black text-rose-500 uppercase tracking-tighter mb-2">Fleet Sync Error</h3>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500/40">Upstream connection failed. Check cryptographic keys.</p>
        </Card>
      ) : Array.isArray(terminalsQuery.data?.data) && terminalsQuery.data.data.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {terminalsQuery.data.data.map((terminal: Terminal) => (
            <TerminalCard key={terminal.id} terminal={terminal} />
          ))}
        </div>
      ) : (
        <Card className="fintech-card border-dashed border-2 border-border/60 min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-muted/5 rounded-[3rem] group">
          <CreditCard className="w-20 h-20 mx-auto text-muted-foreground/60 group-hover:scale-110 transition-transform duration-700 mb-8" />
          <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter mb-4">No Terminals Provisioned</h3>
          <p className="text-[11px] text-muted-foreground/70 max-w-[320px] font-black uppercase tracking-[0.3em] leading-relaxed">
            Identity does not possess active edge hardware licenses. Contact institutional support.
          </p>
        </Card>
      )}
    </div>
  );
};

export default POSTerminalDashboard;
