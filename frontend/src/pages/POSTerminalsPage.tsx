import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Plus,
  Monitor,
  CheckCircle,
  XCircle,
  Clock,
  User,
  AlertCircle,
  Search,
  Settings,
  MoreVertical,
} from 'lucide-react';

interface POSTerminalDevice {
  id: number;
  device_id: string;
  brand: string | null;
  model: string | null;
  os_version: string | null;
  app_version: string | null;
  is_authorized: boolean;
  last_seen_at: string;
}

interface POSTerminal {
  id: number;
  terminal_code: string;
  terminal_name: string;
  user_id: string;
  device_id: string | null;
  status: string;
  is_active: boolean;
}

export default function POSTerminalsPage() {
  const { isSuperAdmin } = useAuth();
  const [devices, setDevices] = useState<POSTerminalDevice[]>([]);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigningDevice, setAssigningDevice] = useState<POSTerminalDevice | null>(null);
  const [targetUserId, setTargetUserId] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [devicesRes, terminalsRes] = await Promise.all([
        fetch('/api/v1/pos-terminals/devices'),
        fetch('/api/v1/pos-terminals/all'),
      ]);

      if (!devicesRes.ok) throw new Error('Failed to load devices');
      if (!terminalsRes.ok) throw new Error('Failed to load terminals');

      const devicesData = await devicesRes.json();
      const terminalsData = await terminalsRes.json();

      if (devicesData.success) {
        setDevices(devicesData.data || []);
      } else {
        throw new Error(devicesData.error || 'Failed to load devices');
      }

      if (terminalsData.success) {
        setTerminals(terminalsData.data || []);
      } else {
        throw new Error(terminalsData.error || 'Failed to load terminals');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Polling every 10s for real-time feel
    return () => clearInterval(interval);
  }, []);

  const handleAssign = async () => {
    if (!assigningDevice || !targetUserId) return;
    try {
      const res = await fetch(`/api/v1/pos-terminals/devices/${assigningDevice.device_id}/assign?user_id=${encodeURIComponent(targetUserId)}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      setAssigningDevice(null);
      setTargetUserId('');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getDeviceTerminal = (deviceId: string) => {
    return terminals.find(t => t.device_id === deviceId);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto w-full p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">POS Terminal Management</h1>
            <p className="text-muted-foreground">Monitor devices and assign terminals to users</p>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm">
            Refresh Data
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/15 border border-destructive text-destructive px-4 py-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Devices Column */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> Registered Devices
            </h2>
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
              </div>
            ) : devices.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">No devices registered yet</CardContent></Card>
            ) : (
              devices.map(device => {
                const terminal = getDeviceTerminal(device.device_id);
                return (
                  <Card key={device.id} className={device.is_authorized ? '' : 'border-amber-500/50 bg-amber-500/5'}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{device.model || 'Unknown Device'}</span>
                            <Badge variant={device.is_authorized ? 'default' : 'secondary'} className="text-[10px] h-4">
                              {device.is_authorized ? 'Authorized' : 'Pending'}
                            </Badge>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground">{device.device_id}</p>
                          <div className="text-[11px] text-muted-foreground mt-2">
                            <span>OS: {device.os_version}</span> • <span>App: {device.app_version}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {terminal ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              Linked: {terminal.terminal_code}
                            </Badge>
                          ) : (
                            <Button size="xs" onClick={() => setAssigningDevice(device)}>Assign User</Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Last seen: {new Date(device.last_seen_at).toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Terminals Column */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor className="h-5 w-5" /> Active Terminals
            </h2>
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
              </div>
            ) : terminals.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">No terminals created yet</CardContent></Card>
            ) : (
              terminals.map(terminal => (
                <Card key={terminal.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-bold text-sm">{terminal.terminal_name}</h3>
                        <p className="text-[11px] font-mono text-primary">{terminal.terminal_code}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px]"><User className="h-2 w-2 mr-1" /> {terminal.user_id}</Badge>
                          <Badge className="text-[10px] h-4" variant={terminal.is_active ? 'default' : 'destructive'}>
                            {terminal.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Assign Dialog (Simple implementation) */}
        {assigningDevice && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Assign Device to User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Device</p>
                  <p className="text-sm">{assigningDevice.model} ({assigningDevice.device_id.substring(0, 12)}...)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Telegram User ID / Username</label>
                  <input
                    type="text"
                    className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm"
                    placeholder="Enter User ID"
                    value={targetUserId}
                    onChange={e => setTargetUserId(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground italic">Assigning will create or link a terminal for this user.</p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setAssigningDevice(null)}>Cancel</Button>
                  <Button onClick={handleAssign} disabled={!targetUserId}>Complete Assignment</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
