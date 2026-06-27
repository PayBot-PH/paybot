import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, ArrowRight, Shield, TrendingUp, Users, Wallet, CreditCard } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

const metrics = [
  { label: 'Processed', value: '₱2B+', icon: Wallet },
  { label: 'Merchants', value: '10k+', icon: Users },
  { label: 'Uptime', value: '99.9%', icon: Shield },
];

const features = [
  {
    icon: CreditCard,
    title: 'Unified payment operations',
    description: 'Accept GCash, Maya, bank transfers, USDT, and QR codes from one interface.',
  },
  {
    icon: Shield,
    title: 'Trusted security',
    description: 'Encrypted settlement flows and verified merchant access for every payout.',
  },
  {
    icon: TrendingUp,
    title: 'Real-time insights',
    description: 'Monitor settlement trends, transaction volume, and gateway health in one view.',
  },
  {
    icon: Activity,
    title: 'Live operational status',
    description: 'Track payments, liquidity, and settlement readiness with live telemetry.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileNavOpen] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link to="/home" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-[0_15px_45px_rgba(15,23,42,0.25)]">
              <img src="/logo.svg" alt="Logo" className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-slate-300">{APP_NAME}</p>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link to="/features" className="text-sm font-semibold text-slate-300 transition hover:text-white">Features</Link>
            <Link to="/pricing" className="text-sm font-semibold text-slate-300 transition hover:text-white">Pricing</Link>
            <Link to="/login" className="text-sm font-semibold text-slate-300 transition hover:text-white">Sign in</Link>
            <Link to="/register" className="rounded-full bg-brandblue-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-brandblue-500/20 transition hover:bg-brandblue-400">
              Get started
            </Link>
          </div>

          <button
            className="md:hidden rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="Open menu"
          >
            {mobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-800 bg-slate-950/95 px-6 py-4 md:hidden">
            <div className="space-y-3">
              <Link to="/features" className="block text-sm font-semibold text-slate-300 hover:text-white">Features</Link>
              <Link to="/pricing" className="block text-sm font-semibold text-slate-300 hover:text-white">Pricing</Link>
              <Link to="/login" className="block text-sm font-semibold text-slate-300 hover:text-white">Sign in</Link>
              <Link to="/register" className="block rounded-full bg-brandblue-500 px-5 py-3 text-sm font-black text-white text-center hover:bg-brandblue-400">Get started</Link>
            </div>
          </div>
        )}
      </nav>

      <main className="pt-28">
        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="grid gap-12 lg:grid-cols-[1.35fr_0.9fr] items-start">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/90 bg-slate-900/80 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-slate-300">
                <Activity className="h-4 w-4 text-brandblue-400" />
                Built for Philippine payments
              </div>

              <div className="space-y-6">
                <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl">
                  Run payments, settlements, and merchant operations from one powerful dashboard.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-400">
                  A premium payment control plane for local businesses that need fast settlement visibility, live support insights, and trusted payout routing.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link to="/register" className="inline-flex w-full items-center justify-center rounded-full bg-brandblue-500 px-6 py-4 text-sm font-black text-white shadow-lg shadow-brandblue-500/20 transition hover:bg-brandblue-400">
                  Start accepting payments
                </Link>
                <Link to="/features" className="inline-flex w-full items-center justify-center rounded-full border border-slate-800 bg-slate-900/80 px-6 py-4 text-sm font-black text-slate-100 transition hover:border-brandblue-400 hover:text-white">
                  Explore features
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-[1.75rem] border border-slate-800/90 bg-slate-900/80 p-6">
                    <div className="flex items-center gap-3">
                      <metric.icon className="h-5 w-5 text-brandblue-400" />
                      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{metric.label}</p>
                    </div>
                    <p className="mt-6 text-3xl font-black text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="overflow-hidden rounded-[2rem] border border-slate-800/90 bg-slate-900/80 p-7 shadow-xl shadow-black/20">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-brandblue-300">Live overview</p>
                    <h2 className="mt-4 text-3xl font-black text-white">₱842K</h2>
                    <p className="mt-3 max-w-xs text-sm text-slate-400">Payments processed today, settlement readiness, and merchant status in one place.</p>
                  </div>
                  <div className="h-14 w-14 rounded-[1.25rem] bg-brandblue-500/10 grid place-items-center text-brandblue-300">
                    <ArrowRight className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/80 p-5">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Success rate</p>
                    <p className="mt-3 text-2xl font-black text-white">97.8%</p>
                  </div>
                  <div className="rounded-[1.75rem] border border-slate-800/80 bg-slate-950/80 p-5">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Settlements ready</p>
                    <p className="mt-3 text-2xl font-black text-white">24</p>
                  </div>
                </div>
              </div>

              <Card className="rounded-[2rem] border border-border/50 bg-slate-950/90 text-slate-100">
                <CardHeader>
                  <CardTitle className="text-base text-white">Why PayBot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-5">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800 text-brandblue-400">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="font-semibold text-white">{feature.title}</p>
                            <p className="text-sm text-slate-400">{feature.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="rounded-[2rem] border border-slate-800/90 bg-slate-900/80 p-8 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-brandblue-300">Payment methods</p>
                <h2 className="mt-3 text-3xl font-black text-white">Accept every payment your customers prefer.</h2>
              </div>
              <div className="rounded-full bg-slate-950/80 px-4 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-slate-300">
                Live now
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { name: 'GCash', color: 'bg-sky-500/10 text-sky-300' },
                { name: 'Maya', color: 'bg-rose-500/10 text-rose-300' },
                { name: 'Bank Transfer', color: 'bg-emerald-500/10 text-emerald-300' },
                { name: 'USDT', color: 'bg-amber-500/10 text-amber-300' },
              ].map((method) => (
                <div key={method.name} className={`rounded-[1.75rem] border border-slate-800/90 ${method.color} px-6 py-5`}>
                  <p className="font-black text-white">{method.name}</p>
                  <p className="mt-2 text-sm text-slate-400">Instant, trusted settlement routing.</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
