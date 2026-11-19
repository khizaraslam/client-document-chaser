'use client';

import {
  AuthMeResponse,
  ClientDetail,
  ClientEntityType,
  ClientStatus,
  ClientSummary,
  CreateClientInput,
  CreateClientSchema,
  OrganizationCountry,
  TeamRosterResponse,
  UpdateClientInput,
  UpdateClientSchema,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  FolderKanban,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import {
  COUNTRY_LABELS,
  ENTITY_TYPE_LABELS,
  clientStatusClass,
} from '@/lib/phase2-labels';

type StatusFilter = 'ALL' | ClientStatus;

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(
    ClientStatus.ACTIVE,
  );
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [includePrimaryContact, setIncludePrimaryContact] = React.useState(true);
  const [editingClient, setEditingClient] =
    React.useState<ClientSummary | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<{
    client: ClientSummary;
    action: 'archive' | 'restore';
  } | null>(null);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const canManageClients =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);

  const clientsQuery = useQuery({
    queryKey: ['clients', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const qs = params.toString();
      return apiRequest<ClientSummary[]>(`/clients${qs ? `?${qs}` : ''}`);
    },
  });

  const rosterQuery = useQuery({
    queryKey: ['memberships', 'roster'],
    queryFn: () => apiRequest<TeamRosterResponse>('/memberships'),
    enabled: canManageClients && (createOpen || Boolean(editingClient)),
  });

  const editDetailQuery = useQuery({
    queryKey: ['clients', editingClient?.id],
    queryFn: () => apiRequest<ClientDetail>(`/clients/${editingClient?.id}`),
    enabled: Boolean(editingClient?.id),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(CreateClientSchema),
    defaultValues: {
      name: '',
      companyName: '',
      email: '',
      phone: '',
      address: '',
      referenceCode: '',
      entityType: ClientEntityType.LLC,
      country: meQuery.data?.organization.country ?? OrganizationCountry.US,
      assignedUserId: '',
      notes: '',
      primaryContact: {
        fullName: '',
        email: '',
        phone: '',
        roleTitle: '',
        isPrimary: true,
      },
    },
  });

  const editForm = useForm<UpdateClientInput>({
    resolver: zodResolver(UpdateClientSchema),
  });

  React.useEffect(() => {
    if (createOpen && meQuery.data) {
      reset({
        name: '',
        companyName: '',
        email: '',
        phone: '',
        address: '',
        referenceCode: '',
        entityType:
          meQuery.data.organization.country === OrganizationCountry.UK
            ? ClientEntityType.LTD
            : ClientEntityType.LLC,
        country: meQuery.data.organization.country,
        assignedUserId: '',
        notes: '',
        primaryContact: includePrimaryContact
          ? {
              fullName: '',
              email: '',
              phone: '',
              roleTitle: '',
              isPrimary: true,
            }
          : undefined,
      });
    }
  }, [createOpen, includePrimaryContact, meQuery.data, reset]);

  React.useEffect(() => {
    if (editingClient) {
      const detail =
        editDetailQuery.data?.id === editingClient.id
          ? editDetailQuery.data
          : null;
      editForm.reset({
        name: detail?.name ?? editingClient.name,
        companyName: detail?.companyName ?? editingClient.companyName ?? '',
        email: detail?.email ?? editingClient.email ?? '',
        phone: detail?.phone ?? editingClient.phone ?? '',
        address: detail?.address ?? editingClient.address ?? '',
        referenceCode:
          detail?.referenceCode ?? editingClient.referenceCode ?? '',
        entityType: detail?.entityType ?? editingClient.entityType,
        country: detail?.country ?? editingClient.country,
        assignedUserId:
          detail?.assignedUserId ?? editingClient.assignedUserId ?? '',
        notes: detail?.notes ?? '',
      });
    }
  }, [editingClient, editDetailQuery.data, editForm]);

  const createMutation = useMutation({
    mutationFn: (values: CreateClientInput) => {
      const payload: CreateClientInput = {
        ...values,
        assignedUserId: values.assignedUserId || null,
        primaryContact: includePrimaryContact ? values.primaryContact : undefined,
      };
      return apiRequest('/clients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setCreateOpen(false);
      notify({
        variant: 'success',
        title: 'Client created',
        description: 'Client record added to your firm directory.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not create client',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: UpdateClientInput) => {
      if (!editingClient) throw new Error('No client selected');
      const payload: UpdateClientInput = {
        name: values.name,
        companyName: values.companyName,
        email: values.email,
        phone: values.phone,
        address: values.address,
        referenceCode: values.referenceCode,
        entityType: values.entityType,
        country: values.country,
        notes: values.notes,
      };
      if (canManageClients) {
        payload.assignedUserId = values.assignedUserId || null;
      }
      return apiRequest<ClientDetail>(`/clients/${editingClient.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_, __) => {
      if (editingClient) {
        queryClient.invalidateQueries({ queryKey: ['clients', editingClient.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditingClient(null);
      notify({
        variant: 'success',
        title: 'Client updated',
        description: 'Client details have been saved.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update client',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const archiveRestoreMutation = useMutation({
    mutationFn: ({
      clientId,
      action,
    }: {
      clientId: string;
      action: 'archive' | 'restore';
    }) =>
      apiRequest<ClientDetail>(`/clients/${clientId}/${action}`, {
        method: 'POST',
      }),
    onSuccess: (updated, vars) => {
      setStatusTarget(null);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', updated.id] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      notify({
        variant: 'success',
        title:
          vars.action === 'archive'
            ? 'Client archived'
            : 'Client restored to active',
        description:
          vars.action === 'archive'
            ? 'Existing requests, files, and audit history remain preserved.'
            : 'The client is now active and can receive new document requests.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Status update failed',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const clientsList = Array.isArray(clientsQuery.data) ? clientsQuery.data : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Clients Directory
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Manage client organizations, assigned accountants, and primary contacts.
          </p>
        </div>

        {canManageClients && (
          <Button
            type="button"
            disabled={isReadOnly}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span>Add client</span>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className="inline-flex rounded-md bg-[#F3F1EC] p-1"
              role="tablist"
              aria-label="Filter clients by status"
            >
              {(
                [
                  { id: ClientStatus.ACTIVE, label: 'Active' },
                  { id: ClientStatus.ARCHIVED, label: 'Archived' },
                  { id: 'ALL', label: 'All' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={
                    statusFilter === tab.id
                      ? 'rounded bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] shadow-xs'
                      : 'rounded px-3 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, company, email, or code..."
                className="pl-9"
                aria-label="Search clients"
              />
            </div>
          </div>

          {clientsQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            </div>
          ) : clientsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {clientsQuery.error instanceof ApiClientError
                  ? clientsQuery.error.message
                  : 'Unable to load clients.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clientsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : clientsList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Client</th>
                    <th className="py-2.5 pr-4">Entity &amp; Region</th>
                    <th className="py-2.5 pr-4">Primary Contact</th>
                    <th className="py-2.5 pr-4">Assignee</th>
                    <th className="py-2.5 pr-4">Open Requests</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientsList.map((client) => (
                    <tr
                      key={client.id}
                      className="border-b border-[#F3F1EC] last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/app/clients/${client.id}`}
                          className="font-medium text-[#0F172A] hover:text-[#0F766E] hover:underline"
                        >
                          {client.name}
                        </Link>
                        {client.companyName &&
                          client.companyName !== client.name && (
                            <p className="mt-0.5 text-xs text-[#475569]">
                              {client.companyName}
                            </p>
                          )}
                        {client.referenceCode && (
                          <p className="mt-0.5 font-mono-tabular text-xs text-[#64748B]">
                            {client.referenceCode}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#475569]">
                        {ENTITY_TYPE_LABELS[client.entityType]} ·{' '}
                        {client.country}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {client.primaryContactName ? (
                          <div>
                            <p className="font-medium text-[#0F172A]">
                              {client.primaryContactName}
                            </p>
                            <p className="text-[#64748B]">
                              {client.primaryContactEmail}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[#94A3B8]">
                            No active contact ({client.contactsCount})
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#475569]">
                        {client.assignedUserName || 'Unassigned'}
                      </td>
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-[#0F172A] tabular-nums">
                        {client.openRequestsCount}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        <span className={clientStatusClass(client.status)}>
                          {client.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            href={`/app/clients/${client.id}`}
                            className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-[#0F766E] hover:bg-[#F3F1EC]"
                          >
                            View
                          </Link>
                          {!isReadOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingClient(client)}
                              aria-label={`Edit ${client.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </Button>
                          )}
                          {canManageClients && !isReadOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setStatusTarget({
                                  client,
                                  action:
                                    client.status === ClientStatus.ACTIVE
                                      ? 'archive'
                                      : 'restore',
                                })
                              }
                            >
                              {client.status === ClientStatus.ACTIVE ? (
                                <>
                                  <Archive className="h-3.5 w-3.5" />
                                  <span>Archive</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Restore</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center">
              <FolderKanban className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">
                No clients match this view
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                {search.trim()
                  ? 'Clear your search filter or add a new client entity.'
                  : 'Create your first client to start organizing contacts and document requests.'}
              </p>
              {canManageClients && !isReadOnly && (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add client</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add client"
        description="Register a client entity and optional primary contact."
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit((vals) => createMutation.mutate(vals))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="client-name">Client / Entity name</Label>
              <Input
                id="client-name"
                placeholder="Oakridge Holdings Ltd"
                {...register('name')}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="client-company">Company / Trading name</Label>
              <Input
                id="client-company"
                placeholder="Oakridge Group"
                {...register('companyName')}
              />
            </div>

            <div>
              <Label htmlFor="client-email">Client email (optional)</Label>
              <Input
                id="client-email"
                type="email"
                placeholder="accounts@oakridge.co.uk"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="client-phone">Client phone (optional)</Label>
              <Input
                id="client-phone"
                placeholder="+44 20 7946 0920"
                {...register('phone')}
              />
            </div>

            <div>
              <Label htmlFor="client-ref">Reference code (optional)</Label>
              <Input
                id="client-ref"
                placeholder="OAK-001"
                {...register('referenceCode')}
              />
              {errors.referenceCode && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.referenceCode.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="client-country">Jurisdiction</Label>
              <Select id="client-country" {...register('country')}>
                {Object.values(OrganizationCountry).map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="client-entity-type">Entity type</Label>
              <Select id="client-entity-type" {...register('entityType')}>
                {Object.values(ClientEntityType).map((type) => (
                  <option key={type} value={type}>
                    {ENTITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="client-assignee">Assigned accountant</Label>
              <Select id="client-assignee" {...register('assignedUserId')}>
                <option value="">Unassigned</option>
                {(rosterQuery.data?.members ?? []).map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName} ({member.role})
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="client-address">Registered address (optional)</Label>
              <Input
                id="client-address"
                placeholder="42 Bishopsgate, London EC2N 4AH"
                {...register('address')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="client-notes">Internal notes (optional)</Label>
            <Textarea
              id="client-notes"
              rows={2}
              placeholder="Fiscal year end, VAT scheme, or accounting software notes..."
              {...register('notes')}
            />
          </div>

          <div className="border-t border-[#E2E0D8] pt-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
              <input
                type="checkbox"
                checked={includePrimaryContact}
                onChange={(e) => setIncludePrimaryContact(e.target.checked)}
                className="h-4 w-4 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
              />
              <span>Add primary contact immediately</span>
            </label>

            {includePrimaryContact && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="contact-name">Contact full name</Label>
                  <Input
                    id="contact-name"
                    placeholder="Claire Bennett"
                    {...register('primaryContact.fullName')}
                  />
                  {errors.primaryContact?.fullName && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {errors.primaryContact.fullName.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="contact-email">Contact email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="claire@oakridge.co.uk"
                    {...register('primaryContact.email')}
                  />
                  {errors.primaryContact?.email && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {errors.primaryContact.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="contact-role">Role / Title</Label>
                  <Input
                    id="contact-role"
                    placeholder="Finance Director"
                    {...register('primaryContact.roleTitle')}
                  />
                </div>

                <div>
                  <Label htmlFor="contact-phone">Phone (optional)</Label>
                  <Input
                    id="contact-phone"
                    placeholder="+44 20 7946 0921"
                    {...register('primaryContact.phone')}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create client'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(editingClient)}
        onClose={() => setEditingClient(null)}
        title="Edit client"
        description="Update client entity profile details."
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={editForm.handleSubmit((vals) => updateMutation.mutate(vals))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="modal-edit-name">Client / Entity name</Label>
              <Input id="modal-edit-name" {...editForm.register('name')} />
              {editForm.formState.errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {editForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="modal-edit-company">Company / Trading name</Label>
              <Input
                id="modal-edit-company"
                {...editForm.register('companyName')}
              />
            </div>

            <div>
              <Label htmlFor="modal-edit-email">Client email</Label>
              <Input
                id="modal-edit-email"
                type="email"
                {...editForm.register('email')}
              />
              {editForm.formState.errors.email && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {editForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="modal-edit-phone">Client phone</Label>
              <Input id="modal-edit-phone" {...editForm.register('phone')} />
            </div>

            <div>
              <Label htmlFor="modal-edit-ref">Reference code</Label>
              <Input
                id="modal-edit-ref"
                {...editForm.register('referenceCode')}
              />
            </div>

            <div>
              <Label htmlFor="modal-edit-country">Jurisdiction</Label>
              <Select id="modal-edit-country" {...editForm.register('country')}>
                {Object.values(OrganizationCountry).map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="modal-edit-entity">Entity type</Label>
              <Select
                id="modal-edit-entity"
                {...editForm.register('entityType')}
              >
                {Object.values(ClientEntityType).map((type) => (
                  <option key={type} value={type}>
                    {ENTITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            {canManageClients && (
              <div>
                <Label htmlFor="modal-edit-assignee">Assigned accountant</Label>
                <Select
                  id="modal-edit-assignee"
                  {...editForm.register('assignedUserId')}
                >
                  <option value="">Unassigned</option>
                  {(rosterQuery.data?.members ?? []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.fullName} ({member.role})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="sm:col-span-2">
              <Label htmlFor="modal-edit-address">Registered address</Label>
              <Input
                id="modal-edit-address"
                {...editForm.register('address')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="modal-edit-notes">Internal notes</Label>
            <Textarea
              id="modal-edit-notes"
              rows={3}
              {...editForm.register('notes')}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingClient(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={
          statusTarget?.action === 'archive'
            ? `Archive ${statusTarget.client.name}`
            : `Restore ${statusTarget?.client.name ?? 'client'}`
        }
        description={
          statusTarget?.action === 'archive'
            ? 'Archiving removes this client from your default active directory and blocks new document requests. All existing requests, contacts, uploaded documents, portal history, and audit logs remain preserved.'
            : 'Restoring returns this client to the active directory and enables creating new document requests if within your plan quota.'
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatusTarget(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={
              statusTarget?.action === 'archive' ? 'destructive' : 'default'
            }
            disabled={archiveRestoreMutation.isPending}
            onClick={() => {
              if (!statusTarget) return;
              archiveRestoreMutation.mutate({
                clientId: statusTarget.client.id,
                action: statusTarget.action,
              });
            }}
          >
            {archiveRestoreMutation.isPending
              ? 'Updating...'
              : statusTarget?.action === 'archive'
                ? 'Confirm archive'
                : 'Confirm restore'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
