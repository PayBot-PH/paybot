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
  const [xenditBalance, setXenditBalance] = useState<number | null>(null);

  // Fee calculator
  const [feeAmount, setFeeAmount] = useState('');
  const [feeMethod, setFeeMethod] = useState('invoice');
  const [feeResult, setFeeResult] = useState<FeeResult | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [rptRes, balRes] = await Promise.all([
        client.apiCall.invoke({ url: `/api/v1/gateway/reports?period=${period}`, method: 'GET', data: {} }),
        client.apiCall.invoke({ url: '/api/v1/gateway/xendit-balance', method: 'GET', data: {} }),
      ]);
      setReport(rptRes.data);
      if (balRes.data?.success) setXenditBalance(balRes.data.balance);
    } catch { /* ignore */ }
    setLoading(false);
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <div className="flex items-center space-x-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="daily" className="text-white">Daily</SelectItem>
                <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={fetchReport} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
        ) : report ? (
          <>
            {/* Revenue Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 border-0">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-emerald-200">Paid Revenue</p>
                      <p className="text-2xl font-bold text-white mt-1">{fmt(report.paid_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-600 to-amber-800 border-0">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-amber-200">Pending</p>
                      <p className="text-2xl font-bold text-white mt-1">{fmt(report.pending_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-red-600 to-red-800 border-0">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-200">Disbursed + Refunded</p>
                      <p className="text-2xl font-bold text-white mt-1">{fmt(report.total_disbursed + report.total_refunded)}</p>
                    </div>
                    <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-600 to-indigo-800 border-0">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-200">Net Revenue</p>
                      <p className="text-2xl font-bold text-white mt-1">{fmt(report.net_revenue)}</p>
                    </div>
                    <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Total Transactions</p>
                      <p className="text-3xl font-bold text-white mt-1">{report.total_transactions}</p>
                    </div>
                    <div className="h-10 w-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Success Rate</p>
                      <p className="text-3xl font-bold text-emerald-400 mt-1">{report.success_rate}%</p>
                    </div>
                    <div className="h-10 w-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                      <Percent className="h-5 w-5 text-emerald-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">PHP Balance</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {xenditBalance !== null ? fmt(xenditBalance) : 'N/A'}
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
              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardHeader><CardTitle className="text-white">Payment Method Breakdown</CardTitle></CardHeader>
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
                            <span className="text-sm text-slate-300">{typeLabels[type] || type}</span>
                            <span className="text-sm text-white font-medium">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div className={`${colors[type] || 'bg-slate-500'} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(report.type_breakdown).length === 0 && (
                      <p className="text-slate-500 text-center py-4">No data for this period</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#1E293B] border-slate-700/50">
                <CardHeader><CardTitle className="text-white">Status Breakdown</CardTitle></CardHeader>
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
                              <span className="text-sm text-slate-300 capitalize">{status}</span>
                            </div>
                            <span className="text-sm text-white font-medium">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
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
            <Card className="bg-[#1E293B] border-slate-700/50">
              <CardHeader><CardTitle className="text-white flex items-center"><Calculator className="h-5 w-5 mr-2 text-yellow-400" />Fee Calculator</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-300">Amount (₱)</Label>
                    <Input type="number" placeholder="1000" value={feeAmount} onChange={e => setFeeAmount(e.target.value)}
                      className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-slate-300">Payment Method</Label>
                    <Select value={feeMethod} onValueChange={setFeeMethod}>
                      <SelectTrigger className="mt-1 bg-slate-800 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {[['invoice', 'Invoice'], ['qr_code', 'QR Code'], ['ewallet', 'E-Wallet'],
                          ['virtual_account', 'Virtual Account'], ['card', 'Card'], ['disbursement', 'Disbursement']].map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-white">{l}</SelectItem>
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
                  <div className="mt-4 p-4 bg-slate-800/50 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-slate-400">Amount</p><p className="text-lg font-bold text-white">{fmt(feeResult.amount)}</p></div>
                    <div><p className="text-xs text-slate-400">Fee</p><p className="text-lg font-bold text-red-400">{fmt(feeResult.fee)}</p></div>
                    <div><p className="text-xs text-slate-400">Net Amount</p><p className="text-lg font-bold text-emerald-400">{fmt(feeResult.net_amount)}</p></div>
                    <div><p className="text-xs text-slate-400">Fee Rate</p><p className="text-lg font-bold text-white">{feeResult.fee_percentage}% + ₱{feeResult.fee_fixed}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-slate-400 text-center py-16">No report data available</p>
        )}
      </div>
    </Layout>
  );
}