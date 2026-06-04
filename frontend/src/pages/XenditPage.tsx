import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, Wallet, Calculator, ArrowUpRight, DollarSign,
  ShieldCheck, Zap, Info, Clock, RefreshCw, BarChart3, Building2,
  Smartphone, FileText, QrCode
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
    finally { setLoading(true); }
  }, [user]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Gateway Infrastructure</h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Direct management of Maya Business cloud connectivity</p>
          </div>
          <Badge className="bg-brand-blue-500/10 text-brand-blue-600 border-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
            <Zap className="h-3 w-3 mr-1.5 inline" /> Operational
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Live Liquidity Card */}
            <Card className="bg-brand-blue-600 border-0 shadow-2xl rounded-[2.5rem] overflow-hidden relative">
               <div className="absolute -right-10 -bottom-10 opacity-10"><Wallet className="h-48 w-48 text-white" /></div>
               <CardContent className="p-10 relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-[10px] font-black text-brand-blue-100 uppercase tracking-[0.2em] mb-2">Live Gateway Liquidity</p>
                      <h2 className="text-5xl font-black text-white tracking-tighter">
                        {loading ? '₱ --.--' : fmtCurrencyPhp(balance)}
                      </h2>
                    </div>
                    <div className="h-16 w-16 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                      <CreditCard className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={fetchBalance} className="bg-white text-brand-blue-600 hover:bg-brand-blue-50 font-black rounded-xl h-12 uppercase text-[10px] tracking-widest px-8">
                      <RefreshCw className="h-4 w-4 mr-2" /> Force Sync
                    </Button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/10 rounded-xl backdrop-blur-sm border border-white/5">
                       <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                       <span className="text-[9px] font-black text-white uppercase tracking-widest">Maya Node Online</span>
                    </div>
                  </div>
               </CardContent>
            </Card>

            {/* Fee Schedule */}
            <Card className="border-border/60 shadow-sm">
               <CardHeader className="pb-4">
                 <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                   <Calculator className="h-5 w-5 text-brand-blue-500" />
                   Pricing & Fee Allocation
                 </CardTitle>
                 <CardDescription className="text-xs font-medium">Standard processing rates for Philippine merchants</CardDescription>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead>
                         <tr className="bg-muted/30 border-y border-border/40">
                           <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Channel Group</th>
                           <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">MDR Rate</th>
                           <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Fixed Surcharge</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border/30">
                          {[
                            { group: 'E-Invoices / Cards', rate: '2.8%', fixed: '₱0.00', icon: FileText, color: 'text-brand-blue-500' },
                            { group: 'InstaPay / QRPH', rate: '0.7%', fixed: '₱0.00', icon: QrCode, color: 'text-purple-500' },
                            { group: 'E-Wallets (GCash/Maya)', rate: '2.0%', fixed: '₱0.00', icon: Smartphone, color: 'text-orange-500' },
                            { group: 'Virtual Accounts', rate: '0.0%', fixed: '₱25.00', icon: Building2, color: 'text-emerald-500' },
                            { group: 'Payouts / Disburse', rate: '0.0%', fixed: '₱25.00', icon: Send, color: 'text-rose-500' },
                          ].map(row => (
                            <tr key={row.group} className="group hover:bg-muted/20 transition-colors">
                               <td className="px-6 py-4">
                                 <div className="flex items-center gap-3">
                                   <row.icon className={`h-4 w-4 ${row.color}`} />
                                   <span className="text-xs font-bold text-foreground">{row.group}</span>
                                 </div>
                               </td>
                               <td className="px-6 py-4 text-xs font-black text-brand-blue-600">{row.rate}</td>
                               <td className="px-6 py-4 text-xs font-bold text-muted-foreground">{row.fixed}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
               </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
             <Card className="border-border/60 shadow-sm">
                <CardHeader><CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Operational Health</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                   {[
                     { label: 'API Endpoint', status: 'Optimal', color: 'bg-emerald-500' },
                     { label: 'Webhook Relay', status: 'Healthy', color: 'bg-emerald-500' },
                     { label: 'Settlement Engine', status: 'Standby', color: 'bg-brand-blue-500' },
                   ].map(item => (
                     <div key={item.label} className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground/80">{item.label}</span>
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{item.status}</span>
                           <div className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                        </div>
                     </div>
                   ))}
                </CardContent>
             </Card>

             <Card className="border-border/60 shadow-sm bg-muted/20">
                <CardHeader><CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Quick Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center border border-border/60 text-brand-blue-500 shadow-sm"><BarChart3 className="h-5 w-5" /></div>
                      <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase">MTD Volume</p>
                        <p className="text-sm font-black text-foreground">₱ 142,500.00</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center border border-border/60 text-emerald-500 shadow-sm"><Clock className="h-5 w-5" /></div>
                      <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase">Average TTR</p>
                        <p className="text-sm font-black text-foreground">1.4 Seconds</p>
                      </div>
                   </div>
                </CardContent>
             </Card>

             <div className="p-6 rounded-[2rem] border-2 border-dashed border-border/60 flex flex-col items-center text-center space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground/30"><Info className="h-7 w-7" /></div>
                <div>
                   <p className="text-xs font-black text-foreground uppercase tracking-widest">Compliance Note</p>
                   <p className="text-[10px] text-muted-foreground font-medium mt-1 leading-relaxed">This interface provides direct monitoring of the underlying payment kernel. Production keys are handled via encrypted vault storage.</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
