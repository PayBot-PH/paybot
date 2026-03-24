import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowRight, Bot, BarChart3, Wallet, CreditCard, ShieldCheck,
  Zap, Globe, TrendingUp, DollarSign, Building2, CheckCircle2,
  MessageCircle, Bell, Users, ChevronRight, Star, Lock, Smartphone,
  PieChart, Send, RefreshCw, Receipt, Menu, X, ArrowUpRight,
} from 'lucide-react';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL } from '@/lib/brand';
import ComplianceBar from '@/components/ComplianceBar';

/* ─── Nav ──────────────────────────────────────────────────────── */
function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.07] bg-[#080E1A]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bot className="h-4.5 w-4.5 text-white" style={{ height: 18, width: 18 }} />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">{APP_NAME}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <Link to="/features" className="hover:text-white transition-colors">Features</Link>
          <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Support</a>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors px-4 py-1.5 rounded-lg border border-white/10 hover:border-white/20">
            Sign in
          </Link>
          <Link to="/login" className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
            Get started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setOpen(v => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-[#0D1526] border-t border-white/[0.07] px-4 py-4 flex flex-col gap-3 text-sm">
          <Link to="/features" className="text-slate-300 hover:text-white py-2" onClick={() => setOpen(false)}>Features</Link>
          <Link to="/pricing" className="text-slate-300 hover:text-white py-2" onClick={() => setOpen(false)}>Pricing</Link>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white py-2">Support</a>
          <Link to="/login" className="mt-2 text-center bg-blue-600 text-white py-2 rounded-lg font-medium" onClick={() => setOpen(false)}>Get started</Link>
        </div>
      )}
    </nav>
  );
}

