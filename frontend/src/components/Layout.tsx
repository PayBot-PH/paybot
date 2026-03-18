import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bot, BarChart3, Wallet, CreditCard, FileText, Building2, PieChart,
  WifiOff, LogOut, ShieldCheck, MessageSquare, ScrollText, Crown, User,
  Menu, X, Activity, Send, ClipboardList, DollarSign, ChevronDown,
  MessageCircle, UserCheck, Sun, Moon, ScanLine, ChevronRight,
  Settings2, Layers, Shield,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { APP_NAME, APP_SUBTITLE, SUPPORT_URL } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';
import PageTransition from '@/components/PageTransition';

interface NavItem { to: string; icon: React.ElementType; label: string; badge?: string; }
interface NavGroup { type: 'group'; key: string; icon: React.ElementType; label: string; badge?: string; children: NavItem[]; }
type NavEntry = NavItem | NavGroup;
interface NavSection { label: string; items: NavEntry[]; }
interface LayoutProps { children: React.ReactNode; connected?: boolean; }

export default function Layout({ children, connected }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { user, logout, isAdmin, isSuperAdmin, permissions } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const userName =
    (user as { name?: string; telegram_username?: string } | null)?.name ||
    (user as { telegram_username?: string } | null)?.telegram_username ||
    'Admin';

  const isActive = (to: string) => to === '/' ? path === '/' : path.startsWith(to);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (['/usdt-send-requests', '/topup-requests', '/bank-deposits'].some((r) => path.startsWith(r))) next.add('requests');
      if (['/kyb-registrations', '/kyc-verifications'].some((r) => path.startsWith(r))) next.add('compliance');
      return next;
    });
  }, [path]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });

  const navSections: NavSection[] = [
    {
      label: t('nav_overview'),
      items: [
        { to: '/', icon: BarChart3, label: t('nav_dashboard') },
        { to: '/wallet', icon: Wallet, label: t('nav_wallet') },
      ],
    },
    {
      label: t('nav_payments'),
      items: [
        { to: '/payments', icon: CreditCard, label: t('nav_payments_hub') },
        { to: '/scan-qrph', icon: ScanLine, label: t('nav_scan_qrph') },
        { to: '/transactions', icon: FileText, label: t('nav_transactions') },
        { to: '/disbursements', icon: Building2, label: t('nav_disbursements') },
        { to: '/reports', icon: PieChart, label: t('nav_reports') },
      ],
    },
    ...(isAdmin || permissions?.can_manage_bot || isSuperAdmin
      ? [{
          label: t('nav_bot'),
          items: [
            ...(isAdmin || isSuperAdmin ? [{ to: '/bot-messages', icon: MessageSquare, label: t('nav_bot_messages') }] : []),
            ...(permissions?.can_manage_bot || isSuperAdmin ? [{ to: '/bot-settings', icon: Bot, label: t('nav_bot_settings') }] : []),
          ] as NavEntry[],
        }]
      : []),
    ...(isSuperAdmin
      ? [{
          label: t('nav_administration'),
          items: [
            { to: '/admin-management', icon: ShieldCheck, label: t('nav_admin_management'), badge: 'Super' },
            { to: '/roles', icon: Shield, label: t('nav_roles'), badge: 'Super' },
            {
              type: 'group' as const, key: 'requests', icon: Layers, label: t('nav_requests'), badge: 'Super',
              children: [
                { to: '/usdt-send-requests', icon: Send, label: t('nav_usdt_requests'), badge: 'Super' },
                { to: '/topup-requests', icon: DollarSign, label: t('nav_topup_requests'), badge: 'Super' },
                { to: '/bank-deposits', icon: Building2, label: t('nav_bank_deposits'), badge: 'Super' },
              ],
            },
            {
              type: 'group' as const, key: 'compliance', icon: Settings2, label: t('nav_compliance'), badge: 'Super',
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
      items: [{ to: '/policies', icon: ScrollText, label: t('nav_policies') }],
    },
  ];

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
      {navSections.map((section) => (
        <div key={section.label} className="mb-2">
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {section.label}
          </p>
          {section.items.map((entry) => {
            if ('type' in entry && entry.type === 'group') {
              const group = entry as NavGroup;
              const isOpen = openGroups.has(group.key);
              const hasActiveChild = group.children.some((c) => isActive(c.to));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={`w-full flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                      hasActiveChild
                        ? 'text-blue-400 bg-blue-500/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                    }`}
                    style={{ width: 'calc(100% - 1rem)' }}
                  >
                    <group.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-left">{group.label}</span>
                    {group.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        {group.badge}
                      </span>
                    )}
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    {group.children.map(({ to, icon: Icon, label, badge }) => {
                      const active = isActive(to);
                      return (
                        <Link
                          key={to} to={to} onClick={onNav}
                          className={`flex items-center gap-2.5 ml-5 mr-2 pl-4 pr-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border-l-2 mt-0.5 ${
                            active
                              ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                              : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-blue-500/30'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{label}</span>
                          {badge && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                              {badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const item = entry as NavItem;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to} to={item.to} onClick={onNav}
                className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 glow-blue-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    {item.badge}
                  </span>
                )}
                {active && <div className="h-1.5 w-1.5 rounded-full bg-white/60 shrink-0" />}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mb-1 mt-1">
        <a
          href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-200 group"
        >
          <MessageCircle className="h-4 w-4 shrink-0 group-hover:scale-110 transition-transform duration-200" />
          <span>{t('nav_contact_support')}</span>
        </a>
      </div>
    </nav>
  );

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-40 border-r border-border/60 glass-sidebar">
        {/* Subtle top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 px-4 h-14 border-b border-border/60 shrink-0 group">
          <div className="relative h-7 w-7 shrink-0">
            <div className="absolute inset-0 rounded-lg bg-blue-500/20 blur-sm group-hover:bg-blue-500/30 transition-colors duration-300" />
            <img src="/logo.svg" alt={APP_NAME} className="relative h-7 w-7 rounded-lg object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight">{APP_NAME}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{APP_SUBTITLE}</p>
          </div>
        </Link>

        <NavLinks />

        {/* User card */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-accent/40 border border-border/40 backdrop-blur-sm">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-500/30 border border-blue-500/30 flex items-center justify-center shrink-0">
              {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5 text-blue-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{userName}</p>
              <p className="text-[10px] text-muted-foreground">{isSuperAdmin ? t('super_admin') : t('admin')}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Drawer ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 w-64 h-full glass-sidebar border-r border-border/60 flex flex-col animate-slide-in-left">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
            <div className="flex items-center justify-between px-4 h-14 border-b border-border/60 shrink-0">
              <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2.5">
                <img src="/logo.svg" alt={APP_NAME} className="h-7 w-7 rounded-lg" />
                <p className="text-sm font-bold">{APP_NAME}</p>
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks onNav={() => setSidebarOpen(false)} />
            <div className="shrink-0 border-t border-border/60 p-3">
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
                {t('sign_out')}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-h-0 md:ml-56">

        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center px-4 gap-3 border-b border-border/60 shrink-0"
          style={{ background: 'hsl(var(--background) / 0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          {/* Bottom glow line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

          <button
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="md:hidden flex items-center gap-2">
            <img src="/logo.svg" alt={APP_NAME} className="h-6 w-6 rounded" />
            <span className="text-sm font-bold">{APP_NAME}</span>
          </div>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
            title={theme === 'dark' ? t('switch_light') : t('switch_dark')}
          >
            {theme === 'dark'
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />}
          </button>

          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 text-xs font-semibold w-8 h-8 flex items-center justify-center"
          >
            {language === 'en' ? '中' : 'EN'}
          </button>

          {/* Live indicator */}
          {connected !== undefined && (
            connected ? (
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <Activity className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('live')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] px-2.5 py-1 rounded-full bg-muted/50 border border-border">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('offline')}</span>
              </div>
            )
          )}

          {/* User menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="hidden md:flex items-center gap-2 pl-3 border-l border-border/60 text-muted-foreground hover:text-foreground transition-all duration-200"
              >
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-border flex items-center justify-center">
                  {isSuperAdmin ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5 text-blue-400" />}
                </div>
                <span className="text-xs font-medium max-w-[100px] truncate">{userName}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl shadow-black/30 py-1 z-50 animate-scale-in">
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-xs font-medium truncate">{userName}</p>
                    <p className="text-[10px] text-muted-foreground">{isSuperAdmin ? t('super_administrator') : t('administrator')}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
            <PageTransition>{children}</PageTransition>
          </div>
          <AppFooter variant="admin" />
        </main>
      </div>
    </div>
  );
}
