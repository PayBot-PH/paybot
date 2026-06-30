import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { client } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bot, BarChart3, Wallet, CreditCard, FileText, Building2, Loader2,
  TrendingUp, TrendingDown, DollarSign, Percent, Calculator, PieChart,
  ArrowUpRight, ArrowDownRight, RefreshCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

interface ReportData {
  period: string; start_date: string; end_date: string;
  paid_revenue: number; pending_revenue: number;
  total_disbursed: number; total_refunded: number; net_revenue: number;
  type_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  total_transactions: number; success_rate: number;
}

interface FeeResult {
  amount: number; method: string; fee: number; net_amount: number;
  fee_percentage: number; fee_fixed: number;
}

const NAV = [
  { to: '/', icon: BarChart3, label: 'Dashboard', active: false },
  { to: '/wallet', icon: Wallet, label: 'Wallet', active: false },
  { to: '/payments', icon: CreditCard, label: 'Payments', active: false },
  { to: '/transactions', icon: FileText, label: 'Transactions', active: false },
  { to: '/disbursements', icon: Building2, label: 'Manage', active: false },
  { to: '/reports', icon: PieChart, label: 'Reports', active: true },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('monthly');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymongoBalance, setPaymongoBalance] = useState<number | null>(null);

  // Fee calculator
  const [feeAmount, setFeeAmount] = useState('');
  const [feeMethod, setFeeMethod] = useState('invoice');
  const [feeResult, setFeeResult] = useState<FeeResult | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rptRes = await client.apiCall.invoke({ url: `/api/v1/gateway/reports?period=${period}`, method: 'GET', data: {} });
      setReport(rptRes.data);
    } catch { /* ignore */ }
    setLoading(false);
    try {
      const balRes = await client.apiCall.invoke({ url: '/api/v1/gateway/paymongo-balance', method: 'GET', data: {} });
      if (balRes.data?.success) setPaymongoBalance(balRes.data.balance);
    } catch { /* ignore */ }
  }, [user, period]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleCalcFees = async () => {
    if (!feeAmount) { toast.error('Enter an amount'); return; }
    setFeeLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/gateway/calculate-fees', method: 'POST',
        data: { amount: parseFloat(feeAmount), method: feeMethod },
      });
      setFeeResult(res.data);
    } catch { toast.error('Failed to calculate'); }
    setFeeLoading(false);
  };

  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const typeLabels: Record<string, string> = {
    invoice: 'Invoice', qr_code: 'QR Code', payment_link: 'Payment Link',
    virtual_account: 'Virtual Account', ewallet: 'E-Wallet',
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm relative overflow-hidden animate-fade-in-up">
          <div className="absolute -top-12 -right-10 h-36 w-36 rounded-full bg-indigo-200/30 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-blue-200/30 blur-2xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
              <p className="text-sm text-slate-500 mt-1">Revenue, trends, and operational metrics for your selected period.</p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-full sm:w-[140px] bg-white border-slate-200 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="daily" className="text-foreground">Daily</SelectItem>
                  <SelectItem value="weekly" className="text-foreground">Weekly</SelectItem>
                  <SelectItem value="monthly" className="text-foreground">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={fetchReport} variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:text-foreground btn-hover-lift transition-smooth">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 px-6">
            <div className="max-w-md mx-auto space-y-3 animate-fade-in-up">
              <div className="h-3 w-2/3 mx-auto rounded-full skeleton-loading" />
              <div className="h-3 w-5/6 mx-auto rounded-full skeleton-loading" />
              <div className="h-3 w-3/4 mx-auto rounded-full skeleton-loading" />
              <div className="flex justify-center pt-2"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
            </div>
          </div>
        ) : report ? (
          <>
            {/* Revenue Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="bg-white border border-slate-200 ring-1 ring-emerald-100 overflow-hidden shadow-sm card-3d animate-fade-in-up animate-stagger-1">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400/70 to-emerald-200/20" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Paid Revenue</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{fmt(report.paid_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-emerald-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border border-slate-200 ring-1 ring-amber-100 overflow-hidden shadow-sm card-3d animate-fade-in-up animate-stagger-2">
                <div className="h-1 w-full bg-gradient-to-r from-amber-400/70 to-amber-200/20" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Pending</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{fmt(report.pending_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-amber-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border border-slate-200 ring-1 ring-red-100 overflow-hidden shadow-sm card-3d animate-fade-in-up animate-stagger-3">
                <div className="h-1 w-full bg-gradient-to-r from-red-400/70 to-red-200/20" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Disbursed + Refunded</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{fmt(report.total_disbursed + report.total_refunded)}</p>
                    </div>
                    <div className="h-10 w-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border border-slate-200 ring-1 ring-blue-100 overflow-hidden shadow-sm card-3d animate-fade-in-up animate-stagger-4">
                <div className="h-1 w-full bg-gradient-to-r from-blue-400/70 to-indigo-200/20" />
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Net Revenue</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{fmt(report.net_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-blue-700" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-1">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Transactions</p>
                      <p className="text-3xl font-bold text-foreground mt-1">{report.total_transactions}</p>
                    </div>
                    <div className="h-10 w-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-2">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-3xl font-bold text-emerald-400 mt-1">{report.success_rate}%</p>
                    </div>
                    <div className="h-10 w-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                      <Percent className="h-5 w-5 text-emerald-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-3">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">PHP Balance</p>
                      <p className="text-3xl font-bold text-foreground mt-1">
                        {paymongoBalance !== null ? fmt(paymongoBalance) : 'N/A'}
                      </p>
                    </div>
                    <div className="h-10 w-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-1">
                <CardHeader><CardTitle className="text-foreground">Payment Method Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(report.type_breakdown).map(([type, count]) => {
                      const total = Object.values(report.type_breakdown).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const colors: Record<string, string> = {
                        invoice: 'bg-blue-500', qr_code: 'bg-purple-500', payment_link: 'bg-cyan-500',
                        virtual_account: 'bg-emerald-500', ewallet: 'bg-orange-500',
                      };
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-muted-foreground">{typeLabels[type] || type}</span>
                            <span className="text-sm text-foreground font-medium">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className={`${colors[type] || 'bg-slate-500'} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(report.type_breakdown).length === 0 && (
                      <p className="text-muted-foreground text-center py-4">No data for this period</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-2">
                <CardHeader><CardTitle className="text-foreground">Status Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(report.status_breakdown).map(([status, count]) => {
                      const total = report.total_transactions || 1;
                      const pct = Math.round((count / total) * 100);
                      const colors: Record<string, string> = {
                        paid: 'bg-emerald-500', pending: 'bg-amber-500', expired: 'bg-red-500', refunded: 'bg-orange-500',
                      };
                      const icons: Record<string, React.ReactNode> = {
                        paid: <ArrowUpRight className="h-4 w-4 text-emerald-400" />,
                        pending: <DollarSign className="h-4 w-4 text-amber-400" />,
                        expired: <ArrowDownRight className="h-4 w-4 text-red-400" />,
                        refunded: <RefreshCcw className="h-4 w-4 text-orange-400" />,
                      };
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              {icons[status]}
                              <span className="text-sm text-muted-foreground capitalize">{status}</span>
                            </div>
                            <span className="text-sm text-foreground font-medium">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className={`${colors[status] || 'bg-slate-500'} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Fee Calculator */}
            <Card className="bg-white border border-slate-200 shadow-sm animate-fade-in-up animate-stagger-3">
              <CardHeader><CardTitle className="text-foreground flex items-center"><Calculator className="h-5 w-5 mr-2 text-yellow-400" />Fee Calculator</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Amount (₱)</Label>
                    <Input type="number" placeholder="1000" value={feeAmount} onChange={e => setFeeAmount(e.target.value)}
                      className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Method</Label>
                    <Select value={feeMethod} onValueChange={setFeeMethod}>
                      <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {[['invoice', 'Invoice'], ['qr_code', 'QR Code'], ['ewallet', 'E-Wallet'],
                          ['virtual_account', 'Virtual Account'], ['card', 'Card'], ['disbursement', 'Disbursement']].map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-foreground">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCalcFees} disabled={feeLoading} className="w-full bg-yellow-600 hover:bg-yellow-700 text-white">
                      {feeLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Calculate
                    </Button>
                  </div>
                </div>
                {feeResult && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-muted-foreground">Amount</p><p className="text-lg font-bold text-foreground">{fmt(feeResult.amount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Fee</p><p className="text-lg font-bold text-red-400">{fmt(feeResult.fee)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Net Amount</p><p className="text-lg font-bold text-emerald-400">{fmt(feeResult.net_amount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Fee Rate</p><p className="text-lg font-bold text-foreground">{feeResult.fee_percentage}% + ₱{feeResult.fee_fixed}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-16 px-6 animate-fade-in-up">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <PieChart className="h-7 w-7" />
            </div>
            <p className="text-slate-700 font-medium">No report data available</p>
            <p className="text-sm text-slate-500 mt-1">Try another period or refresh to load analytics.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
