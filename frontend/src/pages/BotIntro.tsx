import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bot,
  BarChart3,
  Wallet,
  CreditCard,
  FileText,
  Building2,
  PieChart,
  ShieldCheck,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  Home,
  Send,
  ClipboardList,
  DollarSign,
  UserCheck,
  Settings,
} from 'lucide-react';
import { APP_NAME, APP_DESCRIPTION, SUPPORT_HANDLE } from '@/lib/brand';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  route?: string;
  routeLabel?: string;
  tips: string[];
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: `Welcome to ${APP_NAME}`,
    description: APP_DESCRIPTION,
    icon: Bot,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15 border-blue-500/25',
    tips: [
      'This quick tour will show you where to find everything in the dashboard.',
      'Use the sidebar on the left to navigate between sections.',
      'The top bar includes a theme toggle and your account menu.',
    ],
  },
  {
    title: 'Dashboard — Your Overview',
    description: 'The Dashboard is your home base. Get a quick summary of wallet balance, recent transactions, and key metrics at a glance.',
    icon: LayoutDashboard,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15 border-blue-500/25',
    route: '/',
    routeLabel: 'Go to Dashboard',
    tips: [
      'The dashboard updates in real-time via WebSocket.',
      'Check the "Live" indicator in the top bar to confirm your connection status.',
    ],
  },
  {
    title: 'Wallet — Manage Your Funds',
    description: 'View your wallet balance, top up funds, and review your wallet transaction history.',
    icon: Wallet,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15 border-emerald-500/25',
    route: '/wallet',
    routeLabel: 'Go to Wallet',
    tips: [
      'Keep your wallet funded to process payments smoothly.',
      'Admins can request top-ups from Super Admins.',
    ],
  },
  {
    title: 'Payments Hub — Accept Payments',
    description: 'Create and manage payments using multiple methods: Invoice, QR Code, Alipay, WeChat Pay, Payment Links, Virtual Accounts, and E-Wallets.',
    icon: CreditCard,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/15 border-purple-500/25',
    route: '/payments',
    routeLabel: 'Go to Payments Hub',
    tips: [
      'Choose the right payment method for each transaction type.',
      'Links are shareable — send them directly via Telegram.',
    ],
  },
  {
    title: 'Transactions — Full History',
    description: 'Browse every payment transaction. Filter by date, status, or type and export data for reconciliation.',
    icon: FileText,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/15 border-cyan-500/25',
    route: '/transactions',
    routeLabel: 'Go to Transactions',
    tips: [
      'Use filters to quickly find specific transactions.',
      'Status badges show pending, completed, or failed payments.',
    ],
  },
  {
    title: 'Disbursements — Send Funds',
    description: 'Disburse funds to recipients instantly. Manage batch payouts and track disbursement status.',
    icon: Building2,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15 border-amber-500/25',
    route: '/disbursements',
    routeLabel: 'Go to Disbursements',
    tips: [
      'Ensure your wallet has sufficient balance before disbursing.',
      'Disbursements require approval based on your role permissions.',
    ],
  },
  {
    title: 'Reports — Analytics & Insights',
    description: 'View charts and summary reports: revenue trends, transaction success rates, and payment method breakdowns.',
    icon: PieChart,
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/15 border-rose-500/25',
    route: '/reports',
    routeLabel: 'Go to Reports',
    tips: [
      'Reports can be filtered by date range.',
      'Use charts to identify peak payment periods.',
    ],
  },
  {
    title: 'Settings & Admin — System Controls',
    description: 'Manage bot settings, configure messages, and (for Super Admins) handle admin accounts, KYC/KYB verifications, and USDT requests.',
    icon: Settings,
    iconColor: 'text-muted-foreground',
    iconBg: 'bg-slate-500/15 border-slate-500/25',
    route: '/bot-settings',
    routeLabel: 'Go to Bot Settings',
    tips: [
      'Bot Settings lets you configure Telegram bot behavior.',
      'Super Admins see additional sections: Admin Management, USDT Requests, KYB/KYC.',
    ],
  },
  {
    title: "You're All Set!",
    description: `You now know your way around ${APP_NAME}. Head to the main dashboard to get started, or explore any section from the sidebar at any time.`,
    icon: Home,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15 border-blue-500/25',
    route: '/',
    routeLabel: 'Go to Dashboard',
    tips: [
      'You can revisit this tutorial anytime — it appears after every login.',
      `Need help? Contact support on Telegram: ${SUPPORT_HANDLE}`,
    ],
  },
];

export default function BotIntro() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center">
        <span className="h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const current = TUTORIAL_STEPS[step];
  const Icon = current.icon;
  const total = TUTORIAL_STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const handleNext = () => {
    if (isLast) {
      navigate('/');
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt={APP_NAME} className="h-8 w-8 rounded-lg" />
          <p className="text-sm font-bold text-white hidden sm:block">{APP_NAME}</p>
        </Link>
        <Link
          to="/"
          className="text-muted-foreground hover:text-white text-xs font-medium transition-colors"
        >
          Skip tutorial →
        </Link>
      </header>

      {/* Progress bar */}
      <div className="relative z-10 h-1 bg-muted">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-8">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-blue-500' : i < step ? 'w-3 bg-blue-700' : 'w-3 bg-slate-700'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Step counter */}
          <p className="text-center text-muted-foreground text-xs mb-6 font-medium">
            Step {step + 1} of {total}
          </p>

          {/* Card */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
            {/* Icon */}
            <div className={`h-14 w-14 rounded-2xl border ${current.iconBg} flex items-center justify-center mb-6`}>
              <Icon className={`h-7 w-7 ${current.iconColor}`} />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>

            {/* Description */}
            <p className="text-slate-300 text-sm leading-relaxed mb-6">{current.description}</p>

            {/* Tips */}
            <div className="space-y-2 mb-8">
              {current.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5 text-muted-foreground text-xs leading-relaxed">
                  <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 font-bold" style={{ fontSize: '9px' }}>
                    {i + 1}
                  </span>
                  {tip}
                </div>
              ))}
            </div>

            {/* Page link */}
            {current.route && (
              <Link
                to={current.route}
                className="flex items-center justify-between w-full bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/25 text-blue-300 hover:text-blue-200 text-sm font-medium py-3 px-4 rounded-xl transition-all group mb-4"
              >
                <span>{current.routeLabel}</span>
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 gap-4">
            <button
              onClick={handleBack}
              disabled={isFirst}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/25"
            >
              {isLast ? 'Go to Dashboard' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
