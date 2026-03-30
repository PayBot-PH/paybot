import { useEffect, useState } from 'react';
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

/* Branded SVG icons for social platforms */
function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#26A5E4" />
      <path d="M5.5 11.8l2.9 1.1 1.1 3.5c.1.2.3.3.5.2l1.6-1.3 3 2.2c.2.2.5 0 .6-.2l2.3-9.3c.1-.4-.3-.7-.6-.5L5.3 11.1c-.3.1-.2.6.2.7z" fill="white" />
    </svg>
  );
}

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path d="M17.5 6.5A7.4 7.4 0 0 0 6.2 17.1L5 19l1.9-1.2a7.4 7.4 0 0 0 10.6-6.4 7.3 7.3 0 0 0-2.1-5.1-7.3 7.3 0 0 0-.9.2zm-5.3 11.4a6.1 6.1 0 0 1-3.1-.9l-.2-.1-2 .5.5-1.9-.2-.2a6.2 6.2 0 1 1 5 2.6zm3.4-4.7c-.2-.1-1-.5-1.2-.5-.2-.1-.3-.1-.4.1-.1.2-.5.5-.6.7-.1.1-.2.1-.4 0-.2-.1-.8-.3-1.5-1-.6-.5-.9-1.1-1-1.3-.1-.2 0-.3.1-.4l.3-.3.2-.3v-.3c0-.1-.4-1-.6-1.3-.1-.3-.3-.3-.4-.3h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 3.9 3.5.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1-.1-.2-.2-.2-.4-.3z" fill="white" />
    </svg>
  );
}

function MessengerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="url(#msgGradReg)" />
      <defs>
        <linearGradient id="msgGradReg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00C6FF" />
          <stop offset="1" stopColor="#0068FF" />
        </linearGradient>
      </defs>
      <path d="M12 4C7.58 4 4 7.36 4 11.5c0 2.2 1.02 4.17 2.63 5.52V19l2.42-1.33c.64.18 1.33.28 2.04.28H12c4.42 0 8-3.36 8-7.5S16.42 4 12 4zm.79 9.78l-2.04-2.18-3.98 2.18 4.38-4.65 2.09 2.18 3.94-2.18-4.39 4.65z" fill="white" />
    </svg>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [kybId, setKybId] = useState<number | null>(null);
  const [kycId, setKycId] = useState<string | null>(null);
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
      <div className="min-h-screen bg-[#F0F7FF] flex items-center justify-center px-6 py-12">
        <div className="relative w-full max-w-md text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Application Submitted!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your KYC registration has been received. An admin will review your application
              and notify you via Telegram (<span className="text-emerald-600">@{form.telegram_username}</span>) once approved.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Application ID</span>
              <span className="text-foreground font-mono">#{kybId}</span>
            </div>
            {kycId && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{APP_NAME} KYC ID</span>
                <span className="text-emerald-600 font-mono text-[10px] truncate max-w-[180px]">{kycId}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className="text-amber-600 font-semibold">Pending Review</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F7FF] flex">

      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-gradient-to-br from-[#0070FF] to-[#0047CC] border-r border-blue-400/20 px-14 py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <img src="/logo.svg" alt={APP_NAME} className="h-10 w-10 rounded-xl shadow-xl shadow-blue-500/20" />
            <div>
              <p className="text-white font-bold text-lg leading-tight">{APP_NAME}</p>
              <p className="text-blue-100 text-sm">by {COMPANY_NAME}</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Apply for Access</h2>
          <p className="text-blue-100 text-sm mb-8 leading-relaxed">
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
                <div className="h-6 w-6 rounded-full bg-white/20 border border-white/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-[10px] font-bold">{s.step}</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{s.label}</p>
                  <p className="text-blue-100 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-white/15 border border-white/20 rounded-xl p-3">
            <p className="text-white text-xs font-semibold mb-1">Security Notice</p>
            <p className="text-blue-100 text-xs">Your Telegram username is required to receive approval notifications and to link your account after approval.</p>
          </div>
        </div>

        <p className="relative text-blue-200 text-xs">© {new Date().getFullYear()} {COMPANY_NAME}</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative overflow-y-auto">
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <img src="/logo.svg" alt={APP_NAME} className="h-9 w-9 rounded-xl shadow-lg shadow-blue-500/20" />
          <div>
            <p className="text-foreground font-bold text-base leading-tight">{APP_NAME}</p>
            <p className="text-muted-foreground text-xs">by {COMPANY_NAME}</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-1">Create an Account</h2>
            <p className="text-muted-foreground text-sm">Submit your KYC application for admin access.</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Full Name <span className="text-red-400">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  placeholder="Juan dela Cruz"
                  required
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Email Address <span className="text-red-400">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="juan@example.com"
                  required
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Mobile Number <span className="text-red-400">*</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="09171234567"
                  required
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
                />
              </div>
            </div>

            {/* Business name */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => handleChange('business_name', e.target.value)}
                  placeholder="DRL Solutions Inc."
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <textarea
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="123 Main St, Makati City, Metro Manila"
                  rows={2}
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Telegram username */}
            <div>
              <label className="block text-muted-foreground text-xs font-medium mb-1.5">Telegram Username <span className="text-red-400">*</span></label>
              <div className="relative">
                <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.telegram_username}
                  onChange={(e) => handleChange('telegram_username', e.target.value)}
                  placeholder="@yourusername"
                  required
                  className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
                />
              </div>
              <p className="text-muted-foreground text-[10px] mt-1.5 ml-1">Required to link and notify your Telegram account after approval.</p>
            </div>

            {/* KYC badge */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-muted-foreground text-xs">
                Your identity will be verified via the <span className="text-blue-600 font-semibold">{APP_NAME} KYC platform</span>.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
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

          {/* ── Social sign-up options ────────────────────────── */}
          {socialConfig && (socialConfig.telegram_bot_username || socialConfig.whatsapp_number || socialConfig.messenger_page_username) && (
            <div className="mt-5">
              <div className="relative flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted-foreground text-xs shrink-0">or sign up via</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex flex-col gap-2.5">
                {socialConfig.telegram_bot_username && (
                  <a
                    href={`https://t.me/${socialConfig.telegram_bot_username}?start=register`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full border border-border bg-white hover:bg-sky-50 hover:border-sky-300 rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors"
                  >
                    <TelegramIcon size={22} />
                    <span>Sign up with Telegram</span>
                  </a>
                )}
                {socialConfig.whatsapp_number && (
                  <a
                    href={`https://wa.me/${socialConfig.whatsapp_number.replace(/\D/g, '')}?text=Hi%2C+I+want+to+register`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full border border-border bg-white hover:bg-green-50 hover:border-green-300 rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors"
                  >
                    <WhatsAppIcon size={22} />
                    <span>Sign up with WhatsApp</span>
                  </a>
                )}
                {socialConfig.messenger_page_username && (
                  <a
                    href={`https://m.me/${socialConfig.messenger_page_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full border border-border bg-white hover:bg-blue-50 hover:border-blue-300 rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors"
                  >
                    <MessengerIcon size={22} />
                    <span>Sign up with Messenger</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-xs text-center mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary/80 transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
