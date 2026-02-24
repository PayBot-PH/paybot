import { useState } from 'react';
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
  ShieldCheck,
  MessageCircle,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments Hub' },
  { to: '/transactions', icon: FileText, label: 'Transactions' },
  { to: '/disbursements', icon: Building2, label: 'Disbursements' },
  { to: '/reports', icon: PieChart, label: 'Reports' },
  { to: '/bot-settings', icon: Bot, label: 'Bot Settings' },
];

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

export default function Layout({ children, connected }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { user, logout, isSuperAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? 'w-16' : 'w-56';

  const NavLink = ({ to, icon: Icon, label, onClick }: { to: string; icon: React.ElementType; label: string; onClick?: () => void }) => {
    const active = path === to;
    return (
      <Link
        to={to}
        onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
          active
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
        }`}
        title={collapsed ? label : undefined}
      >
        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={`flex items-center h-14 px-3 border-b border-slate-700/50 shrink-0 ${collapsed ? 'justify-center' : 'gap-2'}`}>
        <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <Bot className="h-5 w-5 text-white" />
        </div>
        {!collapsed && <span className="text-base font-bold text-white">PayBot</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} icon={icon} label={label} onClick={onNav} />
        ))}
        {isSuperAdmin && (
          <NavLink to="/admin-management" icon={ShieldCheck} label="Admin Management" onClick={onNav} />
        )}
        <NavLink to="/policies" icon={ScrollText} label="Policies" onClick={onNav} />
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-slate-700/50 space-y-0.5 shrink-0">
        <a
          href="https://t.me/traxionpay"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors`}
          title={collapsed ? 'Support' : undefined}
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Support</span>}
        </a>
        {user && (
          <button
            onClick={() => { logout(); onNav?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col ${sidebarWidth} bg-[#0F172A] border-r border-slate-700/50 sticky top-0 h-screen shrink-0 transition-all duration-200 z-40`}>
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-16 bg-slate-800 border border-slate-700 rounded-full p-0.5 text-slate-400 hover:text-white transition-colors z-50"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-[#0F172A] border-r border-slate-700/50 z-50 flex flex-col">
            <SidebarContent onNav={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-slate-700/50 bg-[#0F172A]/90 backdrop-blur-sm sticky top-0 z-30 h-14 flex items-center px-4 gap-3">
          {/* Mobile menu button */}
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile brand */}
          <Link to="/" className="md:hidden flex items-center gap-2">
            <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-white">PayBot</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
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
            {/* Username */}
            {user && (
              <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-32">
                {user.name || user.email || 'Admin'}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 sm:px-6 py-6 pb-8 overflow-auto">
          {children}
          <footer className="mt-10 pt-6 border-t border-slate-700/40 text-center text-slate-500 text-xs space-x-4">
            <span>© {new Date().getFullYear()} DRL Solutions. All rights reserved.</span>
            <Link to="/policies" className="hover:text-sky-400 transition-colors">Policies</Link>
            <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 transition-colors">Support</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
