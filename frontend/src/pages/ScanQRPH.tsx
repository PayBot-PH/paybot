import { useState, useRef, useCallback, useEffect } from 'react';
import jsQR from 'jsqr';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Camera, Upload, QrCode, Loader2, CheckCircle, AlertCircle,
  ScanLine, X, RefreshCw, Send, Zap, ShieldCheck, Smartphone,
  Info, ArrowLeft
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
    setLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/xendit/pay-qrph',
        method: 'POST',
        data: {
          qr_data: qrData.raw,
          amount: amt,
          description: description || qrData.merchantName || 'QRPH payment',
          merchant_name: qrData.merchantName,
          reference_number: qrData.referenceNumber,
        },
      });
      if (res.data?.success) { setResult(res.data.data || res.data); toast.success('Capital transfer successful!'); }
      else toast.error(res.data?.message || 'Transaction aborted.');
    } catch { toast.error('Kernel communication failure.'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    stopCamera(); setMode('idle'); setQrData(null); setAmount(''); setDescription(''); setResult(null);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
              <QrCode className="h-8 w-8 text-brand-blue-500" />
              QRPH Scanner
            </h1>
            <p className="text-muted-foreground text-sm font-medium mt-1">Industrial-grade QRPH & InstaPay optical recognition</p>
          </div>
          <Badge className="bg-brand-blue-500/10 text-brand-blue-600 border-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
            <Zap className="h-3 w-3 mr-1.5 inline" /> Operational
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
           <div className="lg:col-span-7 space-y-6">
              {!qrData && !result && (
                <Card className="border-border/60 shadow-sm overflow-hidden">
                   <div className="h-1 bg-brand-blue-500 w-full" />
                   <CardHeader>
                     <CardTitle className="text-lg font-black uppercase tracking-tight">Step 1 — Optical Capture</CardTitle>
                     <CardDescription className="text-xs font-medium uppercase tracking-widest">Acquire QRPH payload from device or file</CardDescription>
                   </CardHeader>
                   <CardContent className="pt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <Button
                           onClick={startCamera}
                           className="h-32 flex-col gap-3 rounded-2xl bg-brand-blue-50 border-2 border-brand-blue-500/30 text-brand-blue-600 hover:bg-brand-blue-100 hover:border-brand-blue-500 transition-all shadow-sm"
                         >
                            <Camera className="h-8 w-8" />
                            <span className="font-black text-[10px] uppercase tracking-widest">Initialize Camera</span>
                         </Button>
                         <Button
                           onClick={() => { setMode('upload'); fileRef.current?.click(); }}
                           variant="outline"
                           className="h-32 flex-col gap-3 rounded-2xl border-2 border-border/60 text-muted-foreground hover:bg-muted/40 hover:border-brand-blue-200 transition-all"
                         >
                            <Upload className="h-8 w-8" />
                            <span className="font-black text-[10px] uppercase tracking-widest">Import Asset</span>
                         </Button>
                      </div>

                      {mode === 'camera' && (
                        <div className="mt-6 relative rounded-3xl overflow-hidden bg-black border-4 border-muted/50 shadow-2xl animate-in zoom-in-95 duration-500">
                           <video ref={videoRef} className="w-full max-h-[400px] object-cover opacity-80" muted playsInline />
                           <canvas ref={canvasRef} className="hidden" />
                           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="border-4 border-brand-blue-500/50 rounded-[2rem] w-64 h-64 animate-pulse ring-[200px] ring-black/40" />
                           </div>
                           <Button size="icon" variant="destructive" className="absolute top-4 right-4 h-10 w-10 rounded-full" onClick={() => { stopCamera(); setMode('idle'); }}>
                              <X className="h-5 w-5" />
                           </Button>
                           <div className="absolute bottom-6 left-0 right-0 text-center">
                              <Badge className="bg-black/60 text-white border-0 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] backdrop-blur-md">Scanning Environment...</Badge>
                           </div>
                        </div>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                   </CardContent>
                </Card>
              )}

              {qrData && !result && (
                <Card className="border-border/60 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                   <div className="h-1 bg-emerald-500 w-full" />
                   <CardHeader className="flex flex-row items-center justify-between pb-4">
                     <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tight">Step 2 — Settlement Authorization</CardTitle>
                        <CardDescription className="text-xs font-medium uppercase tracking-widest">Review parsed metadata and confirm transfer</CardDescription>
                     </div>
                     <Button variant="ghost" size="sm" onClick={reset} className="font-black text-[10px] uppercase tracking-widest text-muted-foreground hover:text-rose-500 gap-1.5"><ArrowLeft className="h-3 w-3" /> Rescan</Button>
                   </CardHeader>
                   <CardContent className="pt-2 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="p-5 rounded-2xl bg-muted/20 border border-border/40 space-y-4">
                            <div className="flex items-center gap-3">
                               <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-border/60 text-brand-blue-500"><Store className="h-5 w-5" /></div>
                               <div className="min-w-0">
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Recipient Node</p>
                                  <p className="text-sm font-black text-foreground uppercase truncate">{qrData.merchantName || 'External Merchant'}</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-3">
                               <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-border/60 text-amber-500"><Info className="h-5 w-5" /></div>
                               <div className="min-w-0">
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Location Node</p>
                                  <p className="text-sm font-black text-foreground uppercase truncate">{qrData.merchantCity || 'Philippines'}</p>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <div className="space-y-2">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Transfer Amount (PHP)</Label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">₱</span><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="pl-8 h-12 bg-muted/20 border-border/60 text-lg font-black rounded-xl" /></div>
                            </div>
                            <div className="space-y-2">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Reference Label</Label>
                               <Input value={description} onChange={e => setDescription(e.target.value)} className="h-12 bg-muted/20 border-border/60 text-xs font-bold rounded-xl" placeholder="Purpose of payment" />
                            </div>
                         </div>
                      </div>

                      <Button onClick={handlePay} disabled={loading || !amount} className="w-full h-16 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-2xl uppercase tracking-[0.2em] shadow-lg shadow-brand-blue-500/20 active:scale-95 transition-all">
                         {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <><ShieldCheck className="h-6 w-6 mr-3" /> Execute Payment Kernel</>}
                      </Button>
                   </CardContent>
                </Card>
              )}

              {result && (
                 <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xl rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-500">
                    <div className="h-2 bg-emerald-500 w-full" />
                    <CardHeader className="text-center pt-10">
                       <div className="h-20 w-20 rounded-[2rem] bg-white flex items-center justify-center mx-auto mb-6 shadow-sm border border-emerald-100 text-emerald-500"><CheckCircle className="h-10 w-10" /></div>
                       <CardTitle className="text-2xl font-black text-foreground uppercase tracking-tight">Authorization Successful</CardTitle>
                       <CardDescription className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-2">Funds have been routed to the destination node</CardDescription>
                    </CardHeader>
                    <CardContent className="p-10 space-y-6">
                       <div className="bg-white border border-border/40 rounded-[2rem] p-8 shadow-sm text-center">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Transaction Value</p>
                          <h2 className="text-4xl font-black text-foreground">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                       </div>
                       <Button onClick={reset} className="w-full h-14 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black rounded-xl uppercase tracking-widest">Continue To Ledger</Button>
                    </CardContent>
                 </Card>
              )}
           </div>

           <div className="lg:col-span-5 space-y-6">
              <Card className="border-border/60 shadow-sm bg-muted/20">
                 <CardHeader><CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Protocol Specifications</CardTitle></CardHeader>
                 <CardContent className="space-y-6">
                    {[
                      { icon: ShieldCheck, label: 'Compliance', val: 'EMVCo v1.0 Standard' },
                      { icon: Smartphone, label: 'Regional Node', val: 'Philippines QRPH' },
                      { icon: Info, label: 'Verification', val: 'InstaPay Secure' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center border border-border/60 text-brand-blue-500 shadow-sm"><row.icon className="h-5 w-5" /></div>
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{row.label}</p>
                          <p className="text-xs font-black text-foreground uppercase">{row.val}</p>
                        </div>
                      </div>
                    ))}
                 </CardContent>
              </Card>

              <div className="p-8 rounded-[2rem] border-2 border-dashed border-border/60 flex flex-col items-center text-center space-y-6">
                 <div className="h-20 w-20 rounded-[2.5rem] bg-muted flex items-center justify-center text-muted-foreground/30"><ScanLine className="h-10 w-10" /></div>
                 <div>
                    <p className="text-sm font-black text-foreground uppercase tracking-tight">Merchant Auto-Detection</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2 leading-relaxed">The kernel automatically extracts merchant identification, location nodes, and reference numbers from any standard QRPH payload.</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
}
