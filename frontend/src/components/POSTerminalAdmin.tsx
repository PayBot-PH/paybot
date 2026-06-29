import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, XCircle, Copy, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TerminalRequest {
  id: number;
  user_id: string;
  user_name: string;
  business_name: string;
  business_type: string;
  location: string;
  status: string;
  required_payment_methods: string[];
  created_at: string;
  monthly_transaction_volume: number;
}

interface Terminal {
  id: number;
  terminal_code: string;
  terminal_name: string;
  user_id: string;
  status: string;
  is_active: boolean;
  location: string;
  enabled_payment_methods: string[];
  created_at: string;
}

const api = {
  getPendingRequests: async () => {
    const response = await fetch('/api/v1/pos-terminals/requests/pending', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch requests');
    return response.json();
  },

  approveRequest: async (requestId: number) => {
    const response = await fetch(`/api/v1/pos-terminals/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to approve request');
    return response.json();
  },

  rejectRequest: async (requestId: number, reason: string) => {
    const response = await fetch(`/api/v1/pos-terminals/requests/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error('Failed to reject request');
    return response.json();
  },

  getAllTerminals: async () => {
    const response = await fetch('/api/v1/pos-terminals/all', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to fetch terminals');
    return response.json();
  },

  deactivateTerminal: async (terminalId: number) => {
    const response = await fetch(`/api/v1/pos-terminals/${terminalId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Failed to deactivate terminal');
    return response.json();
  },
};

const RequestCard: React.FC<{ request: TerminalRequest; onAction: () => void }> = ({
  request,
  onAction,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => api.approveRequest(request.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
      onAction();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.rejectRequest(request.id, rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
      setShowRejectDialog(false);
      onAction();
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{request.business_name}</CardTitle>
            <CardDescription>
              Requested by {request.user_name} (ID: {request.user_id})
            </CardDescription>
          </div>
          <Badge>{request.status}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-gray-600">Business Type</Label>
            <p>{request.business_type || 'Not specified'}</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Location</Label>
            <p>{request.location || 'Not specified'}</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Monthly Volume</Label>
            <p>{request.monthly_transaction_volume || 'Not specified'}</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Requested Methods</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {Array.isArray(request.required_payment_methods) && request.required_payment_methods.map((method) => (
                <Badge key={method} variant="outline" className="text-xs">
                  {method}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Approve
          </Button>

          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="flex-1">
                Reject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject Request</DialogTitle>
                <DialogDescription>
                  Provide a reason for rejecting this terminal request
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Reason</Label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter rejection reason..."
                    className="w-full border rounded-md p-2 mt-2 min-h-24"
                  />
                </div>
                <Button
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending || !rejectionReason}
                  variant="destructive"
                  className="w-full"
                >
                  {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirm Rejection
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

const TerminalRow: React.FC<{ terminal: Terminal; onDeactivate: () => void }> = ({
  terminal,
  onDeactivate,
}) => {
  const queryClient = useQueryClient();

  const deactivateMutation = useMutation({
    mutationFn: () => api.deactivateTerminal(terminal.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTerminals'] });
      onDeactivate();
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-4 py-3 font-medium">{terminal.terminal_name}</td>
      <td className="px-4 py-3">
        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{terminal.terminal_code}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyToClipboard(terminal.terminal_code)}
          className="ml-2"
        >
          <Copy className="w-4 h-4" />
        </Button>
      </td>
      <td className="px-4 py-3">{terminal.user_id}</td>
      <td className="px-4 py-3">{terminal.location || '-'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {Array.isArray(terminal.enabled_payment_methods) && terminal.enabled_payment_methods.slice(0, 3).map((method) => (
            <Badge key={method} variant="outline" className="text-xs">
              {method}
            </Badge>
          ))}
          {Array.isArray(terminal.enabled_payment_methods) && terminal.enabled_payment_methods.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{terminal.enabled_payment_methods.length - 3}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {terminal.is_active ? (
          <Badge className="bg-green-100 text-green-800">Active</Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {terminal.is_active && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deactivateMutation.mutate()}
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Deactivate
          </Button>
        )}
      </td>
    </tr>
  );
};

export const POSTerminalAdminPanel: React.FC = () => {
  const pendingQuery = useQuery({
    queryKey: ['pendingRequests'],
    queryFn: api.getPendingRequests,
    refetchInterval: 10000,
  });

  const allTerminalsQuery = useQuery({
    queryKey: ['allTerminals'],
    queryFn: api.getAllTerminals,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">POS Terminal Management</h1>
        <p className="text-gray-600 mt-2">Manage terminal requests and assignments</p>
      </div>

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requests">
            Pending Requests ({pendingQuery.data?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="terminals">
            All Terminals ({allTerminalsQuery.data?.total || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          {pendingQuery.isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Loading requests...</p>
              </CardContent>
            </Card>
          ) : pendingQuery.isError ? (
            <Card>
              <CardContent className="pt-6">
                <div className="bg-red-100 text-red-800 p-4 rounded-md flex gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>Failed to load requests</span>
                </div>
              </CardContent>
            </Card>
          ) : pendingQuery.data?.data?.length > 0 && Array.isArray(pendingQuery.data.data) ? (
            <div className="grid grid-cols-1 gap-4">
              {pendingQuery.data.data.map((request: TerminalRequest) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onAction={() => pendingQuery.refetch()}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-12 pb-12">
                <div className="text-center space-y-4">
                  <CheckCircle2 className="w-16 h-16 mx-auto text-green-400" />
                  <h3 className="text-lg font-medium">No pending requests</h3>
                  <p className="text-gray-600">All terminal requests have been reviewed</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="terminals">
          {allTerminalsQuery.isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Loading terminals...</p>
              </CardContent>
            </Card>
          ) : allTerminalsQuery.isError ? (
            <Card>
              <CardContent className="pt-6">
                <div className="bg-red-100 text-red-800 p-4 rounded-md flex gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>Failed to load terminals</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>All Terminals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Name</th>
                        <th className="text-left px-4 py-3 font-semibold">Code</th>
                        <th className="text-left px-4 py-3 font-semibold">User ID</th>
                        <th className="text-left px-4 py-3 font-semibold">Location</th>
                        <th className="text-left px-4 py-3 font-semibold">Methods</th>
                        <th className="text-left px-4 py-3 font-semibold">Status</th>
                        <th className="text-left px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(allTerminalsQuery.data?.data) ? allTerminalsQuery.data.data.map((terminal: Terminal) => (
                        <TerminalRow
                          key={terminal.id}
                          terminal={terminal}
                          onDeactivate={() => allTerminalsQuery.refetch()}
                        />
                      )) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default POSTerminalAdminPanel;
