import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
import { Users, CreditCard, Code2, ArrowUpRight, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const cards = [
    {
      title: 'Your Team',
      description: 'Manage admin access, assign roles, and keep your staff aligned with the right permissions.',
      icon: <Users className="h-5 w-5 text-sky-500" />, 
      href: '/admin-management',
      badge: 'Team',
    },
    {
      title: 'Billing & Fees',
      description: 'Review pricing, payment fees, and statements so you can control costs and reconciliation.',
      icon: <CreditCard className="h-5 w-5 text-emerald-500" />, 
      href: '/pricing',
      badge: 'Finance',
    },
    {
      title: 'Developers',
      description: 'Configure webhook endpoints, API tokens, and bot integration settings in one place.',
      icon: <Code2 className="h-5 w-5 text-violet-500" />, 
      href: '/bot-settings',
      badge: 'Integration',
    },
    {
      title: 'Withdrawals',
      description: 'Request payouts, track withdrawal approvals, and monitor settlement status.',
      icon: <ArrowUpRight className="h-5 w-5 text-amber-500" />, 
      href: '/wallet',
      badge: 'Cashflow',
    },
    {
      title: 'Security',
      description: 'Enable stronger controls, review login activity, and keep your workspace safe.',
      icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />, 
      href: '/bot-settings',
      badge: 'Safety',
    },
    {
      title: 'App Settings',
      description: 'Update platform settings, notification preferences, and bot behavior across your account.',
      icon: <SettingsIcon className="h-5 w-5 text-slate-500" />, 
      href: '/bot-settings',
      badge: 'Platform',
    },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Settings</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-foreground">Control center for your account</h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
              Find the most important configuration areas in one place. Use these cards to quickly access team, billing, developer, and payout settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">
              <Link to="/bot-settings">Open Bot Settings</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <Link to="/wallet">View Wallet</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title} className="group border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200">
              <CardHeader className="space-y-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                    {card.icon}
                  </div>
                  <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] uppercase tracking-[0.16em]">{card.badge}</Badge>
                </div>
                <CardTitle className="text-lg font-semibold text-foreground">{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-0">
                <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                <div className="flex items-center justify-between gap-3">
                  <Button asChild size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">
                    <Link to={card.href}>Manage</Link>
                  </Button>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Go</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
