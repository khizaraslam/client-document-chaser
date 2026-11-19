'use client';

import {
  AuthMeResponse,
  InviteMemberInput,
  InviteMemberSchema,
  TeamRosterResponse,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { formatShortDate } from '@/lib/utils';

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = React.useState<string | null>(
    null,
  );

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const rosterQuery = useQuery({
    queryKey: ['memberships', 'roster'],
    queryFn: () => apiRequest<TeamRosterResponse>('/memberships'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(InviteMemberSchema),
    defaultValues: { email: '', role: UserRole.STAFF },
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteMemberInput) =>
      apiRequest<{ emailDispatchStatus: string }>('/memberships/invitations', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['memberships', 'roster'] });
      reset();
      setInviteOpen(false);
      notify({
        variant: 'success',
        title: 'Invitation created',
        description:
          res.emailDispatchStatus === 'SENT'
            ? 'Invitation email dispatched.'
            : `Invitation saved (${res.emailDispatchStatus}).`,
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to invite member',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiRequest(`/memberships/invitations/${invitationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships', 'roster'] });
      notify({ variant: 'success', title: 'Invitation revoked' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not revoke invitation',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiRequest(`/memberships/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships', 'roster'] });
      notify({ variant: 'success', title: 'Member role updated' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Role update failed',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) =>
      apiRequest(`/memberships/${membershipId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmRemoveId(null);
      queryClient.invalidateQueries({ queryKey: ['memberships', 'roster'] });
      notify({ variant: 'success', title: 'Team member removed' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to remove member',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const currentRole = meQuery.data?.membership.role;
  const canManageTeam =
    currentRole === UserRole.OWNER || currentRole === UserRole.ADMIN;
  const isOwner = currentRole === UserRole.OWNER;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Team &amp; Permissions
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Manage firm accountants, administrators, and staff access.
          </p>
        </div>

        {canManageTeam && (
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            <span>Invite team member</span>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {rosterQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-10 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-10 rounded bg-[#F3F1EC] animate-pulse" />
            </div>
          ) : rosterQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {rosterQuery.error instanceof ApiClientError
                  ? rosterQuery.error.message
                  : 'Unable to load team members.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => rosterQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : rosterQuery.data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Member</th>
                    <th className="py-2.5 pr-4">Role</th>
                    <th className="py-2.5 pr-4">Email Verification</th>
                    <th className="py-2.5 pr-4">Joined</th>
                    {canManageTeam && (
                      <th className="py-2.5 text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rosterQuery.data.members.map((member) => {
                    const isSelf = member.id === meQuery.data?.membership.id;
                    return (
                      <tr
                        key={member.id}
                        className="border-b border-[#F3F1EC] last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium text-[#0F172A]">
                            {member.fullName}
                            {isSelf && (
                              <span className="ml-2 text-xs font-normal text-[#64748B]">
                                (You)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[#64748B]">
                            {member.email}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          {isOwner && !isSelf ? (
                            <Select
                              aria-label={`Role for ${member.fullName}`}
                              value={member.role}
                              onChange={(e) =>
                                updateRoleMutation.mutate({
                                  id: member.id,
                                  role: e.target.value as UserRole,
                                })
                              }
                              className="h-8 w-32 text-xs"
                            >
                              <option value={UserRole.OWNER}>OWNER</option>
                              <option value={UserRole.ADMIN}>ADMIN</option>
                              <option value={UserRole.STAFF}>STAFF</option>
                            </Select>
                          ) : (
                            <span className="text-xs font-medium text-[#0F172A]">
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#475569]">
                          {member.emailVerified ? 'Verified' : 'Unverified'}
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#64748B] tabular-nums">
                          {formatShortDate(member.createdAt)}
                        </td>
                        {canManageTeam && (
                          <td className="py-3 text-right">
                            {!isSelf && member.role !== UserRole.OWNER && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmRemoveId(member.id)}
                              >
                                Remove
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {rosterQuery.isLoading ? (
            <div className="h-10 rounded bg-[#F3F1EC] animate-pulse" />
          ) : rosterQuery.isError ? (
            <p className="text-sm text-[#991B1B]">
              Pending invitations could not be loaded while team roster is unavailable.
            </p>
          ) : rosterQuery.data && rosterQuery.data.pendingInvitations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Email</th>
                    <th className="py-2.5 pr-4">Role</th>
                    <th className="py-2.5 pr-4">Expires</th>
                    {canManageTeam && (
                      <th className="py-2.5 text-right">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rosterQuery.data.pendingInvitations.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-[#F3F1EC] last:border-0"
                    >
                      <td className="py-3 pr-4 text-[#0F172A]">{inv.email}</td>
                      <td className="py-3 pr-4 text-xs font-medium text-[#475569]">
                        {inv.role}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#64748B] tabular-nums">
                        {formatShortDate(inv.expiresAt)}
                      </td>
                      {canManageTeam && (
                        <td className="py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeMutation.mutate(inv.id)}
                            disabled={revokeMutation.isPending}
                          >
                            Revoke
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#475569]">
              No pending team invitations.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite team member"
        description="Send a workspace invitation to a colleague."
      >
        <form
          onSubmit={handleSubmit((vals) => inviteMutation.mutate(vals))}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="invite-email">Colleague email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="sarah@vanceaccounting.co.uk"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" {...register('role')}>
              <option value={UserRole.STAFF}>STAFF (Assigned clients &amp; requests)</option>
              <option value={UserRole.ADMIN}>ADMIN (Manage clients, requests &amp; team)</option>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Sending...' : 'Send invitation'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(confirmRemoveId)}
        onClose={() => setConfirmRemoveId(null)}
        title="Remove team member"
        description="This immediately revokes their access to your firm workspace."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmRemoveId(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={removeMemberMutation.isPending}
            onClick={() =>
              confirmRemoveId && removeMemberMutation.mutate(confirmRemoveId)
            }
          >
            {removeMemberMutation.isPending ? 'Removing...' : 'Confirm removal'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
