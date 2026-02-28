import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bot,
  Wallet,
  Bell,
  ShieldCheck,
  CreditCard,
  Send,
  BarChart3,
  Zap,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: CreditCard,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    title: 'Multi-Method Payments',
    desc: 'Invoice, QR Code, Alipay, WeChat Pay, Payment Links, Virtual Accounts & more.',
    delay: 0,
  },
  {
    icon: Wallet,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    title: 'Wallet & Disbursements',
    desc: 'Top up your wallet and disburse funds to recipients instantly.',
    delay: 100,
  },
  {
    icon: Bell,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    title: 'Real-time Alerts',
    desc: 'Get instant Telegram notifications for every payment event.',
    delay: 200,
  },
  {
    icon: Send,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    title: 'USDT Send Requests',
    desc: 'Manage crypto USDT send requests directly from the dashboard.',
    delay: 300,
  },
  {
    icon: BarChart3,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
    title: 'Reports & Analytics',
    desc: 'Track transactions, view success rates and export reports.',
    delay: 400,
  },
  {
    icon: ShieldCheck,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
    title: 'Secure Telegram Auth',
    desc: 'Only authorized Telegram accounts can access the admin panel.',
    delay: 500,
  },
];

const TICKER_ITEMS = [
  '💳 Invoice payments',
  '📲 QR Code checkout',
  '🏦 Virtual Accounts',
  '💸 Instant disbursements',
  '🔔 Real-time alerts',
  '🔐 Telegram-only auth',
  '📊 Analytics & Reports',
  '🪙 USDT transfers',
];

function useVisible(delay: number) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return visible;
}

function FeatureCard({
  icon: Icon,
  color,
  bg,
  title,
  desc,
  delay,
}: (typeof FEATURES)[number]) {
  const visible = useVisible(delay + 600);
  return (
    <div
      className={`border rounded-2xl p-4 ${bg} transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm mb-1">{title}</p>
          <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}

export default function BotIntro() {
  const { user, loading } = useAuth();

  const titleVisible = useVisible(100);
  const subtitleVisible = useVisible(350);
  const tickerVisible = useVisible(550);
  const ctaVisible = useVisible(800);

  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIdx((i) => (i + 1) % TICKER_ITEMS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full bg-cyan-600/5 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 max-w-2xl mx-auto w-full">
        {/* Bot icon */}
        <div
          className={`mb-8 transition-all duration-700 ${
            titleVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`}
        >
          <div className="relative">
            <div className="h-20 w-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/40 mx-auto">
              <Bot className="h-10 w-10 text-white" />
            </div>
            {/* Ping ring */}
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500" />
            </span>
          </div>
        </div>

        {/* Title */}
        <div
          className={`text-center mb-3 transition-all duration-700 ${
            titleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Meet <span className="text-blue-400">PayBot</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">by DRL Solutions</p>
        </div>

        {/* Subtitle */}
        <p
          className={`text-center text-slate-300 text-base sm:text-lg max-w-md mb-6 leading-relaxed transition-all duration-700 ${
            subtitleVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          Your all-in-one Telegram bot for payments, disbursements, real-time alerts, and admin management.
        </p>

        {/* Animated ticker */}
        <div
          className={`mb-10 transition-all duration-700 ${
            tickerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-5 py-2.5">
            <Zap className="h-4 w-4 text-blue-400 shrink-0" />
            <span
              key={tickerIdx}
              className="text-slate-200 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              {TICKER_ITEMS[tickerIdx]}
            </span>
          </div>
        </div>

        {/* Feature cards grid */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>

        {/* CTA */}
        <div
          className={`flex flex-col sm:flex-row gap-3 w-full sm:w-auto transition-all duration-700 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-8 rounded-xl transition-colors shadow-lg shadow-blue-500/25 text-sm"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/features"
            className="flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 hover:text-white font-medium py-3 px-6 rounded-xl transition-colors text-sm"
          >
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
            See all features
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-8 text-slate-600 text-xs text-center">
          Need access?{' '}
          <a
            href="https://t.me/traxionpay"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 transition-colors"
          >
            Contact @traxionpay
          </a>
        </p>

        {/* Bottom grid lines decoration */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>
    </div>
  );
}
