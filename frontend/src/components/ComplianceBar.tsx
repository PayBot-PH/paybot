export default function ComplianceBar() {
  return (
    <div className="border-t border-slate-800 bg-slate-950 py-6 px-4">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
        {/* Badges row */}
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <img
            src="/logos/bsp.svg"
            alt="Bangko Sentral ng Pilipinas"
            className="h-14 w-auto opacity-90 hover:opacity-100 transition-opacity"
          />
          <img
            src="/logos/pci.svg"
            alt="PCI DSS Compliant"
            className="h-14 w-auto opacity-90 hover:opacity-100 transition-opacity"
          />
          <img
            src="/logos/dpo.svg"
            alt="DPO Registered \u2013 NPC Philippines"
            className="h-14 w-auto opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>
        {/* Regulatory text */}
        <p className="text-xs text-muted-foreground text-center max-w-lg leading-relaxed">
          <span className="text-muted-foreground font-medium">PayBot PH</span> is regulated by the{' '}
          <span className="text-muted-foreground font-medium">Bangko Sentral ng Pilipinas (BSP)</span>.
          We are PCI&nbsp;DSS compliant and registered with the National Privacy Commission (NPC) as a Data Protection Officer.
        </p>
      </div>
    </div>
  );
}
