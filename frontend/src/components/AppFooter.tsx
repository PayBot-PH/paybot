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
  const dividerClass = isAdmin ? 'border-border/10' : 'border-slate-800/40';
  const bgClass = isAdmin ? 'bg-transparent' : 'bg-[#0A0F1E]';

  return (
    <footer className={`relative overflow-hidden border-t ${dividerClass} ${bgClass} pt-20 pb-16`}>
      {/* Decorative gradient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute -bottom-48 left-1/4 w-[500px] h-[500px] bg-brandblue-700/10 blur-[120px] rounded-full animate-float" />
        <div className="absolute -bottom-32 right-1/4 w-[400px] h-[400px] bg-emerald-700/5 blur-[100px] rounded-full animate-float-delayed" />
      </div>

      <div className="relative max-w-7xl mx-auto px-10">

        {/* ── TOP ROW: Brand + Nav columns ────────────────────── */}
        <div className="pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-16">

          {/* Brand column */}
          <div className="lg:col-span-2 space-y-8">
            <Link to="/login" className="inline-flex items-center gap-4 group">
              <div className="h-12 w-12 bg-[#0A0F1E] border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:bg-brandblue-600">
                <Bot className="h-6 w-6 text-brandblue-400 group-hover:text-white" />
              </div>
              <div>
                <p className="text-foreground font-black text-xl leading-none uppercase tracking-tighter">{APP_NAME}</p>
                <p className="text-muted-foreground/80 text-[10px] font-black uppercase tracking-[0.3em] mt-1.5">{APP_TAGLINE}</p>
              </div>
            </Link>
            <p className="text-muted-foreground/90 text-sm font-bold leading-relaxed max-w-sm uppercase tracking-tight">
              The institutional transmission layer for Philippine liquidity nodes. Real-time clearing between local networks and global asset vaults.
            </p>
            <div className="pt-4 flex flex-col gap-3">
               <p className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-[0.4em]">Kernel_Support</p>
               <a
                 href={SUPPORT_URL}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="inline-flex items-center gap-3 text-brandblue-500 hover:text-brandblue-400 text-xs font-black uppercase tracking-widest transition-all group/link"
               >
                 <MessageCircle className="h-4 w-4" />
                 {SUPPORT_URL.replace('https://t.me/', '@')}
                 <ExternalLink className="h-3 w-3 opacity-40 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
               </a>
            </div>
          </div>

          {/* Navigation column */}
          <div>
            <p className="text-muted-foreground/80 text-[10px] font-black uppercase tracking-[0.4em] mb-8">Protocol_Links</p>
            <ul className="space-y-4">
              {NAV_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="text-muted-foreground hover:text-brandblue-500 text-xs font-black uppercase tracking-widest transition-all"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & compliance column */}
          <div>
            <p className="text-muted-foreground/80 text-[10px] font-black uppercase tracking-[0.4em] mb-8">Node_Compliance</p>
            <ul className="space-y-5">
              {[
                { img: '/logos/bsp.svg', label: 'BSP Regulated' },
                { img: '/logos/pci.svg', label: 'PCI DSS v4.0' },
                { img: '/logos/dpo.svg', label: 'DPO/NPC Node' },
              ].map(c => (
                <li key={c.label} className="flex items-center gap-3 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-default">
                  <img src={c.img} alt="" aria-hidden="true" className="h-6 w-auto shadow-sm" />
                  <span className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">{c.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 pt-2">
                <Shield className="h-4 w-4 text-emerald-500/70 shrink-0" />
                <span className="text-muted-foreground/80 text-[9px] font-black uppercase tracking-widest">AES-256 GCM Encryption</span>
              </li>
            </ul>
          </div>
        </div>

        {/* ── PAYMENT BRANDS ROW ───────────────────────────────── */}
        <div className={`border-t ${dividerClass} py-12`}>
          <p className="text-muted-foreground/60 text-[10px] font-black uppercase tracking-[0.5em] text-center mb-10">
            ACCEPTED_NETWORK_ENTITIES
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {PAYMENT_BRANDS.map(({ el, name }) => (
              <div
                key={name}
                className="flex items-center gap-3 bg-muted/20 border border-border/10 rounded-2xl px-4 py-2.5 hover:bg-muted/40 hover:border-brandblue-500/20 transition-all duration-500 cursor-default grayscale opacity-60 hover:grayscale-0 hover:opacity-100 shadow-sm"
                title={name}
              >
                <div className="scale-110">{el}</div>
                <span className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">{name}</span>
              </div>
            ))}
              <div className="flex items-center gap-2 bg-muted/10 border border-transparent rounded-full px-5 py-2">
              <span className="text-muted-foreground/60 text-[9px] font-black uppercase tracking-[0.2em]">+100 INSTITUTIONAL_BANKS</span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM BAR: copyright ────────────────────────────── */}
        <div className={`border-t ${dividerClass} pt-12 flex flex-col sm:flex-row items-center justify-between gap-6`}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
             <p className="text-muted-foreground/60 text-[10px] font-black uppercase tracking-[0.3em]">
               © {new Date().getFullYear()} {COMPANY_NAME}
             </p>
             <span className="hidden sm:block h-1 w-1 rounded-full bg-muted-foreground/30" />
             <p className="text-muted-foreground/60 text-[10px] font-black uppercase tracking-[0.3em]">NODE_ID: PRODUCTION_PH_01</p>
          </div>
          <div className="flex items-center gap-4 bg-[#0A0F1E] border border-white/5 rounded-full px-6 py-2.5 shadow-2xl">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)] shrink-0" />
            <span className="text-white text-[10px] font-black uppercase tracking-[0.4em]">Grid_Settlement: Active (T+0)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
