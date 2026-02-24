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
  Crown,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const BASE_NAV_ITEMS = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments Hub' },
  { to: '/transactions', icon: FileText, label: 'Transactions' },
  { to: '/disbursements', icon: Building2, label: 'Disbursements' },
  { to: '/reports', icon: PieChart, label: 'Reports' },
];

const BOT_NAV_ITEM = { to: '/bot-settings', icon: Bot, label: 'Bot' };

const BOTTOM_NAV = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/transactions', icon: FileText, label: 'Txns' },
  { to: '/disbursements', icon: Building2, label: 'Manage' },
];

interface LayoutProps {
  children: React.ReactNode;
  connected?: boolean;
}

export default function Layout({ children, connected }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { user, logout, isSuperAdmin, permissions } = useAuth();

  const NAV_ITEMS = permissions?.can_manage_bot
    ? [...BASE_NAV_ITEMS, BOT_NAV_ITEM]
    : BASE_NAV_ITEMS;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-700/50 bg-[#0F172A]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">PayBot</span>
              {user && (
                isSuperAdmin ? (
                  <span className="hidden sm:flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    <Crown className="h-2.5 w-2.5" />Super Admin
                  </span>
                ) : (
                  <span className="hidden sm:flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    <User className="h-2.5 w-2.5" />Admin
                  </span>
                )
              )}
            </Link>

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
            {/* Role badge */}
            {user && (
              <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isSuperAdmin
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                  : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
              }`}>
                <ShieldCheck className="h-3 w-3" />
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
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