/* ─── Stat card ────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
          <ArrowUpRight className="h-3 w-3" />{sub}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ─── Feature card ─────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, color, bg, title, description }: {
  icon: React.ElementType; color: string; bg: string;
  title: string; description: string;
}) {
  return (
    <div className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-2xl p-6 transition-all duration-200">
      <div className={`h-12 w-12 rounded-xl ${bg} border ${color.replace('text-', 'border-').replace('400', '500/30')} flex items-center justify-center mb-4`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

/* ─── Testimonial ──────────────────────────────────────────────── */
function Testimonial({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <article className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <div className="flex gap-1 mb-4">
        {[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}
      </div>
      <blockquote className="text-slate-300 text-sm leading-relaxed mb-4">"{quote}"</blockquote>
      <cite className="not-italic">
        <p className="text-white text-sm font-medium">{name}</p>
        <p className="text-slate-500 text-xs">{role}</p>
      </cite>
    </article>
  );
}

/* ─── Main page ────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#080E1A] text-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Glow blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-indigo-600/8 rounded-full blur-3xl" />
          <div className="absolute top-60 right-1/4 w-[250px] h-[250px] bg-cyan-600/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-300 font-medium mb-8">
            <Zap className="h-3 w-3" />
            BSP-Regulated · PCI DSS Compliant · Built for the Philippines
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            <span className="text-white">The Financial Platform</span><br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Powering Philippine Business
            </span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Accept payments, manage disbursements, and grow your business — all from a single
            Telegram-native dashboard built for modern Philippine merchants.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              Start for free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white font-medium px-8 py-3.5 rounded-xl transition-colors"
            >
              Explore features <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Trust line */}
          <p className="mt-8 text-xs text-slate-500">
            Trusted by <span className="text-slate-300 font-medium">500+</span> merchants ·
            <span className="text-slate-300 font-medium"> ₱2B+</span> processed ·
            <span className="text-slate-300 font-medium"> 99.9%</span> uptime
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} color="bg-emerald-500/15 text-emerald-400" label="Total Volume" value="₱2B+" sub="+18% MoM" />
          <StatCard icon={Users} color="bg-blue-500/15 text-blue-400" label="Active Merchants" value="500+" sub="+24% QoQ" />
          <StatCard icon={TrendingUp} color="bg-purple-500/15 text-purple-400" label="Success Rate" value="99.4%" sub="+0.2%" />
          <StatCard icon={Globe} color="bg-amber-500/15 text-amber-400" label="Payment Methods" value="12+" sub="Always growing" />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Platform Capabilities</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Everything your business needs</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            From real-time payments to detailed analytics — one platform, zero complexity.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard icon={CreditCard} color="text-blue-400" bg="bg-blue-500/10"
            title="Multi-Method Payments"
            description="Accept GCash, Maya, GrabPay, virtual accounts, QR codes, e-wallets, and international wallets like Alipay & WeChat Pay." />
          <FeatureCard icon={Send} color="text-purple-400" bg="bg-purple-500/10"
            title="Instant Disbursements"
            description="Send payouts to any Philippine bank or e-wallet in seconds. Batch disbursements supported for enterprise payroll." />
          <FeatureCard icon={BarChart3} color="text-cyan-400" bg="bg-cyan-500/10"
            title="Real-Time Analytics"
            description="Live dashboards with transaction trends, revenue breakdowns, and exportable reports for accounting." />
          <FeatureCard icon={Bot} color="text-emerald-400" bg="bg-emerald-500/10"
            title="Telegram-Native Bot"
            description="Manage everything from Telegram — get payment alerts, approve requests, and run commands on the go." />
          <FeatureCard icon={ShieldCheck} color="text-amber-400" bg="bg-amber-500/10"
            title="Enterprise Security"
            description="BSP-regulated, PCI DSS compliant, with end-to-end encryption and role-based access control for your team." />
          <FeatureCard icon={RefreshCw} color="text-rose-400" bg="bg-rose-500/10"
            title="Automated Workflows"
            description="Set up payment reminders, webhook notifications, and auto-reconciliation to eliminate manual work." />
          <FeatureCard icon={Wallet} color="text-indigo-400" bg="bg-indigo-500/10"
            title="Multi-Currency Wallet"
            description="Hold PHP and USDT balances in one place. Convert and transfer with competitive rates." />
          <FeatureCard icon={Receipt} color="text-teal-400" bg="bg-teal-500/10"
            title="Digital Invoicing"
            description="Create branded invoices with auto-payment links. Track payment status and send automated reminders." />
          <FeatureCard icon={Building2} color="text-orange-400" bg="bg-orange-500/10"
            title="KYC / KYB Compliance"
            description="Built-in identity verification workflows for merchants and customers, fully compliant with BSP regulations." />
        </div>

        <div className="mt-8 text-center">
          <Link to="/features" className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
            See all features <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Payment methods strip ── */}
      <section className="border-y border-white/[0.06] bg-white/[0.02] py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-slate-500 text-xs uppercase tracking-widest font-medium mb-8">Accepted payment methods</p>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6">
            {[
              { src: '/logos/gcash.svg',     alt: 'GCash',     bg: '#007DFF' },
              { src: '/logos/maya.svg',      alt: 'Maya',      bg: '#00C851' },
              { src: '/logos/grab.svg',      alt: 'GrabPay',   bg: '#00B14F' },
              { src: '/logos/alipay.svg',    alt: 'Alipay',    bg: '#1677FF' },
              { src: '/logos/wechat.svg',    alt: 'WeChat Pay',bg: '#07C160' },
              { src: '/logos/bpi.svg',       alt: 'BPI',       bg: '#003087' },
              { src: '/logos/bdo.svg',       alt: 'BDO',       bg: '#003087' },
              { src: '/logos/unionbank.svg', alt: 'UnionBank', bg: '#003087' },
              { src: '/logos/tether.svg',    alt: 'USDT',      bg: '#26A17B' },
            ].map(({ src, alt, bg }) => (
              <div key={alt} title={alt}
                className="h-10 w-10 rounded-xl flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
                style={{ background: bg, padding: 8 }}>
                <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Up and running in minutes</h2>
          <p className="text-slate-400 max-w-xl mx-auto">No complex integrations. Just connect and start accepting payments today.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: '01', icon: Bot, title: 'Connect your bot', desc: 'Link your Telegram bot to our platform and configure your payment settings in minutes.' },
            { step: '02', icon: CreditCard, title: 'Accept payments', desc: 'Share payment links or QR codes with customers. Money flows directly to your wallet.' },
            { step: '03', icon: TrendingUp, title: 'Track & grow', desc: 'Monitor transactions in real-time, generate reports, and optimize your financial operations.' },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="relative">
              <div className="text-6xl font-black text-white/[0.04] mb-4 leading-none">{step}</div>
              <div className="h-12 w-12 bg-blue-600/15 border border-blue-500/25 rounded-xl flex items-center justify-center mb-4">
                <Icon className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-white/[0.02] border-y border-white/[0.06] py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-3xl font-bold text-white">Trusted by Philippine merchants</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <Testimonial
              quote="PayBot transformed how we collect payments. Setup took under 10 minutes and our conversion rate jumped significantly."
              name="Maria Santos" role="E-commerce Owner, Cebu" />
            <Testimonial
              quote="The Telegram integration is brilliant. I get notified instantly for every payment and can manage everything without leaving the app."
              name="Rico Dela Cruz" role="Freelance Developer, Manila" />
            <Testimonial
              quote="Finally a Filipino payment platform that takes compliance seriously. BSP-regulated and incredibly easy to use for our team."
              name="Ana Reyes" role="CFO, SME Retailer" />
          </div>
        </div>
      </section>

      {/* ── Security & compliance ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Security & Compliance</p>
            <h2 className="text-3xl font-bold text-white mb-5">Built for regulated financial services</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              {APP_NAME} is designed to meet the highest standards for Philippine financial regulations,
              protecting your business and your customers.
            </p>
            <div className="space-y-4">
              {[
                { icon: ShieldCheck, title: 'BSP Regulated', desc: 'Fully compliant with Bangko Sentral ng Pilipinas regulations' },
                { icon: Lock, title: 'PCI DSS Compliant', desc: 'Payment Card Industry Data Security Standard certified' },
                { icon: Smartphone, title: '2FA & Role-Based Access', desc: 'Multi-factor authentication and granular team permissions' },
                { icon: Bell, title: 'Real-time Fraud Monitoring', desc: 'Automated alerts and anomaly detection on all transactions' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center mt-0.5">
                    <Icon className="h-4.5 w-4.5 text-blue-400" style={{ height: 18, width: 18 }} />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{title}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.07]">
              <div className="h-9 w-9 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" style={{ height: 18, width: 18 }} />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">All systems operational</p>
                <p className="text-slate-400 text-xs">Last checked just now · 99.9% uptime</p>
              </div>
            </div>
            {[
              { label: 'Payment Gateway', status: 'Operational', color: 'text-emerald-400' },
              { label: 'Webhook Delivery', status: 'Operational', color: 'text-emerald-400' },
              { label: 'Admin Dashboard', status: 'Operational', color: 'text-emerald-400' },
              { label: 'Telegram Bot', status: 'Operational', color: 'text-emerald-400' },
              { label: 'KYC Processing', status: 'Operational', color: 'text-emerald-400' },
            ].map(({ label, status, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">{label}</span>
                <span className={`text-xs font-medium ${color}`}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600/20 via-indigo-600/15 to-purple-600/10 border border-blue-500/20 rounded-3xl px-8 py-16 text-center">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-blue-600/15 rounded-full blur-3xl" />
          </div>
          <div className="relative">
            <PieChart className="h-10 w-10 text-blue-400 mx-auto mb-6" />
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Start accepting payments today
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto mb-8 text-lg">
              Join 500+ Philippine merchants who trust {APP_NAME} to power their financial operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/login" className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-600/20">
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/pricing" className="inline-flex items-center justify-center gap-2 bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.12] text-white font-medium px-8 py-3.5 rounded-xl transition-colors">
                View pricing <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.07]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-white">{APP_NAME}</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                The modern financial platform built for Philippine businesses. Accept payments, manage teams, and grow with confidence.
              </p>
            </div>
            <div>
              <p className="text-white text-sm font-semibold mb-3">Product</p>
              <div className="space-y-2">
                <Link to="/features" className="block text-slate-400 hover:text-white text-sm transition-colors">Features</Link>
                <Link to="/pricing" className="block text-slate-400 hover:text-white text-sm transition-colors">Pricing</Link>
                <Link to="/policies" className="block text-slate-400 hover:text-white text-sm transition-colors">Policies</Link>
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-semibold mb-3">Company</p>
              <div className="space-y-2">
                <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="block text-slate-400 hover:text-white text-sm transition-colors">Support</a>
                <Link to="/login" className="block text-slate-400 hover:text-white text-sm transition-colors">Sign in</Link>
                <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="block text-slate-400 hover:text-white text-sm transition-colors">Contact</a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/policies" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
              <Link to="/policies" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
        <ComplianceBar />
      </footer>
    </div>
  );
}
