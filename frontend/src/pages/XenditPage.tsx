import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, Wallet, Calculator, ArrowUpRight, DollarSign,
  ShieldCheck, Zap, Info, Clock, RefreshCw, BarChart3, Building2,
  Smartphone, FileText, QrCode, Send
} from 'lucide-react';
import Layout from '@/components/Layout';
import { fmtCurrencyPhp } from '@/lib/format';

export default function XenditPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/xendit/balance', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase flex items-center gap-4">
               <div className="h-14 w-14 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20 shadow-inner">
                 <Building2 className="h-8 w-8 text-brandblue-600" />
               </div>
               Core Infrastructure
            </h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Maya Business Cloud Node (Cluster-PH1)</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="fintech-badge bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-6 py-2.5 backdrop-blur-md shadow-sm">
               <Zap className="h-4 w-4 mr-2 inline animate-pulse" /> CLUSTER_ONLINE
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            {/* Live Liquidity Card */}
            <div className="fintech-gradient-card bg-brandblue-600 p-12 shadow-2xl shadow-brandblue-500/30 group">
               <div className="absolute -right-20 -bottom-20 opacity-10 group-hover:scale-110 transition-transform duration-1000 pointer-events-none"><Wallet className="h-64 w-64 text-white" /></div>
               <div className="relative z-10 space-y-10">
                  <div className="flex items-center justify-between">
                    <div className="space-y-4">
                      <p className="text-[11px] font-black text-brandblue-100 uppercase tracking-[0.4em]">Live Gateway Liquidity</p>
                      <h2 className="text-6xl font-black text-white tracking-tighter tabular-nums">
                        {loading ? '₱ --.--' : fmtCurrencyPhp(balance)}
                      </h2>
                    </div>
                    <div className="h-20 w-20 rounded-[1.5rem] bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                      <CreditCard className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Button onClick={fetchBalance} className="bg-white text-brandblue-600 hover:bg-brandblue-50 font-black rounded-2xl h-16 uppercase text-[11px] tracking-widest px-10 shadow-2xl active:scale-95 transition-all">
                      <RefreshCw className={`h-5 w-5 mr-3 ${loading ? 'animate-spin' : ''}`} /> Force Node Sync
                    </Button>
                    <div className="flex items-center gap-3 px-6 py-3 bg-black/20 rounded-2xl backdrop-blur-3xl border border-white/10 shadow-inner">
                       <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                       <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Operational_Node_PH_Alpha</span>
                    </div>
                  </div>
               </div>
            </div>

            {/* Fee Schedule */}
            <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
               <CardHeader className="p-10 border-b border-border/10">
                 <div className="flex items-center gap-5">
                   <div className="h-12 w-12 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20 shadow-inner">
                      <Calculator className="h-6 w-6 text-brand-blue-600" />
                   </div>
                   <div>
                      <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Economic configuration</CardTitle>
                      <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/90 mt-1">Standard processing parameters for local transactions</CardDescription>
                   </div>
                 </div>
               </CardHeader>
               <CardContent className="p-0 bg-card">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="modern-table">
                       <thead>
                         <tr className="bg-[#0A0F1E]">
                           <th className="px-10 py-8 text-white/60 border-white/5 uppercase tracking-[0.4em]">Channel Protocol</th>
                           <th className="px-10 py-8 text-white/60 border-white/5 uppercase tracking-[0.4em]">MDR Basis</th>
                           <th className="px-10 py-8 text-white/60 border-white/5 uppercase tracking-[0.4em]">Base Surcharge</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border/10">
                          {[
                            { group: 'E-Invoices / Cards', rate: '2.8%', fixed: '₱0.00', icon: FileText, color: 'text-brandblue-500', bg: 'bg-brandblue-500/10' },
                            { group: 'InstaPay / QRPH', rate: '0.7%', fixed: '₱0.00', icon: QrCode, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                            { group: 'E-Wallets (GCASH/MAYA)', rate: '2.0%', fixed: '₱0.00', icon: Smartphone, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                            { group: 'Virtual Accounts', rate: '0.0%', fixed: '₱25.00', icon: Building2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { group: 'Payouts / Disburse', rate: '0.0%', fixed: '₱25.00', icon: Send, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                          ].map(row => (
                            <tr key={row.group} className="group hover:bg-muted/10 transition-all duration-500">
                               <td className="px-10 py-8">
                                 <div className="flex items-center gap-5">
                                   <div className={`h-12 w-12 rounded-2xl ${row.bg} flex items-center justify-center border border-black/5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-sm`}>
                                      <row.icon className={`h-6 w-6 ${row.color}`} />
                                   </div>
                                   <span className="text-sm font-black text-foreground uppercase tracking-tight">{row.group}</span>
                                 </div>
                               </td>
                                 <td className="px-10 py-8 text-sm font-black text-brandblue-600 tracking-widest">{row.rate}</td>
                                   <td className="px-10 py-8 text-sm font-black text-muted-foreground/80 tracking-widest uppercase">{row.fixed}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
               </CardContent>
            </Card>
          </div>

          <div className="space-y-10">
             <Card className="fintech-card border-0 shadow-2xl bg-[#0A0F1E] border-white/5">
                <CardHeader className="p-8 border-b border-white/5"><CardTitle className="text-[11px] font-black text-white/60 uppercase tracking-[0.4em]">Grid Health</CardTitle></CardHeader>
                <CardContent className="space-y-8 p-8">
                   {[
                     { label: 'API Endpoint v4', status: 'OPTIMAL', color: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' },
                     { label: 'Webhook Relay Node', status: 'VERIFIED', color: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' },
                     { label: 'Settlement Kernel', status: 'STANDBY', color: 'bg-brandblue-400 shadow-[0_0_10px_rgba(0,122,255,0.5)]' },
                   ].map(item => (
                     <div key={item.label} className="flex items-center justify-between group/h">
                        <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{item.label}</span>
                        <div className="flex items-center gap-3">
                           <span className="text-[9px] font-black uppercase tracking-widest text-white/60 group-hover/h:text-white/60 transition-colors">{item.status}</span>
                           <div className={`h-2 w-2 rounded-full ${item.color} group-hover/h:scale-125 transition-transform`} />
                        </div>
                     </div>
                   ))}
                </CardContent>
             </Card>

             <Card className="fintech-card border-0 shadow-2xl bg-card/60 backdrop-blur-sm">
                <CardHeader className="p-8 border-b border-border/10"><CardTitle className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.4em]">Cluster Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-8 p-8">
                   <div className="flex items-center gap-6 group/m">
                      <div className="h-16 w-16 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border-2 border-brandblue-500/20 text-brandblue-600 shadow-xl transition-all group-hover/m:scale-110 group-hover/m:rotate-3"><BarChart3 className="h-8 w-8" /></div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-[0.2em]">MTD Transmission</p>
                        <p className="text-xl font-black text-foreground tracking-tighter tabular-nums">₱ 142,500.00</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-6 group/m">
                      <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-500/20 text-emerald-600 shadow-xl transition-all group-hover/m:scale-110 group-hover/m:-rotate-3"><Clock className="h-8 w-8" /></div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-[0.2em]">AVG_RESPONSE_TIME</p>
                        <p className="text-xl font-black text-foreground tracking-tighter tabular-nums">1.4 SECONDS</p>
                      </div>
                   </div>
                </CardContent>
             </Card>

             <div className="p-10 rounded-[3rem] border-2 border-dashed border-border/60 flex flex-col items-center text-center space-y-6 bg-muted/5 group hover:bg-muted/10 transition-all duration-1000">
                <div className="h-20 w-20 rounded-[2.5rem] bg-muted flex items-center justify-center text-muted-foreground/60 group-hover:scale-110 transition-transform duration-700 shadow-inner"><Info className="h-10 w-10" /></div>
                <div className="space-y-3">
                   <p className="text-base font-black text-foreground/60 uppercase tracking-widest">Compliance Protocol</p>
                   <p className="text-[10px] text-muted-foreground/60 font-black uppercase leading-relaxed tracking-widest px-4">
                      Direct node-level monitoring of underlying payment protocols. Production keys managed via high-security encrypted HSM vault.
                   </p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
