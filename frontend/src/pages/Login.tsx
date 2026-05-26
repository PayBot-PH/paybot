import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowRight, ChevronRight, CheckCircle2,
  UserPlus, Menu, X, Lock, Mail, Key, Eye, EyeOff, Loader2, XCircle
} from 'lucide-react';
import { APP_NAME, SUPPORT_LINKS, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* ─── Logo helpers ──────────────────────────────────────────────── */

function SiIcon({
  src, alt, bg, size = 40,
}: { src: string; alt: string; bg: string; size?: number }) {
  const r = Math.round(size * 0.24);
  const p = Math.round(size * 0.19);
  return (
    <div
      style={{
        width: size, height: size, background: bg, borderRadius: r,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: p, flexShrink: 0,
      }}
    >
      <img
        src={src} alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
      />
    </div>
  );
}

function ImgIcon({
  src, alt, size = 40,
}: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src} alt={alt}
      style={{ height: size, width: 'auto', objectFit: 'contain', borderRadius: 8, flexShrink: 0 }}
    />
  );
}

const Logo = {
  Alipay:    (s = 40) => <SiIcon  src="/logos/alipay.svg"    alt="Alipay"     bg="#0070FF" size={s} />,
  WeChat:    (s = 40) => <SiIcon  src="/logos/wechat.svg"    alt="WeChat Pay" bg="#07C160" size={s} />,
  GCash:     (s = 40) => <ImgIcon src="/logos/gcash.svg"     alt="GCash"      size={s} />,
  Maya:      (s = 40) => <ImgIcon src="/logos/maya.svg"      alt="Maya"       size={s} />,
  GrabPay:   (s = 40) => <SiIcon  src="/logos/grab.svg"      alt="GrabPay"    bg="#00B14F" size={s} />,
  BPI:       (s = 40) => <ImgIcon src="/logos/bpi.svg"       alt="BPI"        size={s} />,
  BDO:       (s = 40) => <ImgIcon src="/logos/bdo.svg"       alt="BDO"        size={s} />,
  UnionBank: (s = 40) => <ImgIcon src="/logos/unionbank.svg" alt="UnionBank"  size={s} />,
  Metrobank: (s = 40) => <ImgIcon src="/logos/metrobank.svg" alt="Metrobank"  size={s} />,
  RCBC:      (s = 40) => <ImgIcon src="/logos/rcbc.svg"      alt="RCBC"       size={s} />,
  PSBank:    (s = 40) => <ImgIcon src="/logos/psbank.svg"    alt="PSBank"     size={s} />,
  USDT:      (s = 40) => <SiIcon  src="/logos/tether.svg"    alt="USDT"       bg="#26A17B" size={s} />,
};

