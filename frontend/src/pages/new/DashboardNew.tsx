import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Bell, CreditCard, DollarSign, LayoutGrid, MessageSquare, ShieldCheck, TrendingUp, Users, Wallet, Zap } from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const stats = [
  { label: 'Gross Revenue', value: '₱ 2.4M', note: '+18.2% vs last month', icon: DollarSign, accent: 'text-emerald-400' },
  { label: 'Successful Payments', value: '12,480', note: '96.8% success rate', icon: CreditCard, accent: 'text-sky-400' },
  { label: 'Active Merchants', value: '328', note: '24 new this week', icon: Users, accent: 'text-violet-400' },
  { label: 'Pending Settlements', value: '₱ 84K', note: '5 items awaiting review', icon: Activity, accent: 'text-amber-400' },
];

const quickActions = [
  { label: 'Create Payment', href: '/create-payment', icon: CreditCard, tone: 'bg-sky-500/15 text-sky-400' },
  { label: 'Send Payout', href: '/disbursements', icon: ArrowRight, tone: 'bg-emerald-500/15 text-emerald-400' },
  { label: 'Wallet Overview', href: '/wallet', icon: Wallet, tone: 'bg-violet-500/15 text-violet-400' },
  { label: 'View Reports', href: '/reports', icon: LayoutGrid, tone: 'bg-amber-500/15 text-amber-400' },
];

const recentActivity = [
  { title: 'QR payment completed', detail: 'Merchant: KTV Lounge • 2 mins ago', amount: '+₱ 12,500' },
  { title: 'Payout approved', detail: 'Settlement to Maya • 18 mins ago', amount: '₱ 55,000' },
  { title: 'New merchant onboarded', detail: 'Sari-sari hub • 1 hour ago', amount: 'Verified' },
];

export default function DashboardNew() {
  const { user } = useAuth();
  const displayName = user?.name || user?.email || 'Operator';

  return (
    <Layout>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-300">
                <Zap className="h-3.5 w-3.5" />
                New control center
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Welcome back, {displayName}
                </h1>
                <p className="mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
                  Monitor payments, merchants, and settlements from one modern workspace built for fast decisions.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="rounded-full bg-sky-500 text-white hover:bg-sky-400">
                  <Link to="/create-payment">Create payment</Link>
                </Button>
                <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
                  <Link to="/transactions" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" /> View alerts
                  </Link>
                </Button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">Today</p>
              <p className="mt-3 text-4xl font-black tracking-tight text-white">₱ 842K</p>
              <p className="mt-2 text-sm text-emerald-400">+12.4% from yesterday</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-border/50 bg-card/70">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{stat.label}</p>
                      <p className="mt-3 text-2xl font-black tracking-tight text-foreground">{stat.value}</p>
                    </div>
                    <div className={`rounded-2xl bg-background/70 p-3 ${stat.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{stat.note}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Quick actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link key={action.label} to={action.href} className="group rounded-[1.25rem] border border-border/50 bg-background/50 p-4 transition hover:border-sky-400/40 hover:bg-background/80">
                      <div className={`inline-flex rounded-2xl p-3 ${action.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="mt-4 font-semibold text-foreground">{action.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Jump straight into this workflow</p>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-sky-400" />
                System status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Payments API', value: 'Operational', tone: 'text-emerald-400' },
                { label: 'Settlement Queue', value: 'Healthy', tone: 'text-sky-400' },
                { label: 'Merchant Sync', value: 'Running', tone: 'text-violet-400' },
              ].map((status) => (
                <div key={status.label} className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/50 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{status.label}</span>
                  <span className={`text-sm font-semibold ${status.tone}`}>{status.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-sky-400" />
                Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.title} className="flex items-center justify-between rounded-[1.25rem] border border-border/50 bg-background/50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{item.amount}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-violet-400" />
                Performance snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.25rem] border border-border/50 bg-background/50 p-4">
                <p className="text-sm text-muted-foreground">Settlement speed</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">1.8 min</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/50 bg-background/50 p-4">
                <p className="text-sm text-muted-foreground">Average ticket size</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">₱ 3,420</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
