import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import React, { useEffect, useState } from 'react';
import TopProgressBar from '@/components/TopProgressBar';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import { XCircle } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Transactions from './pages/Transactions';
import CreatePayment from './pages/CreatePayment';
import DisbursementsPage from './pages/DisbursementsPage';
import ReportsPage from './pages/ReportsPage';
import BotSettings from './pages/BotSettings';
import MessengerPage from './pages/MessengerPage';
import AdminManagement from './pages/AdminManagement';
import POSTerminalsPage from './pages/POSTerminalsPage';
import TerminalSimulator from './pages/TerminalSimulator';
import BotMessagesPage from './pages/BotMessagesPage';
import TopupRequestsPage from './pages/TopupRequestsPage';
import UsdtSendRequestsPage from './pages/UsdtSendRequestsPage';
import BankDepositsPage from './pages/BankDepositsPage';
import RolesPage from './pages/RolesPage';
import RequireSuperAdmin from './components/RequireSuperAdmin';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import Policies from './pages/Policies';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';
import LogoutCallbackPage from './pages/LogoutCallbackPage';
import NotFound from './pages/NotFound';
import MaintenancePage from './pages/MaintenancePage';
import BotIntro from './pages/BotIntro';
import ScanQRPH from './pages/ScanQRPH';
import XenditPage from './pages/XenditPage';
import AlipayPage from './pages/AlipayPage';
import WeChatPage from './pages/WeChatPage';
import HomePage from './pages/Index';
import DesignSystemDemo from './pages/DesignSystemDemo';
import DashboardNew from './pages/new/DashboardNew';
import WalletNew from './pages/new/WalletNew';
import TransactionsNew from './pages/new/TransactionsNew';
import Merchants from './pages/Merchants';
import Users from './pages/Users';

const queryClient = new QueryClient();

// Paths that should remain accessible even during maintenance
const MAINTENANCE_EXEMPT_PATHS = ['/home', '/intro', '/login', '/register', '/features', '/pricing', '/auth/callback', '/auth/error', '/logout-callback', '/maintenance'];

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checked, setChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('Maintenance check timed out');
      setChecked(true);
    }, 3000);

    fetch('/api/v1/app-settings/maintenance', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setMaintenanceMode(!!data.maintenance_mode);
      })
      .catch((err) => {
        console.warn('Maintenance mode check failed:', err);
        setMaintenanceMode(false);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setChecked(true);
      });

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [location.pathname]);

  if (!checked) return null;

  const isExempt = MAINTENANCE_EXEMPT_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));

  if (maintenanceMode && !isExempt) {
    return <Navigate to="/maintenance" replace />;
  }

  return <>{children}</>;
}

// Wraps children in a div that re-mounts (and fades in) on every route change
function PageFade({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // Provide a main landmark and a screen-reader-only page title
  const path = location.pathname === '/' ? 'Dashboard' : location.pathname.replace(/^\/+|\/+$/g, '').replace(/[-_/]/g, ' ') || 'Page';
  const title = path.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

  return (
    <main key={location.key} id="main-content" role="main" className="page-enter">
      <h1 className="sr-only">{title}</h1>
      {children}
    </main>
  );
}

/**
 * Renders the full app shell only after the initial auth check completes.
 * Must be rendered inside BrowserRouter so TopProgressBar / PageFade can call useLocation().
 * The AppLoadingScreen plays an exit animation before it is unmounted.
 */
// Error Boundary Component to prevent total app crashes
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="h-20 w-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto border border-rose-500/20">
               <XCircle className="h-10 w-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter">System Kernel Panic</h1>
              <p className="text-slate-400 text-sm font-medium">The interface encountered an unexpected sequence error. Our automated repair systems are notified.</p>
            </div>
            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 text-left overflow-auto max-h-32">
               <code className="text-[10px] text-rose-300/70 font-mono break-all">{this.state.error?.toString()}</code>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full h-12 bg-white text-black font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all"
            >
              Reboot UI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthAwareShell() {
  const { loading } = useAuth();
  const [showLoader, setShowLoader] = useState(true);
  const [exitingLoader, setExitingLoader] = useState(false);

  useEffect(() => {
    if (!loading && showLoader) {
      // Start the exit animation, then unmount after it completes.
      setExitingLoader(true);
      const t = setTimeout(() => setShowLoader(false), 450);
      return () => clearTimeout(t);
    }
  }, [loading, showLoader]);

  if (showLoader) return <AppLoadingScreen exiting={exitingLoader} />;

  return (
    <>
      <TopProgressBar />
      {/* MaintenanceGuard is intentionally outside PageFade so it does not
          remount (and re-fetch) on every navigation. */}
      <MaintenanceGuard>
        <PageFade>
          <Routes>
            <Route path="/design" element={<DesignSystemDemo />} />
            <Route path="/new/dashboard" element={<DashboardNew />} />
            <Route path="/new/wallet" element={<WalletNew />} />
            <Route path="/new/transactions" element={<TransactionsNew />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/intro" element={<BotIntro />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/features" element={<Features />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/error" element={<AuthError />} />
            <Route path="/logout-callback" element={<LogoutCallbackPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/" element={<DashboardNew />} />
            <Route path="/merchants" element={<Merchants />} />
            <Route path="/users" element={<Users />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/create-payment" element={<CreatePayment />} />
            <Route path="/scan-qrph" element={<ScanQRPH />} />
            <Route path="/xendit" element={<XenditPage />} />
            <Route path="/alipay" element={<AlipayPage />} />
            <Route path="/wechat" element={<WeChatPage />} />
            <Route path="/disbursements" element={<DisbursementsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/bot-settings" element={<BotSettings />} />
            <Route path="/messenger" element={<MessengerPage />} />
            <Route path="/admin-management" element={<RequireSuperAdmin><AdminManagement /></RequireSuperAdmin>} />
            <Route path="/pos-terminals" element={<RequireSuperAdmin><POSTerminalsPage /></RequireSuperAdmin>} />
            <Route path="/terminal-simulator" element={<RequireSuperAdmin><TerminalSimulator /></RequireSuperAdmin>} />
            <Route path="/bot-messages" element={<ProtectedAdminRoute><BotMessagesPage /></ProtectedAdminRoute>} />
            <Route path="/topup-requests" element={<RequireSuperAdmin><TopupRequestsPage /></RequireSuperAdmin>} />
            <Route path="/usdt-send-requests" element={<RequireSuperAdmin><UsdtSendRequestsPage /></RequireSuperAdmin>} />
            <Route path="/bank-deposits" element={<RequireSuperAdmin><BankDepositsPage /></RequireSuperAdmin>} />
            <Route path="/roles" element={<RequireSuperAdmin><RolesPage /></RequireSuperAdmin>} />
            <Route path="/policies" element={<Policies />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageFade>
      </MaintenanceGuard>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <ErrorBoundary>
              <AuthAwareShell />
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;