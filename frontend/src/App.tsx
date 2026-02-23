import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Transactions from './pages/Transactions';
import CreatePayment from './pages/CreatePayment';
import PaymentsHub from './pages/PaymentsHub';
import DisbursementsPage from './pages/DisbursementsPage';
import ReportsPage from './pages/ReportsPage';
import BotSettings from './pages/BotSettings';
import AdminManagement from './pages/AdminManagement';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';
import LogoutCallbackPage from './pages/LogoutCallbackPage';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/error" element={<AuthError />} />
            <Route path="/logout-callback" element={<LogoutCallbackPage />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/create-payment" element={<CreatePayment />} />
            <Route path="/payments" element={<PaymentsHub />} />
            <Route path="/disbursements" element={<DisbursementsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/bot-settings" element={<BotSettings />} />
            <Route path="/admin-management" element={<AdminManagement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;