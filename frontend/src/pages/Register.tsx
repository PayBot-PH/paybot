import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle, AlertCircle, User, Phone, Mail, MapPin, Building2, Send } from 'lucide-react';
import { APP_NAME, COMPANY_NAME } from '@/lib/brand';

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  business_name: string;
  telegram_username: string;
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
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [kybId, setKybId] = useState<number | null>(null);
  const [kycId, setKycId] = useState<string | null>(null);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Full name, email, and phone are required.');
      return;
    }
    if (!form.telegram_username.trim()) {
      setError('Telegram username is required to link your account after approval.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || null,
          business_name: form.business_name.trim() || null,
          telegram_username: form.telegram_username.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail ?? 'Registration failed. Please try again.');
      } else {
        setSuccess(true);
        setKybId(data.kyb_id);
        setKycId(data.xendit_customer_id ?? null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center px-6 py-12">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-600/8 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Application Submitted!</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your KYC registration has been received. An admin will review your application
              and notify you via Telegram (<span className="text-emerald-400">@{form.telegram_username}</span>) once approved.
            </p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Application ID</span>
              <span className="text-white font-mono">#{kybId}</span>
            </div>
            {kycId && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{APP_NAME} KYC ID</span>
                <span className="text-emerald-400 font-mono text-[10px] truncate max-w-[180px]">{kycId}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Status</span>
              <span className="text-amber-400 font-semibold">Pending Review</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-gradient-to-br from-[#0F172A] to-[#0A0F1E] border-r border-white/5 px-14 py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <img src="/logo.svg" alt={APP_NAME} className="h-10 w-10 rounded-xl shadow-xl shadow-blue-500/20" />
            <div>
              <p className="text-white font-bold text-lg leading-tight">{APP_NAME}</p>
              <p className="text-slate-500 text-sm">by {COMPANY_NAME}</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Apply for Access</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Submit your KYC information to request admin dashboard access. After approval, you'll be notified via Telegram.
          </p>

          <div className="space-y-4">
            {[
              { step: '1', label: 'Submit your information', desc: 'Fill in name, email, phone, and Telegram username' },
              { step: '2', label: 'KYC verification', desc: `Your identity is verified via the ${APP_NAME} KYC platform` },
              { step: '3', label: 'Admin review & approval', desc: 'A super admin reviews and approves your application' },
              { step: '4', label: 'Dashboard access granted', desc: 'Sign in with Telegram once approved' },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-400 text-[10px] font-bold">{s.step}</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{s.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-300 text-xs font-semibold mb-1">Security Notice</p>
            <p className="text-slate-400 text-xs">Your Telegram username is required to receive approval notifications and to link your account after approval.</p>
          </div>
        </div>

        <p className="relative text-slate-600 text-xs">© {new Date().getFullYear()} {COMPANY_NAME}</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative overflow-y-auto">
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <img src="/logo.svg" alt={APP_NAME} className="h-9 w-9 rounded-xl shadow-lg shadow-blue-500/20" />
          <div>
            <p className="text-white font-bold text-base leading-tight">{APP_NAME}</p>
            <p className="text-slate-500 text-xs">by {COMPANY_NAME}</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Create an Account</h2>
            <p className="text-slate-400 text-sm">Submit your KYC application for admin access.</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Full Name <span className="text-red-400">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  placeholder="Juan dela Cruz"
                  required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Email Address <span className="text-red-400">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="juan@example.com"
                  required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Mobile Number <span className="text-red-400">*</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="09171234567"
                  required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors"
                />
              </div>
            </div>

            {/* Business name */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => handleChange('business_name', e.target.value)}
                  placeholder="DRL Solutions Inc."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <textarea
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="123 Main St, Makati City, Metro Manila"
                  rows={2}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors resize-none"
                />
              </div>
            </div>

            {/* Telegram username */}
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Telegram Username <span className="text-red-400">*</span></label>
              <div className="relative">
                <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={form.telegram_username}
                  onChange={(e) => handleChange('telegram_username', e.target.value)}
                  placeholder="@yourusername"
                  required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-colors"
                />
              </div>
              <p className="text-slate-600 text-[10px] mt-1.5 ml-1">Required to link and notify your Telegram account after approval.</p>
            </div>

            {/* KYC badge */}
            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-slate-400 text-xs">
                Your identity will be verified via the <span className="text-blue-400 font-semibold">{APP_NAME} KYC platform</span>.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit KYC Application'
              )}
            </button>
          </form>

          <p className="text-slate-500 text-xs text-center mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-400 hover:text-sky-300 transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