function HeroCard({
  icon, name, amount, statusLabel, statusCls,
}: { icon: React.ReactNode; name: string; amount: string; statusLabel: string; statusCls: string }) {
  return (
    <div className="glass-effect rounded-2xl p-4 card-shadow-lg hover-scale animate-float logo-pop">
      <div className="flex items-center gap-3 mb-3">
        <div className="animate-logo-entrance">
          {icon}
        </div>
        <div>
          <p className="text-[#141414] font-semibold text-sm">{name}</p>
          <p className="text-[#595959] text-xs">Payment Method</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[#141414] font-bold">{amount}</span>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

function RevealGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('revealed'); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal-group ${className}`}>{children}</div>;
}

const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function seededRand(seed: number): number {
  const x = Math.sin(seed + 9301) * 49297;
  return x - Math.floor(x);
}

function getDailyUsdtStats() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const total  = 5000 + seededRand(seed)     * 95000;
  const alipay =   50 + seededRand(seed + 1) * 1950;
  const wechat =   30 + seededRand(seed + 2) * 1470;
  const gcash  =   20 + seededRand(seed + 3) * 980;
  return { total, alipay, wechat, gcash };
}

const MARQUEE_ROW_1 = [
  { el: Logo.Alipay(40),    label: 'Alipay'    },
  { el: Logo.WeChat(40),    label: 'WeChat'    },
  { el: Logo.GCash(40),     label: 'GCash'     },
  { el: Logo.Maya(40),      label: 'Maya'      },
  { el: Logo.GrabPay(40),   label: 'GrabPay'   },
  { el: Logo.BPI(40),       label: 'BPI'       },
];
const MARQUEE_ROW_2 = [
  { el: Logo.BDO(40),       label: 'BDO'       },
  { el: Logo.UnionBank(40), label: 'UnionBank' },
  { el: Logo.Metrobank(40), label: 'Metrobank' },
  { el: Logo.RCBC(40),      label: 'RCBC'      },
  { el: Logo.PSBank(40),    label: 'PSBank'    },
  { el: Logo.USDT(40),      label: 'USDT'      },
];

export default function Login() {
  const { user, login, loading, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const usdtStats = getDailyUsdtStats();
  const loginSectionRef = useRef<HTMLDivElement>(null);

  const scrollToLogin = () => {
    setMobileNavOpen(false);
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setLocalError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  if (user) return <Navigate to="/intro" replace />;

  return (
    <div className="min-h-screen bg-white text-[#141414] overflow-x-hidden">
      <header className="sticky top-0 z-50 bg-white border-b border-[#E8EAED] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt={APP_NAME} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl animate-logo-entrance" />
            <span className="font-bold text-base sm:text-lg text-[#141414] tracking-tight">{APP_NAME}</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link to="/features" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Features</Link>
            <Link to="/pricing" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-[#595959] hover:text-[#0070FF] text-sm transition-colors">Support</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={scrollToLogin} className="flex items-center gap-1.5 bg-[#0070FF] hover:bg-[#005FDD] text-white text-sm font-semibold px-4 sm:px-5 py-2 rounded-full transition-all shadow-md">
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button className="md:hidden p-1.5 text-[#595959]" onClick={() => setMobileNavOpen(v => !v)}>
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#E8EAED] bg-white px-4 py-4 space-y-1">
            <Link to="/features" className="block py-2.5 text-[#595959] text-sm font-medium" onClick={() => setMobileNavOpen(false)}>Features</Link>
            <Link to="/pricing" className="block py-2.5 text-[#595959] text-sm font-medium" onClick={() => setMobileNavOpen(false)}>Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="block py-2.5 text-[#595959] text-sm font-medium">Support</a>
          </div>
        )}
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-[#0070FF] to-[#0047CC]">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="pt-12 pb-8 sm:pt-16 sm:pb-10 lg:py-24 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 py-1.5 mb-5 sm:mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-white text-xs font-semibold tracking-wide uppercase">Now live in the Philippines</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-[1.1] mb-5 sm:mb-6">
                Accept <span className="text-yellow-300">Alipay</span>, <span className="text-green-300">WeChat</span>, <span className="text-sky-200">GCash</span>
                <br className="hidden sm:block" /> <span className="text-white/90">& All PH Banks.</span>
              </h1>
              <p className="text-blue-100 text-base sm:text-lg mb-7 sm:mb-8 max-w-lg mx-auto lg:mx-0">
                The unified Telegram payment platform for Philippine merchants. Settle in <span className="text-yellow-300 font-semibold">USDT same day</span>.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
                <button onClick={scrollToLogin} className="flex items-center justify-center gap-2 bg-white text-[#0070FF] font-semibold px-7 py-3.5 rounded-full text-sm w-full sm:w-auto shadow-lg">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative hidden lg:flex items-center justify-center py-16">
              <div className="relative w-full max-w-sm space-y-3">
                <HeroCard icon={Logo.Alipay(40)}  name="Alipay QR"  amount="¥ 1,200.00" statusLabel="Accepted" statusCls="bg-blue-100 text-blue-700" />
                <HeroCard icon={Logo.GCash(40)}   name="GCash"      amount="₱ 2,500.00" statusLabel="Accepted" statusCls="bg-sky-100 text-sky-700" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={loginSectionRef} className="py-16 sm:py-24 bg-[#F5F7FA] relative overflow-hidden flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 sm:px-6">
          <div className="bg-white border border-[#E8EAED] rounded-3xl p-8 shadow-2xl relative z-10">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <Lock className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#141414]">Merchant Login</h2>
              <p className="text-[#595959] text-sm mt-2">Access your PayBot terminal dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-[#141414] mb-1.5 block px-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9CA3AF]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[#141414]"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5 px-1">
                  <label className="text-sm font-semibold text-[#141414]">Password</label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 font-medium hover:underline">Forgot password?</Link>
                </div>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9CA3AF]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl py-3.5 pl-12 pr-12 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[#141414]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {(localError || authError) && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2 animate-shake">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{localError || authError}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-6 font-bold text-base shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Sign In</span>
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-gray-500 text-sm">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 font-bold hover:underline">Register your business</Link>
              </p>
            </div>
          </div>

          <div className="mt-8 text-center space-y-4">
             <p className="text-gray-400 text-xs">Need technical assistance?</p>
             <div className="flex justify-center gap-4">
                {SUPPORT_LINKS.map(link => (
                  <a key={link.handle} href={link.href} className="text-gray-500 hover:text-blue-600 transition-colors">
                    <span className="text-xs font-medium">{link.handle}</span>
                  </a>
                ))}
             </div>
          </div>
        </div>
      </section>

      <AppFooter />
    </div>
  );
}

