import { useEffect, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import TelegramLoginWidget from '@/components/TelegramLoginWidget';
import {
    ArrowRight, ChevronRight, CheckCircle2,
    UserPlus, Menu, X, Lock, Mail, Key, Eye, EyeOff, Loader2, XCircle
} from 'lucide-react';
import { APP_NAME, SUPPORT_LINKS, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    Alipay: (s = 40) => <SiIcon src="/logos/alipay.svg" alt="Alipay" bg="#0070FF" size={s} />,
    WeChat: (s = 40) => <SiIcon src="/logos/wechat.svg" alt="WeChat Pay" bg="#07C160" size={s} />,
    GCash: (s = 40) => <ImgIcon src="/logos/gcash.svg" alt="GCash" size={s} />,
    Maya: (s = 40) => <ImgIcon src="/logos/maya.svg" alt="Maya" size={s} />,
    GrabPay: (s = 40) => <SiIcon src="/logos/grab.svg" alt="GrabPay" bg="#00B14F" size={s} />,
    BPI: (s = 40) => <ImgIcon src="/logos/bpi.svg" alt="BPI" size={s} />,
    BDO: (s = 40) => <ImgIcon src="/logos/bdo.svg" alt="BDO" size={s} />,
    UnionBank: (s = 40) => <ImgIcon src="/logos/unionbank.svg" alt="UnionBank" size={s} />,
    Metrobank: (s = 40) => <ImgIcon src="/logos/metrobank.svg" alt="Metrobank" size={s} />,
    RCBC: (s = 40) => <ImgIcon src="/logos/rcbc.svg" alt="RCBC" size={s} />,
    PSBank: (s = 40) => <ImgIcon src="/logos/psbank.svg" alt="PSBank" size={s} />,
    USDT: (s = 40) => <SiIcon src="/logos/tether.svg" alt="USDT" bg="#26A17B" size={s} />,
};

function HeroCard({
    icon, name, amount, statusLabel, statusCls, delay = "0s"
}: { icon: React.ReactNode; name: string; amount: string; statusLabel: string; statusCls: string; delay?: string }) {
    return (
        <div
            className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 shadow-2xl hover-scale animate-float border border-white/10"
            style={{ animationDelay: delay }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className="animate-logo-entrance relative">
                    {icon}
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <p className="text-white font-semibold text-sm">{name}</p>
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-tighter">LIVE_SYNC</span>
                    </div>
                    <p className="text-white/40 text-xs">Payment Method</p>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-white font-bold">{amount}</span>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg ${statusCls} uppercase tracking-widest`}>{statusLabel}</span>
            </div>
        </div>
    );
}

export default function Login() {
    const { user, login, loginWithTelegram, error: authError } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [botUsername, setBotUsername] = useState<string | null>(null);
    const loginSectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Force dark mode for login page for consistent branding
        document.documentElement.classList.add('dark');

        fetch('/api/v1/auth/telegram-login-config')
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.bot_username && setBotUsername(d.bot_username))
            .catch(() => { });

        return () => {
            // Optional: cleanup if you want other pages to potentially be light
            // document.documentElement.classList.remove('dark');
        };
    }, []);

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
        <div className="min-h-screen bg-[#0A0F1E] text-white overflow-x-hidden font-sans">
            <header className="fixed top-0 left-0 right-0 z-[100] bg-[#0A0F1E]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-10 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-5 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-2xl shadow-brandblue-500/40 group-hover:rotate-3 group-hover:scale-110 transition-all duration-500">
                            <img src="/logo.svg" alt="Logo" className="h-7 w-7" />
                        </div>
                        <div className="hidden sm:block">
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">{APP_NAME}</h2>
                            <p className="text-[10px] font-black text-brandblue-400 uppercase tracking-[0.4em] mt-1.5 leading-none">Philippines</p>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-12">
                        <Link to="/features" className="nav-link text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors">Features</Link>
                        <Link to="/pricing" className="nav-link text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors">Plans</Link>
                        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="nav-link text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors">Support</a>
                        <div className="h-4 w-px bg-white/10 mx-4" />
                        <button onClick={scrollToLogin} className="bg-white text-[#0A0F1E] font-black text-[11px] uppercase tracking-[0.3em] px-10 h-14 rounded-2xl shadow-2xl active:scale-95 transition-all hover:bg-brandblue-50 hover-lift">Login</button>
                    </div>

                    <button className="md:hidden h-12 w-12 flex items-center justify-center rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
                        {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {mobileNavOpen && (
                    <div className="md:hidden mobile-menu-enter border-t border-white/5 bg-[#0A0F1E]/80 backdrop-blur-xl">
                        <div className="px-10 py-8 space-y-6">
                            <Link 
                                to="/features" 
                                onClick={() => setMobileNavOpen(false)}
                                className="mobile-menu-item block text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors py-3 border-b border-white/5 pb-4"
                            >
                                Features
                            </Link>
                            <Link 
                                to="/pricing" 
                                onClick={() => setMobileNavOpen(false)}
                                className="mobile-menu-item block text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors py-3 border-b border-white/5 pb-4"
                            >
                                Plans
                            </Link>
                            <a 
                                href={SUPPORT_URL} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="mobile-menu-item block text-[11px] font-black text-white/40 uppercase tracking-[0.3em] hover:text-brandblue-400 transition-colors py-3 border-b border-white/5 pb-4"
                            >
                                Support
                            </a>
                            <button 
                                onClick={() => {
                                    scrollToLogin();
                                    setMobileNavOpen(false);
                                }}
                                className="mobile-menu-item w-full bg-white text-[#0A0F1E] font-black text-[11px] uppercase tracking-[0.3em] px-10 h-14 rounded-2xl shadow-2xl active:scale-95 transition-all hover:bg-brandblue-50 hover-lift mt-4"
                            >
                                Login
                            </button>
                        </div>
                    </div>
                )}
            </header>

            <section className="relative pt-40 lg:pt-60 pb-32 lg:pb-60 bg-[#0A0F1E] overflow-hidden">
                <div className="absolute top-0 right-0 p-20 opacity-30 pointer-events-none animate-float">
                    <div className="h-[800px] w-[800px] rounded-full bg-brand-blue-600 blur-[180px]" />
                </div>
                <div className="absolute bottom-0 left-0 p-20 opacity-10 pointer-events-none animate-float-delayed">
                    <div className="h-[500px] w-[500px] rounded-full bg-purple-500 blur-[150px]" />
                </div>

                <div className="max-w-7xl mx-auto px-10 relative z-10">
                    <div className="grid lg:grid-cols-12 gap-20 lg:gap-32 items-center">
                        <div className="lg:col-span-7 text-center lg:text-left">
                            <div className="inline-flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-3 rounded-full backdrop-blur-3xl mb-12 animate-in fade-in duration-1000 shadow-2xl">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brandblue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-brandblue-500"></span>
                                </span>
                                <span className="text-white text-[10px] font-black uppercase tracking-[0.4em]">System Status: <span className="text-brandblue-400">OPTIMAL</span></span>
                            </div>
                            <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.85] tracking-tighter mb-10 animate-in slide-in-from-left-12 duration-1000">
                                START YOUR <br />
                                <span className="text-gradient">SESSION</span>
                            </h1>
                            <p className="text-white/40 text-xl lg:text-2xl font-medium max-w-lg mb-16 leading-relaxed mx-auto lg:mx-0 uppercase tracking-tight">
                                Authorize your merchant identity to access the PayBot network and real-time payment processing.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-8 justify-center lg:justify-start mb-12">
                                <button onClick={scrollToLogin} className="flex items-center justify-center gap-4 bg-white text-[#0A0F1E] font-black px-12 py-6 rounded-[2.5rem] text-xs w-full sm:w-auto shadow-2xl hover:shadow-brandblue-500/20 transition-all active:scale-95 group uppercase tracking-[0.3em] hover-lift">
                                    Sign In Now <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                                </button>
                                <div className="flex items-center gap-4 px-6 opacity-40">
                                    <div className="h-1 w-12 bg-white/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-brandblue-500 animate-progress"></div>
                                    </div>
                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Latency: 14ms</span>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-5 hidden lg:flex items-center justify-center py-20 relative">
                            <div className="relative w-full max-w-md space-y-6">
                                <div className="animate-float">
                                    <HeroCard icon={Logo.Alipay(48)} name="ALIPAY_HK" amount="¥ 12,400.00" statusLabel="EMITTED" statusCls="bg-brandblue-500/10 text-brandblue-400 border border-brandblue-500/20" delay="0s" />
                                </div>
                                <div className="animate-float-delayed ml-12">
                                    <HeroCard icon={Logo.GCash(48)} name="GCASH_HUB" amount="₱ 8,500.00" statusLabel="SETTLED" statusCls="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" delay="0.5s" />
                                </div>
                                <div className="animate-float ml-4 opacity-60 grayscale-[50%]">
                                    <HeroCard icon={Logo.USDT(48)} name="USDT_VAULT" amount="$ 1,200.00" statusLabel="LOCKED" statusCls="bg-white/5 text-white/40 border border-white/10" delay="1s" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section ref={loginSectionRef} className="py-32 lg:py-60 bg-[#0A0F1E] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

                <div className="max-w-xl w-full mx-auto px-10 relative z-10">
                    <div className="fintech-card bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-[3rem] p-12 lg:p-16 shadow-[0_40px_100px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-brandblue-600 shadow-[0_0_20px_rgba(0,122,255,0.5)]" />

                        <div className="text-center mb-16">
                            <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl border border-white/10 transition-transform hover:rotate-3 duration-500 group">
                                <Lock className="h-10 w-10 text-brandblue-400 group-hover:scale-110 transition-transform" />
                            </div>
                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter">PayBot Admin</h2>
                            <p className="text-white/40 font-black text-[10px] mt-4 uppercase tracking-[0.4em]">Merchant Dashboard Portal</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-8">
                            <div className="space-y-4 card-entrance">
                                <Label className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] ml-1 input-label-floating">Email Address</Label>
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-brandblue-500/10 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl" />
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-brandblue-400 group-focus-within:scale-110 transition-all duration-300" />
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="merchant@paybot.ph"
                                        className="w-full h-18 bg-white/5 border-white/10 rounded-2xl py-4 pl-14 pr-6 focus:ring-brandblue-500/20 focus:border-brandblue-500/50 border-2 outline-none transition-all text-sm font-black uppercase tracking-widest shadow-sm relative z-10 text-white placeholder:text-white/10 hover:bg-white/8 focus:bg-white/10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 card-entrance" style={{ animationDelay: '0.1s' }}>
                                <div className="flex justify-between items-center ml-1">
                                    <Label className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em] input-label-floating">Password</Label>
                                    <Link to="/forgot-password" university-data-toggle="tooltip" title="Recover your password" className="text-[9px] font-black text-brandblue-500 uppercase tracking-widest hover:text-brandblue-400 transition-colors nav-link">Forgot Password?</Link>
                                </div>
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-brandblue-500/10 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl" />
                                    <Key className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 group-focus-within:text-brandblue-400 group-focus-within:scale-110 transition-all duration-300" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full h-18 bg-white/5 border-white/10 rounded-2xl py-4 pl-14 pr-14 focus:ring-brandblue-500/20 focus:border-brandblue-500/50 border-2 outline-none transition-all text-sm font-black tracking-widest shadow-sm relative z-10 text-white placeholder:text-white/10 hover:bg-white/8 focus:bg-white/10"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 text-white/20 hover:text-brandblue-400 transition-colors z-20 hover:scale-110"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            {(localError || authError) && (
                                <div className="form-error bg-rose-500/10 border-2 border-rose-500/20 text-rose-400 text-[10px] px-6 py-4 rounded-2xl flex items-center gap-3 font-black uppercase tracking-widest">
                                    <XCircle className="h-5 w-5 shrink-0" />
                                    <span>{localError || authError}</span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={submitting}
                                className="w-full h-20 bg-white text-[#0A0F1E] hover:bg-white/90 rounded-[2rem] font-black text-sm shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95 transition-all uppercase tracking-[0.4em] group mt-10 hover-lift card-entrance button-ripple"
                                style={{ animationDelay: '0.2s' }}
                            >
                                {submitting ? (
                                    <div className="flex items-center gap-4">
                                        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
                                        <span>Signing In...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        <span>Start Session</span>
                                        <ArrowRight className="h-6 w-6 group-hover:translate-x-2 transition-transform" />
                                    </div>
                                )}
                            </Button>
                        </form>

                        {botUsername && (
                            <div className="mt-12 space-y-8 pt-10 border-t border-white/5">
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-white/10"></span>
                                    </div>
                                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.3em]">
                                        <span className="bg-[#111827] px-4 text-white/30">Quick Login via Telegram</span>
                                    </div>
                                </div>

                                <div className="scale-110 flex justify-center">
                                    <TelegramLoginWidget
                                        botName={botUsername}
                                        onAuth={(user) => {
                                            setSubmitting(true);
                                            loginWithTelegram(user).finally(() => setSubmitting(false));
                                        }}
                                    />
                                </div>
                                <p className="text-[9px] text-center text-white/20 font-black uppercase tracking-[0.2em] px-8 leading-relaxed">
                                    Sign in securely with Telegram to create a verified merchant account instantly.
                                </p>
                            </div>
                        )}

                        <div className="mt-16 pt-10 border-t border-white/5 text-center space-y-6">
                            <p className="text-white/40 text-[11px] font-black uppercase tracking-[0.3em]">
                                New to PayBot?{' '}
                                <Link to="/register" className="text-brandblue-400 hover:text-brandblue-300 transition-colors ml-2">Create Account</Link>
                            </p>
                            <div className="flex items-center justify-center gap-6 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white">PCI-DSS Certified</span>
                                </div>
                                <div className="h-3 w-px bg-white/10" />
                                <div className="flex items-center gap-2">
                                    <Lock className="h-3 w-3 text-brandblue-500" />
                                    <span className="text-[8px] font-black uppercase tracking-widest text-white">AES-256 Encrypted</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 text-center space-y-8 opacity-40 hover:opacity-100 transition-opacity duration-700">
                        <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em]">Support Channels</p>
                        <div className="flex justify-center gap-8">
                            {SUPPORT_LINKS.map(link => (
                                <a key={link.handle} href={link.href} className="text-xs font-black text-white hover:text-brandblue-400 transition-colors uppercase tracking-widest border-b-2 border-transparent hover:border-brandblue-500/20 pb-1">
                                    {link.handle}
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

