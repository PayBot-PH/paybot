import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import TelegramLoginWidget from '@/components/TelegramLoginWidget';
import {
  ArrowRight, Bot, BarChart3, Wallet, CreditCard, ShieldCheck,
  Zap, Globe, TrendingUp, DollarSign, Building2, CheckCircle2,
  MessageCircle, Bell, Users, ChevronRight, Star, Lock, Smartphone,
  PieChart, Send, RefreshCw, Receipt, Menu, X, ArrowUpRight,
  Sparkles, CheckCircle
} from 'lucide-react';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL, APP_DESCRIPTION } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';
import { Button } from '@/components/ui/button';

/* ─── Shared Components ───────────────────────────────────────── */

function LogoBox({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`h-12 w-12 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-black/5 hover:scale-110 transition-transform cursor-default ${className}`}>
      {children}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center md:text-left">
      <p className="text-3xl font-black text-white tracking-tighter">{value}</p>
      <p className="text-brand-blue-100 text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */
export default function LandingPage() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileNavOpen] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/telegram-login-config')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.bot_username && setBotUsername(d.bot_username))
      .catch(() => {});
  }, []);

  if (user) return <Navigate to="/home" replace />;

  return (
    <div className="min-h-screen bg-white text-[#141414] overflow-x-hidden font-sans">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <img src="/logo.svg" alt="Logo" className="h-10 w-10 rounded-xl shadow-lg animate-logo-entrance" />
             <div className="hidden sm:block">
               <h2 className="text-xl font-black text-foreground tracking-tighter uppercase">{APP_NAME}</h2>
               <p className="text-[9px] font-black text-brand-blue-500 uppercase tracking-widest opacity-80 leading-none">Philippines</p>
             </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/features" className="text-[11px] font-black text-muted-foreground uppercase tracking-widest hover:text-brand-blue-600 transition-colors">Features</Link>
            <Link to="/pricing" className="text-[11px] font-black text-muted-foreground uppercase tracking-widest hover:text-brand-blue-600 transition-colors">Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-muted-foreground uppercase tracking-widest hover:text-brand-blue-600 transition-colors">Support</a>
            <div className="h-4 w-px bg-black/10 mx-2" />
            <Link to="/login">
               <Button variant="ghost" className="text-[11px] font-black uppercase tracking-widest px-6">Sign In</Button>
            </Link>
            <Link to="/register">
               <Button className="bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black text-[11px] uppercase tracking-widest px-8 rounded-full shadow-lg shadow-brand-blue-500/20">Get Started</Button>
            </Link>
          </div>

          <button className="md:hidden p-2 text-foreground" onClick={() => setMobileNavOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-black/5 p-6 animate-in slide-in-from-top-4 duration-300">
             <div className="flex flex-col gap-4">
                <Link to="/features" className="text-sm font-black uppercase tracking-widest py-2">Features</Link>
                <Link to="/pricing" className="text-sm font-black uppercase tracking-widest py-2">Pricing</Link>
                <Link to="/login" className="text-sm font-black uppercase tracking-widest py-2 text-brand-blue-600">Merchant Dashboard</Link>
                <Link to="/register">
                   <Button className="w-full bg-brand-blue-500 text-white font-black rounded-xl h-12 uppercase tracking-widest mt-2">Create Account</Button>
                </Link>
             </div>
          </div>
        )}
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative pt-32 lg:pt-48 pb-20 lg:pb-40 bg-brand-blue-600 overflow-hidden">
        {/* Abstract shapes */}
        <div className="absolute top-0 right-0 p-20 opacity-10 pointer-events-none"><Sparkles className="h-96 w-96 text-white" /></div>
        <div className="absolute -bottom-20 -left-20 p-20 opacity-10 pointer-events-none"><Zap className="h-64 w-64 text-white" /></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
           <div className="grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
              <div className="lg:col-span-7 text-center lg:text-left">
                 <Badge className="bg-white/10 text-white border-0 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 backdrop-blur-md">
                   <Globe className="h-3 w-3 mr-2 inline" /> Now Live: Region PH-1
                 </Badge>
                 <h1 className="text-5xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter mb-8 animate-in slide-in-from-left-6 duration-700">
                    PHILLIPINE <br />
                    COMMERCE <br />
                    <span className="text-brand-blue-200">RE-DEFINED.</span>
                 </h1>
                 <p className="text-brand-blue-50 text-xl font-medium max-w-2xl mb-12 opacity-90 leading-relaxed mx-auto lg:mx-0">
                    {APP_DESCRIPTION} Build, scale, and settle in <span className="font-black text-white">USDT same-day</span> with our Telegram-native kernel.
                 </p>

                 <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                    <Link to="/register" className="w-full sm:w-auto">
                       <Button size="lg" className="w-full h-16 px-10 bg-white text-brand-blue-600 hover:bg-brand-blue-50 font-black rounded-[2rem] uppercase tracking-widest shadow-2xl transition-all active:scale-95">
                         Register Merchant <ArrowRight className="ml-2 h-5 w-5" />
                       </Button>
                    </Link>
                    <Link to="/features" className="w-full sm:w-auto">
                       <Button variant="outline" size="lg" className="w-full h-16 px-10 border-white/30 text-white hover:bg-white/10 font-black rounded-[2rem] uppercase tracking-widest transition-all">
                         View Capabilities
                       </Button>
                    </Link>
                 </div>

                 <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-white/10">
                    <StatItem label="Active Nodes" value="500+" />
                    <StatItem label="Total Volume" value="₱2B+" />
                    <StatItem label="Clearing Time" value="T+0" />
                    <StatItem label="Uptime" value="99.9%" />
                 </div>
              </div>

              <div className="lg:col-span-5 hidden lg:block">
                 <div className="relative animate-in zoom-in-95 duration-1000">
                    {/* Visual Mockup */}
                    <div className="bg-white/10 backdrop-blur-2xl rounded-[3rem] p-10 border border-white/20 shadow-3xl">
                       <div className="bg-white rounded-[2rem] p-8 shadow-2xl space-y-6">
                          <div className="flex items-center justify-between border-b pb-6 border-black/5">
                             <div>
                               <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Incoming Payout</p>
                               <h3 className="text-2xl font-black text-foreground tracking-tight">₱ 24,500.00</h3>
                             </div>
                             <div className="h-12 w-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white"><CheckCircle className="h-6 w-6" /></div>
                          </div>
                          <div className="space-y-4">
                             {[
                               { label: 'Merchant', val: 'DRL Solutions Inc.' },
                               { label: 'Gateway', val: 'PayBot Kernel v1.0' },
                               { label: 'Settlement', val: 'USDT TRC-20' },
                             ].map(row => (
                               <div key={row.label} className="flex justify-between text-xs font-bold">
                                 <span className="text-muted-foreground uppercase tracking-tighter">{row.label}</span>
                                 <span className="text-foreground">{row.val}</span>
                               </div>
                             ))}
                          </div>
                          <div className="pt-4">
                             <div className="w-full h-12 bg-brand-blue-500 rounded-xl flex items-center justify-center font-black text-white text-[10px] uppercase tracking-[0.2em]">Verified Secure</div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
           <div className="text-center mb-20">
              <h2 className="text-[10px] font-black text-brand-blue-600 uppercase tracking-[0.3em] mb-4">Enterprise Features</h2>
              <h3 className="text-4xl lg:text-5xl font-black text-foreground tracking-tighter">Everything you need to <br className="hidden sm:block" />clearing payments in PH.</h3>
           </div>

           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: Smartphone, title: 'Telegram Native', desc: 'Manage invoices, disbursements, and refunds directly from the world\'s fastest messaging app.' },
                { icon: ShieldCheck, title: 'Secure Gateway', desc: 'PCI-DSS compliant infrastructure with real-time fraud monitoring and multi-channel routing.' },
                { icon: Zap, title: 'Instant Settlement', desc: 'Bridge the gap between local currency and global liquidity with automated USDT payouts.' },
                { icon: BarChart3, title: 'Power Analytics', desc: 'Access granular data on every transaction, customer, and settlement schedule.' },
                { icon: Building2, title: 'Bank Direct', desc: 'Support for all major Philippine banks and e-wallets including GCash, Maya, and BDO.' },
                { icon: MessageCircle, title: 'Active Notifications', desc: 'Webhook-driven alerts keep you and your customers informed of every payment status change.' },
              ].map((f, i) => (
                <div key={i} className="p-8 rounded-[2rem] bg-[#F9FAFB] border border-black/5 hover:border-brand-blue-200 transition-all hover:-translate-y-1 group">
                   <div className="h-14 w-14 rounded-2xl bg-white shadow-md flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <f.icon className="h-7 w-7 text-brand-blue-500" />
                   </div>
                   <h4 className="text-lg font-black text-foreground uppercase tracking-tight mb-3">{f.title}</h4>
                   <p className="text-muted-foreground font-medium text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 lg:py-40 bg-[#F5F7FA]">
         <div className="max-w-4xl mx-auto px-6 text-center">
            <div className="inline-flex h-16 w-16 rounded-[1.5rem] bg-brand-blue-500 text-white items-center justify-center shadow-xl shadow-brand-blue-500/20 mb-8 animate-bounce">
               <Bot className="h-8 w-8" />
            </div>
            <h2 className="text-4xl lg:text-6xl font-black text-foreground tracking-tighter mb-8 leading-[0.95]">
               READY TO UPGRADE <br />YOUR BUSINESS?
            </h2>
            <p className="text-muted-foreground text-lg font-medium mb-12 max-w-xl mx-auto">
               Join 500+ merchants who have transitioned to the PayBot kernel. Onboarding takes less than 3 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <Link to="/register" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full h-16 px-12 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-full uppercase tracking-widest shadow-xl">Activate Merchant Node</Button>
               </Link>
               <Link to="/login" className="w-full sm:w-auto">
                  <Button variant="ghost" size="lg" className="w-full h-16 px-12 font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">Sign In</Button>
               </Link>
            </div>
         </div>
      </section>

      <AppFooter />
    </div>
  );
}
