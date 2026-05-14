import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText, Shield, RefreshCw, Building2 } from 'lucide-react';
import { APP_NAME, COMPANY_NAME, SUPPORT_LINKS } from '@/lib/brand';

type PolicyTab = 'terms' | 'privacy' | 'refund';

const renderSupportLinks = () =>
  SUPPORT_LINKS.map(({ href, handle }, index) => (
    <span key={handle}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">
        {handle}
      </a>
      {index === SUPPORT_LINKS.length - 2 ? ' and ' : index < SUPPORT_LINKS.length - 1 ? ', ' : ''}
    </span>
  ));

export default function Policies() {
  const [activeTab, setActiveTab] = useState<PolicyTab>('terms');

  const tabs: { id: PolicyTab; label: string; icon: React.ReactNode }[] = [
    { id: 'terms', label: 'Terms of Service', icon: <ScrollText className="h-4 w-4" /> },
    { id: 'privacy', label: 'Privacy Policy', icon: <Shield className="h-4 w-4" /> },
    { id: 'refund', label: 'Refund Policy', icon: <RefreshCw className="h-4 w-4" /> },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <Building2 className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{COMPANY_NAME} — Policies</h1>
          <p className="text-muted-foreground text-sm">Legal policies governing the use of {APP_NAME}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-muted-foreground hover:text-white hover:bg-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            {tabs.find((t) => t.id === activeTab)?.icon}
            {tabs.find((t) => t.id === activeTab)?.label}
          </CardTitle>
          <p className="text-muted-foreground text-xs">Last updated: February 2026 · {COMPANY_NAME}</p>
        </CardHeader>
        <CardContent className="prose prose-invert prose-sm max-w-none text-slate-300 space-y-5">
          {activeTab === 'terms' && <TermsOfService />}
          {activeTab === 'privacy' && <PrivacyPolicy />}
          {activeTab === 'refund' && <RefundPolicy />}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      <div className="text-slate-300 text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function TermsOfService() {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        These Terms of Service ("Terms") govern your access to and use of the {APP_NAME} platform
        operated by <strong className="text-white">{COMPANY_NAME}</strong>. By accessing or using
        the platform, you agree to be bound by these Terms.
      </p>

      <Section title="1. Acceptance of Terms">
        <p>
          By accessing or using {APP_NAME}, you confirm that you are at least 18 years of age, have
          the legal authority to enter into these Terms, and agree to comply with all applicable
          Philippine laws and regulations.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          {APP_NAME} is a payment management platform that integrates Telegram bot functionality with
          a web-based admin dashboard. It enables users to collect payments via 7 methods
          (Invoice, QR Code, Alipay QR, Maya Checkout, Payment Link, Virtual Account, and
          E-Wallet), manage disbursements, monitor wallet balances, and access financial
          transaction history through our trusted payment gateways. The
          platform also offers 22 Telegram bot commands for full payment operations directly
          from chat.
        </p>
      </Section>

      <Section title="3. Account Eligibility">
        <p>
          Access to the Admin Dashboard is restricted to verified Telegram accounts authorized by
          {COMPANY_NAME}. Unauthorized access attempts are strictly prohibited and may result in
          permanent account suspension and legal action.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree NOT to use {APP_NAME} to:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Process fraudulent, illegal, or unauthorized transactions</li>
          <li>Engage in money laundering or financing of illegal activities</li>
          <li>Circumvent payment gateway compliance requirements</li>
          <li>Impersonate any person or entity</li>
          <li>Transmit malware, spam, or disruptive code</li>
        </ul>
      </Section>

      <Section title="5. Payment Processing">
        <p>
          All payments are processed through our trusted payment gateways. {COMPANY_NAME} acts
          as a platform facilitator only. Transaction fees are determined by the respective payment
          gateways. {COMPANY_NAME} is not liable for payment gateway downtimes, failed transactions,
          or third-party processing errors.
        </p>
      </Section>

      <Section title="6. Wallet & Funds">
        <p>
          Wallet balances represent credits within the {APP_NAME} system. {COMPANY_NAME} reserves the
          right to freeze or suspend wallet accounts suspected of fraudulent activity. Withdrawal
          requests, top-up requests, and USDT send requests are subject to verification and
          super-admin approval. Processing may take 1–3 business days.
        </p>
      </Section>

      <Section title="7. Limitation of Liability">
        <p>
          {COMPANY_NAME} shall not be liable for any indirect, incidental, special, or consequential
          damages arising from your use of the platform. Our maximum aggregate liability shall not
          exceed the total fees paid by you in the 30 days preceding the claim.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          {COMPANY_NAME} may suspend or terminate your access at any time for violation of these
          Terms, suspected fraud, or at our sole discretion with reasonable notice.
        </p>
      </Section>

      <Section title="9. Governing Law">
        <p>
          These Terms are governed by the laws of the Republic of the Philippines. Any disputes
          shall be resolved exclusively in the courts of the Philippines.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          For questions about these Terms, contact us at {renderSupportLinks()}{' '}
          on Telegram.
        </p>
      </Section>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {COMPANY_NAME} is committed to protecting your personal data in accordance with the
        Philippine <strong className="text-white">Data Privacy Act of 2012 (RA 10173)</strong>.
        This policy explains how we collect, use, and protect your information.
      </p>

      <Section title="1. Information We Collect">
        <p>We collect the following data:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Telegram account information (user ID, username, first/last name)</li>
          <li>Payment transaction details (amounts, descriptions, status)</li>
          <li>Bank account details provided for disbursements</li>
          <li>Wallet balances and transaction history</li>
          <li>Device and access logs (IP address, timestamps)</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Data">
        <p>Your data is used to:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Process and track payment transactions</li>
          <li>Manage your wallet and disbursement requests</li>
          <li>Send payment notifications via Telegram</li>
          <li>Comply with legal and regulatory obligations</li>
          <li>Detect and prevent fraudulent activity</li>
        </ul>
      </Section>

      <Section title="3. Data Sharing">
        <p>
          We share your data only with trusted third-party payment processors as necessary to complete transactions. We do not sell, rent, or trade your
          personal information to any third party for marketing purposes.
        </p>
      </Section>

      <Section title="4. Data Retention">
        <p>
          Transaction records and personal data are retained for a minimum of 5 years in compliance
          with Philippine financial regulations (BSP regulations and Anti-Money Laundering Act).
        </p>
      </Section>

      <Section title="5. Data Security">
        <p>
          We implement industry-standard security measures including encrypted data transmission
          (HTTPS/TLS), JWT-based authentication, and access controls restricted to authorized
          Telegram accounts only.
        </p>
      </Section>

      <Section title="6. Your Rights">
        <p>Under the Data Privacy Act, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Access your personal data held by {COMPANY_NAME}</li>
          <li>Correct inaccurate or incomplete data</li>
          <li>Request erasure of data (subject to legal retention requirements)</li>
          <li>Object to processing of your data</li>
          <li>Lodge a complaint with the National Privacy Commission (NPC)</li>
        </ul>
      </Section>

      <Section title="7. Cookies">
        <p>
          The Admin Dashboard uses session tokens stored in your browser for authentication
          purposes only. We do not use tracking cookies or third-party analytics.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          For privacy concerns or data requests, contact our Data Protection Officer at {renderSupportLinks()}{' '}
          on Telegram.
        </p>
      </Section>
    </>
  );
}

