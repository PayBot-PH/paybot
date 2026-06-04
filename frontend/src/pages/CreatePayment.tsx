import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    FileText,
    QrCode,
    LinkIcon,
    Plus,
    Loader2,
    CheckCircle,
    Copy,
    ExternalLink,
    ChevronRight,
    ArrowLeft,
    Info,
    Smartphone,
    ShieldCheck,
    Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmtCurrencyPhp } from '@/lib/format';

export default function CreatePayment() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialType = searchParams.get('type') || 'invoice';

    const [paymentType, setPaymentType] = useState(initialType);
    const [amount, setAmount] = useState(searchParams.get('amount') || '');
    const [description, setDescription] = useState(searchParams.get('description') || '');
    const [customerName, setCustomerName] = useState(searchParams.get('customer_name') || '');
    const [customerEmail, setCustomerEmail] = useState(searchParams.get('customer_email') || '');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);

    const typeOptions = [
        { id: 'invoice', label: 'E-Invoice', icon: FileText, color: 'blue', desc: 'Enterprise billing with full tax support' },
        { id: 'qr_code', label: 'Static QR', icon: QrCode, color: 'purple', desc: 'Instant mobile scanning via QR PH standard' },
        { id: 'payment_link', label: 'Universal', icon: LinkIcon, color: 'cyan', desc: 'Secure reusable links for social commerce' },
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Enter a valid operational amount');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            let endpoint = '';
            let payload: Record<string, unknown> = {};

            if (paymentType === 'invoice') {
                endpoint = '/api/v1/xendit/create-invoice';
                payload = { amount: parseFloat(amount), description, customer_name: customerName, customer_email: customerEmail };
            } else if (paymentType === 'qr_code') {
                endpoint = '/api/v1/xendit/create-qr-code';
                payload = { amount: parseFloat(amount), description };
            } else {
                endpoint = '/api/v1/xendit/create-payment-link';
                payload = { amount: parseFloat(amount), description, customer_name: customerName, customer_email: customerEmail };
            }

            const res = await client.apiCall.invoke({
                url: endpoint,
                method: 'POST',
                data: payload,
            });

            if (res.data?.success) {
                setResult(res.data);
                toast.success('Validation success. Payment node generated.');
            } else {
                toast.error(res.data?.message || 'Upstream connection error');
            }
        } catch (err: unknown) {
            const errorMsg = (err as { data?: { detail?: string } })?.data?.detail || 'Node generation failed';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Protocol string copied to clipboard');
    };

    const currentType = useMemo(() => typeOptions.find(t => t.id === paymentType) || typeOptions[0], [paymentType]);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto pb-10 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-all group">
                        <ArrowLeft className="h-4 w-4 mr-2.5 group-hover:-translate-x-1 transition-transform" />
                        Cancel Operation
                    </button>
                </div>

                <div className="space-y-2">
                    <h1 className="text-3xl font-black tracking-tighter uppercase">Initialize Terminal Order</h1>
                    <p className="text-muted-foreground font-medium flex items-center gap-2">
                       <div className="h-1.5 w-1.5 rounded-full bg-brand-blue-500 animate-pulse" />
                       Deploy secure payment request to the global node
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Main Form Area */}
                    <div className="lg:col-span-7 space-y-8">
                        <Card className="glass-card overflow-hidden border-0 shadow-2xl">
                            <div className="h-1.5 bg-gradient-to-r from-brand-blue-500 to-brand-blue-300 w-full" />
                            <CardHeader className="pb-8 pt-10 px-10">
                                <CardTitle className="text-sm font-black uppercase tracking-[0.3em] flex items-center gap-3">
                                   <div className="h-10 w-10 rounded-xl bg-brand-blue-500/10 flex items-center justify-center border border-brand-blue-500/20 shadow-inner">
                                      <Smartphone className="h-5 w-5 text-brand-blue-500" />
                                   </div>
                                   Order Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-10 pb-12">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
                                    {typeOptions.map((option) => {
                                        const Icon = option.icon;
                                        const isActive = paymentType === option.id;

                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setPaymentType(option.id)}
                                                className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all duration-300 relative overflow-hidden group ${isActive
                                                    ? 'bg-brand-blue-500/5 border-brand-blue-500 shadow-xl shadow-brand-blue-500/10 scale-[1.02]'
                                                    : 'bg-muted/20 border-border/40 hover:bg-muted/40 text-muted-foreground/60'
                                                    }`}
                                            >
                                                <Icon className={`h-8 w-8 mb-4 transition-all duration-500 ${isActive ? 'text-brand-blue-500 scale-110 rotate-[10deg]' : 'group-hover:text-foreground'}`} />
                                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isActive ? 'text-brand-blue-600' : ''}`}>{option.label}</span>
                                                {isActive && <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-brand-blue-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]" />}
                                            </button>
                                        );
                                    })}
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-8">
                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-muted-foreground/70">Transaction Volume (PHP)</Label>
                                        <div className="relative group">
                                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-brand-blue-500 group-focus-within:scale-110 transition-transform">₱</div>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="1"
                                                placeholder="0.00"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="pl-12 h-20 text-3xl font-black bg-muted/20 border-border/50 rounded-[1.5rem] tabular-nums focus:ring-primary/10 transition-all shadow-inner"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-muted-foreground/70">Operational Note</Label>
                                        <Textarea
                                            placeholder="Specify order intent / reference metadata..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="bg-muted/20 border-border/50 rounded-2xl min-h-[120px] resize-none focus:ring-primary/10 transition-all font-semibold p-5"
                                        />
                                    </div>

                                    {paymentType !== 'qr_code' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-3">
                                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-muted-foreground/70">Legal Entity Name</Label>
                                                <Input
                                                    placeholder="FULL_NAME_STRING"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                    className="bg-muted/20 border-border/50 focus:ring-primary/10 h-14 rounded-2xl px-6 font-black uppercase tracking-tight"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 text-muted-foreground/70">Target Endpoint (Email)</Label>
                                                <Input
                                                    type="email"
                                                    placeholder="VERIFIED_EMAIL_ADDRESS"
                                                    value={customerEmail}
                                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                                    className="bg-muted/20 border-border/50 focus:ring-primary/10 h-14 rounded-2xl px-6 font-bold"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-6">
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full h-16 bg-brand-blue-500 hover:bg-brand-blue-600 text-white font-black text-xs rounded-[1.5rem] shadow-[0_15px_40px_rgba(14,165,233,0.3)] transition-all active:scale-[0.96] uppercase tracking-[0.3em] group"
                                        >
                                            {loading ? (
                                                <div className="flex items-center gap-3">
                                                    <Loader2 className="h-6 w-6 animate-spin opacity-50" />
                                                    SYCHRONIZING NODES...
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <Zap className="h-5 w-5 fill-current" />
                                                    DEPLOY {currentType.label} REQUEST
                                                </div>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        {/* Integration Protocol */}
                        <Card className="bg-muted/20 border-dashed border-border/60 rounded-3xl group cursor-default overflow-hidden relative">
                           <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><ShieldCheck className="h-20 w-20" /></div>
                            <CardContent className="p-8 flex items-start gap-6 relative z-10">
                                <div className="h-12 w-12 rounded-2xl bg-brand-blue-500/10 flex items-center justify-center shrink-0 border border-brand-blue-500/20">
                                    <Info className="h-6 w-6 text-brand-blue-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-foreground mb-2 uppercase tracking-[0.3em]">Validation Protocol</p>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed font-semibold uppercase tracking-tighter italic">
                                        Current node status: 100% HEALTHY. Automated clearing via Maya Business gateways.
                                        Cross-chain verification protocols active for Visa, Mastercard, and e-wallets.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Result / Preview Sidebar */}
                    <div className="lg:col-span-5 space-y-8 sticky top-28">
                        {!result ? (
                            <Card className="border-border/40 bg-card/40 border-dashed min-h-[500px] flex flex-col items-center justify-center text-center p-12 rounded-[3rem] group">
                                <div className="h-28 w-24 rounded-[2.5rem] bg-muted/40 flex items-center justify-center mb-10 shadow-inner group-hover:rotate-[5deg] transition-transform duration-500">
                                    <Radio className="h-12 w-12 text-muted-foreground/20 animate-pulse" />
                                </div>
                                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Signal Offline</h3>
                                <p className="text-xs text-muted-foreground mt-4 max-w-[220px] font-black uppercase tracking-[0.2em] leading-loose opacity-60">
                                    Awaiting input sequence for terminal order generation
                                </p>
                                <div className="mt-12 flex items-center gap-3 opacity-20 group-hover:opacity-40 transition-opacity">
                                    <ShieldCheck className="h-4 w-4" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.5em]">NODE_SECURED</span>
                                </div>
                            </Card>
                        ) : (
                            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 duration-700 rounded-[3rem]">
                                <div className="bg-emerald-500 h-2 w-full shadow-lg" />
                                <CardHeader className="pb-10 pt-12 px-10">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-black flex items-center text-emerald-500 uppercase tracking-[0.3em]">
                                            <CheckCircle className="h-6 w-6 mr-3 shadow-sm" />
                                            Active Link
                                        </CardTitle>
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full">BROADCASTED</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-6 pb-12 space-y-8">
                                    <div className="glass border border-emerald-500/20 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-4 opacity-5"><Zap className="h-32 w-32" /></div>
                                        <div className="text-center mb-10 pb-8 border-b border-border/20">
                                            <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.4em] mb-3">Payload Value</p>
                                            <h2 className="text-5xl font-black text-foreground tracking-tighter tabular-nums">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                                            {description && <p className="text-xs text-muted-foreground mt-4 font-black uppercase tracking-[0.1em] opacity-80 leading-relaxed italic">"{description}"</p>}
                                        </div>

                                        <div className="space-y-8">
                                            {Object.entries(result).map(([key, value]) => {
                                                if (!value || key === 'success' || key === 'message') return null;
                                                const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

                                                return (
                                                    <div key={key} className="space-y-3">
                                                        <Label className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-[0.4em] flex items-center justify-between px-1">
                                                            {key.replace(/_/g, ' ')}
                                                            <button
                                                                onClick={() => copyToClipboard(String(value))}
                                                                className="hover:text-brand-blue-500 transition-all flex items-center gap-1.5 group"
                                                            >
                                                                <Copy className="h-3 w-3 group-active:scale-90" />
                                                                <span className="group-hover:translate-x-1 transition-transform">FETCH STRING</span>
                                                            </button>
                                                        </Label>

                                                        <div className="flex items-center gap-4 p-5 bg-muted/40 rounded-2xl border border-border/40 overflow-hidden shadow-inner group">
                                                            {isUrl ? (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[11px] text-brand-blue-500 font-black truncate uppercase tracking-widest flex-1 hover:underline"
                                                                >
                                                                    {value as string}
                                                                </a>
                                                            ) : (
                                                                <code className="text-xs text-foreground font-black tracking-widest truncate flex-1 leading-none uppercase">
                                                                    {String(value)}
                                                                </code>
                                                            )}

                                                            {isUrl && (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="h-10 w-10 rounded-xl bg-brand-blue-500/10 flex items-center justify-center text-brand-blue-500 hover:bg-brand-blue-500/20 transition-all shrink-0 border border-brand-blue-500/10 active:scale-90"
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 pt-4 px-4">
                                        <Button
                                            className="h-16 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/30 transition-all active:scale-95 text-xs uppercase tracking-widest group"
                                            onClick={() => result.invoice_url && window.open(result.invoice_url as string, '_blank')}
                                        >
                                            Initialize Checkout Flow
                                            <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="h-14 font-black uppercase text-[10px] tracking-widest text-muted-foreground hover:text-foreground rounded-2xl"
                                            onClick={() => {
                                                setResult(null);
                                                setAmount('');
                                                setDescription('');
                                            }}
                                        >
                                            Reset Sequence
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
