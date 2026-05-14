import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bot, LayoutDashboard, Wallet, FileText, Building2, Activity,
  WifiOff, LogOut, ShieldCheck, MessageSquare, Crown, User,
  Menu, X, Send, ClipboardList, DollarSign, ChevronDown,
  MessageCircle, UserCheck, Sun, Moon, ScanLine, ChevronRight,
  Settings2, Inbox, Shield, Zap, QrCode, ArrowRightLeft, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { APP_NAME, APP_SUBTITLE, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

/* ─── Nav types ─────────────────────────────────────────────────── */
interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
}

interface NavGroup {
  type: 'group';
  key: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

interface NavSection {
  label: string;
  items: NavEntry[];
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
  const { language, setLanguage, t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  /* Close user-menu on outside click */
  React.useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const userName =
    (user as { name?: string; telegram_username?: string } | null)?.name ||
    (user as { telegram_username?: string } | null)?.telegram_username ||
    'Admin';

  const isActive = (to: string) =>
    to === '/' ? path === '/' : path.startsWith(to);

  /* Auto-expand sub-groups when a child route is active */
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (['/xendit', '/alipay', '/wechat'].some((r) => path.startsWith(r))) {
        next.add('gateways');
      }
      if (['/usdt-send-requests', '/topup-requests', '/bank-deposits'].some((r) => path.startsWith(r))) {
        next.add('requests');
      }
      if (['/kyb-registrations', '/kyc-verifications'].some((r) => path.startsWith(r))) {
        next.add('compliance');
      }
      return next;
    });
  }, [path]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });

  /* ─── Navigation structure ──────────────────────────────────── */
  const navSections: NavSection[] = [
    {
      label: t('nav_overview'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav_dashboard') },
        { to: '/wallet', icon: Wallet, label: t('nav_wallet') },
      ],
    },
    {
      label: t('nav_payments'),
      items: [
        {
          type: 'group' as const,
          key: 'gateways',
          icon: Zap,
          label: t('nav_gateways'),
          children: [
            { to: '/xendit', icon: Zap, label: t('nav_xendit') },
            { to: '/alipay', icon: QrCode, label: t('nav_alipay') },
            { to: '/wechat', icon: QrCode, label: t('nav_wechat') },
          ],
        },
        { to: '/scan-qrph', icon: ScanLine, label: t('nav_scan_qrph') },
        { to: '/transactions', icon: FileText, label: t('nav_transactions') },
        { to: '/disbursements', icon: ArrowRightLeft, label: t('nav_disbursements') },
        { to: '/reports', icon: Activity, label: t('nav_reports') },
      ],
    },
    /* Bot section — shown to admins / can_manage_bot users */
    ...(isAdmin || permissions?.can_manage_bot || isSuperAdmin
      ? [{
          label: t('nav_bot'),
          items: [
            ...(isAdmin || isSuperAdmin
              ? [{ to: '/bot-messages', icon: MessageSquare, label: t('nav_bot_messages') }]
              : []),
            ...(permissions?.can_manage_bot || isSuperAdmin
              ? [{ to: '/bot-settings', icon: Bot, label: t('nav_bot_settings') }]
              : []),
            ...(permissions?.can_manage_bot || isSuperAdmin
              ? [{ to: '/messenger', icon: MessageCircle, label: t('nav_messenger') }]
              : []),
          ] as NavEntry[],
        }]
      : []),
    /* Administration — super admin only, with collapsible sub-groups */
    ...(isSuperAdmin
      ? [{
          label: t('nav_administration'),
          items: [
            { to: '/admin-management', icon: ShieldCheck, label: t('nav_admin_management'), badge: 'Super' },
            { to: '/roles', icon: Shield, label: t('nav_roles'), badge: 'Super' },
            {
              type: 'group' as const,
              key: 'requests',
              icon: Inbox,
              label: t('nav_requests'),
              badge: 'Super',
              children: [
                { to: '/usdt-send-requests', icon: Send, label: t('nav_usdt_requests'), badge: 'Super' },
                { to: '/topup-requests', icon: DollarSign, label: t('nav_topup_requests'), badge: 'Super' },
                { to: '/bank-deposits', icon: Building2, label: t('nav_bank_deposits'), badge: 'Super' },
              ],
            },
            {
              type: 'group' as const,
              key: 'compliance',
              icon: Settings2,
              label: t('nav_compliance'),
              badge: 'Super',
              children: [
                { to: '/kyb-registrations', icon: ClipboardList, label: t('nav_kyb_registrations'), badge: 'Super' },
                { to: '/kyc-verifications', icon: UserCheck, label: t('nav_kyc_verifications'), badge: 'Super' },
              ],
            },
          ] as NavEntry[],
        }]
      : []),
    {
      label: t('nav_help'),
      items: [
        { to: '/policies', icon: BookOpen, label: t('nav_policies') },
      ],
    },
  ];

  /* ─── NavLinks renderer ─────────────────────────────────────── */
  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      {navSections.map((section) => (
        <div key={section.label} className="mb-1">
          <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {section.label}
          </p>
          {section.items.map((entry) => {
            /* Collapsible sub-group */
            if ('type' in entry && entry.type === 'group') {
              const group = entry as NavGroup;
              const isOpen = openGroups.has(group.key);
              const hasActiveChild = group.children.some((c) => isActive(c.to));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 border-l-2 ${
                      hasActiveChild
                        ? 'text-primary bg-primary/10 border-primary dark:bg-primary/15'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted border-transparent'
                    }`}
                  >
                    <div className={`flex items-center justify-center h-6 w-6 rounded-lg shrink-0 transition-all duration-150 ${
                      hasActiveChild ? 'bg-primary text-white shadow-sm' : 'text-current'
                    }`}>
                      <group.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1 truncate text-left">{group.label}</span>
                    {group.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                        {group.badge}
                      </span>
                    )}
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 mb-1 ml-3">
                      {group.children.map(({ to, icon: Icon, label, badge }) => {
                        const active = isActive(to);
                        return (
                          <Link
                            key={to}
                            to={to}
                            onClick={onNav}
                            className={`flex items-center gap-3 pl-7 pr-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 border-l-2 ${
                              active
                                ? 'bg-primary/10 text-primary border-primary font-semibold dark:bg-primary/15'
                                : 'text-foreground/60 hover:text-foreground hover:bg-muted border-transparent'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate text-xs">{label}</span>
                            {badge && (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                                {badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            /* Regular nav item */
            const item = entry as NavItem;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNav}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 border-l-2 ${
                  active
                    ? 'bg-primary/10 text-primary border-primary font-semibold dark:bg-primary/15'
                    : 'text-foreground/70 hover:text-foreground hover:bg-muted border-transparent'
                }`}
              >
                <div className={`flex items-center justify-center h-6 w-6 rounded-lg shrink-0 transition-all duration-150 ${
                  active ? 'bg-primary text-white shadow-sm' : 'text-current'
                }`}>
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      {/* Contact Support */}
      <div className="mb-1 mt-1 px-2">
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 border-l-2 border-transparent"
        >
          <div className="flex items-center justify-center h-6 w-6 rounded-lg shrink-0">
            <MessageCircle className="h-3.5 w-3.5" />
          </div>
          <span>{t('nav_contact_support')}</span>
        </a>
      </div>
    </nav>
  );

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex">

      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-40 bg-card border-r border-border shadow-sm">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0 group">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
            <img src="/logo.svg" alt={APP_NAME} className="h-5 w-5 shrink-0" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-foreground">{APP_NAME}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{APP_SUBTITLE}</p>
          </div>
        </Link>

        <NavLinks />

        {/* User */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-accent/50 border border-accent">
            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : <User className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{userName}</p>
              <p className="text-[10px] text-muted-foreground">{isSuperAdmin ? t('super_admin') : t('admin')}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 h-full bg-card border-r border-border flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 group">
                <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <img src="/logo.svg" alt={APP_NAME} className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-foreground">{APP_NAME}</p>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks onNav={() => setSidebarOpen(false)} />
            <div className="shrink-0 border-t border-border p-3">
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('sign_out')}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-h-0 md:ml-56">

        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center px-4 gap-3 bg-card/95 backdrop-blur-md border-b border-border shrink-0">
          <button
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <img src="/logo.svg" alt={APP_NAME} className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-foreground">{APP_NAME}</span>
          </div>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={theme === 'dark' ? t('switch_light') : t('switch_dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs font-semibold w-8 h-8 flex items-center justify-center"
            title={language === 'en' ? t('switch_chinese') : t('switch_english')}
          >
            {language === 'en' ? '中' : 'EN'}
          </button>

          {/* Live indicator */}
          {connected !== undefined && (
            connected ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="hidden sm:inline">{t('live')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('offline')}</span>
              </div>
            )
          )}

          {/* User menu */}
          {user && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="hidden md:flex items-center gap-2 pl-3 border-l border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : <User className="h-3.5 w-3.5 text-primary" />}
                </div>
                <span className="text-xs font-semibold max-w-[100px] truncate">{userName}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-2xl shadow-xl py-1.5 z-50">
                  <div className="px-4 py-2.5 border-b border-border">
                    <p className="text-sm font-semibold truncate">{userName}</p>
                    <p className="text-[11px] text-muted-foreground">{isSuperAdmin ? t('super_administrator') : t('administrator')}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('sign_out')}
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="max-w-7xl w-full mx-auto">
            {children}
          </div>
          <AppFooter variant="admin" />
        </main>
      </div>
    </div>
  );
}
