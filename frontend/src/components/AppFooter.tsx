import { Link } from 'react-router-dom';
import { Bot, MessageCircle, Shield, FileText, ExternalLink } from 'lucide-react';
import { APP_NAME, COMPANY_NAME, SUPPORT_URL, APP_TAGLINE } from '@/lib/brand';

/* ─── Logo helpers ───────────────────────────────── */
// SiIcon: Simple-Icons (monochrome path) inside a branded coloured square.
function SiIcon({ src, alt, bg, size = 22 }: { src: string; alt: string; bg: string; size?: number }) {
  const r = Math.round(size * 0.28);
  const p = Math.round(size * 0.18);
  return (
    <div style={{ width: size, height: size, background: bg, borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: p, flexShrink: 0 }}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
    </div>
  );
}
// ImgIcon: Pre-coloured logo rendered at a fixed HEIGHT with auto width so wide
// wordmarks (GCash 4.25:1, Metrobank 5:1, etc.) display at their natural aspect ratio.
function ImgIcon({ src, alt, size = 20 }: { src: string; alt: string; size?: number }) {
  return (
    <img src={src} alt={alt} style={{ height: size, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
  );
}

// Heights are calibrated so every logo renders at roughly 50-65 px visual width:
// – square logos (BPI 1.3:1, RCBC 1.26:1) → size 22 → ~28 px wide
// – medium logos (BDO 2.86:1, Maya 3.44:1) → size 18 → ~52-62 px wide
// – wide wordmarks (GCash 4.25:1, UB 4.1:1, Metrobank 5:1) → size 12-14 → ~57-63 px wide
const PAYMENT_BRANDS = [
  { el: <SiIcon src="/logos/alipay.svg"     alt="Alipay"     bg="#1677FF" size={22} />, name: 'Alipay' },
  { el: <SiIcon src="/logos/wechat.svg"     alt="WeChat Pay" bg="#07C160" size={22} />, name: 'WeChat Pay' },
  { el: <ImgIcon src="/logos/gcash.svg"     alt="GCash"      size={14} />,               name: 'GCash' },
  { el: <ImgIcon src="/logos/maya.svg"      alt="Maya"       size={18} />,               name: 'Maya' },
  { el: <SiIcon src="/logos/grab.svg"       alt="GrabPay"    bg="#00B14F" size={22} />, name: 'GrabPay' },
  { el: <ImgIcon src="/logos/bpi.svg"       alt="BPI"        size={22} />,               name: 'BPI' },
  { el: <ImgIcon src="/logos/bdo.svg"       alt="BDO"        size={18} />,               name: 'BDO' },
  { el: <ImgIcon src="/logos/unionbank.svg" alt="UnionBank"  size={14} />,               name: 'UnionBank' },
  { el: <ImgIcon src="/logos/metrobank.svg" alt="Metrobank"  size={12} />,               name: 'Metrobank' },
  { el: <ImgIcon src="/logos/rcbc.svg"      alt="RCBC"       size={22} />,               name: 'RCBC' },
  { el: <ImgIcon src="/logos/psbank.svg"    alt="PSBank"     size={18} />,               name: 'PSBank' },
  { el: <SiIcon src="/logos/tether.svg"     alt="USDT"       bg="#26A17B" size={22} />, name: 'USDT' },
];

const NAV_LINKS = [
  { label: 'Home',     to: '/login' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing',  to: '/pricing' },
  { label: 'Policies', to: '/policies' },
  { label: 'Register', to: '/register' },
];

interface AppFooterProps {
  /** When true (admin layout), use the dark fintech palette; otherwise auto-blends with public pages */
  variant?: 'admin' | 'public';
}

export default function AppFooter({ variant = 'public' }: AppFooterProps) {
  const isAdmin = variant === 'admin';

  return (
    <footer className={`relative overflow-hidden ${isAdmin ? 'border-t border-white/[0.14] bg-[#0B1120]' : 'border-t border-white/[0.15] bg-[#040C18]'}`}>
      {/* Decorative gradient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-blue-700/8 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 right-1/4 w-64 h-64 bg-teal-700/6 blur-[80px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">

        {/* ── TOP ROW: Brand + Nav columns ────────────────────── */}
        <div className="pt-10 pb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">

          {/* Brand column */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/login" className="inline-flex items-center gap-3">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0 animate-logo-entrance hover:animate-logo-bounce">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-base leading-tight">{APP_NAME}</p>
                <p className="text-muted-foreground text-xs">{APP_TAGLINE}</p>
              </div>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              The unified Telegram payment platform for Philippine merchants. Accept Alipay, WeChat Pay,
              GCash, Maya, and all major PH banks — settle in USDT same day.
            </p>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm font-medium transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              {SUPPORT_URL.replace('https://t.me/', '@')}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </div>

          {/* Navigation column */}
          <div>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-4">Platform</p>
            <ul className="space-y-2.5">
              {NAV_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="text-muted-foreground hover:text-slate-200 text-sm transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & compliance column */}
          <div>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-4">Compliance</p>
            <ul className="space-y-3">
              <li className="flex items-center gap-2">
                <img src="/logos/bsp.svg" alt="BSP" className="h-5 w-auto opacity-80 logo-glow-hover" />
                <span className="text-muted-foreground text-xs">BSP Regulated</span>
              </li>
              <li className="flex items-center gap-2">
                <img src="/logos/pci.svg" alt="PCI DSS" className="h-5 w-auto opacity-80 logo-glow-hover" />
                <span className="text-muted-foreground text-xs">PCI DSS Compliant</span>
              </li>
              <li className="flex items-center gap-2">
                <img src="/logos/dpo.svg" alt="DPO / NPC" className="h-5 w-auto opacity-80 logo-glow-hover" />
                <span className="text-muted-foreground text-xs">NPC / DPO Registered</span>
              </li>
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-teal-400/80 shrink-0" />
                <span className="text-muted-foreground text-xs">256-bit TLS Encryption</span>
              </li>
              <li className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400/80 shrink-0" />
                <Link to="/policies" className="text-muted-foreground hover:text-slate-300 text-xs transition-colors">
                  Privacy Policy & Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* ── PAYMENT BRANDS ROW ───────────────────────────────── */}
        <div className="border-t border-white/[0.15] py-6">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest text-center mb-4">
            Accepted payment networks
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PAYMENT_BRANDS.map(({ el, name }) => (
              <div
                key={name}
                className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1 logo-box-glow transition-all duration-150"
                title={name}
              >
                {el}
                <span className="text-muted-foreground text-[10px] font-medium whitespace-nowrap">{name}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 py-1">
              <span className="text-slate-600 text-[10px]">+100 PH banks</span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM BAR: copyright ────────────────────────────── */}
        <div className="border-t border-white/[0.15] py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-600 text-xs text-center sm:text-left">
            © {new Date().getFullYear()} <span className="text-muted-foreground">{COMPANY_NAME}</span>. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 bg-teal-500/8 border border-teal-500/20 rounded-full px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" />
            <span className="text-teal-400 text-[11px] font-semibold">USDT T+0 Settlement &middot; Live</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
