import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Home, LayoutDashboard, CreditCard, Send, FileText, BarChart3,
  Wallet, Settings, LogOut, Menu, User, ShieldCheck, Crown,
  ChevronRight, Zap, Bell, CheckCircle, XCircle, Clock, Bot,
  MessageSquare, Users, CalendarDays, RotateCcw, ArrowUpFromLine
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Payments', icon: CreditCard, path: '/payments' },
  { label: 'Disbursements', icon: Send, path: '/disbursements' },
  { label: 'Transactions', icon: FileText, path: '/transactions' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
  { label: 'Wallet', icon: Wallet, path: '/wallet' },
  { label: 'Refunds', icon: RotateCcw, path: '/refunds' },
  { label: 'Schedules', icon: CalendarDays, path: '/schedules' },
  { label: 'Customers', icon: Users, path: '/customers' },
  { label: 'Bot Messages', icon: MessageSquare, path: '/bot-messages' },
  { label: 'Bot Settings', icon: Bot, path: '/bot-settings', permission: 'can_manage_bot' },
  { label: 'Admin Management', icon: ShieldCheck, path: '/admin-management', adminOnly: true },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export default function Layout({ children, connected }: LayoutProps) {
  const { user, logout, isSuperAdmin, permissions } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const visibleNav = navItems.filter(item => {
    if (item.adminOnly && !isSuperAdmin) return false;
    if (item.permission && !permissions?.[item.permission as keyof typeof permissions]) return false;
    return true;
  });

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-slate-200 bg-white">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900 tracking-tight">PayBot</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {visibleNav.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-slate-900' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 ml-auto text-slate-400" />}
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name || user?.telegram_username || 'Admin'}</p>
              <p className="text-xs text-slate-500 truncate">{isSuperAdmin ? 'Super Administrator' : 'Administrator'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 text-xs font-medium"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </Button>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-600">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-white border-r border-slate-200">
                <div className="h-16 flex items-center px-5 border-b border-slate-100">
                  <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
                    <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-base font-semibold text-slate-900 tracking-tight">PayBot</span>
                  </Link>
                </div>
                <nav className="py-4 px-3 space-y-0.5">
                  {visibleNav.map(item => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                          active
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-slate-900' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                        {active && <ChevronRight className="h-3.5 w-3.5 ml-auto text-slate-400" />}
                      </Link>
                    );
                  })}
                </nav>
                <div className="p-4 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMobileOpen(false); handleLogout(); }}
                    className="w-full justify-start gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 text-xs font-medium"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-slate-900 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-900">PayBot</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {connected !== undefined && (
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                {connected ? 'Live' : 'Offline'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0">
        {/* Desktop Top Bar */}
        <div className={`hidden lg:flex h-16 items-center justify-between px-6 sticky top-0 z-40 transition-all duration-200 ${
          scrolled ? 'bg-white/80 backdrop-blur-md border-b border-slate-200' : 'bg-transparent'
        }`}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-slate-500">
              {navItems.find(n => isActive(n.path))?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {connected !== undefined && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                {connected ? 'Live Updates' : 'Offline'}
              </span>
            )}
            <div className="h-8 w-px bg-slate-200 mx-1" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <span className="text-xs font-medium text-slate-700">{user?.name || user?.telegram_username || 'Admin'}</span>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="px-4 py-6 lg:px-6 lg:py-8 pt-20 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
