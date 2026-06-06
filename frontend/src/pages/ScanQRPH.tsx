import { useState, useRef, useCallback, useEffect } from 'react';
import jsQR from 'jsqr';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import PinAuthDialog from '@/components/PinAuthDialog';
import {
  Camera, Upload, QrCode, Loader2, CheckCircle, AlertCircle,
  ScanLine, X, RefreshCw, Send, Zap, ShieldCheck, Smartphone,
  Info, ArrowLeft, Store, Globe
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmtCurrencyPhp } from '@/lib/format';

interface QRPHData {
  merchantName: string;
  merchantCity: string;
  amount: string;
  currency: string;
  referenceNumber: string;
  raw: string;
  isQRPH: boolean;
}

function parseTLV(data: string): Map<string, string> {
  const result = new Map<string, string>();
  let i = 0;
  while (i + 4 <= data.length) {
    const id = data.substring(i, i + 2);
    const lenStr = data.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (isNaN(len) || i + 4 + len > data.length) break;
    const value = data.substring(i + 4, i + 4 + len);
    result.set(id, value);
    i += 4 + len;
  }
  return result;
}

function parseQRPH(raw: string): QRPHData | null {
  try {
    const tlv = parseTLV(raw);
    const merchantName = tlv.get('59') || '';
    const merchantCity = tlv.get('60') || '';
    const amount = tlv.get('54') || '';
    const currency = tlv.get('53') === '608' ? 'PHP' : (tlv.get('53') || '');
    let referenceNumber = '';
    const additionalData = tlv.get('62') || '';
    if (additionalData) {
      const subTlv = parseTLV(additionalData);
      referenceNumber = subTlv.get('05') || subTlv.get('01') || '';
    }
    const isQRPH = tlv.get('58') === 'PH' || tlv.get('53') === '608';
    return { merchantName, merchantCity, amount, currency, referenceNumber, raw, isQRPH };
  } catch { return null; }
}

