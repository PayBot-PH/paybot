import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, User, Phone, Mail, Building2, Send, ArrowRight, ShieldCheck, Zap, Globe, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import TelegramLoginWidget from '@/components/TelegramLoginWidget';
import { APP_NAME, COMPANY_NAME, APP_DESCRIPTION } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  business_name: string;
  telegram_username: string;
}

interface SocialConfig {
  telegram_bot_username: string;
  messenger_page_username: string;
  whatsapp_number: string;
}

const INITIAL_FORM: FormData = {
  full_name: '',
  email: '',
  phone: '',
  address: '',
  business_name: '',
  telegram_username: '',
};

export default function Register() {
  const navigate = useNavigate();
  const { loginWithTelegram } = useAuth();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [socialConfig, setSocialConfig] = useState<SocialConfig | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/social-config')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSocialConfig(d))
      .catch(() => {});
  }, []);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Full name, email, and phone are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) setSuccess(true);
      else {
        const d = await res.json();
        setError(d.detail || 'Registration failed');
      }
    } catch { setError('Connection error'); }
    finally { setSubmitting(false); }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="h-24 w-24 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Onboarding Complete</h2>
            <p className="text-muted-foreground font-medium mt-2">Your merchant record has been initialized. Access your dashboard to begin processing.</p>
          </div>
          <Button onClick={() => navigate('/login')} size="lg" className="w-full h-14 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-lg shadow-brand-blue-500/20">
            Sign In to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col lg:flex-row">
      {/* Left: Brand Showcase */}
      <div className="lg:w-1/2 bg-brand-blue-600 p-12 lg:p-24 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 p-20 opacity-10"><Sparkles className="h-64 w-64 text-white" /></div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16 animate-in slide-in-from-left-4 duration-500">
            <img src="/logo.svg" alt="Logo" className="h-12 w-12 rounded-[1rem] shadow-2xl" />
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{APP_NAME}</h2>
              <p className="text-brand-blue-100 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Philippines</p>
            </div>
          </div>

          <h1 className="text-4xl lg:text-6xl font-black text-white leading-tight mb-8 animate-in slide-in-from-left-6 duration-700">
            Unified <br />Commerce <br />Infrastructure.
          </h1>
          <p className="text-brand-blue-50 text-lg font-medium max-w-md mb-12 opacity-90">{APP_DESCRIPTION}</p>

          <div className="space-y-6">
             {[
               { icon: Globe, label: 'Global Settlement', desc: 'Accept PHP and settle in USDT same-day.' },
               { icon: Zap, label: 'Bot Integration', desc: 'Control your entire business via Telegram.' },
               { icon: ShieldCheck, label: 'Enterprise Grade', desc: 'PCI-DSS compliant cloud infrastructure.' },
             ].map((f, i) => (
               <div key={i} className="flex gap-4 items-start animate-in slide-in-from-left-8 duration-700" style={{animationDelay: `${i*100}ms`}}>
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10"><f.icon className="h-5 w-5 text-white" /></div>
                  <div>
                    <p className="text-white font-black text-xs uppercase tracking-widest">{f.label}</p>
                    <p className="text-brand-blue-100 text-xs font-medium opacity-70 mt-1">{f.desc}</p>
                  </div>
               </div>
             ))}
          </div>
        </div>

        <p className="relative z-10 text-brand-blue-200 text-[10px] font-black uppercase tracking-widest mt-20 opacity-50">© {new Date().getFullYear()} {COMPANY_NAME}</p>
      </div>

      {/* Right: Registration Form */}
      <div className="flex-1 p-8 lg:p-24 flex items-center justify-center overflow-y-auto">
         <div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
            <div>
              <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Register Merchant</h2>
              <p className="text-muted-foreground font-medium mt-2">Join the next generation of Philippine payments.</p>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold animate-shake">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
               <div className="space-y-2">
                 <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Account Holder</Label>
                 <div className="relative">
                   <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} placeholder="Enter full name" className="pl-11 h-14 bg-white border-border/60 rounded-2xl font-bold shadow-sm focus-visible:ring-brand-blue-500/20" required />
                 </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Work Email</Label>
                    <Input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="Email" className="h-14 bg-white border-border/60 rounded-2xl font-bold shadow-sm focus-visible:ring-brand-blue-500/20" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Contact No.</Label>
                    <Input type="tel" value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="0917..." className="h-14 bg-white border-border/60 rounded-2xl font-bold shadow-sm focus-visible:ring-brand-blue-500/20" required />
                  </div>
               </div>

               <div className="space-y-2">
                 <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Business Entity</Label>
                 <div className="relative">
                   <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input value={form.business_name} onChange={e => handleChange('business_name', e.target.value)} placeholder="Trade name or business name" className="pl-11 h-14 bg-white border-border/60 rounded-2xl font-bold shadow-sm focus-visible:ring-brand-blue-500/20" />
                 </div>
               </div>

               <div className="space-y-2">
                 <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Telegram Identity</Label>
                 <div className="relative">
                   <Send className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input value={form.telegram_username} onChange={e => handleChange('telegram_username', e.target.value)} placeholder="@your_username" className="pl-11 h-14 bg-white border-border/60 rounded-2xl font-black text-brand-blue-600 shadow-sm focus-visible:ring-brand-blue-500/20" required />
                 </div>
                 <p className="text-[9px] text-muted-foreground font-medium px-2">Used to link your account to the PayBot Kernel for instant notifications.</p>
               </div>

               <Button type="submit" disabled={submitting} className="w-full h-16 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-lg shadow-brand-blue-500/20 transition-all active:scale-95 mt-4">
                 {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Sparkles className="h-5 w-5 mr-2" /> Activate Merchant Node</>}
               </Button>
            </form>

            {socialConfig?.telegram_bot_username && (
              <div className="pt-6 border-t border-border/60 text-center">
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Express Registration</p>
                 <div className="flex justify-center mb-4">
                   <TelegramLoginWidget
                     botName={socialConfig.telegram_bot_username}
                     onAuth={user => {
                       setSubmitting(true);
                       loginWithTelegram(user).finally(() => { setSubmitting(false); navigate('/'); });
                     }}
                   />
                 </div>
              </div>
            )}

            <p className="text-center text-xs font-bold text-muted-foreground">
              Already have an account? <Link to="/login" className="text-brand-blue-600 hover:underline">Sign In</Link>
            </p>
         </div>
      </div>
    </div>
  );
}
