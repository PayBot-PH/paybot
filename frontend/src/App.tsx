import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import React, { useEffect, useState } from 'react';
import TopProgressBar from '@/components/TopProgressBar';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Transactions from './pages/Transactions';
import CreatePayment from './pages/CreatePayment';
import PaymentsHub from './pages/PaymentsHub';
import DisbursementsPage from './pages/DisbursementsPage';
import ReportsPage from './pages/ReportsPage';
import BotSettings from './pages/BotSettings';
import AdminManagement from './pages/AdminManagement';
import BotMessagesPage from './pages/BotMessagesPage';
import TopupRequestsPage from './pages/TopupRequestsPage';
import UsdtSendRequestsPage from './pages/UsdtSendRequestsPage';
import BankDepositsPage from './pages/BankDepositsPage';
import KybRegistrationsPage from './pages/KybRegistrationsPage';
import KycVerificationsPage from './pages/KycVerificationsPage';
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

const queryClient = new QueryClient();

// Paths that should remain accessible even during maintenance
const MAINTENANCE_EXEMPT_PATHS = ['/intro', '/login', '/register', '/features', '/pricing', '/auth/callback', '/auth/error', '/logout-callback', '/maintenance'];

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checked, setChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetch('/api/v1/app-settings/maintenance')
      .then((r) => r.json())
      .then((data) => {
        setMaintenanceMode(!!data.maintenance_mode);
      })
      .catch((err) => {
        // If the check fails, don't block access — log for debugging
        console.warn('Maintenance mode check failed:', err);
        setMaintenanceMode(false);
      })
      .finally(() => setChecked(true));
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
  return (
    <div key={location.key} className="page-enter">
      {children}
    </div>
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
            <TopProgressBar />
            <PageFade>
            <MaintenanceGuard>
            <Routes>
              <Route path="/intro" element={<BotIntro />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/features" element={<Features />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/error" element={<AuthError />} />
              <Route path="/logout-callback" element={<LogoutCallbackPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/create-payment" element={<CreatePayment />} />
              <Route path="/payments" element={<PaymentsHub />} />
              <Route path="/scan-qrph" element={<ScanQRPH />} />
              <Route path="/disbursements" element={<DisbursementsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/bot-settings" element={<BotSettings />} />
              <Route path="/admin-management" element={<RequireSuperAdmin><AdminManagement /></RequireSuperAdmin>} />
              <Route path="/bot-messages" element={<ProtectedAdminRoute><BotMessagesPage /></ProtectedAdminRoute>} />
              <Route path="/topup-requests" element={<RequireSuperAdmin><TopupRequestsPage /></RequireSuperAdmin>} />
              <Route path="/usdt-send-requests" element={<RequireSuperAdmin><UsdtSendRequestsPage /></RequireSuperAdmin>} />
              <Route path="/bank-deposits" element={<RequireSuperAdmin><BankDepositsPage /></RequireSuperAdmin>} />
              <Route path="/kyb-registrations" element={<RequireSuperAdmin><KybRegistrationsPage /></RequireSuperAdmin>} />
              <Route path="/kyc-verifications" element={<RequireSuperAdmin><KycVerificationsPage /></RequireSuperAdmin>} />
              <Route path="/roles" element={<RequireSuperAdmin><RolesPage /></RequireSuperAdmin>} />
              <Route path="/policies" element={<Policies />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MaintenanceGuard>
          </PageFade>
          </BrowserRouter>
        </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;