export default function ScanQRPH() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'idle' | 'camera' | 'upload'>('idle');
  const [scanning, setScanning] = useState(false);
  const [qrData, setQrData] = useState<QRPHData | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleQRFound = useCallback((raw: string) => {
    stopCamera();
    const parsed = parseQRPH(raw);
    if (parsed && parsed.isQRPH) {
      setQrData(parsed);
      if (parsed.amount) setAmount(parsed.amount);
      toast.success('QRPH Kernel matched successfully!');
    } else {
      setQrData({ merchantName: '', merchantCity: '', amount: '', currency: 'PHP', referenceNumber: '', raw, isQRPH: false });
      toast.info('Decoding completed. External format detected.');
    }
    setMode('idle');
  }, [stopCamera]);

  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) handleQRFound(code.data);
    else rafRef.current = requestAnimationFrame(tick);
  }, [handleQRFound]);

  const startCamera = useCallback(async () => {
    setMode('camera');
    setQrData(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setScanning(true);
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch { toast.error('Optical hardware restricted.'); setMode('idle'); }
  }, [tick]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrData(null);
    setResult(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      URL.revokeObjectURL(url);
      if (code) handleQRFound(code.data);
      else toast.error('Signal too weak. Try a higher resolution capture.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error('I/O Failure.'); };
    img.src = url;
    e.target.value = '';
  }, [handleQRFound]);

  const handlePay = async () => {
    if (!qrData) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Invalid amount provided.'); return; }

    setPinValue('');
    setPinDialogOpen(true);
  };

  const executePay = async () => {
    if (pinValue.length < 4) {
      toast.error('Enter valid PIN');
      return;
    }

    setLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/xendit/pay-qrph',
        method: 'POST',
        data: {
          qr_data: qrData!.raw,
          amount: parseFloat(amount),
          description: description || qrData!.merchantName || 'QRPH payment',
          merchant_name: qrData!.merchantName,
          reference_number: qrData!.referenceNumber,
          pin: pinValue
        },
      });
      if (res.data?.success) {
        setResult(res.data.data || res.data);
        toast.success('Capital transfer successful!');
        setPinDialogOpen(false);
      }
      else {
        const msg = res.data?.message || 'Transaction aborted.';
        toast.error(msg);
        if (msg.toLowerCase().includes('pin')) setPinValue('');
      }
    } catch { toast.error('Kernel communication failure.'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    stopCamera(); setMode('idle'); setQrData(null); setAmount(''); setDescription(''); setResult(null);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase flex items-center gap-4">
               <div className="h-14 w-14 rounded-2xl bg-brandblue-500/10 flex items-center justify-center border border-brandblue-500/20 shadow-inner">
                 <QrCode className="h-8 w-8 text-brandblue-600" />
               </div>
               Optical Recognition
            </h1>
            <p className="text-muted-foreground font-medium flex items-center gap-3">
               <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
               <span className="uppercase tracking-[0.2em] text-[10px] font-black">Industrial QRPH & InstaPay Parser</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
             <div className="fintech-badge bg-brandblue-500/10 text-brandblue-500 border-brandblue-500/20 px-6 py-2.5 backdrop-blur-md shadow-sm">
               <Zap className="h-4 w-4 mr-2 inline animate-pulse" /> GRID_SCAN_READY
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
           <div className="lg:col-span-7 space-y-10">
              {!qrData && !result && (
                <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
                   <div className="h-2.5 bg-brandblue-500 w-full shadow-[0_0_15px_rgba(0,122,255,0.4)]" />
                   <CardHeader className="p-10 border-b border-border/10">
                     <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Phase 1 — Optical Acquisition</CardTitle>
                     <CardDescription className="font-black text-[10px] uppercase tracking-widest text-muted-foreground/40 mt-2">Capture QRPH payload from hardware or digital asset</CardDescription>
                   </CardHeader>
                   <CardContent className="p-10 space-y-10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                         <Button
                           onClick={startCamera}
                           className="h-48 flex-col gap-5 rounded-[2.5rem] bg-[#0A0F1E] border-2 border-white/5 text-white hover:bg-brandblue-600 hover:border-brandblue-500 transition-all duration-500 shadow-2xl group"
                         >
                            <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 group-hover:rotate-3 transition-all">
                               <Camera className="h-8 w-8 text-brandblue-400 group-hover:text-white" />
                            </div>
                            <span className="font-black text-[11px] uppercase tracking-[0.4em]">INITIATE_CAMERA</span>
                         </Button>
                         <Button
                           onClick={() => { setMode('upload'); fileRef.current?.click(); }}
                           variant="outline"
                           className="h-48 flex-col gap-5 rounded-[2.5rem] border-2 border-border/40 bg-muted/10 text-muted-foreground/60 hover:bg-muted/30 hover:border-brandblue-500/20 transition-all duration-500 group"
                         >
                            <div className="h-16 w-16 rounded-2xl bg-card flex items-center justify-center border border-border/40 group-hover:scale-110 group-hover:-rotate-3 transition-all">
                               <Upload className="h-8 w-8 text-muted-foreground/40 group-hover:text-brandblue-500" />
                            </div>
                            <span className="font-black text-[11px] uppercase tracking-[0.4em]">IMPORT_ASSET</span>
                         </Button>
                      </div>

                      {mode === 'camera' && (
                        <div className="mt-10 relative rounded-[3rem] overflow-hidden bg-black border-4 border-muted/50 shadow-[0_40px_80px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-700 aspect-square sm:aspect-video">
                           <video ref={videoRef} className="w-full h-full object-cover opacity-70 grayscale-[50%] hover:grayscale-0 transition-all duration-1000" muted playsInline />
                           <canvas ref={canvasRef} className="hidden" />
                           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="border-[2px] border-brandblue-500/40 rounded-[3rem] w-72 h-72 animate-pulse relative">
                                 <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-brandblue-500 rounded-tl-xl" />
                                 <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-brandblue-500 rounded-tr-xl" />
                                 <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-brandblue-500 rounded-bl-xl" />
                                 <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-brandblue-500 rounded-br-xl" />
                                 <div className="absolute inset-0 bg-brandblue-500/5 animate-float-delayed" />
                              </div>
                           </div>
                           <Button size="icon" variant="destructive" className="absolute top-8 right-8 h-12 w-12 rounded-full shadow-2xl active:scale-90" onClick={() => { stopCamera(); setMode('idle'); }}>
                              <X className="h-6 w-6" />
                           </Button>
                           <div className="absolute bottom-10 left-0 right-0 text-center">
                              <div className="inline-flex items-center gap-3 bg-black/60 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 shadow-2xl">
                                 <span className="h-2 w-2 rounded-full bg-brandblue-500 animate-ping" />
                                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white">SCANNING_ENVIRONMENT</span>
                              </div>
                           </div>
                        </div>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                   </CardContent>
                </Card>
              )}

              {qrData && !result && (
                <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card animate-in fade-in slide-in-from-top-6 duration-700">
                   <div className="h-2.5 bg-emerald-500 w-full shadow-[0_0_15px_rgba(52,211,153,0.4)]" />
                   <CardHeader className="p-10 border-b border-border/10 flex flex-row items-center justify-between">
                     <div>
                        <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Phase 2 — Settlement Authorization</CardTitle>
                        <CardDescription className="font-black text-[10px] uppercase tracking-widest text-muted-foreground/40 mt-2">Validate network metadata and execute transfer</CardDescription>
                     </div>
                     <Button variant="ghost" size="sm" onClick={reset} className="h-12 px-6 font-black text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 hover:text-rose-500 bg-muted/20 rounded-xl gap-2 transition-all"><ArrowLeft className="h-3.5 w-3.5" /> RE_SCAN</Button>
                   </CardHeader>
                   <CardContent className="p-10 space-y-10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="p-8 rounded-[2rem] bg-muted/20 border-2 border-border/40 space-y-8 shadow-inner">
                            <div className="flex items-center gap-5">
                               <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-border/60 text-brand-blue-600"><Store className="h-7 w-7" /></div>
                               <div className="min-w-0 space-y-1">
                                  <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.3em]">Destination Node</p>
                                  <p className="text-base font-black text-foreground uppercase truncate tracking-tight">{qrData.merchantName || 'EXT_MERCHANT_ID'}</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-5">
                               <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-border/60 text-amber-500"><Globe className="h-7 w-7" /></div>
                               <div className="min-w-0 space-y-1">
                                  <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.3em]">Regional Location</p>
                                  <p className="text-base font-black text-foreground uppercase truncate tracking-tight">{qrData.merchantCity || 'PHILIPPINES_SE_ASIA'}</p>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-8">
                            <div className="space-y-4">
                               <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Transfer Value (PHP)</Label>
                               <div className="relative group">
                                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-brand-blue-500 group-focus-within:scale-110 transition-transform">₱</div>
                                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="pl-12 h-18 bg-muted/20 border-border/40 text-3xl font-black rounded-[1.5rem] tabular-nums focus:ring-brandblue-500/10 border-2 shadow-sm" />
                               </div>
                            </div>
                            <div className="space-y-4">
                               <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Protocol Memo</Label>
                               <Input value={description} onChange={e => setDescription(e.target.value)} className="h-16 bg-muted/20 border-border/40 text-sm font-black rounded-2xl px-8 uppercase tracking-widest border-2 shadow-sm" placeholder="OPTIONAL_TX_METADATA" />
                            </div>
                         </div>
                      </div>

                      <Button onClick={handlePay} disabled={loading || !amount} className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-[2rem] uppercase tracking-[0.4em] shadow-2xl shadow-brandblue-500/30 active:scale-95 transition-all text-sm group">
                         {loading ? <Loader2 className="h-7 w-7 animate-spin mr-3" /> : <><ShieldCheck className="h-7 w-7 mr-4 group-hover:scale-110 transition-transform" /> EXECUTE_PAYMENT_KERNEL</>}
                      </Button>
                   </CardContent>
                </Card>
              )}

              {result && (
                 <Card className="fintech-card border-0 bg-[#0A0F1E] shadow-[0_40px_80px_rgba(0,0,0,0.4)] overflow-hidden animate-in zoom-in-95 duration-700 rounded-[3rem]">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2.5 w-full shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                    <CardHeader className="text-center pt-16 px-10">
                       <div className="h-28 w-28 rounded-[2.5rem] bg-white/5 backdrop-blur-3xl flex items-center justify-center mx-auto mb-10 shadow-2xl border border-white/10 text-emerald-400 animate-logo-entrance"><CheckCircle className="h-14 w-14" /></div>
                       <CardTitle className="text-3xl font-black text-white uppercase tracking-tighter">Settlement OK</CardTitle>
                       <CardDescription className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.4em] mt-3">Assets routed to destination node successfully</CardDescription>
                    </CardHeader>
                    <CardContent className="p-12 space-y-10">
                       <div className="bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center shadow-inner relative overflow-hidden group">
                          <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                          <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em] mb-6">Confirmed Value</p>
                          <h2 className="text-6xl font-black text-white tracking-tighter tabular-nums">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                          <div className="mt-10 flex justify-center">
                             <div className="fintech-badge bg-emerald-500 text-white border-0 px-6 py-2">SETTLED_T+0</div>
                          </div>
                       </div>
                       <Button onClick={reset} className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black rounded-[2rem] shadow-2xl shadow-brandblue-500/40 uppercase tracking-[0.4em] transition-all active:scale-95 text-xs">VIEW_UPDATED_LEDGER</Button>
                    </CardContent>
                 </Card>
              )}
           </div>

           <div className="lg:col-span-5 space-y-10">
              <Card className="fintech-card border-0 shadow-2xl bg-card/60 backdrop-blur-sm">
                 <CardHeader className="p-8 border-b border-border/10"><CardTitle className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.4em] ml-1">Grid Protocol Specs</CardTitle></CardHeader>
                 <CardContent className="space-y-10 p-10">
                    {[
                      { icon: ShieldCheck, label: 'Node Compliance', val: 'EMVCo v1.2 Standard', color: 'text-brandblue-500' },
                      { icon: Smartphone, label: 'Transmission Mode', val: 'Philippines QRPH Native', color: 'text-emerald-500' },
                      { icon: Info, label: 'Verification Engine', val: 'InstaPay Secure Realtime', color: 'text-amber-500' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-6 group/spec">
                        <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center border-2 border-border/40 text-muted-foreground/40 shadow-xl transition-all group-hover/spec:scale-110 group-hover/spec:border-brandblue-500/20 group-hover/spec:text-brandblue-500"><row.icon className={`h-8 w-8 ${row.color}`} /></div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">{row.label}</p>
                          <p className="text-sm font-black text-foreground uppercase tracking-tight">{row.val}</p>
                        </div>
                      </div>
                    ))}
                 </CardContent>
              </Card>

              <div className="p-10 rounded-[3rem] border-2 border-dashed border-border/60 flex flex-col items-center text-center space-y-8 bg-muted/5 group hover:bg-muted/10 transition-all duration-1000">
                 <div className="h-24 w-24 rounded-[2.5rem] bg-muted/20 flex items-center justify-center text-muted-foreground/10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 shadow-inner">
                    <ScanLine className="h-12 w-12 group-hover:text-brandblue-500/20 transition-colors" />
                 </div>
                 <div className="space-y-3">
                    <p className="text-base font-black text-foreground/60 uppercase tracking-widest">Auto-Emission Detection</p>
                    <p className="text-[11px] text-muted-foreground/60 font-black uppercase leading-relaxed tracking-widest px-4">
                       The neural kernel automatically parses merchant_id, geographic_nodes, and settlement_metadata from standard QRPH payloads.
                    </p>
                 </div>
                 <div className="flex gap-3">
                    <div className="h-1 w-8 rounded-full bg-brandblue-500/20" />
                    <div className="h-1 w-8 rounded-full bg-brandblue-500/10" />
                    <div className="h-1 w-8 rounded-full bg-brandblue-500/5" />
                 </div>
              </div>
           </div>
        </div>
      </div>

      <PinAuthDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        value={pinValue}
        onValueChange={setPinValue}
        onConfirm={executePay}
        loading={loading}
      />
    </Layout>
  );
}