function RefundPolicy() {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        This Refund Policy outlines the conditions under which{' '}
        <strong className="text-white">{COMPANY_NAME}</strong> processes refunds for payments made
        through the {APP_NAME} platform.
      </p>

      <Section title="1. Eligibility for Refunds">
        <p>Refund requests may be considered under the following circumstances:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Duplicate or erroneous payment transactions</li>
          <li>Payment collected for a service not rendered</li>
          <li>Technical errors resulting in incorrect charge amounts</li>
          <li>Unauthorized transactions (subject to investigation)</li>
        </ul>
      </Section>

      <Section title="2. Non-Refundable Items">
        <p>The following are generally non-refundable:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Payment gateway processing fees charged by our payment processors</li>
          <li>Completed disbursements already credited to the recipient's bank account</li>
          <li>Transactions where the service or goods have been delivered</li>
          <li>Wallet top-up fees</li>
        </ul>
      </Section>

      <Section title="3. How to Request a Refund">
        <p>To request a refund:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-1">
          <li>Contact us via Telegram at {renderSupportLinks()}</li>
          <li>Provide the transaction ID and reason for the refund request</li>
          <li>Our team will review the request within 2 business days</li>
          <li>If approved, refunds are processed back to the original payment method</li>
        </ol>
      </Section>

      <Section title="4. Refund Processing Time">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-white">E-Wallets (GCash, Maya, GrabPay):</strong> 3–5 business days</li>
          <li><strong className="text-white">Credit/Debit Cards:</strong> 7–14 business days</li>
          <li><strong className="text-white">Virtual Accounts / Bank Transfer:</strong> 3–7 business days</li>
          <li><strong className="text-white">Wallet Credits:</strong> Immediate upon approval</li>
        </ul>
      </Section>

      <Section title="5. Partial Refunds">
        <p>
          Partial refunds may be issued at {COMPANY_NAME}' discretion when only a portion of a
          transaction is eligible for refund. The refund amount will not exceed the original
          transaction value minus applicable processing fees.
        </p>
      </Section>

      <Section title="6. Disputes">
        <p>
          If you disagree with a refund decision, you may escalate via Telegram at{' '}
          {renderSupportLinks()}
          . {COMPANY_NAME} reserves the right to make the final determination on all refund disputes.
        </p>
      </Section>

      <Section title="7. Fraud Prevention">
        <p>
          {COMPANY_NAME} reserves the right to deny refund requests that appear to be fraudulent or
          abusive. Accounts with repeated suspicious refund requests may be suspended pending
          investigation.
        </p>
      </Section>
    </>
  );
}
