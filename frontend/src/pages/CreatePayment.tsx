import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
    Radio,
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
            console.error('Node generation error:', err);
            const errorMsg = (err as { data?: { detail?: string } })?.data?.detail
                || (err as Error)?.message
                || 'Node generation failed. Check API configuration.';
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
            <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="flex items-center text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 hover:text-foreground transition-all group bg-muted/20 px-6 py-2.5 rounded-xl border border-border/20 shadow-sm">
                        <ArrowLeft className="h-4 w-4 mr-3 group-hover:-translate-x-1.5 transition-transform" />
                        ABORT_SEQUENCE
                    </button>
                    <div className="flex items-center gap-3">
                       <div className="fintech-badge bg-brandblue-500/10 text-brandblue-500 border-brandblue-500/20 px-5">PROTOCOL_READY</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground">Deploy Terminal Order</h1>
                    <p className="text-muted-foreground font-medium flex items-center gap-3">
                       <span className="flex h-2 w-2 rounded-full bg-brand-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
                       <span className="uppercase tracking-[0.2em] text-[10px] font-black">Encrypted Payment Node Generation</span>
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Main Form Area */}
                    <div className="lg:col-span-7 space-y-10">
                        <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
                            <div className="bg-[#0A0F1E] border-b border-white/5 p-8">
                                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/30 mb-8 ml-1">Order Configuration</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {typeOptions.map((option) => {
                                        const Icon = option.icon;
                                        const isActive = paymentType === option.id;

                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setPaymentType(option.id)}
                                                className={`flex flex-col items-center justify-center p-8 rounded-[2rem] border-2 transition-all duration-500 relative overflow-hidden group ${isActive
                                                    ? 'bg-brandblue-500 border-brandblue-500 text-white shadow-2xl shadow-brandblue-500/40 scale-105'
                                                    : 'bg-white/5 border-white/5 text-white/40 hover:border-white/10 hover:bg-white/[0.08] hover:text-white/60'
                                                    }`}
                                            >
                                                <Icon className={`h-8 w-8 mb-5 transition-all duration-500 ${isActive ? 'text-white scale-110' : 'opacity-20 group-hover:opacity-40 group-hover:scale-110'}`} />
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white' : ''}`}>{option.label}</span>
                                                {isActive && <div className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,1)]" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <CardContent className="p-10">
                                <form onSubmit={handleSubmit} className="space-y-10">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between ml-1">
                                           <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Transmission Volume (PHP)</Label>
                                           <span className="text-[9px] font-black text-brandblue-500 uppercase tracking-widest bg-brandblue-500/5 px-2 py-0.5 rounded">T+0 Clearance</span>
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-brand-blue-500 group-focus-within:scale-110 transition-transform">₱</div>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="1"
                                                placeholder="0.00"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="pl-12 h-24 text-4xl font-black bg-muted/20 border-border/40 rounded-3xl tabular-nums focus:ring-brandblue-500/10 transition-all border-2 shadow-inner"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Operational Specification</Label>
                                        <Textarea
                                            placeholder="Specify transmission intent, node metadata, or customer references..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="bg-muted/20 border-border/40 rounded-[2rem] min-h-[160px] resize-none focus:ring-brandblue-500/10 text-base font-black uppercase tracking-tight p-8 border-2 shadow-inner"
                                        />
                                    </div>

                                    {paymentType !== 'qr_code' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-4">
                                                <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Target Identity (Name)</Label>
                                                <Input
                                                    placeholder="ENTITY_STRING"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                    className="bg-muted/20 border-border/40 focus:ring-brandblue-500/10 h-16 rounded-2xl px-6 font-black uppercase tracking-widest border-2 shadow-sm"
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-1">Protocol Destination (Email)</Label>
                                                <Input
                                                    type="email"
                                                    placeholder="VERIFIED_ENDPOINT"
                                                    value={customerEmail}
                                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                                    className="bg-muted/20 border-border/40 focus:ring-brandblue-500/10 h-16 rounded-2xl px-6 font-bold border-2 shadow-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-8">
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full h-20 bg-brandblue-600 hover:bg-brandblue-700 text-white font-black text-sm rounded-[2rem] shadow-2xl shadow-brandblue-500/30 transition-all active:scale-95 uppercase tracking-[0.4em] group"
                                        >
                                            {loading ? (
                                                <div className="flex items-center gap-4">
                                                    <Loader2 className="h-7 w-7 animate-spin opacity-50" />
                                                    SYNCHRONIZING_NODES...
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-4">
                                                    <Zap className="h-7 w-7 fill-current group-hover:scale-125 transition-transform" />
                                                    INITIATE {currentType.label.toUpperCase()} PROTOCOL
                                                </div>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        {/* Integration Protocol */}
                        <div className="bg-[#0A0F1E] rounded-[2.5rem] p-10 border border-white/5 flex items-start gap-8 shadow-xl group">
                            <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-brandblue-500 transition-colors duration-500">
                                <ShieldCheck className="h-8 w-8 text-brandblue-400 group-hover:text-white transition-colors" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Institutional Verification</p>
                                <p className="text-xs text-white/40 leading-relaxed font-medium uppercase tracking-tight">
                                    Current node state: <span className="text-emerald-400">100%_OPERATIONAL</span>. High-priority clearing active across Maya & GCash networks.
                                    Cryptographic hashing enabled for all transmission payloads.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Result / Preview Sidebar */}
                    <div className="lg:col-span-5 space-y-10 sticky top-10">
                        {!result ? (
                            <div className="fintech-card border-dashed border-2 border-border/60 min-h-[600px] flex flex-col items-center justify-center text-center p-12 bg-muted/5 relative overflow-hidden group rounded-[3rem]">
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-muted/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                <div className="h-28 w-28 rounded-[2.5rem] bg-muted/20 flex items-center justify-center mb-10 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-700">
                                    <Radio className="h-14 w-14 text-muted-foreground/20 group-hover:text-brandblue-500/20 transition-colors animate-pulse" />
                                </div>
                                <h3 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter mb-4">Awaiting Signal</h3>
                                <p className="text-[11px] text-muted-foreground/60 max-w-[280px] font-black uppercase tracking-[0.3em] leading-relaxed">
                                    Execute terminal configuration to emit network payment assets
                                </p>
                                <div className="mt-16 pt-10 border-t border-border/10 w-full flex flex-col items-center gap-4 opacity-20 group-hover:opacity-40 transition-opacity">
                                    <ShieldCheck className="h-5 w-5 text-brandblue-500" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.5em]">NODE_LOCKED</span>
                                </div>
                            </div>
                        ) : (
                            <Card className="fintech-card border-0 bg-[#0A0F1E] shadow-[0_40px_80px_rgba(0,0,0,0.4)] overflow-hidden animate-in zoom-in-95 duration-700 rounded-[3rem]">
                                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2.5 w-full shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                                <CardHeader className="p-10 border-b border-white/5">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xl font-black flex items-center text-emerald-400 uppercase tracking-tight">
                                            <CheckCircle className="h-6 w-6 mr-3 shadow-sm" />
                                            Active_Link_Ready
                                        </CardTitle>
                                        <div className="bg-emerald-500 text-white px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest">BROADCASTED</div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-10 space-y-10">
                                    <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 text-center relative overflow-hidden group/res">
                                       <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><Zap className="h-32 w-32 text-white" /></div>
                                        <div className="text-center mb-10 pb-8 border-b border-white/5">
                                            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em] mb-4">Payload Value</p>
                                            <h2 className="text-5xl font-black text-white tracking-tighter tabular-nums">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                                            {description && <p className="text-xs text-white/40 mt-6 font-black uppercase tracking-[0.1em] opacity-80 leading-relaxed italic">"{description}"</p>}
                                        </div>

                                        <div className="space-y-8">
                                            {Object.entries(result).map(([key, value]) => {
                                                if (!value || key === 'success' || key === 'message') return null;
                                                const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

                                                return (
                                                    <div key={key} className="space-y-3">
                                                        <Label className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] flex items-center justify-between px-1">
                                                            {key.replace(/_/g, ' ')}
                                                            <button
                                                                onClick={() => copyToClipboard(String(value))}
                                                                className="text-[10px] font-black text-brandblue-400 hover:text-white transition-colors uppercase tracking-[0.2em] flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/5"
                                                            >
                                                                <Copy className="h-3 w-3" /> COPY
                                                            </button>
                                                        </Label>

                                                        <div className="flex items-center gap-4 p-6 bg-black/40 rounded-2xl border border-white/5 overflow-hidden group/field">
                                                            {isUrl ? (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-brandblue-400 font-bold truncate underline flex-1 hover:text-white transition-colors"
                                                                >
                                                                    {value as string}
                                                                </a>
                                                            ) : (
                                                                <code className="text-sm text-white/90 font-black truncate flex-1 leading-none tabular-nums tracking-widest">
                                                                    {String(value)}
                                                                </code>
                                                            )}

                                                            {isUrl && (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="h-10 w-10 rounded-xl bg-brandblue-500 flex items-center justify-center text-white hover:bg-brandblue-400 hover:scale-110 transition-all shrink-0 shadow-lg shadow-brandblue-500/30"
                                                                >
                                                                    <ExternalLink className="h-5 w-5" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-5">
                                        <Button
                                            className="h-20 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-[1.5rem] shadow-2xl shadow-emerald-500/20 transition-all active:scale-95 text-sm uppercase tracking-[0.3em] group"
                                            onClick={() => result.invoice_url && window.open(result.invoice_url as string, '_blank')}
                                        >
                                            Inaugurate Checkout Flow
                                            <ChevronRight className="ml-3 h-6 w-6 group-hover:translate-x-1.5 transition-transform" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="text-white/40 hover:text-white hover:bg-white/5 font-black h-16 rounded-[1.5rem] text-[11px] uppercase tracking-[0.4em] transition-all border border-white/5"
                                            onClick={() => {
                                                setResult(null);
                                                setAmount('');
                                                setDescription('');
                                            }}
                                        >
                                            Reset_System_State
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
