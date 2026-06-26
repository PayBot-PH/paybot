import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bot, LayoutDashboard, Wallet, FileText, Building2, Activity,
  WifiOff, LogOut, ShieldCheck, MessageSquare, Crown, User,
  Menu, X, Send, ClipboardList, DollarSign, ChevronDown,
  MessageCircle, UserCheck, Sun, Moon, ScanLine, ChevronRight,
  Settings2, Inbox, Shield, Zap, QrCode, ArrowRightLeft, BookOpen,
  Smartphone, Monitor, CreditCard,
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
        { to: '/merchants', icon: Building2, label: t('nav_merchants') },
      ],
    },
    {
      label: t('nav_payments'),
      items: [
        { to: '/create-payment', icon: CreditCard, label: 'Collect Payment', badge: 'New' },
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
            { to: '/pos-terminals', icon: Smartphone, label: 'POS Terminals', badge: 'Super' },
            { to: '/terminal-simulator', icon: Monitor, label: 'ECR Simulator', badge: 'Super' },
            { to: '/roles', icon: Shield, label: t('nav_roles'), badge: 'Super' },
            { to: '/users', icon: User, label: t('nav_users'), badge: 'Super' },
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
  const NavLinks = ({ onNav, isMobile }: { onNav?: () => void; isMobile?: boolean }) => (
    <nav className="flex-1 overflow-y-auto py-3 px-2">
      {navSections.map((section) => (
        <div key={section.label} className="mb-1">
          <p className={`px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest ${
            isMobile ? 'text-white/70' : 'text-muted-foreground/90'
          }`}>
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
                        : isMobile
                          ? 'text-white/70 hover:text-white hover:bg-white/5 border-transparent'
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
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                        {group.badge}
                      </span>
                    )}
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {isOpen && group.children && Array.isArray(group.children) && (
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
                                : isMobile
                                  ? 'text-white/50 hover:text-white hover:bg-white/5 border-transparent'
                                              : 'text-foreground hover:text-foreground hover:bg-muted border-transparent'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate text-xs">{label}</span>
                            {badge && (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
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
                    : isMobile
                      ? 'text-white/70 hover:text-white hover:bg-white/5 border-transparent'
                      : 'text-foreground hover:text-foreground hover:bg-muted border-transparent'
                }`}
              >
                <div className={`flex items-center justify-center h-6 w-6 rounded-lg shrink-0 transition-all duration-150 ${
                  active ? 'bg-primary text-white shadow-sm' : 'text-current'
                }`}>
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1 truncate text-foreground">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
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
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 border-l-2 border-transparent ${
            isMobile ? 'text-white/50 hover:text-white hover:bg-white/5' : 'text-foreground hover:text-foreground hover:bg-muted'
          }`}
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
      <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 z-40 bg-card/60 backdrop-blur-2xl border-r border-border/40 shadow-2xl">
        {/* Brand */}
            <Link to="/" className="flex items-center gap-4 px-8 h-24 border-b border-border/40 shrink-0 group transition-all hover:bg-muted/10">
          <div className="h-11 w-11 rounded-2xl bg-[#0A0F1E] flex items-center justify-center shrink-0 shadow-2xl shadow-brand-blue-500/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 border border-white/5">
            <img src="/logo.svg" alt={APP_NAME} className="h-7 w-7 shrink-0 animate-logo-bounce" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tighter text-foreground uppercase">{APP_NAME}</p>
            <p className="text-[9px] text-muted-foreground/90 font-black uppercase tracking-[0.3em]">{APP_SUBTITLE}</p>
          </div>
        </Link>

        <NavLinks />

        {/* User */}
        <div className="shrink-0 border-t border-border/40 p-6 bg-[#0A0F1E]/5">
          <div className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-[#0A0F1E] border border-white/5 shadow-2xl group cursor-pointer hover:bg-brandblue-600 transition-all duration-500">
            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-sm group-hover:bg-white group-hover:text-brandblue-600 transition-all duration-500">
              {isSuperAdmin ? <Crown className="h-5 w-5 text-amber-400 group-hover:text-brandblue-600" /> : <User className="h-5 w-5 text-white/40 group-hover:text-brandblue-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black truncate tracking-widest text-white uppercase">{userName}</p>
              <p className="text-[9px] font-black uppercase text-white/60 tracking-[0.2em] leading-none mt-1 group-hover:text-white/80">{isSuperAdmin ? 'ROOT_USER' : 'ADMIN_NODE'}</p>
            </div>
            <button
              onClick={() => logout()}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Drawer ─── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-80 h-full bg-[#0A0F1E] border-r border-white/5 flex flex-col shadow-2xl animate-in slide-in-from-left-8 duration-500">
            <div className="flex items-center justify-between px-8 h-24 border-b border-white/5 shrink-0">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-4 group">
                <div className="h-11 w-11 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-2xl shadow-brandblue-500/40">
                  <img src="/logo.svg" alt={APP_NAME} className="h-7 w-7" />
                </div>
                <p className="text-xl font-black tracking-tighter text-white uppercase">{APP_NAME}</p>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40 hover:text-white transition-all active:scale-90" aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-6">
               <NavLinks onNav={() => setSidebarOpen(false)} isMobile />
            </div>
            <div className="shrink-0 border-t border-white/5 p-6">
              <button
                onClick={() => logout()}
                className="w-full h-12 flex items-center justify-center gap-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 transition-all active:scale-95 shadow-xl"
              >
                <LogOut className="h-4 w-4" />
                SIGN OUT
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-h-0 md:ml-64 transition-all duration-300">

        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-20 flex items-center px-10 gap-6 bg-background/40 backdrop-blur-2xl border-b border-border/30 shrink-0">
          <button
            className="md:hidden h-12 w-12 flex items-center justify-center rounded-2xl bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all active:scale-90"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-4">
            <div className="h-10 w-10 rounded-2xl bg-[#0A0F1E] flex items-center justify-center shadow-xl border border-white/5">
              <img src="/logo.svg" alt={APP_NAME} className="h-6 w-6" />
            </div>
            <span className="text-base font-black tracking-tighter text-foreground uppercase">{APP_NAME}</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded-[1.5rem] border border-border/40 shadow-inner">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="h-10 w-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-card hover:shadow-xl transition-all active:scale-90 border border-transparent hover:border-border/10"
              title={theme === 'dark' ? t('switch_light') : t('switch_dark')}
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="h-10 w-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-card hover:shadow-xl transition-all text-[10px] font-black uppercase tracking-tighter border border-transparent hover:border-border/10"
              title={language === 'en' ? t('switch_chinese') : t('switch_english')}
            >
              {language === 'en' ? '中' : 'EN'}
            </button>
          </div>

          {/* Live indicator */}
          {connected !== undefined && (
            <div className={`flex items-center gap-3 px-6 py-2.5 rounded-full border shadow-sm transition-all duration-1000 ${
              connected
              ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-emerald-500/10'
              : 'bg-rose-500/5 text-rose-600 border-rose-500/20 shadow-rose-500/10'
            }`}>
              <div className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${connected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </div>
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-[0.3em]">
                 {connected ? 'LIVE_GRID_UP' : 'OFFLINE_MODE'}
              </span>
            </div>
          )}

          {/* User menu */}
          {user && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="hidden md:flex items-center gap-4 pl-6 border-l border-border/40 text-muted-foreground hover:text-foreground transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-[#0A0F1E] flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform border border-white/5">
                  {isSuperAdmin ? <Crown className="h-5 w-5 text-amber-400" /> : <User className="h-5 w-5 text-white/40" />}
                </div>
                <div className="text-left space-y-0.5">
                  <p className="text-xs font-black text-foreground truncate max-w-[120px] uppercase tracking-tight leading-none">{userName}</p>
                  <p className="text-[9px] font-bold text-muted-foreground/80 uppercase tracking-[0.3em]">{isSuperAdmin ? 'ROOT' : 'ADMIN'}</p>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-500 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-5 w-64 bg-[#0A0F1E] border border-white/10 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.5)] py-3 z-50 animate-in fade-in zoom-in-95 duration-300 origin-top-right backdrop-blur-3xl">
                  <div className="px-8 py-6 border-b border-white/5 space-y-1">
                    <p className="text-sm font-black text-white uppercase tracking-tight">{userName}</p>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.4em]">{isSuperAdmin ? 'CLUSTER_ROOT' : 'OPERATOR_NODE'}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                      className="w-full flex items-center gap-4 px-6 py-4 text-xs font-black text-rose-400 hover:bg-rose-500 hover:text-white rounded-[1.25rem] transition-all duration-300 group"
                    >
                      <LogOut className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                      TERMINATE_PROTOCOL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 sm:p-12 overflow-y-auto overflow-x-hidden min-h-0 bg-background relative custom-scrollbar">
          {/* High-end Fintech Glow Backgrounds */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brandblue-500/5 blur-[150px] pointer-events-none -z-10 rounded-full animate-float" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 blur-[150px] pointer-events-none -z-10 rounded-full animate-float-delayed" />

          <div className="max-w-7xl w-full mx-auto">
            {children}
          </div>
          <div className="mt-20">
             <AppFooter variant="admin" />
          </div>
        </main>
      </div>
    </div>
  );
}
