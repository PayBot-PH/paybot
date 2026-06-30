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
  MessageSquare, ArrowUpFromLine, DollarSign, ClipboardList,
  ChevronDown, Lock, FileCheck, AlertCircle, Sparkles
} from 'lucide-react';
import '../styles/dashboard-enhancements.css';

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  icon: any;
  path: string;
  adminOnly?: boolean;
  permission?: string;
}

const userNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Payments', icon: CreditCard, path: '/payments' },
  { label: 'Disbursements', icon: Send, path: '/disbursements' },
  { label: 'Transactions', icon: FileText, path: '/transactions' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
  { label: 'Wallet', icon: Wallet, path: '/wallet' },
  { label: 'Bot Messages', icon: MessageSquare, path: '/bot-messages' },
];

const adminNavItems: NavItem[] = [
  { label: 'KYB Registrations', icon: ClipboardList, path: '/kyb-registrations' },
  { label: 'KYC Verifications', icon: ShieldCheck, path: '/kyc-verifications' },
  { label: 'Top-up Requests', icon: DollarSign, path: '/topup-requests' },
  { label: 'USDT Requests', icon: Send, path: '/usdt-send-requests' },
  { label: 'Bank Deposits', icon: ArrowUpFromLine, path: '/bank-deposits' },
  { label: 'Bot Settings', icon: Bot, path: '/bot-settings', permission: 'can_manage_bot' },
  { label: 'Admin Management', icon: ShieldCheck, path: '/admin-management' },
];

export default function Layout({ children, connected }: LayoutProps) {
  const { user, logout, isSuperAdmin, permissions } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const getVisibleItems = (items: NavItem[]) =>
    items.filter(item => {
      if (item.permission && !permissions?.[item.permission as keyof typeof permissions]) return false;
      return true;
    });

  const sections: NavSection[] = [
    {
      label: 'Main',
      items: getVisibleItems(userNavItems),
    },
    ...(isSuperAdmin ? [{
      label: 'Administration',
      items: getVisibleItems(adminNavItems),
    }] : []),
    {
      label: 'Account',
      items: [{ label: 'Settings', icon: Settings, path: '/settings' }],
    },
  ];

  const allItems = [...userNavItems, ...(isSuperAdmin ? adminNavItems : []), { label: 'Settings', icon: Settings, path: '/settings' }];

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
      <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-slate-200 bg-gradient-to-b from-white via-white to-slate-50/80">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100 bg-white/90 backdrop-blur-sm">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
              <Sparkles className="h-4 w-4 text-white relative z-10 group-hover:animate-spin transition-transform" />
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent group-hover:from-slate-700 group-hover:to-slate-500 transition-all duration-300">xend</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {sections.map((section, idx) => (
            <div key={section.label} className={idx > 0 ? 'pt-2' : ''}>
              {section.label !== 'Main' && (
                <div className="px-3 py-2 flex items-center justify-between group">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{section.label}</p>
                  {section.label === 'Administration' && isSuperAdmin && (
                    <Crown className="h-3 w-3 text-amber-500" />
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth ${
                        active
                          ? 'bg-gradient-to-r from-slate-100 to-blue-50 text-slate-900 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:border hover:border-slate-200'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 shrink-0 transition-transform ${active ? 'text-slate-900 animate-float' : 'text-slate-400 group-hover:scale-110'}`} />
                      <span className="truncate">{item.label}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5 ml-auto text-slate-400 animate-float" style={{animationDelay: '0.2s'}} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              isSuperAdmin ? 'bg-amber-100' : 'bg-slate-100'
            }`}>
              {isSuperAdmin ? (
                <Crown className={`h-4.5 w-4.5 ${isSuperAdmin ? 'text-amber-600' : 'text-slate-500'}`} />
              ) : (
                <User className="h-4 w-4 text-slate-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name || user?.telegram_username || 'Admin'}</p>
              <p className={`text-xs font-medium truncate ${isSuperAdmin ? 'text-amber-600' : 'text-slate-500'}`}>
                {isSuperAdmin ? '👑 Super Administrator' : '🔐 Administrator'}
              </p>
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
                  <Link to="/" className="flex items-center gap-2.5 group" onClick={() => setMobileOpen(false)}>
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 group-hover:opacity-40 transition-opacity" />
                      <Sparkles className="h-4 w-4 text-white relative z-10" />
                    </div>
                    <span className="text-base font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">xend</span>
                  </Link>
                </div>
                <nav className="py-4 px-3 space-y-6">
                  {sections.map((section, idx) => (
                    <div key={section.label}>
                      {section.label !== 'Main' && (
                        <div className="px-3 py-2 flex items-center justify-between group">
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{section.label}</p>
                          {section.label === 'Administration' && isSuperAdmin && (
                            <Crown className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {section.items.map(item => {
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
                      </div>
                    </div>
                  ))}
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
            <Link to="/" className="flex items-center gap-2 group">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20" />
                <Sparkles className="h-3.5 w-3.5 text-white relative z-10" />
              </div>
              <span className="text-sm font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">xend</span>
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
              {allItems.find(n => isActive(n.path))?.label || 'Dashboard'}
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
