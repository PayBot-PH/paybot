import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Monitor,
  Send,
  Terminal as TerminalIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Eraser,
  Hash
} from 'lucide-react';
import { toast } from 'sonner';

interface POSTerminal {
  id: number;
  terminal_code: string;
  terminal_name: string;
  status: string;
  device_id: string | null;
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'outgoing';
  message: string;
}

export default function TerminalSimulator() {
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [selectedTerminalId, setSelectedTerminal] = useState<string>('');
  const [amount, setAmount] = useState<string>('0');
  const [description, setDescription] = useState<string>('ECR Sale');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'PAID' | 'FAILED'>('IDLE');
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    }]);
  };

  useEffect(() => {
    fetch('/api/v1/pos-terminals/all')
      .then(res => res.json())
      .then(data => setTerminals(data.data || []))
      .catch(err => toast.error('Failed to load terminals'));

    // Setup SSE listener for status updates
    const ev = new EventSource('/api/v1/events/stream');
    ev.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'status_change') {
         addLog('info', `[EVENT] Transaction ${data.external_id} status: ${data.new_status}`);
         if (data.new_status === 'paid') {
            setStatus('PAID');
            addLog('success', '💸 PAYMENT RECEIVED! POS confirmed checkout.');
         } else if (data.new_status === 'failed') {
            setStatus('FAILED');
            addLog('error', '❌ Transaction failed or cancelled.');
         }
      }
    };
    eventSourceRef.current = ev;

    return () => ev.close();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleKeyPress = (val: string) => {
    if (val === 'C') {
      setAmount('0');
      return;
    }
    setAmount(prev => {
      if (prev === '0' && val !== '.') return val;
      if (val === '.' && prev.includes('.')) return prev;
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev;
      return prev + val;
    });
  };

  const pushToTerminal = async () => {
    if (!selectedTerminalId) {
      toast.error('Please select a terminal');
      return;
    }
    if (parseFloat(amount) <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    setLoading(true);
    setStatus('PENDING');
    addLog('outgoing', `Pushing PHP ${amount} to Terminal ${selectedTerminalId}...`);

    try {
      const res = await fetch(`/api/v1/pos-terminals/${selectedTerminalId}/ecr-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description
        })
      });

      const result = await res.json();
      if (result.success) {
        addLog('info', `[ECR] Request sent successfully. Order ID: ${result.data.order_id}`);
        addLog('info', '[POS] Waiting for user selection on mobile device...');
      } else {
        throw new Error(result.error || 'Failed to push');
      }
    } catch (err: any) {
      addLog('error', `[ECR] Error: ${err.message}`);
      setStatus('FAILED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <Monitor className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ECR Simulator</h1>
            <p className="text-muted-foreground text-sm">Simulate a Cash Register pushing sales to a physical terminal</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Input & Keypad */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Amount Entry</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₱</div>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-10 text-3xl h-20 font-bold text-right bg-accent/50 border-2 border-primary/20 focus-visible:ring-primary/30"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3,4,5,6,7,8,9,'.',0,'C'].map(k => (
                    <Button
                      key={k}
                      variant={k === 'C' ? 'destructive' : 'secondary'}
                      className="h-14 text-xl font-bold rounded-xl active:scale-95 transition-transform"
                      onClick={() => handleKeyPress(k.toString())}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sale Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Description</label>
                  <Input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Table 5 Order"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Target Terminal</label>
                  <select
                    value={selectedTerminalId}
                    onChange={e => setSelectedTerminal(e.target.value)}
                    className="w-full bg-background border border-input rounded-md h-10 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select a terminal...</option>
                    {terminals.map(t => (
                      <option key={t.id} value={t.id}>{t.terminal_name} ({t.terminal_code})</option>
                    ))}
                  </select>
                </div>
                <Button
                  className="w-full h-12 gap-2 font-bold shadow-lg shadow-primary/20"
                  size="lg"
                  onClick={pushToTerminal}
                  disabled={loading || !selectedTerminalId}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  PUSH TO TERMINAL
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Status & Logs */}
          <div className="lg:col-span-2 space-y-6">
            <Card className={`border-2 transition-colors duration-500 overflow-hidden ${
              status === 'PAID' ? 'border-emerald-500 bg-emerald-500/5' :
              status === 'FAILED' ? 'border-destructive bg-destructive/5' :
              status === 'PENDING' ? 'border-amber-500 bg-amber-500/5' :
              'border-border/50 shadow-sm'
            }`}>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  {status === 'IDLE' && (
                    <>
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <TerminalIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-xl font-bold">ECR Ready</h3>
                        <p className="text-muted-foreground text-sm">Select a terminal and push a sale amount</p>
                      </div>
                    </>
                  )}

                  {status === 'PENDING' && (
                    <>
                      <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
                        <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                      </div>
                      <div className="text-center">
                        <Badge variant="outline" className="mb-2 bg-amber-50 text-amber-600 border-amber-200">AWAITING PAYMENT</Badge>
                        <h3 className="text-3xl font-black">₱{amount}</h3>
                        <p className="text-muted-foreground text-sm">Sent to terminal. Customer must select payment method on device.</p>
                      </div>
                    </>
                  )}

                  {status === 'PAID' && (
                    <>
                      <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                      </div>
                      <div className="text-center">
                        <Badge variant="outline" className="mb-2 bg-emerald-50 text-emerald-600 border-emerald-200 uppercase tracking-widest">Paid Successfully</Badge>
                        <h3 className="text-3xl font-black">₱{amount}</h3>
                        <p className="text-emerald-700 text-sm font-medium">Terminal transaction complete. Check Ledger for details.</p>
                        <Button variant="outline" className="mt-4" onClick={() => setStatus('IDLE')}>New Transaction</Button>
                      </div>
                    </>
                  )}

                  {status === 'FAILED' && (
                    <>
                      <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="h-10 w-10 text-red-600" />
                      </div>
                      <div className="text-center">
                        <Badge variant="outline" className="mb-2 bg-red-50 text-red-600 border-red-200 uppercase tracking-widest">Transaction Error</Badge>
                        <h3 className="text-3xl font-black">₱{amount}</h3>
                        <p className="text-destructive text-sm font-medium">The request was denied or timed out.</p>
                        <Button variant="outline" className="mt-4" onClick={() => setStatus('IDLE')}>Retry</Button>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-lg bg-[#0f172a] text-white">
              <CardHeader className="border-b border-white/10 py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Real-time Simulation Logs
                </CardTitle>
                <Button variant="ghost" size="xs" className="h-7 text-white/50 hover:text-white" onClick={() => setLogs([])}>
                  <Eraser className="h-3 w-3 mr-1" /> Clear
                </Button>
              </CardHeader>
              <CardContent className="p-0 h-[320px]">
                <div className="font-mono text-[11px] h-full overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
                  {logs.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-500 italic">
                      Waiting for simulator activity...
                    </div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 leading-relaxed border-l border-white/5 pl-3">
                      <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                      <span className={`
                        ${log.type === 'info' ? 'text-blue-400' : ''}
                        ${log.type === 'success' ? 'text-emerald-400' : ''}
                        ${log.type === 'error' ? 'text-red-400' : ''}
                        ${log.type === 'outgoing' ? 'text-amber-400 font-bold' : ''}
                      `}>
                        {log.type === 'outgoing' && '>>> '}
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
