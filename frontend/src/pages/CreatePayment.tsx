import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { client } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    FileText,
    QrCode,
    LinkIcon,
    Loader2,
    CheckCircle,
    Copy,
    ExternalLink,
    ChevronRight,
    ArrowLeft,
    Smartphone,
    ShieldCheck,
    Zap,
    Radio,
    MessageCircle,
    CreditCard,
    History,
    Ban,
    RefreshCcw,
    Search,
    Settings,
    Wallet,
    Delete,
    Printer,
    Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { fmtCurrencyPhp } from '@/lib/format';

// --- Types & Constants ---

interface PaymentTypeOption {
    id: string;
    label: string;
    icon: React.ElementType;
    color: string;
    desc: string;
}

const TYPE_OPTIONS: PaymentTypeOption[] = [
    { id: 'card', label: 'Card Payment', icon: CreditCard, color: 'blue', desc: 'Debit or Credit Card (Visa, Mastercard, JCB)' },
    { id: 'qr_code', label: 'QR Ph / Maya', icon: QrCode, color: 'emerald', desc: 'Maya and QR Ph Universal Scanner' },
    { id: 'ewallet', label: 'GCash via QR Ph', icon: Smartphone, color: 'blue', desc: 'Direct GCash payment via QR Ph' },
    { id: 'invoice', label: 'E-Invoice', icon: FileText, color: 'purple', desc: 'Enterprise billing with full tax support' },
    { id: 'payment_link', label: 'Payment Link', icon: LinkIcon, color: 'cyan', desc: 'Secure reusable links for social commerce' },
];

interface FormState {
    amount: string;
    description: string;
    customerName: string;
    customerEmail: string;
    channelCode: string;
}

interface PaymentConfig {
    endpoint: string;
    getPayload: (state: FormState) => Record<string, unknown>;
}

const PAYMENT_CONFIGS: Record<string, PaymentConfig> = {
    invoice: {
        endpoint: '/api/v1/xendit/create-invoice',
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description, customer_name: s.customerName, customer_email: s.customerEmail }),
    },
    qr_code: {
        endpoint: '/api/v1/xendit/create-qr-code',
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description }),
    },
    payment_link: {
        endpoint: '/api/v1/xendit/create-payment-link',
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description, customer_name: s.customerName, customer_email: s.customerEmail }),
    },
    ewallet: {
        endpoint: '/api/v1/gateway/ewallet-charge',
        getPayload: (s) => ({ amount: parseFloat(s.amount), channel_code: s.channelCode }),
    },
    alipay: {
        endpoint: '/api/v1/photonpay/alipay-session',
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description }),
    },
    wechat: {
        endpoint: '/api/v1/photonpay/wechat-session',
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description }),
    },
    card: {
        endpoint: '/api/v1/xendit/create-invoice', // Defaulting to invoice for now if card not specific
        getPayload: (s) => ({ amount: parseFloat(s.amount), description: s.description }),
    },
};

const TERMINAL_ACTIONS = [
    { id: 'history', label: 'Transaction History', sub: 'View all transactions', icon: History, path: '/transactions' },
    { id: 'void', label: 'Void', sub: 'Void invalid transactions', icon: Ban, path: '/disbursements?tab=refunds' },
    { id: 'settlement', label: 'Settlement', sub: 'Settle all transactions', icon: CheckCircle, path: '/disbursements' },
    { id: 'reversal', label: 'Pending Reversal', sub: 'Reverse failed transactions', icon: RefreshCcw, path: '/disbursements?tab=refunds' },
    { id: 'balance', label: 'Balance Inquiry', sub: 'Check current balance', icon: Search, path: '/wallet' },
    { id: 'settings', label: 'Settings', sub: 'Manage MPINs & terminal', icon: Settings, path: '/bot-settings' },
];

// --- Sub-components ---

const TerminalLabel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <Label className={`text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ${className}`}>
        {children}
    </Label>
);

