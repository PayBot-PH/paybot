import { WrenchIcon, Clock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center">
            <WrenchIcon className="h-10 w-10 text-amber-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Under Maintenance</h1>
          <p className="text-muted-foreground text-base">The system is currently undergoing scheduled maintenance.</p>
          <p className="text-muted-foreground text-sm">We'll be back shortly. Thank you for your patience.</p>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-amber-500" />
          <span>Estimated downtime: a few minutes</span>
        </div>
        <div className="pt-2">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600 transition-colors">
            <ArrowLeft className="h-4 w-4" />Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
