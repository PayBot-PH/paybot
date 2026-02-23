import { Link, useLocation } from 'react-router-dom';
import {
  Bot,
  BarChart3,
  Wallet,
  CreditCard,
  FileText,
  Building2,
  PieChart,
  Wifi,
  WifiOff,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/transactions', icon: FileText, label: 'Txns' },
  { to: '/disbursements', icon: Building2, label: 'Manage' },
  { to: '/reports', icon: PieChart, label: 'Reports' },
  { to: '/bot-settings', icon: Bot, label: 'Bot' },
];

const BOTTOM_NAV = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/transactions', icon: FileText, label: 'Txns' },
  { to: '/disbursements', icon: Building2, label: 'Manage' },
];

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

export default function Layout({ children, connected }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-700/50 bg-[#0F172A]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">PayBot</span>
            </Link>

            <div className="flex items-center gap-3">
              {/* Live indicator */}
              {connected !== undefined && (
                <div className="flex items-center gap-1">
                  {connected ? (
                    <div className="flex items-center gap-1 text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <Wifi className="h-3.5 w-3.5" />
                      <span className="text-[10px] uppercase tracking-wider font-semibold hidden sm:inline">Live</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-slate-500">
                      <WifiOff className="h-3.5 w-3.5" />
                      <span className="text-[10px] uppercase tracking-wider hidden sm:inline">Offline</span>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-0.5">
                {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
                  const active = path === to;
                  return (
                    <Link key={to} to={to}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          active
                            ? 'text-white bg-slate-700/60 text-xs px-2.5'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50 text-xs px-2.5'
                        }
                      >
                        <Icon className="h-3.5 w-3.5 mr-1" />
                        {label}
                      </Button>
                    </Link>
                  );
                })}
              </nav>

              {/* Logout button (desktop) */}
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  className="hidden md:flex text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs px-2.5"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" />
                  Logout
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0F172A]/95 backdrop-blur-md border-t border-slate-700/60 z-50 safe-area-bottom">
        <div className="flex items-stretch h-16">
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center justify-center flex-1 gap-0.5 py-2 transition-colors"
              >
                <div className={`p-1.5 rounded-lg transition-colors ${active ? 'bg-blue-600/20' : ''}`}>
                  <Icon className={`h-5 w-5 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                </div>
                <span
                  className={`text-[10px] font-medium leading-none ${
                    active ? 'text-blue-400' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
          {/* Logout on mobile bottom nav */}
          {user && (
            <button
              onClick={() => logout()}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 py-2 transition-colors"
            >
              <div className="p-1.5 rounded-lg transition-colors">
                <LogOut className="h-5 w-5 text-slate-500" />
              </div>
              <span className="text-[10px] font-medium leading-none text-slate-500">Logout</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