const ResultField = ({ label, value, onCopy }: { label: string, value: unknown, onCopy: (v: string) => void }) => {
    const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('https'));

    return (
        <div className="space-y-3">
            <Label className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] flex items-center justify-between px-1">
                {label.replace(/_/g, ' ')}
                <button
                    onClick={() => onCopy(String(value))}
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
};

// --- Main Component ---

export default function CreatePayment() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Form State
    const [paymentType, setPaymentType] = useState(searchParams.get('type') || 'invoice');
    const [form, setForm] = useState<FormState>({
        amount: searchParams.get('amount') || '',
        description: searchParams.get('description') || '',
        customerName: searchParams.get('customer_name') || '',
        customerEmail: searchParams.get('customer_email') || '',
        channelCode: 'PH_GCASH',
    });

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [activeTab, setActiveTab] = useState<'payment' | 'more'>('payment');

    const updateForm = (updates: Partial<FormState>) => setForm(prev => ({ ...prev, ...updates }));

    const handleKeypadPress = (val: string) => {
        setForm(prev => {
            let currentRaw = prev.amount.replace('.', '').replace(/^0+/, '');
            if (val === 'AC') {
                currentRaw = '';
            } else if (val === 'backspace') {
                currentRaw = currentRaw.slice(0, -1);
            } else {
                currentRaw += val;
            }

            if (currentRaw === '' || currentRaw === '0') return { ...prev, amount: '' };

            const numericValue = parseInt(currentRaw, 10);
            if (isNaN(numericValue)) return prev;

            const formatted = (numericValue / 100).toFixed(2);
            return { ...prev, amount: formatted };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amountNum = parseFloat(form.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            toast.error('Enter a valid operational amount');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const config = PAYMENT_CONFIGS[paymentType];
            if (!config) throw new Error('Invalid protocol selected');

            const res = await client.apiCall.invoke({
                url: config.endpoint,
                method: 'POST',
                data: config.getPayload(form),
            });

            if (res.data?.success) {
                setResult(res.data);
                toast.success('Validation success. Payment node generated.');
            } else {
                toast.error(res.data?.message || 'Upstream connection error');
            }
        } catch (err: unknown) {
            console.error('Node generation error:', err);
            const errorMsg = (err as any)?.data?.detail || (err as any)?.message || 'Node generation failed. Check API configuration.';
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Protocol string copied to clipboard');
    };

    const handlePrint = () => {
        toast.info('Initializing thermal printer sequence...');
        setTimeout(() => {
            window.print();
        }, 1000);
    };

    const currentType = useMemo(() => TYPE_OPTIONS.find(t => t.id === paymentType) || TYPE_OPTIONS[0], [paymentType]);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto pb-16 space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                {/* Header Navigation */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 hover:text-foreground transition-all group bg-muted/20 px-6 py-2.5 rounded-xl border border-border/20 shadow-sm"
                    >
                        <ArrowLeft className="h-4 w-4 mr-3 group-hover:-translate-x-1.5 transition-transform" />
                        ABORT_SEQUENCE
                    </button>
                    <div className="flex items-center gap-3">
                       <div className="fintech-badge bg-brandblue-500/10 text-brandblue-500 border-brandblue-500/20 px-5 font-black uppercase tracking-widest text-[10px]">PROTOCOL_READY</div>
                    </div>
                </div>

                {/* Page Title */}
                <div className="space-y-3">
                    <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground">Deploy Terminal Order</h1>
                    <p className="text-muted-foreground font-medium flex items-center gap-3">
                       <span className="flex h-2 w-2 rounded-full bg-brandblue-500 shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
                       <span className="uppercase tracking-[0.2em] text-[10px] font-black">Encrypted Payment Node Generation</span>
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Left Column: Form Section */}
                    <div className="lg:col-span-7 space-y-10">
                        <div className="flex gap-4 mb-2">
                            <button
                                onClick={() => setActiveTab('payment')}
                                className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'payment' ? 'bg-brandblue-500 text-white shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                            >
                                Payments
                            </button>
                            <button
                                onClick={() => setActiveTab('more')}
                                className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'more' ? 'bg-brandblue-500 text-white shadow-lg' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                            >
                                More Options
                            </button>
                        </div>

                        {activeTab === 'payment' ? (
                            <Card className="fintech-card border-0 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-sm">
                                {/* Terminal Header style from photo */}
                                <div className="bg-brandblue-600 p-8 flex justify-between items-center text-white relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
                                    <div className="relative z-10 space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Input Payment</p>
                                        <h2 className="text-4xl font-black tabular-nums tracking-tighter">₱{form.amount || '0.00'}</h2>
                                    </div>
                                    <div className="relative z-10 bg-white/10 p-4 rounded-[1.5rem] backdrop-blur-md border border-white/10 shadow-2xl">
                                        <Smartphone className="h-8 w-8" />
                                    </div>
                                </div>

                                {/* Maya Business Header */}
                                <div className="bg-[#0A0F1E] border-b border-white/5 p-6 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-brandblue-400 font-black text-lg tracking-tighter uppercase italic">maya</span>
                                        <span className="bg-brandblue-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">BUSINESS</span>
                                    </div>
                                    <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Select Payment Option</div>
                                </div>

                                <div className="bg-[#0A0F1E]/50 border-b border-white/5 p-8">
                                    <TerminalLabel className="mb-8 ml-1 block text-white/30">Order Configuration</TerminalLabel>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {TYPE_OPTIONS.map((option) => {
                                        const Icon = option.icon;
                                        const isActive = paymentType === option.id;

                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setPaymentType(option.id)}
                                                className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all duration-500 relative overflow-hidden group ${
                                                    isActive
                                                        ? 'bg-brandblue-500 border-brandblue-500 text-white shadow-2xl shadow-brandblue-500/40 scale-105'
                                                        : 'bg-white/5 border-white/5 text-white/40 hover:border-white/10 hover:bg-white/[0.08] hover:text-white/60'
                                                }`}
                                            >
                                                <Icon className={`h-6 w-6 mb-4 transition-all duration-500 ${isActive ? 'text-white scale-110' : 'opacity-20 group-hover:opacity-40 group-hover:scale-110'}`} />
                                                <span className={`text-[9px] font-black uppercase tracking-widest text-center ${isActive ? 'text-white' : ''}`}>{option.label}</span>
                                                {isActive && <div className="absolute top-3 right-3 h-1 w-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,1)]" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <CardContent className="p-10">
                                <form onSubmit={handleSubmit} className="space-y-10">
                                    {/* Amount Section */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between ml-1">
                                           <TerminalLabel>Input Sale Amount (PHP)</TerminalLabel>
                                           <div className="flex gap-2">
                                                <span className="text-[9px] font-black text-brandblue-500 uppercase tracking-widest bg-brandblue-500/5 px-2 py-1 rounded-lg border border-brandblue-500/10">T+0 Clearance</span>
                                           </div>
                                        </div>

                                        {/* Virtual Keypad Grid */}
                                        <div className="grid grid-cols-4 gap-3">
                                            {[
                                                '1', '2', '3', 'backspace',
                                                '4', '5', '6', 'AC',
                                                '7', '8', '9', 'proceed',
                                                '00', '0', '000'
                                            ].map((key) => {
                                                if (key === 'proceed') {
                                                    return (
                                                        <button
                                                            key={key}
                                                            type="submit"
                                                            disabled={loading}
                                                            className="row-span-2 bg-brandblue-600 hover:bg-brandblue-700 text-white rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-brandblue-500/20"
                                                        >
                                                            {loading ? (
                                                                <Loader2 className="h-6 w-6 animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <div className="bg-white/20 p-2 rounded-full">
                                                                        <ChevronRight className="h-5 w-5" />
                                                                    </div>
                                                                    <span className="text-[10px] font-black uppercase tracking-widest">Proceed</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => handleKeypadPress(key)}
                                                        className={`h-16 rounded-2xl flex items-center justify-center text-xl font-black transition-all active:scale-95 shadow-sm ${
                                                            key === 'AC' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20' :
                                                            key === 'backspace' ? 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10' :
                                                            'bg-white/5 text-white border border-white/5 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {key === 'backspace' ? <Delete className="h-6 w-6" /> : key}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Description Section */}

                                    {/* Description Section */}
                                    <div className="space-y-4">
                                        <TerminalLabel className="ml-1">Operational Specification</TerminalLabel>
                                        <Textarea
                                            placeholder="Specify transmission intent, node metadata, or customer references..."
                                            value={form.description}
                                            onChange={(e) => updateForm({ description: e.target.value })}
                                            className="bg-muted/20 border-border/40 rounded-[2rem] min-h-[120px] resize-none focus:ring-brandblue-500/10 text-base font-black uppercase tracking-tight p-8 border-2 shadow-inner"
                                        />
                                    </div>

                                    {/* E-Wallet Channels */}
                                    {paymentType === 'ewallet' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <TerminalLabel className="ml-1">Provider Node</TerminalLabel>
                                            <div className="grid grid-cols-3 gap-4">
                                                {['PH_GCASH', 'PH_MAYA', 'PH_GRABPAY'].map(p => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => updateForm({ channelCode: p })}
                                                        className={`p-4 rounded-xl border-2 transition-all font-black text-[10px] uppercase tracking-widest ${
                                                            form.channelCode === p
                                                                ? 'bg-brandblue-500 border-brandblue-500 text-white'
                                                                : 'bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30'
                                                        }`}
                                                    >
                                                        {p.replace('PH_', '')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Advanced Identity Fields */}
                                    {['invoice', 'payment_link'].includes(paymentType) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-4">
                                                <TerminalLabel className="ml-1">Target Identity (Name)</TerminalLabel>
                                                <Input
                                                    placeholder="ENTITY_STRING"
                                                    value={form.customerName}
                                                    onChange={(e) => updateForm({ customerName: e.target.value })}
                                                    className="bg-muted/20 border-border/40 focus:ring-brandblue-500/10 h-16 rounded-2xl px-6 font-black uppercase tracking-widest border-2 shadow-sm"
                                                />
                                            </div>
                                            <div className="space-y-4">
                                                <TerminalLabel className="ml-1">Protocol Destination (Email)</TerminalLabel>
                                                <Input
                                                    type="email"
                                                    placeholder="VERIFIED_ENDPOINT"
                                                    value={form.customerEmail}
                                                    onChange={(e) => updateForm({ customerEmail: e.target.value })}
                                                    className="bg-muted/20 border-border/40 focus:ring-brandblue-500/10 h-16 rounded-2xl px-6 font-bold border-2 shadow-sm"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </form>
                            </CardContent>
                        </Card>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 gap-4">
                                    {TERMINAL_ACTIONS.map((action) => (
                                        <button
                                            key={action.id}
                                            onClick={() => navigate(action.path)}
                                            className="flex items-center gap-6 p-8 bg-[#0A0F1E] hover:bg-brandblue-500/10 border border-white/5 rounded-[2rem] transition-all group text-left"
                                        >
                                            <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-brandblue-500 transition-colors">
                                                <action.icon className="h-6 w-6 text-brandblue-400 group-hover:text-white" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-black text-white uppercase tracking-widest">{action.label}</h4>
                                                <p className="text-[10px] text-white/40 font-medium uppercase tracking-tight">{action.sub}</p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Network Status Info */}
                        <div className="bg-[#0A0F1E] rounded-[2.5rem] p-10 border border-white/5 flex items-start gap-8 shadow-xl group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Activity className="h-24 w-24 text-emerald-500 animate-pulse" />
                            </div>
                            <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-brandblue-500 transition-colors duration-500">
                                <ShieldCheck className="h-8 w-8 text-brandblue-400 group-hover:text-white transition-colors" />
                            </div>
                            <div className="space-y-2 relative z-10">
                                <p className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-3">
                                    Institutional Verification
                                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                                </p>
                                <p className="text-xs text-white/40 leading-relaxed font-medium uppercase tracking-tight">
                                    Current node state: <span className="text-emerald-400">100%_OPERATIONAL</span>. High-priority clearing active across Maya & GCash networks.
                                    Cryptographic hashing enabled for all transmission payloads.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Results Sidebar */}
                    <div className="lg:col-span-5 space-y-10 sticky top-10">
                        {!result ? (
                            <div className="fintech-card border-dashed border-2 border-border/60 min-h-[600px] flex flex-col items-center justify-center text-center p-12 bg-muted/5 relative overflow-hidden group rounded-[3rem]">
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-muted/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                <div className="h-28 w-28 rounded-[2.5rem] bg-muted/20 flex items-center justify-center mb-10 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-700">
                                    <Radio className="h-14 w-14 text-muted-foreground/20 group-hover:text-brandblue-500/20 transition-colors animate-pulse" />
                                </div>
                                <h2 className="text-2xl font-black text-foreground/40 uppercase tracking-tighter mb-4">Awaiting Signal</h2>
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
                                            <h2 className="text-5xl font-black text-white tracking-tighter tabular-nums">{fmtCurrencyPhp(parseFloat(form.amount))}</h2>
                                            {form.description && <p className="text-xs text-white/40 mt-6 font-black uppercase tracking-[0.1em] opacity-80 leading-relaxed italic">"{form.description}"</p>}
                                        </div>

                                        <div className="space-y-8">
                                            {/* QR Code Display if available in result */}
                                            {(() => {
                                                const qr = (result.qr_string || (result.data as any)?.qr_string) as string | undefined;
                                                if (!qr) return null;
                                                return (
                                                    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] mb-8 shadow-2xl">
                                                        <img
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`}
                                                            alt="Payment QR"
                                                            className="w-48 h-48"
                                                        />
                                                        <p className="mt-4 text-[10px] font-black text-black/30 uppercase tracking-[0.3em]">Scan with any QRPH application</p>
                                                    </div>
                                                );
                                            })()}

                                            {Object.entries(result.data && typeof result.data === 'object' ? { ...result, ...(result.data as object) } : result).map(([key, value]) => {
                                                if (!value || key === 'success' || key === 'message' || key === 'data') return null;
                                                return (
                                                    <ResultField
                                                        key={key}
                                                        label={key}
                                                        value={value}
                                                        onCopy={copyToClipboard}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Link Actions */}
                                    <div className="flex flex-col gap-5">
                                        {(() => {
                                            const url = (result.invoice_url || result.checkout_url || result.url || (result.data as any)?.checkout_url) as string | undefined;
                                            if (!url) return null;
                                            return (
                                                <Button
                                                    className="h-20 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-[1.5rem] shadow-2xl shadow-emerald-500/20 transition-all active:scale-95 text-sm uppercase tracking-[0.3em] group"
                                                    onClick={() => window.open(url, '_blank')}
                                                >
                                                    Inaugurate Checkout Flow
                                                    <ChevronRight className="ml-3 h-6 w-6 group-hover:translate-x-1.5 transition-transform" />
                                                </Button>
                                            );
                                        })()}

                                        <div className="grid grid-cols-2 gap-4">
                                            <Button
                                                variant="ghost"
                                                className="text-white/40 hover:text-white hover:bg-white/5 font-black h-16 rounded-[1.5rem] text-[11px] uppercase tracking-[0.4em] transition-all border border-white/5 group"
                                                onClick={handlePrint}
                                            >
                                                <Printer className="h-4 w-4 mr-3 group-hover:scale-110 transition-transform" />
                                                Print_Receipt
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="text-white/40 hover:text-white hover:bg-white/5 font-black h-16 rounded-[1.5rem] text-[11px] uppercase tracking-[0.4em] transition-all border border-white/5"
                                                onClick={() => {
                                                    setResult(null);
                                                    updateForm({ amount: '', description: '' });
                                                }}
                                            >
                                                Reset_State
                                            </Button>
                                        </div>
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
