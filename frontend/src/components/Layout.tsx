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
  WifiOff,
  LogOut,
  ShieldCheck,
  MessageCircle,
  MessageSquare,
  ScrollText,
  Crown,
  User,
  Menu,
  ChevronLeft,
  ChevronRight,
  Activity,
  Send,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
  badgeColor?: string;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      ? [
          {
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
                    {
                      to: '/admin-management',
                      icon: ShieldCheck,
                      label: 'Admin Management',
                      badge: 'Super',
                      badgeColor: 'amber',
                    },
                    {
                      to: '/usdt-send-requests',
                      icon: Send,
                      label: 'USDT Send Requests',
                      badge: 'Super',
                      badgeColor: 'amber',
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    {
      label: 'Support',
      items: [
        { to: '/policies', icon: ScrollText, label: 'Policies' },
      ],
    },
  ];

  const isActive = (to: string) =>
    to === '/' ? path === '/' : path.startsWith(to);

  const SidebarContent = ({ collapsed }: { collapsed: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-3' : 'px-5'} h-16 border-b border-slate-700/50 shrink-0 bg-gradient-to-r from-blue-900/30 to-slate-900/10`}>
        <Link
          to="/"
          className="flex items-center gap-2.5 min-w-0"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
            <Bot className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-[15px] font-bold text-white">PayBot</span>
              {user && (
                isSuperAdmin ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Crown className="h-2.5 w-2.5 text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-semibold">Super Admin</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5">
                    <User className="h-2.5 w-2.5 text-blue-400" />
                    <span className="text-[10px] text-blue-400 font-semibold">Admin</span>
                  </div>
                )
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label, badge, badgeColor }) => {
                const active = isActive(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setSidebarOpen(false)}
                    title={collapsed ? label : undefined}
                    className={`flex items-center gap-3 rounded-lg transition-all duration-150 group
                      ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
                      ${active
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                      }`}
                  >
                    <Icon className={`shrink-0 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
                    {!collapsed && (
                      <>
                        <span className="text-sm font-medium flex-1">{label}</span>
                        {badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            badgeColor === 'amber'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}>
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* External Support link */}
        {!collapsed && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Help
            </p>
            <a
              href="https://t.me/traxionpay"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all duration-150"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">Contact Support</span>
            </a>
          </div>
        )}
        {collapsed && (
          <a
            href="https://t.me/traxionpay"
            target="_blank"
            rel="noopener noreferrer"
            title="Contact Support"
            className="flex items-center justify-center px-2 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all duration-150"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
        )}
      </nav>

      {/* User / Logout */}
      <div className="shrink-0 border-t border-slate-700/50 p-3">
        {user && (
          <>
            {!collapsed && (
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-slate-800/60 mb-2">
                <div className="h-7 w-7 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center shrink-0">
                  {isSuperAdmin ? (
                    <Crown className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-blue-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate">
                    {(user as { name?: string; telegram_username?: string }).name ||
                     (user as { telegram_username?: string }).telegram_username ||
                     'Admin User'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {isSuperAdmin ? 'Super Administrator' : 'Administrator'}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => logout()}
              title={collapsed ? 'Sign out' : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150
                ${collapsed ? 'justify-center' : ''}`}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-gradient-to-b from-[#0D1829] to-[#0F172A] border-r border-slate-700/50 transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-[60px]' : 'w-60'}`}
      >
        <SidebarContent collapsed={sidebarCollapsed} />

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="absolute -right-3 top-[72px] h-6 w-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 transition-colors z-10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-10 w-64 h-full bg-gradient-to-b from-[#0D1829] to-[#0F172A] border-r border-slate-700/50 flex flex-col">
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ml-0 w-full min-w-0
          ${sidebarCollapsed ? 'md:ml-[60px]' : 'md:ml-60'}`}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0B1120]/90 backdrop-blur-sm border-b border-slate-700/40 h-14 flex items-center px-4 gap-4 shrink-0">
          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-2">
            <div className="h-7 w-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">PayBot</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Connection status */}
          {connected !== undefined && (
            <div className="flex items-center gap-1.5">
              {connected ? (
                <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  <Activity className="h-3 w-3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Live</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-800/50 border border-slate-700/40 px-2.5 py-1 rounded-full">
                  <WifiOff className="h-3 w-3" />
                  <span className="text-[10px] uppercase tracking-wide">Offline</span>
                </div>
              )}
            </div>
          )}

          {/* User badge - desktop */}
          {user && (
            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-700/50">
              <div className="h-7 w-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                {isSuperAdmin ? (
                  <Crown className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <User className="h-3.5 w-3.5 text-blue-400" />
                )}
              </div>
              <span className="text-xs text-slate-400">
                {isSuperAdmin ? (
                  <span className="text-amber-400 font-medium">Super Admin</span>
                ) : (
                  <span className="text-blue-400 font-medium">Admin</span>
                )}
              </span>
            </div>
          )}

          {/* Mobile logout */}
          {user && (
            <button
              onClick={() => logout()}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto overflow-x-hidden">
          {children}

          {/* Footer */}
          <footer className="mt-10 pt-6 border-t border-slate-700/40 text-center text-slate-600 text-xs space-x-4">
            <span>© {new Date().getFullYear()} DRL Solutions. All rights reserved.</span>
            <Link to="/policies" className="hover:text-sky-400 transition-colors">Policies</Link>
            <a href="https://t.me/traxionpay" target="_blank" rel="noopener noreferrer" className="hover:text-sky-400 transition-colors">Support</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
