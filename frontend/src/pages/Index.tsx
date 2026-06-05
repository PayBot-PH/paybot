import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, CheckCircle2, Menu, X, Smartphone, Shield,
  Zap, BarChart3, Building2, MessageCircle, Wallet, CreditCard,
  TrendingUp, DollarSign, Clock
} from 'lucide-react';
import { APP_NAME, SUPPORT_URL, APP_DESCRIPTION } from '@/lib/brand';
import AppFooter from '@/components/AppFooter';

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileNavOpen] = useState(false);

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-[100] bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <img src="/logo.svg" alt="Logo" className="h-6 w-6" />
            </div>
            <div className="hidden sm:block">
              <h2 className="text-lg font-bold text-gray-900">{APP_NAME}</h2>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/features" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Features</Link>
            <Link to="/pricing" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Pricing</Link>
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Support</a>
            <Link to="/login">
              <Button variant="ghost" className="text-sm px-4 h-10">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 h-10">Get Started</Button>
            </Link>
          </div>

          <button className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 text-gray-900" onClick={() => setMobileNavOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-200 p-4 space-y-4">
            <Link to="/features" className="block text-sm text-gray-600 hover:text-blue-600">Features</Link>
            <Link to="/pricing" className="block text-sm text-gray-600 hover:text-blue-600">Pricing</Link>
            <Link to="/login" className="block text-sm text-gray-600 hover:text-blue-600">Sign In</Link>
            <Link to="/register">
              <Button className="w-full bg-blue-600 text-white h-10">Get Started</Button>
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero Section ── */}
      <section className="pt-32 pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-blue-50 border border-blue-200 px-4 py-2 rounded-full mb-6">
                <span className="text-sm text-blue-600 font-semibold">🇵🇭 Live in Philippines</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Accept payments.
                <br />
                <span className="text-blue-600">Get paid today.</span>
              </h1>

              <p className="text-lg text-gray-600 mb-10 leading-relaxed max-w-xl">
                Sell online with PayBot. Accept GCash, Maya, bank transfers, and more — all in one place. Perfect for small businesses, freelancers, and online stores.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/register" className="flex-1 sm:flex-none">
                  <Button className="w-full h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm group">
                    Get Started Free <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to="/features" className="flex-1 sm:flex-none">
                  <Button variant="outline" className="w-full h-12 px-8 border-gray-300 text-gray-900 hover:bg-gray-50 font-semibold rounded-lg">
                    See How It Works
                  </Button>
                </Link>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-8 pt-8 border-t border-gray-200">
                <div>
                  <p className="text-2xl font-bold text-gray-900">₱2B+</p>
                  <p className="text-sm text-gray-600 mt-1">Processed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">10k+</p>
                  <p className="text-sm text-gray-600 mt-1">Merchants</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">99.9%</p>
                  <p className="text-sm text-gray-600 mt-1">Uptime</p>
                </div>
              </div>
            </div>

            {/* Right side: Demo Card */}
            <div className="hidden lg:block">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 shadow-lg">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Today's Revenue</p>
                      <h3 className="text-4xl font-bold text-gray-900 mt-2">₱24,500</h3>
                    </div>
                    <div className="h-16 w-16 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="text-sm text-gray-600">GCash Transfers</span>
                      <span className="text-sm font-semibold text-gray-900">₱12,000</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Bank Deposits</span>
                      <span className="text-sm font-semibold text-gray-900">₱8,500</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Maya Transfers</span>
                      <span className="text-sm font-semibold text-gray-900">₱4,000</span>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-green-700">Settled Today</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Choose PayBot ── */}
      <section className="py-20 lg:py-32 bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16">
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-4">Why PayBot</h2>
            <h3 className="text-4xl font-bold text-gray-900">Everything you need to accept payments</h3>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Smartphone, title: 'Telegram Chat', desc: 'Manage payments right from your Telegram chat. No app downloads needed.' },
              { icon: Shield, title: 'Bank-Level Security', desc: 'Your money is protected. All transactions are verified and secure.' },
              { icon: Zap, title: 'Same-Day Payouts', desc: 'Money goes to your bank account the same day. No waiting periods.' },
              { icon: BarChart3, title: 'Real Sales Reports', desc: 'See all your revenue and customer activity in one place.' },
              { icon: Building2, title: 'All Local Banks', desc: 'Works with GCash, Maya, and every major Philippine bank.' },
              { icon: MessageCircle, title: 'Auto Confirmations', desc: 'Your customers get payment confirmations automatically.' },
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">{feature.title}</h4>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Payment Methods ── */}
      <section className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16">
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-4">Payment Methods</h2>
            <h3 className="text-4xl font-bold text-gray-900">Accept every payment method your customers want</h3>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'GCash', color: 'bg-blue-50' },
              { name: 'Maya', color: 'bg-red-50' },
              { name: 'Bank Transfer', color: 'bg-green-50' },
              { name: 'USDT', color: 'bg-amber-50' },
            ].map((method, i) => (
              <div key={i} className={`${method.color} border border-gray-200 rounded-lg p-6 text-center hover:shadow-lg transition-shadow`}>
                <p className="font-semibold text-gray-900">{method.name}</p>
                <p className="text-sm text-gray-600 mt-2">Instant transfers</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-20 lg:py-32 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">Start accepting payments in 3 minutes</h2>
          <p className="text-lg text-blue-100 mb-10">No setup fees. No credit card required. Free forever plan available.</p>
          <Link to="/register">
            <Button className="h-12 px-8 bg-white hover:bg-gray-100 text-blue-600 font-semibold rounded-lg shadow-lg group">
              Get Started Now <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
