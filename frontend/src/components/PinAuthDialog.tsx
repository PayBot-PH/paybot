import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';

interface PinAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

const PinAuthDialog: React.FC<PinAuthDialogProps> = ({
  open,
  onOpenChange,
  value,
  onValueChange,
  onConfirm,
  loading = false,
  title = "Security Verification",
  subtitle = "Confirm Protocol Authorization"
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-0 bg-card shadow-2xl">
        <div className="bg-slate-900 p-8 text-center">
          <div className="h-16 w-16 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-4 border border-white/20">
            <ShieldAlert className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tight">{title}</h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">{subtitle}</p>
        </div>
        <div className="p-10 space-y-10 flex flex-col items-center">
          <div className="text-center space-y-2">
            <p className="text-sm font-black text-foreground uppercase tracking-tight">Enter Operator PIN</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Required for asset transmission</p>
          </div>

          <InputOTP
            maxLength={6}
            value={value}
            onChange={onValueChange}
          >
            <InputOTPGroup className="gap-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="h-14 w-12 rounded-xl border-2 border-border/40 text-xl font-black"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>

          <div className="w-full space-y-4">
            <Button
              onClick={onConfirm}
              disabled={loading || value.length < 4}
              className="w-full h-16 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-2xl uppercase tracking-[0.2em] shadow-xl"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Authorize Transaction'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full h-12 text-muted-foreground hover:text-foreground font-black uppercase text-[10px] tracking-widest"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PinAuthDialog;
