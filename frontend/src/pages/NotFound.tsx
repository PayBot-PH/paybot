import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, LayoutDashboard, CreditCard, FileText, BarChart3 } from 'lucide-react';

const QUICK_LINKS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/transactions', icon: FileText, label: 'Transactions' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <p className="text-8xl font-black text-slate-100 select-none">404</p>
          <h1 className="text-2xl font-bold text-foreground -mt-4">Page not found</h1>
          <p className="text-muted-foreground text-sm">The page you're looking for doesn't exist or has been moved.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_LINKS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-slate-300 transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        <Link to="/">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            <Home className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
