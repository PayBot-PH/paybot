import React, { useState } from 'react';
import Layout from '../components/Layout';
import { Download, Smartphone, Zap, Clock, Shield, CheckCircle, ArrowRight, Star } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface Testimonial {
  name: string;
  role: string;
  text: string;
  rating: number;
}

export default function DownloadApkPage() {
  const [downloadStarted, setDownloadStarted] = useState(false);

  const features: Feature[] = [
    {
      icon: <Smartphone className="h-8 w-8" />,
      title: 'Tap-to-Phone Payments',
      description: 'Accept contactless payments directly through your smartphone. No extra hardware needed.',
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: 'Instant Settlement (T+0)',
      description: 'Get paid instantly. Money deposited to your account in real-time, 24/7/365.',
    },
    {
      icon: <Clock className="h-8 w-8" />,
      title: 'Real-time Transactions',
      description: 'Process transactions instantly with live updates on your dashboard.',
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: 'Bank-Grade Security',
      description: 'Enterprise-level encryption and compliance with PCI-DSS standards.',
    },
  ];

  const terminalFeatures: Feature[] = [
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'NFC & RFID Support',
      description: 'Accept all major contactless card types and digital wallets.',
    },
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'EMV Certified',
      description: 'Fully certified for secure contactless transactions.',
    },
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'Multi-Currency Support',
      description: 'Accept payments in multiple currencies with real-time conversion.',
    },
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'Offline Mode',
      description: 'Keep accepting payments even without internet connectivity.',
    },
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'Transaction History',
      description: 'Complete records and receipts for every transaction.',
    },
    {
      icon: <CheckCircle className="h-6 w-6" />,
      title: 'Quick Settlements',
      description: 'Multiple settlement options with transparent fee structure.',
    },
  ];

  const testimonials: Testimonial[] = [
    {
      name: 'Maria Santos',
      role: 'Small Business Owner',
      text: 'Instant payouts mean I never have to wait for money. This has completely transformed how I manage my cash flow.',
      rating: 5,
    },
    {
      name: 'Juan Dela Cruz',
      role: 'Market Vendor',
      text: 'No more carrying cash, no more delays. My customers love it, and I get paid right away.',
      rating: 5,
    },
    {
      name: 'Angela Reyes',
      role: 'Restaurant Owner',
      text: 'The tap-to-phone feature is so easy to use. My staff learned it in minutes.',
      rating: 5,
    },
  ];

  const handleDownload = () => {
    setDownloadStarted(true);
    // Simulate download
    setTimeout(() => {
      setDownloadStarted(false);
    }, 2000);
  };

  return (
    <Layout>
      <div className="w-full">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700 text-white py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-block px-4 py-2 bg-blue-400/20 border border-blue-300 rounded-full">
                  <span className="text-sm font-semibold text-blue-100">Available Now</span>
                </div>
                <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                  Accept Payments Anywhere
                </h1>
                <p className="text-xl text-blue-100 leading-relaxed">
                  Transform your smartphone into a powerful payment terminal. Accept contactless payments, settle instantly, and grow your business.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-all duration-150 shadow-lg hover:shadow-xl"
                  >
                    <Download className="h-5 w-5" />
                    {downloadStarted ? 'Downloading...' : 'Download APK'}
                  </button>
                  <a
                    href="#features"
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white text-white font-bold rounded-lg hover:bg-white/10 transition-all duration-150"
                  >
                    Learn More
                    <ArrowRight className="h-5 w-5" />
                  </a>
                </div>
                <div className="flex items-center gap-6 pt-4">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 fill-yellow-300 text-yellow-300" />
                    <span className="font-semibold">4.9/5 Rating</span>
                  </div>
                  <div className="text-sm text-blue-100">50K+ downloads</div>
                </div>
              </div>

              {/* Phone Mockup */}
              <div className="relative h-96">
                <div className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-transparent rounded-3xl" />
                <div className="relative mx-auto max-w-xs h-full bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl border-8 border-slate-700 flex items-center justify-center overflow-hidden">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-900 rounded-b-3xl" />
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 flex flex-col items-center justify-center p-6 space-y-4">
                    <Smartphone className="h-24 w-24 text-white opacity-50" />
                    <div className="text-center space-y-2">
                      <p className="text-white font-bold text-xl">₱1,250.00</p>
                      <p className="text-blue-100 text-sm">Tap to accept payment</p>
                    </div>
                    <div className="w-12 h-12 rounded-full border-3 border-white/30 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features Section */}
        <section id="features" className="py-16 px-4 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose xend Terminal?</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Everything you need to accept payments and grow your business
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, idx) => (
                <div key={idx} className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                  <div className="text-blue-600 mb-3">{feature.icon}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* T+0 Settlement Highlight */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-8 border border-green-200">
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Zap className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Settlement Speed</p>
                        <p className="text-3xl font-bold text-green-600">Instant (T+0)</p>
                      </div>
                    </div>
                    <div className="border-t border-green-200 pt-6">
                      <h4 className="font-bold text-gray-900 mb-3">What does T+0 mean?</h4>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2 text-gray-700">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          Same-day fund transfer
                        </li>
                        <li className="flex items-center gap-2 text-gray-700">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          24/7 availability
                        </li>
                        <li className="flex items-center gap-2 text-gray-700">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          No waiting period
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-1 md:order-2 space-y-6">
                <h2 className="text-4xl font-bold text-gray-900">Instant Payouts</h2>
                <p className="text-lg text-gray-600 leading-relaxed">
                  Say goodbye to waiting days for your money. With our T+0 settlement, funds are transferred to your bank account instantly after each transaction.
                </p>
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="font-semibold text-gray-900">No More Waiting</p>
                    <p className="text-sm text-gray-600">Improve your cash flow with immediate access to your earnings.</p>
                  </div>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="font-semibold text-gray-900">Better for Business</p>
                    <p className="text-sm text-gray-600">Reinvest earnings immediately or handle unexpected expenses.</p>
                  </div>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="font-semibold text-gray-900">Complete Transparency</p>
                    <p className="text-sm text-gray-600">Real-time settlement tracking and detailed transaction records.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Terminal Features */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Terminal Features</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Advanced payment processing capabilities in your pocket
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {terminalFeatures.map((feature, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow border border-gray-200"
                >
                  <div className="text-blue-600 mb-3">{feature.icon}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-lg text-gray-600">Simple steps to start accepting payments</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { step: 1, title: 'Download', desc: 'Get the app from your phone' },
                { step: 2, title: 'Register', desc: 'Create your merchant account' },
                { step: 3, title: 'Setup', desc: 'Configure your payment settings' },
                { step: 4, title: 'Accept', desc: 'Start receiving payments' },
              ].map((item, idx) => (
                <div key={idx} className="relative">
                  <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4">
                      {item.step}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </div>
                  {idx < 3 && (
                    <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2">
                      <ArrowRight className="h-6 w-6 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">What Users Say</h2>
              <p className="text-lg text-gray-600">Join thousands of satisfied merchants</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, idx) => (
                <div key={idx} className="bg-white rounded-lg p-6 shadow-md">
                  <div className="flex items-center gap-1 mb-4">
                    {Array(testimonial.rating)
                      .fill(0)
                      .map((_, i) => (
                        <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                      ))}
                  </div>
                  <p className="text-gray-700 mb-4 italic">"{testimonial.text}"</p>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="font-bold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-600">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* System Requirements */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-gray-900 mb-8 text-center">System Requirements</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Android Device
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Android 8.0 or higher</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>NFC capability required</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Minimum 2GB RAM</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>50MB free storage</span>
                  </li>
                </ul>
              </div>

              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security & Compliance
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>PCI-DSS Level 1 Compliant</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>End-to-end Encryption</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>EMV & NFC Certified</span>
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span>Regular Security Audits</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">Frequently Asked Questions</h2>

            <div className="space-y-4">
              {[
                {
                  q: 'Is there a setup fee?',
                  a: 'No setup fees. Simple pay-per-transaction pricing with no hidden charges.',
                },
                {
                  q: 'Which payment cards are supported?',
                  a: 'We support all major payment networks: Visa, Mastercard, UnionPay, and digital wallets.',
                },
                {
                  q: 'How secure are the transactions?',
                  a: 'All transactions are encrypted end-to-end and comply with PCI-DSS Level 1 standards.',
                },
                {
                  q: 'What if my internet goes down?',
                  a: 'The app has offline mode. Transactions are synced once connectivity is restored.',
                },
                {
                  q: 'How do I get customer support?',
                  a: '24/7 support via chat, email, and phone. Average response time: under 2 minutes.',
                },
                {
                  q: 'Can I use multiple devices?',
                  a: 'Yes, your account can be used on multiple devices. All transactions sync in real-time.',
                },
              ].map((item, idx) => (
                <details
                  key={idx}
                  className="bg-white rounded-lg border border-gray-200 p-6 cursor-pointer hover:border-blue-300 transition-colors"
                >
                  <summary className="font-bold text-gray-900 flex items-center justify-between">
                    {item.q}
                    <span className="text-blue-600">+</span>
                  </summary>
                  <p className="text-gray-600 mt-4">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold">Ready to Transform Your Business?</h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              Join thousands of merchants accepting contactless payments with instant settlements
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <button
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-all duration-150 shadow-lg hover:shadow-xl"
              >
                <Download className="h-5 w-5" />
                Download APK Now
              </button>
              <a
                href="/help"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white text-white font-bold rounded-lg hover:bg-white/10 transition-all duration-150"
              >
                Need Help?
              </a>
            </div>
            <p className="text-sm text-blue-100">Free • Fast • Secure • Reliable</p>
          </div>
        </section>
      </div>
    </Layout>
  );
}
