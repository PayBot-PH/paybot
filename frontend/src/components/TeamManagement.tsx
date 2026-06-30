import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserPlus,
  Mail,
  Shield,
  Clock,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Users,
  Lock,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { client } from '@/lib/api';

interface TeamInvitation {
  id: number;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  expires_at?: string;
  invited_by: string;
  permissions: Record<string, boolean>;
  notes?: string;
  organization_id?: string;
  organization_name?: string;
}

interface TeamMember {
  id: number;
  name: string;
  telegram_id: string;
  role: string;
  permissions: Record<string, boolean>;
  joined_at: string;
  is_active: boolean;
  organization_id?: string;
  organization_name?: string;
}

interface OrganizationWalletBalance {
  organization_id: string;
  organization_name?: string;
  wallet_id: number;
  currency: string;
  balance: number;
  available_balance: number;
  pending_balance: number;
}

interface Role {
  name: string;
  description?: string;
  permissions: Record<string, boolean>;
  is_builtin: boolean;
}

const PERMISSION_LABELS: Record<string, string> = {
  can_add_delete_user: 'Add/Delete User',
  can_edit_user_access: 'Edit User Access',
  can_edit_business_settings: 'Edit Business Settings',
  can_add_edit_delete_cards_promotion: 'Cards Promotion',
  can_upload_delete_batch_disbursements: 'Batch Disbursements',
  can_validate_batch_disbursements: 'Validate Disbursements',
  can_generate_invoice: 'Generate Invoice',
  can_add_edit_customers: 'Manage Customers',
  can_view_transaction_details: 'View Transactions',
  can_download_csv_report: 'Download Reports',
  can_withdraw_funds: 'Withdraw Funds',
  can_create_transfers: 'Create Transfers',
  can_add_edit_delete_withdrawal_account: 'Manage Withdrawal Account',
  can_see_api_keys: 'See API Keys',
  can_resend_callbacks: 'Resend Callbacks',
  can_change_callback_urls: 'Change Callback URLs',
  can_approve_batch_disbursements: 'Approve Disbursements',
  can_refund_cards_charges: 'Refund Cards',
  can_manage_team: 'Manage Team',
};

export function TeamInvitationsTab() {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('admin');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/team/invitations',
        method: 'GET',
        data: {},
      });
      if (res.data?.invitations) {
        setInvitations(res.data.invitations);
      }
    } catch (err) {
      toast.error('Failed to load invitations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const handleSendInvitation = async () => {
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }

    try {
      setFormLoading(true);
      await client.apiCall.invoke({
        url: '/api/v1/team/invite',
        method: 'POST',
        data: { email, role: selectedRole, notes: notes || undefined },
      });
      toast.success('Invitation sent successfully');
      setEmail('');
      setNotes('');
      setSelectedRole('admin');
      setFormOpen(false);
      await fetchInvitations();
    } catch (err: any) {
      toast.error(err?.data?.detail || 'Failed to send invitation');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: number) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      await client.apiCall.invoke({
        url: `/api/v1/team/invitations/${invitationId}`,
        method: 'DELETE',
        data: {},
      });
      toast.success('Invitation revoked');
      await fetchInvitations();
    } catch (err) {
      toast.error('Failed to revoke invitation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Send Invitation Form */}
      <Card className="bg-white border border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Send Team Invitation
            </CardTitle>
            {!formOpen && (
              <Button size="sm" onClick={() => setFormOpen(true)} className="gap-2">
                <UserPlus className="h-3.5 w-3.5" />
                New Invitation
              </Button>
            )}
          </div>
        </CardHeader>

        {formOpen && (
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Email Address</Label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="withdrawer">Withdrawer</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="approver">Approver</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Notes (Optional)</Label>
                <Input
                  placeholder="Add notes for this invitation..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSendInvitation}
                  disabled={formLoading}
                  className="gap-2 flex-1"
                >
                  {formLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Invitations List */}
      <Card className="bg-white border border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Pending Invitations
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No pending invitations</p>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-start justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-slate-900">{inv.email}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {inv.status === 'pending' ? <Clock className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Role: <span className="font-medium">{inv.role}</span> • Sent{' '}
                      {new Date(inv.invited_at).toLocaleDateString()}
                    </p>
                    {inv.notes && <p className="text-xs text-slate-600 mt-1">Note: {inv.notes}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(inv.permissions)
                        .filter(([, enabled]) => enabled)
                        .map(([perm]) => (
                          <span
                            key={perm}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {PERMISSION_LABELS[perm] || perm}
                          </span>
                        ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeInvitation(inv.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TeamMembersTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [orgWallet, setOrgWallet] = useState<OrganizationWalletBalance | null>(null);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/team/members',
        method: 'GET',
        data: {},
      });
      if (res.data?.members) {
        setMembers(res.data.members);
      }

      const walletRes = await client.apiCall.invoke({
        url: '/api/v1/wallet/organization-balance',
        method: 'GET',
        data: {},
      });
      if (walletRes.data?.organization_id) {
        setOrgWallet(walletRes.data as OrganizationWalletBalance);
      }
    } catch (err) {
      toast.error('Failed to load team members');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  return (
    <Card className="bg-white border border-slate-200">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Active Team Members
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {orgWallet && (
          <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
            <p className="text-xs text-emerald-700 font-medium">Organization Wallet</p>
            <p className="text-base font-semibold text-emerald-900 mt-1">
              {orgWallet.currency} {Number(orgWallet.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Available: {orgWallet.currency} {Number(orgWallet.available_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5">
              {orgWallet.organization_name || orgWallet.organization_id}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No team members</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">@{member.telegram_id}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 mt-2">
                      <Shield className="h-3 w-3" />
                      {member.role}
                    </span>
                    {(member.organization_name || member.organization_id) && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Org: {member.organization_name || member.organization_id}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(member.permissions)
                        .filter(([, enabled]) => enabled)
                        .map(([perm]) => (
                          <span
                            key={perm}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {PERMISSION_LABELS[perm] || perm}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
