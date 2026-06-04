import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        { id: 'invoice', label: 'E-Invoice', icon: FileText, color: 'blue', desc: 'Email invoice with multiple payment methods' },
        { id: 'qr_code', label: 'QR Code', icon: QrCode, color: 'purple', desc: 'Generate a QR string for instant mobile scanning' },
        { id: 'payment_link', label: 'Universal Link', icon: LinkIcon, color: 'cyan', desc: 'Reusable link for sharing on social media' },
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
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
                toast.success('Payment created successfully!');
            } else {
                toast.error(res.data?.message || 'Failed to create payment');
            }
        } catch (err: unknown) {
            const errorMsg = (err as { data?: { detail?: string } })?.data?.detail || 'Failed to create payment';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const currentType = useMemo(() => typeOptions.find(t => t.id === paymentType) || typeOptions[0], [paymentType]);

    return (
        <Layout>
            <div className="max-w-5xl mx-auto pb-10">
                <button onClick={() => navigate(-1)} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </button>

                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Create Payment</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Issue invoices or generate payment links for your customers</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Main Form Area */}
                    <div className="lg:col-span-7 space-y-6">
                        <Card className="border-border/60 shadow-sm overflow-hidden">
                            <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
                                <CardTitle className="text-lg">Payment Method</CardTitle>
                                <CardDescription>Choose how your customer will pay</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                                    {typeOptions.map((option) => {
                                        const Icon = option.icon;
                                        const isActive = paymentType === option.id;
                                        const colorClass = option.color === 'blue' ? 'text-blue-500 bg-blue-500/10 border-blue-500/30 shadow-blue-500/10' :
                                            option.color === 'purple' ? 'text-purple-500 bg-purple-500/10 border-purple-500/30 shadow-purple-500/10' :
                                                'text-cyan-500 bg-cyan-500/10 border-cyan-500/30 shadow-cyan-500/10';

                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setPaymentType(option.id)}
                                                className={`flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all duration-200 ${isActive
                                                    ? `${colorClass} shadow-md scale-[1.02] ring-2 ring-offset-2 ring-offset-background ring-current/20`
                                                    : 'border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground'
                                                    }`}
                                            >
                                                <Icon className={`h-6 w-6 mb-3 ${isActive ? 'animate-in zoom-in-75' : ''}`} />
                                                <span className="text-xs font-bold uppercase tracking-wider">{option.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-bold uppercase tracking-wider ml-1 text-muted-foreground">Transaction Amount (PHP)</Label>
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground group-focus-within:text-primary transition-colors">₱</div>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="1"
                                                placeholder="0.00"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="pl-9 h-14 text-xl font-bold bg-muted/30 border-border/60 focus-visible:ring-primary/20"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-bold uppercase tracking-wider ml-1 text-muted-foreground">Payment Description</Label>
                                        <Textarea
                                            placeholder="What is this payment for?"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="bg-muted/30 border-border/60 min-h-[100px] resize-none focus-visible:ring-primary/20"
                                        />
                                    </div>

                                    {paymentType !== 'qr_code' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-bold uppercase tracking-wider ml-1 text-muted-foreground">Customer Name</Label>
                                                <Input
                                                    placeholder="Full Name"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                    className="bg-muted/30 border-border/60 focus-visible:ring-primary/20 h-11"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-bold uppercase tracking-wider ml-1 text-muted-foreground">Customer Email</Label>
                                                <Input
                                                    type="email"
                                                    placeholder="email@example.com"
                                                    value={customerEmail}
                                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                                    className="bg-muted/30 border-border/60 focus-visible:ring-primary/20 h-11"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="h-5 w-5 mr-2 fill-current" />
                                                    Generate {currentType.label}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        {/* Information Card */}
                        <Card className="bg-muted/20 border-dashed border-border/60">
                            <CardContent className="p-4 flex items-start gap-4">
                                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <Info className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-foreground mb-1 uppercase tracking-tight">Integration Note</p>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        All created payments are synced in real-time with Maya Business.
                                        Customers can pay using Credit/Debit cards, GCash, Maya, and GrabPay.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Result / Preview Sidebar */}
                    <div className="lg:col-span-5 space-y-6">
                        {!result ? (
                            <Card className="border-border/40 bg-card/50 border-dashed min-h-[400px] flex flex-col items-center justify-center text-center p-8">
                                <div className="h-20 w-20 rounded-3xl bg-muted/60 flex items-center justify-center mb-6">
                                    <Smartphone className="h-10 w-10 text-muted-foreground/30" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground/80">Pending Generation</h3>
                                <p className="text-sm text-muted-foreground mt-2 max-w-[200px]">
                                    Fill out the form to generate a secure payment link or QR code
                                </p>
                                <div className="mt-8 flex flex-col items-center gap-2 opacity-30">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                                        <ShieldCheck className="h-3 w-3" />
                                        Secure Checkout
                                    </div>
                                </div>
                            </Card>
                        ) : (
                            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/5 overflow-hidden animate-in zoom-in-95 duration-500">
                                <div className="bg-emerald-500 h-1.5 w-full" />
                                <CardHeader className="pb-4">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle className="h-5 w-5 mr-2" />
                                            Ready to Send
                                        </CardTitle>
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0">GENERATED</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
                                        <div className="text-center mb-6 pb-6 border-b border-border/40">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total to Pay</p>
                                            <h2 className="text-3xl font-black text-foreground">{fmtCurrencyPhp(parseFloat(amount))}</h2>
                                            {description && <p className="text-sm text-muted-foreground mt-2 italic">"{description}"</p>}
                                        </div>

                                        <div className="space-y-5">
                                            {Object.entries(result).map(([key, value]) => {
                                                if (!value || key === 'success' || key === 'message') return null;
                                                const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

                                                return (
                                                    <div key={key} className="space-y-2">
                                                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                                            {key.replace(/_/g, ' ')}
                                                            <button
                                                                onClick={() => copyToClipboard(String(value))}
                                                                className="hover:text-primary transition-colors flex items-center gap-1"
                                                            >
                                                                <Copy className="h-3 w-3" /> Copy
                                                            </button>
                                                        </Label>

                                                        <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border/40 overflow-hidden">
                                                            {isUrl ? (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-blue-500 font-medium truncate underline flex-1"
                                                                >
                                                                    {value as string}
                                                                </a>
                                                            ) : (
                                                                <code className="text-xs text-foreground font-mono truncate flex-1 leading-none">
                                                                    {String(value)}
                                                                </code>
                                                            )}

                                                            {isUrl && (
                                                                <a
                                                                    href={value as string}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 hover:bg-blue-500/20 transition-all shrink-0"
                                                                >
                                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pt-2">
                                        <Button
                                            className="bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl group"
                                            onClick={() => result.invoice_url && window.open(result.invoice_url as string, '_blank')}
                                        >
                                            Open Checkout Page
                                            <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="border-border/60 hover:bg-muted font-bold h-12 rounded-xl"
                                            onClick={() => {
                                                setResult(null);
                                                setAmount('');
                                                setDescription('');
                                            }}
                                        >
                                            Create Another
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
