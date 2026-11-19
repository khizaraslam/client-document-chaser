'use client';

import {
  AuditEventItem,
  AuthMeResponse,
  ClientContactItem,
  ClientDetail,
  ClientEntityType,
  ClientStatus,
  ClientUploadedFileSummary,
  CreateClientContactInput,
  CreateClientContactSchema,
  DocumentRequestSummary,
  FileScanStatus,
  OrganizationCountry,
  RecurrenceSummary,
  SignedDownloadResponse,
  TeamRosterResponse,
  UpdateClientInput,
  UpdateClientSchema,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Archive,
  ArrowLeft,
  Download,
  FileText,
  Mail,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  FILE_SCAN_STATUS_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
  REQUEST_STATUS_LABELS,
  clientStatusClass,
  fileScanStatusClass,
  formatAuditAction,
  formatFileSize,
  recurrenceStatusClass,
  requestStatusClass,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [contactDialogOpen, setContactDialogOpen] = React.useState(false);
  const [editingContact, setEditingContact] =
    React.useState<ClientContactItem | null>(null);
  const [confirmArchiveAction, setConfirmArchiveAction] = React.useState<
    'archive' | 'restore' | null
  >(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [contactToDeactivate, setContactToDeactivate] =
    React.useState<ClientContactItem | null>(null);
  const [contactToDelete, setContactToDelete] =
    React.useState<ClientContactItem | null>(null);
  const [downloadingFileId, setDownloadingFileId] = React.useState<string | null>(
    null,
  );

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const canManageClients =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);

  const clientQuery = useQuery({
    queryKey: ['clients', clientId],
    queryFn: () => apiRequest<ClientDetail>(`/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', 'by-client', clientId],
    queryFn: () =>
      apiRequest<DocumentRequestSummary[]>(`/requests?clientId=${clientId}`),
    enabled: Boolean(clientId),
  });

  const filesQuery = useQuery({
    queryKey: ['clients', clientId, 'files'],
    queryFn: () =>
      apiRequest<ClientUploadedFileSummary[]>(`/clients/${clientId}/files`),
    enabled: Boolean(clientId),
  });

  const recurrencesQuery = useQuery({
    queryKey: ['recurrences', 'by-client', clientId],
    queryFn: () =>
      apiRequest<RecurrenceSummary[]>(`/recurrences?clientId=${clientId}`),
    enabled: Boolean(clientId),
  });

  const activityQuery = useQuery({
    queryKey: ['clients', clientId, 'activity'],
    queryFn: () =>
      apiRequest<AuditEventItem[]>(`/clients/${clientId}/activity`),
    enabled: Boolean(clientId),
  });

  const rosterQuery = useQuery({
    queryKey: ['memberships', 'roster'],
    queryFn: () => apiRequest<TeamRosterResponse>('/memberships'),
    enabled: canManageClients,
  });

  const profileForm = useForm<UpdateClientInput>({
    resolver: zodResolver(UpdateClientSchema),
  });

  React.useEffect(() => {
    if (clientQuery.data) {
      profileForm.reset({
        name: clientQuery.data.name,
        companyName: clientQuery.data.companyName ?? '',
        email: clientQuery.data.email ?? '',
        phone: clientQuery.data.phone ?? '',
        address: clientQuery.data.address ?? '',
        referenceCode: clientQuery.data.referenceCode ?? '',
        entityType: clientQuery.data.entityType,
        country: clientQuery.data.country,
        status: clientQuery.data.status,
        assignedUserId: clientQuery.data.assignedUserId ?? '',
        notes: clientQuery.data.notes ?? '',
      });
    }
  }, [clientQuery.data, profileForm]);

  const contactForm = useForm<CreateClientContactInput>({
    resolver: zodResolver(CreateClientContactSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      roleTitle: '',
      isPrimary: false,
    },
  });

  const openNewContactDialog = () => {
    setEditingContact(null);
    const activeContacts = (clientQuery.data?.contacts ?? []).filter(
      (c) => c.isActive,
    );
    contactForm.reset({
      fullName: '',
      email: '',
      phone: '',
      roleTitle: '',
      isPrimary: activeContacts.length === 0,
    });
    setContactDialogOpen(true);
  };

  const openEditContactDialog = (contact: ClientContactItem) => {
    setEditingContact(contact);
    contactForm.reset({
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone ?? '',
      roleTitle: contact.roleTitle ?? '',
      isPrimary: contact.isPrimary,
    });
    setContactDialogOpen(true);
  };

  const invalidateClientData = () => {
    queryClient.invalidateQueries({ queryKey: ['clients', clientId] });
    queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'activity'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const updateClientMutation = useMutation({
    mutationFn: (values: UpdateClientInput) => {
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
      return apiRequest<ClientDetail>(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      invalidateClientData();
      notify({ variant: 'success', title: 'Client details saved' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to update client',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const archiveRestoreMutation = useMutation({
    mutationFn: (action: 'archive' | 'restore') =>
      apiRequest<ClientDetail>(`/clients/${clientId}/${action}`, {
        method: 'POST',
      }),
    onSuccess: (_, action) => {
      setConfirmArchiveAction(null);
      invalidateClientData();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      notify({
        variant: 'success',
        title:
          action === 'archive'
            ? 'Client archived'
            : 'Client restored to active',
        description:
          action === 'archive'
            ? 'All requests, files, contacts, and audit records remain preserved.'
            : 'Client is active again and ready for document requests.',
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

  const deleteClientMutation = useMutation({
    mutationFn: () => apiRequest(`/clients/${clientId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      notify({ variant: 'success', title: 'Client permanently deleted' });
      router.replace('/app/clients');
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Cannot delete client',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const saveContactMutation = useMutation({
    mutationFn: (values: CreateClientContactInput) => {
      if (editingContact) {
        return apiRequest<ClientContactItem>(
          `/clients/${clientId}/contacts/${editingContact.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(values),
          },
        );
      }
      return apiRequest<ClientContactItem>(`/clients/${clientId}/contacts`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      invalidateClientData();
      setContactDialogOpen(false);
      notify({
        variant: 'success',
        title: editingContact ? 'Contact updated' : 'Contact added',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to save contact',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest(`/clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      }),
    onSuccess: () => {
      invalidateClientData();
      notify({ variant: 'success', title: 'Primary contact updated' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to update primary contact',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deactivateContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest<ClientContactItem>(
        `/clients/${clientId}/contacts/${contactId}/deactivate`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setContactToDeactivate(null);
      invalidateClientData();
      notify({ variant: 'success', title: 'Contact deactivated' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to deactivate contact',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const reactivateContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest<ClientContactItem>(
        `/clients/${clientId}/contacts/${contactId}/reactivate`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      invalidateClientData();
      notify({ variant: 'success', title: 'Contact reactivated' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to reactivate contact',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest(`/clients/${clientId}/contacts/${contactId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setContactToDelete(null);
      invalidateClientData();
      notify({ variant: 'success', title: 'Contact removed' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to remove contact',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const handleDownloadFile = async (fileId: string) => {
    setDownloadingFileId(fileId);
    try {
      const signed = await apiRequest<SignedDownloadResponse>(
        `/files/${fileId}/download-url`,
      );
      const anchor = document.createElement('a');
      anchor.href = signed.downloadUrl;
      anchor.download = signed.fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      notify({
        variant: 'error',
        title: 'Could not download file',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (clientQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-[#F3F1EC] animate-pulse" />
        <div className="h-64 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
      </div>
    );
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/clients"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to clients</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <span>
            {clientQuery.error instanceof ApiClientError
              ? clientQuery.error.message
              : 'Unable to load client record.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clientQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const client = clientQuery.data;
  const requests = Array.isArray(requestsQuery.data) ? requestsQuery.data : [];
  const files = Array.isArray(filesQuery.data) ? filesQuery.data : [];
  const recurrences = Array.isArray(recurrencesQuery.data)
    ? recurrencesQuery.data
    : [];
  const activityEvents = Array.isArray(activityQuery.data)
    ? activityQuery.data
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/clients"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to clients</span>
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-[#0F172A]">
            {client.name}
          </h1>
          <p className="mt-1 text-xs text-[#475569]">
            <span className={clientStatusClass(client.status)}>
              {client.status}
            </span>
            {' · '}
            {ENTITY_TYPE_LABELS[client.entityType]}
            {' · '}
            {COUNTRY_LABELS[client.country]}
            {client.companyName && client.companyName !== client.name && (
              <>
                {' · '}
                <span>{client.companyName}</span>
              </>
            )}
            {client.referenceCode && (
              <>
                {' · '}
                <span className="font-mono-tabular">{client.referenceCode}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {client.status === ClientStatus.ACTIVE && (
            <Link
              href={`/app/requests?newForClient=${client.id}`}
              className="inline-flex h-9 items-center rounded-md bg-[#0F766E] px-3.5 text-xs font-medium text-white hover:bg-[#0D9488] whitespace-nowrap"
            >
              New document request
            </Link>
          )}
          {canManageClients && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isReadOnly || archiveRestoreMutation.isPending}
                onClick={() =>
                  setConfirmArchiveAction(
                    client.status === ClientStatus.ACTIVE
                      ? 'archive'
                      : 'restore',
                  )
                }
              >
                {client.status === ClientStatus.ACTIVE ? (
                  <>
                    <Archive className="h-3.5 w-3.5" />
                    <span>Archive client</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore client</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isReadOnly}
                onClick={() => setConfirmDeleteOpen(true)}
                className="text-[#DC2626] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {client.status === ClientStatus.ARCHIVED && (
        <div className="rounded-md border border-[#E2E0D8] bg-[#F3F1EC] px-4 py-3 text-xs text-[#475569]">
          This client is <strong>ARCHIVED</strong>. New document requests are
          blocked while existing requests, uploaded files, contacts, and audit
          records remain preserved.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Client Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={profileForm.handleSubmit((vals) =>
                updateClientMutation.mutate(vals),
              )}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-client-name">Client name</Label>
                  <Input
                    id="edit-client-name"
                    disabled={isReadOnly}
                    {...profileForm.register('name')}
                  />
                  {profileForm.formState.errors.name && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {profileForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-client-company">Company name</Label>
                  <Input
                    id="edit-client-company"
                    disabled={isReadOnly}
                    {...profileForm.register('companyName')}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-client-email">Client email</Label>
                  <Input
                    id="edit-client-email"
                    type="email"
                    disabled={isReadOnly}
                    {...profileForm.register('email')}
                  />
                  {profileForm.formState.errors.email && (
                    <p className="mt-1 text-xs text-[#DC2626]">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-client-phone">Client phone</Label>
                  <Input
                    id="edit-client-phone"
                    disabled={isReadOnly}
                    {...profileForm.register('phone')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-client-address">Registered address</Label>
                <Input
                  id="edit-client-address"
                  disabled={isReadOnly}
                  {...profileForm.register('address')}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-client-ref">Reference code</Label>
                  <Input
                    id="edit-client-ref"
                    disabled={isReadOnly}
                    {...profileForm.register('referenceCode')}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-client-country">Jurisdiction</Label>
                  <Select
                    id="edit-client-country"
                    disabled={isReadOnly}
                    {...profileForm.register('country')}
                  >
                    {Object.values(OrganizationCountry).map((c) => (
                      <option key={c} value={c}>
                        {COUNTRY_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-client-entity">Entity type</Label>
                  <Select
                    id="edit-client-entity"
                    disabled={isReadOnly}
                    {...profileForm.register('entityType')}
                  >
                    {Object.values(ClientEntityType).map((type) => (
                      <option key={type} value={type}>
                        {ENTITY_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-client-assignee">
                    Assigned accountant
                  </Label>
                  {canManageClients ? (
                    <Select
                      id="edit-client-assignee"
                      disabled={isReadOnly}
                      {...profileForm.register('assignedUserId')}
                    >
                      <option value="">Unassigned</option>
                      {(rosterQuery.data?.members ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.fullName}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id="edit-client-assignee"
                      disabled
                      value={client.assignedUserName || 'Unassigned'}
                    />
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="edit-client-notes">Internal notes</Label>
                <Textarea
                  id="edit-client-notes"
                  rows={3}
                  disabled={isReadOnly}
                  {...profileForm.register('notes')}
                />
              </div>

              <Button
                type="submit"
                disabled={isReadOnly || updateClientMutation.isPending}
              >
                {updateClientMutation.isPending ? 'Saving...' : 'Save profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                Client Contacts ({client.contactsCount} active)
              </CardTitle>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Only one active primary contact receives document request emails.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isReadOnly}
              onClick={openNewContactDialog}
            >
              <Plus className="h-4 w-4" />
              <span>Add contact</span>
            </Button>
          </CardHeader>
          <CardContent>
            {client.contacts.length === 0 ? (
              <div className="py-8 text-center">
                <Mail className="mx-auto h-7 w-7 text-[#94A3B8]" />
                <p className="mt-2 text-sm font-medium text-[#0F172A]">
                  No contacts added yet
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Add at least one client recipient before sending document
                  requests.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                      <th className="py-2 pr-4">Recipient</th>
                      <th className="py-2 pr-4">Role / Phone</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.contacts.map((contact) => (
                      <tr
                        key={contact.id}
                        className={`border-b border-[#F3F1EC] last:border-0 ${
                          !contact.isActive ? 'opacity-65' : ''
                        }`}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[#0F172A]">
                              {contact.fullName}
                            </span>
                            {contact.isPrimary && contact.isActive && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E]">
                                <UserCheck className="h-3.5 w-3.5" />
                                Primary
                              </span>
                            )}
                            {!contact.isActive && (
                              <span className="text-xs font-medium text-[#64748B]">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#64748B]">
                            {contact.email}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#475569]">
                          <span>{contact.roleTitle || '—'}</span>
                          {contact.phone && (
                            <span className="block font-mono-tabular text-[#64748B]">
                              {contact.phone}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            {contact.isActive && !contact.isPrimary && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={
                                  isReadOnly || setPrimaryMutation.isPending
                                }
                                onClick={() =>
                                  setPrimaryMutation.mutate(contact.id)
                                }
                                title="Set as primary contact"
                              >
                                <Star className="h-3.5 w-3.5" />
                                <span>Set primary</span>
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isReadOnly}
                              onClick={() => openEditContactDialog(contact)}
                            >
                              Edit
                            </Button>
                            {contact.isActive ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isReadOnly}
                                onClick={() => setContactToDeactivate(contact)}
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                <span>Deactivate</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={
                                  isReadOnly ||
                                  reactivateContactMutation.isPending
                                }
                                onClick={() =>
                                  reactivateContactMutation.mutate(contact.id)
                                }
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                <span>Reactivate</span>
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isReadOnly}
                              onClick={() => setContactToDelete(contact)}
                              className="text-[#DC2626] hover:bg-[#FEF2F2]"
                            >
                              Remove
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Document Requests ({requests.length})</CardTitle>
            <Link
              href={`/app/requests?clientId=${client.id}`}
              className="text-xs font-medium text-[#0F766E] hover:underline"
            >
              Open in requests
            </Link>
          </CardHeader>
          <CardContent>
            {requestsQuery.isLoading ? (
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            ) : requestsQuery.isError ? (
              <p className="text-xs text-[#991B1B]">
                Unable to load client requests.
              </p>
            ) : requests.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-4 border-b border-[#F3F1EC] pb-2.5 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/app/requests/${req.id}`}
                        className="block truncate text-sm font-medium text-[#0F172A] hover:text-[#0F766E] hover:underline"
                      >
                        {req.title}
                      </Link>
                      <p className="text-xs text-[#64748B] tabular-nums">
                        Due {formatShortDate(req.dueAt)} ·{' '}
                        {req.completedItemsCount}/{req.totalItemsCount} items
                      </p>
                    </div>
                    <span
                      className={`text-xs whitespace-nowrap ${requestStatusClass(req.status, req.isOverdue)}`}
                    >
                      {req.isOverdue
                        ? 'Overdue'
                        : REQUEST_STATUS_LABELS[req.status]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#475569]">
                No document requests created for this client yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#0F766E]" />
              <span>Uploaded Documents ({files.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filesQuery.isLoading ? (
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            ) : filesQuery.isError ? (
              <p className="text-xs text-[#991B1B]">
                Unable to load uploaded documents.
              </p>
            ) : files.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-3 border-b border-[#F3F1EC] pb-2.5 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0F172A]">
                        {file.originalFilename}
                      </p>
                      <p className="text-xs text-[#64748B] truncate">
                        <Link
                          href={`/app/requests/${file.requestId}`}
                          className="text-[#0F766E] hover:underline"
                        >
                          {file.requestTitle}
                        </Link>
                        {' · '}
                        {file.requestItemTitle}
                      </p>
                      <p className="text-xs text-[#64748B] tabular-nums">
                        {formatFileSize(file.sizeBytes)}
                        {' · '}
                        <span className={fileScanStatusClass(file.scanStatus)}>
                          {FILE_SCAN_STATUS_LABELS[file.scanStatus]}
                        </span>
                        {file.uploadedAt && (
                          <> · {formatShortDate(file.uploadedAt)}</>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        file.scanStatus !== FileScanStatus.CLEAN ||
                        downloadingFileId === file.id
                      }
                      onClick={() => handleDownloadFile(file.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>
                        {downloadingFileId === file.id
                          ? 'Loading...'
                          : 'Download'}
                      </span>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#475569]">
                No documents uploaded for this client yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Recurring Schedules ({recurrences.length})</CardTitle>
            <Link
              href={`/app/schedules?clientId=${client.id}`}
              className="text-xs font-medium text-[#0F766E] hover:underline"
            >
              Manage schedules
            </Link>
          </CardHeader>
          <CardContent>
            {recurrencesQuery.isLoading ? (
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            ) : recurrencesQuery.isError ? (
              <p className="text-xs text-[#991B1B]">
                Unable to load client schedules.
              </p>
            ) : recurrences.length > 0 ? (
              <div className="space-y-3">
                {recurrences.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-4 border-b border-[#F3F1EC] pb-2.5 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0F172A]">
                        {rec.titleTemplate}
                      </p>
                      <p className="text-xs text-[#64748B] tabular-nums">
                        {RECURRENCE_FREQUENCY_LABELS[rec.frequency]} · Next run{' '}
                        {formatShortDate(rec.nextRunAt)}
                      </p>
                    </div>
                    <span
                      className={`text-xs whitespace-nowrap ${recurrenceStatusClass(rec.status)}`}
                    >
                      {rec.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#475569]">
                No recurring schedules configured for this client.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#0F766E]" />
              <span>Client Activity &amp; Audit History</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityQuery.isLoading ? (
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            ) : activityQuery.isError ? (
              <p className="text-xs text-[#991B1B]">
                Unable to load client activity history.
              </p>
            ) : activityEvents.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {activityEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start justify-between gap-4 border-b border-[#F3F1EC] pb-2.5 last:border-0 last:pb-0 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F172A]">
                        {formatAuditAction(evt.action)}
                      </p>
                      <p className="mt-0.5 text-[#64748B]">
                        Actor: {evt.actorType}
                        {typeof evt.metadata?.['email'] === 'string' &&
                          ` · ${evt.metadata['email']}`}
                        {typeof evt.metadata?.['reason'] === 'string' &&
                          ` · Reason: ${evt.metadata['reason']}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[#64748B] tabular-nums">
                      {formatShortDate(evt.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#475569]">
                No activity recorded for this client yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        title={editingContact ? 'Edit client contact' : 'Add client contact'}
        description="Contacts receive document upload invitations and reminders."
      >
        <form
          onSubmit={contactForm.handleSubmit((vals) =>
            saveContactMutation.mutate(vals),
          )}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="c-fullName">Full name</Label>
            <Input
              id="c-fullName"
              placeholder="Claire Bennett"
              {...contactForm.register('fullName')}
            />
            {contactForm.formState.errors.fullName && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {contactForm.formState.errors.fullName.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="c-email">Email address</Label>
            <Input
              id="c-email"
              type="email"
              placeholder="claire@oakridge.co.uk"
              {...contactForm.register('email')}
            />
            {contactForm.formState.errors.email && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {contactForm.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-roleTitle">Role / Title</Label>
              <Input
                id="c-roleTitle"
                placeholder="Managing Director"
                {...contactForm.register('roleTitle')}
              />
            </div>

            <div>
              <Label htmlFor="c-phone">Phone (optional)</Label>
              <Input
                id="c-phone"
                placeholder="+44 20 7946 0921"
                {...contactForm.register('phone')}
              />
            </div>
          </div>

          {(!editingContact || editingContact.isActive) && (
            <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
                {...contactForm.register('isPrimary')}
              />
              <span>Mark as primary contact</span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setContactDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveContactMutation.isPending}>
              {saveContactMutation.isPending ? 'Saving...' : 'Save contact'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(confirmArchiveAction)}
        onClose={() => setConfirmArchiveAction(null)}
        title={
          confirmArchiveAction === 'archive'
            ? 'Archive client'
            : 'Restore client to active'
        }
        description={
          confirmArchiveAction === 'archive'
            ? 'Archiving removes this client from your default active directory and blocks creating new document requests. Existing requests, contacts, uploaded documents, portal history, and audit trails remain intact.'
            : 'Restoring returns this client to the active directory and allows new document requests within your plan quota.'
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmArchiveAction(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={
              confirmArchiveAction === 'archive' ? 'destructive' : 'default'
            }
            disabled={archiveRestoreMutation.isPending}
            onClick={() => {
              if (!confirmArchiveAction) return;
              archiveRestoreMutation.mutate(confirmArchiveAction);
            }}
          >
            {archiveRestoreMutation.isPending
              ? 'Updating...'
              : confirmArchiveAction === 'archive'
                ? 'Confirm archive'
                : 'Confirm restore'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Permanently delete client"
        description="Permanent deletion is only allowed when this client has zero document requests, uploaded files, recurring schedules, portal links, or lifecycle history. If historical records exist, archive the client instead."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmDeleteOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteClientMutation.isPending}
            onClick={() => deleteClientMutation.mutate()}
          >
            {deleteClientMutation.isPending ? 'Deleting...' : 'Confirm delete'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(contactToDeactivate)}
        onClose={() => setContactToDeactivate(null)}
        title="Deactivate client contact"
        description={
          contactToDeactivate?.isPrimary
            ? 'This is the current primary contact. Deactivating them will stop future emails to this address and promote the next active contact (if available).'
            : 'Deactivated contacts remain in client history for audit traceability but will not receive future document request emails.'
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setContactToDeactivate(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deactivateContactMutation.isPending}
            onClick={() => {
              if (!contactToDeactivate) return;
              deactivateContactMutation.mutate(contactToDeactivate.id);
            }}
          >
            {deactivateContactMutation.isPending
              ? 'Deactivating...'
              : 'Confirm deactivate'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(contactToDelete)}
        onClose={() => setContactToDelete(null)}
        title="Remove client contact"
        description="Removing hides this contact from the client roster. If this is the primary contact, another active contact will be promoted automatically."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setContactToDelete(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteContactMutation.isPending}
            onClick={() => {
              if (!contactToDelete) return;
              deleteContactMutation.mutate(contactToDelete.id);
            }}
          >
            {deleteContactMutation.isPending ? 'Removing...' : 'Confirm remove'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
