import { WrenchIcon } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center">
            <WrenchIcon className="h-10 w-10 text-amber-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Under Maintenance</h1>
        <p className="text-muted-foreground text-base mb-2">
          The system is currently undergoing scheduled maintenance.
        </p>
        <p className="text-muted-foreground text-sm">
          We'll be back shortly. Thank you for your patience.
        </p>
      </div>
    </div>
  );
}
