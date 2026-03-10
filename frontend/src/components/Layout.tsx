import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bot, BarChart3, Wallet, CreditCard, FileText, Building2, PieChart,
  WifiOff, LogOut, ShieldCheck, MessageSquare, ScrollText, Crown, User,
  Menu, X, Activity, Send, ClipboardList, DollarSign, ChevronDown,
  MessageCircle, UserCheck, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_NAME, APP_SUBTITLE, SUPPORT_URL } from '@/lib/brand';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

export default function Layout({ children, connected }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { user, logout, isAdmin, isSuperAdmin, permissions } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userName =
    (user as { name?: string; telegram_username?: string } | null)?.name ||
    (user as { telegram_username?: string } | null)?.telegram_username ||
    'Admin';

  const navSections: NavSection[] = [
    {
      label: 'Overview',
      items: [
        { to: '/', icon: BarChart3, label: 'Dashboard' },
        { to: '/wallet', icon: Wallet, label: 'Wallet' },
      ],
    },
    {
      label: 'Payments',
      items: [
        { to: '/payments', icon: CreditCard, label: 'Payments Hub' },
        { to: '/transactions', icon: FileText, label: 'Transactions' },
        { to: '/disbursements', icon: Building2, label: 'Disbursements' },
        { to: '/reports', icon: PieChart, label: 'Reports' },
      ],
    },
    ...(isAdmin || permissions?.can_manage_bot || isSuperAdmin
      ? [{
          label: 'System',
          items: [
            ...(isAdmin || isSuperAdmin
              ? [{ to: '/bot-messages', icon: MessageSquare, label: 'Bot Messages' }]
              : []),
            ...(permissions?.can_manage_bot
              ? [{ to: '/bot-settings', icon: Bot, label: 'Bot Settings' }]
              : []),
            ...(isSuperAdmin
              ? [
                  { to: '/admin-management', icon: ShieldCheck, label: 'Admin Management', badge: 'Super' },
                  { to: '/usdt-send-requests', icon: Send, label: 'USDT Requests', badge: 'Super' },
                  { to: '/topup-requests', icon: DollarSign, label: 'Topup Requests', badge: 'Super' },
                  { to: '/kyb-registrations', icon: ClipboardList, label: 'KYB Registrations', badge: 'Super' },
                  { to: '/kyc-verifications', icon: UserCheck, label: 'KYC Verifications', badge: 'Super' },
                  { to: '/deployment-status', icon: Activity, label: 'Deployment Status', badge: 'Super' },
                ]
              : []),
          ],
        }]
      : []),
    {
      label: 'More',
      items: [{ to: '/policies', icon: ScrollText, label: 'Policies' }],
    },
  ];

  const isActive = (to: string) =>
    to === '/' ? path === '/' : path.startsWith(to);

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-3">
      {navSections.map((section) => (
        <div key={section.label} className="mb-1">
          <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {section.label}
          </p>
          {section.items.map(({ to, icon: Icon, label, badge }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={onNav}
                className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mb-1">
        <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Help</p>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all duration-150"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span>Contact Support</span>
        </a>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#0D1117] text-slate-100 flex">

      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-40 bg-[#0D1117] border-r border-slate-800">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-800 shrink-0">
          <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{APP_NAME}</p>
            <p className="text-[10px] text-slate-500 leading-tight">{APP_SUBTITLE}</p>
          </div>
        </Link>

        <NavLinks />

        {/* User */}
        <div className="shrink-0 border-t border-slate-800 p-3">
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-slate-800/60">
            <div className="h-7 w-7 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center shrink-0">
              {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5 text-blue-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{userName}</p>
              <p className="text-[10px] text-slate-500">{isSuperAdmin ? 'Super Admin' : 'Admin'}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Drawer ─── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 h-full bg-[#0D1117] border-r border-slate-800 flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 shrink-0">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2.5">
                <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">{APP_NAME}</p>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks onNav={() => setSidebarOpen(false)} />
            <div className="shrink-0 border-t border-slate-800 p-3">
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-56">

        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center px-4 gap-3 bg-[#0D1117] border-b border-slate-800 shrink-0">
          <button
            className="md:hidden p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Page title from path */}
          <div className="md:hidden flex items-center gap-2">
            <div className="h-6 w-6 bg-blue-600 rounded flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-white">{APP_NAME}</span>
          </div>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Live indicator */}
          {connected !== undefined && (
            connected ? (
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Activity className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </div>
            )
          )}

          {/* User menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5 text-blue-400" />}
                </div>
                <span className="text-xs font-medium max-w-[100px] truncate">{userName}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-[#161B22] border border-slate-700 rounded-lg shadow-xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <p className="text-xs font-medium text-white truncate">{userName}</p>
                    <p className="text-[10px] text-slate-500">{isSuperAdmin ? 'Super Administrator' : 'Administrator'}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden max-w-7xl w-full mx-auto">
          {children}
        </main>

        <footer className="px-6 py-4 border-t border-slate-800 text-center text-[11px] text-slate-600">
          © {new Date().getFullYear()} {APP_NAME} · <Link to="/policies" className="hover:text-slate-400 transition-colors">Policies</Link>
        </footer>
      </div>
    </div>
  );
}
