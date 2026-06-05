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
        fetch('/api/v1/auth/telegram-login-config')
            .then(r => r.ok ? r.json() : null)
            .then(d => d?.bot_username && setBotUsername(d.bot_username))
            .catch(() => { });
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
        <div className="min-h-screen bg-white text-[#0A0F1E] overflow-x-hidden font-sans">
            <header className="fixed top-0 left-0 right-0 z-[100] bg-white/70 backdrop-blur-xl border-b border-black/[0.03]">
                <div className="max-w-7xl mx-auto px-10 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-5 group cursor-pointer">
                        <div className="h-12 w-12 rounded-2xl bg-[#0A0F1E] flex items-center justify-center shadow-2xl shadow-brand-blue-500/20 group-hover:rotate-3 group-hover:scale-110 transition-all duration-500 border border-white/5">
                            <img src="/logo.svg" alt="Logo" className="h-7 w-7 animate-logo-bounce" />
                        </div>
                        <div className="hidden sm:block">
                            <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">{APP_NAME}</h2>
                            <p className="text-[10px] font-black text-brandblue-500 uppercase tracking-[0.4em] mt-1.5 leading-none">Philippines</p>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-12">
                        <Link to="/features" className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] hover:text-brand-blue-600 transition-colors">CAPABILITIES</Link>
                        <Link to="/pricing" className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] hover:text-brand-blue-600 transition-colors">PRICING</Link>
                        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] hover:text-brand-blue-600 transition-colors">KERNEL_SUPPORT</a>
                        <div className="h-4 w-px bg-black/[0.08] mx-4" />
                        <button onClick={scrollToLogin} className="bg-[#0A0F1E] hover:bg-black text-white font-black text-[11px] uppercase tracking-[0.3em] px-10 h-14 rounded-2xl shadow-2xl active:scale-95 transition-all">SIGN_IN</button>
                    </div>

                    <button className="md:hidden h-12 w-12 flex items-center justify-center rounded-2xl bg-muted/50 text-foreground" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
                        {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
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
                                <span className="h-2 w-2 rounded-full bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                                <span className="text-white text-[10px] font-black uppercase tracking-[0.4em]">Grid_Node_Access: Ready</span>
                            </div>
                            <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.85] tracking-tighter mb-10 animate-in slide-in-from-left-12 duration-1000">
                                INITIATE <br />
                                <span className="text-gradient">SESSION.</span>
                            </h1>
                            <p className="text-white/40 text-xl lg:text-2xl font-medium max-w-lg mb-16 leading-relaxed mx-auto lg:mx-0 uppercase tracking-tight">
                                Authorize your merchant identity to access the global PayBot network and real-time settlement vault.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-8 justify-center lg:justify-start mb-12">
                                <button onClick={scrollToLogin} className="flex items-center justify-center gap-4 bg-white text-[#0A0F1E] font-black px-12 py-6 rounded-[2.5rem] text-xs w-full sm:w-auto shadow-2xl transition-all active:scale-95 group uppercase tracking-[0.3em]">
                                    Authenticate Hub <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                                </button>
                            </div>
                        </div>
                        <div className="lg:col-span-5 hidden lg:flex items-center justify-center py-20 relative">
                            <div className="relative w-full max-w-md space-y-6">
                                <div className="animate-float">
                                    <HeroCard icon={Logo.Alipay(48)} name="ALIPAY_HK" amount="¥ 12,400.00" statusLabel="EMITTED" statusCls="bg-brandblue-500/10 text-brandblue-400 border border-brandblue-500/20" />
                                </div>
                                <div className="animate-float-delayed ml-12">
                                    <HeroCard icon={Logo.GCash(48)} name="GCASH_HUB" amount="₱ 8,500.00" statusLabel="SETTLED" statusCls="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" />
                                </div>
                                <div className="animate-float ml-4 opacity-60 grayscale-[50%]">
                                    <HeroCard icon={Logo.USDT(48)} name="USDT_VAULT" amount="$ 1,200.00" statusLabel="LOCKED" statusCls="bg-white/5 text-white/40 border border-white/10" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section ref={loginSectionRef} className="py-32 lg:py-48 bg-[#F8FAFC] relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none" />
                <div className="max-w-xl w-full mx-auto px-10 relative z-10">
                    <div className="fintech-card bg-white border-0 rounded-[3rem] p-12 lg:p-16 shadow-[0_40px_80px_rgba(0,0,0,0.1)] relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2.5 bg-brandblue-600 shadow-[0_0_15px_rgba(0,122,255,0.3)]" />

                        <div className="text-center mb-16">
                            <div className="w-24 h-24 bg-[#0A0F1E] rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl border border-white/5 transition-transform hover:rotate-3 duration-500">
                                <Lock className="h-10 w-10 text-brandblue-400" />
                            </div>
                            <h2 className="text-4xl font-black text-[#0A0F1E] uppercase tracking-tighter">OPERATOR_LOGIN</h2>
                            <p className="text-muted-foreground/60 font-black text-[10px] mt-4 uppercase tracking-[0.4em]">Institutional Dashboard Access</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-8">
                            <div className="space-y-4">
                                <Label className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.3em] ml-1">Terminal Endpoint (Email)</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/30 group-focus-within:text-brandblue-600 transition-colors" />
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="OPERATOR@DOMAIN.COM"
                                        className="w-full h-18 bg-muted/20 border-border/40 rounded-2xl py-4 pl-14 pr-6 focus:ring-brandblue-500/10 border-2 outline-none transition-all text-sm font-black uppercase tracking-widest shadow-inner"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center ml-1">
                                    <Label className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.3em]">Access Sequence (Password)</Label>
                                    <Link to="/forgot-password" className="text-[9px] font-black text-brandblue-600 uppercase tracking-widest hover:underline">RECOVER_KEY</Link>
                                </div>
                                <div className="relative group">
                                    <Key className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/30 group-focus-within:text-brandblue-600 transition-colors" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full h-18 bg-muted/20 border-border/40 rounded-2xl py-4 pl-14 pr-14 focus:ring-brandblue-500/10 border-2 outline-none transition-all text-sm font-black tracking-widest shadow-inner"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-brandblue-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            {(localError || authError) && (
                                <div className="bg-rose-50 border-2 border-rose-100 text-rose-600 text-[10px] px-6 py-4 rounded-2xl flex items-center gap-3 font-black uppercase tracking-widest animate-shake">
                                    <XCircle className="h-5 w-5 shrink-0" />
                                    <span>{localError || authError}</span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={submitting}
                                className="w-full h-20 bg-[#0A0F1E] hover:bg-black text-white rounded-[2rem] font-black text-sm shadow-2xl active:scale-95 transition-all uppercase tracking-[0.4em] group mt-10"
                            >
                                {submitting ? (
                                    <div className="flex items-center gap-4">
                                        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
                                        <span>AUTHORIZING...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        <span>INIT_SESSION</span>
                                        <ArrowRight className="h-6 w-6 group-hover:translate-x-2 transition-transform" />
                                    </div>
                                )}
                            </Button>
                        </form>

                        {botUsername && (
                            <div className="mt-12 space-y-8 pt-10 border-t border-border/10">
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-border/20"></span>
                                    </div>
                                    <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.3em]">
                                        <span className="bg-white px-4 text-muted-foreground/40">NEURAL_ID_LOGIN</span>
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
                                <p className="text-[9px] text-center text-muted-foreground/40 font-black uppercase tracking-[0.2em] px-8 leading-relaxed">
                                    Fast-track authentication via Telegram creates a verified node identity automatically.
                                </p>
                            </div>
                        )}

                        <div className="mt-16 pt-10 border-t border-border/10 text-center">
                            <p className="text-muted-foreground/60 text-[11px] font-black uppercase tracking-[0.3em]">
                                NEW_TERMINAL_OPERATOR?{' '}
                                <Link to="/register" className="text-brand-blue-600 hover:underline ml-2">REGISTER_NODE</Link>
                            </p>
                        </div>
                    </div>

                    <div className="mt-12 text-center space-y-8 opacity-40 hover:opacity-100 transition-opacity duration-700">
                        <p className="text-muted-foreground/60 text-[10px] font-black uppercase tracking-[0.4em]">Network_Support_Channels</p>
                        <div className="flex justify-center gap-8">
                            {SUPPORT_LINKS.map(link => (
                                <a key={link.handle} href={link.href} className="text-xs font-black text-foreground hover:text-brandblue-600 transition-colors uppercase tracking-widest border-b-2 border-transparent hover:border-brandblue-500/20 pb-1">
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

