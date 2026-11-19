'use client';

import {
  AuthMeResponse,
  ClientStatus,
  ClientSummary,
  CreateDocumentRequestInput,
  CreateDocumentRequestSchema,
  DocumentRequestDetail,
  DocumentRequestSummary,
  EmailStatus,
  RequestStatus,
  TemplateDetail,
  TemplateSummary,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  FileCheck2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
  REQUEST_STATUS_LABELS,
  requestStatusClass,
  toDateInputValue,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

type StatusFilter = 'ALL' | RequestStatus;

function RequestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const initialClientFilter = searchParams.get('clientId') ?? '';
  const newForClientId = searchParams.get('newForClient') ?? '';

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL');
  const [clientFilter, setClientFilter] = React.useState(initialClientFilter);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(Boolean(newForClientId));
  const [selectedTemplateId, setSelectedTemplateId] = React.useState('');
  const [submitMode, setSubmitMode] = React.useState<'draft' | 'send'>('draft');
  const submitModeRef = React.useRef<'draft' | 'send'>('draft');

  const [cancelTarget, setCancelTarget] =
    React.useState<DocumentRequestSummary | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [reopenTarget, setReopenTarget] =
    React.useState<DocumentRequestSummary | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<DocumentRequestSummary | null>(null);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);
  const canDeleteRequests =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;

  const clientsQuery = useQuery({
    queryKey: ['clients', 'active-for-requests'],
    queryFn: () =>
      apiRequest<ClientSummary[]>(`/clients?status=${ClientStatus.ACTIVE}`),
  });

  const templatesQuery = useQuery({
    queryKey: ['templates', 'for-requests'],
    queryFn: () => apiRequest<TemplateSummary[]>('/templates'),
    enabled: createOpen,
  });

  const templateDetailQuery = useQuery({
    queryKey: ['templates', selectedTemplateId],
    queryFn: () =>
      apiRequest<TemplateDetail>(`/templates/${selectedTemplateId}`),
    enabled: Boolean(selectedTemplateId) && createOpen,
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', statusFilter, clientFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (clientFilter) {
        params.set('clientId', clientFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const qs = params.toString();
      return apiRequest<DocumentRequestSummary[]>(
        `/requests${qs ? `?${qs}` : ''}`,
      );
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateDocumentRequestInput>({
    resolver: zodResolver(CreateDocumentRequestSchema),
    defaultValues: {
      clientId: newForClientId || '',
      templateId: '',
      title: '',
      instructions: '',
      dueAt: toDateInputValue(14),
      items: [
        {
          title: 'Primary business bank statement',
          description: '',
          isRequired: true,
        },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'items',
  });

  React.useEffect(() => {
    if (newForClientId) {
      setValue('clientId', newForClientId);
      setCreateOpen(true);
    }
  }, [newForClientId, setValue]);

  React.useEffect(() => {
    if (templateDetailQuery.data) {
      replace(
        templateDetailQuery.data.items.map((item) => ({
          title: item.title,
          description: item.description ?? '',
          isRequired: item.isRequired,
        })),
      );
    }
  }, [templateDetailQuery.data, replace]);

  const createMutation = useMutation({
    mutationFn: async ({
      values,
      mode,
    }: {
      values: CreateDocumentRequestInput;
      mode: 'draft' | 'send';
    }) => {
      const isoDue = values.dueAt.includes('T')
        ? values.dueAt
        : `${values.dueAt}T23:59:59.000Z`;
      const created = await apiRequest<DocumentRequestDetail>('/requests', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          templateId: values.templateId || null,
          dueAt: isoDue,
        }),
      });

      if (mode === 'send') {
        try {
          const sent = await apiRequest<DocumentRequestDetail>(
            `/requests/${created.id}/send`,
            { method: 'POST' },
          );
          return { detail: sent, mode: 'send' as const, sendError: null };
        } catch (err) {
          return {
            detail: created,
            mode: 'draft_fallback' as const,
            sendError:
              err instanceof ApiClientError
                ? err.message
                : 'Created draft, but could not send automatically.',
          };
        }
      }

      return { detail: created, mode: 'draft' as const, sendError: null };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      reset();
      setSelectedTemplateId('');
      setCreateOpen(false);

      if (result.mode === 'draft') {
        notify({ variant: 'success', title: 'Document request draft created' });
      } else if (result.mode === 'draft_fallback') {
        notify({
          variant: 'error',
          title: 'Draft saved, but request could not be sent',
          description: result.sendError ?? undefined,
        });
      } else if (result.detail.emailDelivery?.status === EmailStatus.SENT) {
        notify({
          variant: 'success',
          title: 'Document request created and sent',
          description: `Email accepted by Resend for ${result.detail.recipientEmail ?? 'primary contact'}.`,
        });
      } else {
        notify({
          variant: 'error',
          title: 'Request sent, but email failed to deliver',
          description:
            result.detail.emailDelivery?.errorMessage ||
            'Check Resend settings on the request detail page.',
        });
      }

      router.push(`/app/requests/${result.detail.id}`);
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not create request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<DocumentRequestDetail>(`/requests/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      }),
    onSuccess: () => {
      setCancelTarget(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      notify({ variant: 'success', title: 'Document request cancelled' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not cancel request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<DocumentRequestDetail>(`/requests/${id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ issuePortalLink: false, sendEmail: false }),
      }),
    onSuccess: (updated) => {
      setReopenTarget(null);
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      notify({
        variant: 'success',
        title: 'Document request reopened',
        description: `Restored to ${REQUEST_STATUS_LABELS[updated.status]}. Issue a fresh portal link if the client needs to upload again.`,
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not reopen request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      notify({ variant: 'success', title: 'Draft request deleted' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Cannot delete request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const statusTabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'ALL', label: 'All' },
    { id: RequestStatus.DRAFT, label: 'Draft' },
    { id: RequestStatus.SENT, label: 'Sent' },
    { id: RequestStatus.IN_PROGRESS, label: 'In Progress' },
    { id: RequestStatus.OVERDUE, label: 'Overdue' },
    { id: RequestStatus.COMPLETED, label: 'Completed' },
    { id: RequestStatus.CANCELLED, label: 'Cancelled' },
  ];

  const requestsList = Array.isArray(requestsQuery.data)
    ? requestsQuery.data
    : [];
  const activeClients = Array.isArray(clientsQuery.data)
    ? clientsQuery.data
    : [];
  const templatesList = Array.isArray(templatesQuery.data)
    ? templatesQuery.data
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Document Requests
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Prepare document checklists, send collection requests, and track due
            dates.
          </p>
        </div>

        <Button
          type="button"
          disabled={isReadOnly}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          <span>New request</span>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className="inline-flex flex-wrap rounded-md bg-[#F3F1EC] p-1"
              role="tablist"
              aria-label="Filter document requests by status"
            >
              {statusTabs.map((tab) => (
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

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Select
                aria-label="Filter by client"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full sm:w-48 h-10 text-xs"
              >
                <option value="">All clients</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>

              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or client..."
                  className="pl-9"
                  aria-label="Search requests"
                />
              </div>
            </div>
          </div>

          {requestsQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            </div>
          ) : requestsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {requestsQuery.error instanceof ApiClientError
                  ? requestsQuery.error.message
                  : 'Unable to load document requests.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => requestsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : requestsList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Request Title</th>
                    <th className="py-2.5 pr-4">Client</th>
                    <th className="py-2.5 pr-4">Checklist Progress</th>
                    <th className="py-2.5 pr-4">Due Date</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsList.map((req) => {
                    const isTerminal =
                      req.status === RequestStatus.COMPLETED ||
                      req.status === RequestStatus.CANCELLED;
                    return (
                      <tr
                        key={req.id}
                        className="border-b border-[#F3F1EC] last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <Link
                            href={`/app/requests/${req.id}`}
                            className="font-medium text-[#0F172A] hover:text-[#0F766E] hover:underline"
                          >
                            {req.title}
                          </Link>
                          {req.periodKey && (
                            <p className="mt-0.5 font-mono-tabular text-xs text-[#64748B]">
                              Recurring period: {req.periodKey}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#475569]">
                          <Link
                            href={`/app/clients/${req.clientId}`}
                            className="hover:text-[#0F172A] hover:underline"
                          >
                            {req.clientName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 font-mono-tabular text-xs text-[#0F172A] tabular-nums">
                          {req.completedItemsCount} / {req.totalItemsCount} items
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                          {formatShortDate(req.dueAt)}
                        </td>
                        <td className="py-3 pr-4 text-xs whitespace-nowrap">
                          <span
                            className={requestStatusClass(
                              req.status,
                              req.isOverdue,
                            )}
                          >
                            {req.isOverdue
                              ? 'Overdue'
                              : REQUEST_STATUS_LABELS[req.status]}
                          </span>
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              href={`/app/requests/${req.id}`}
                              className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-[#0F766E] hover:bg-[#F3F1EC]"
                            >
                              View
                            </Link>
                            {!isReadOnly && !isTerminal && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCancelReason('');
                                  setCancelTarget(req);
                                }}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Cancel</span>
                              </Button>
                            )}
                            {!isReadOnly &&
                              req.status === RequestStatus.CANCELLED && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setReopenTarget(req)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Reopen</span>
                                </Button>
                              )}
                            {!isReadOnly &&
                              canDeleteRequests &&
                              req.status === RequestStatus.DRAFT &&
                              !req.sentAt && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteTarget(req)}
                                  className="text-[#DC2626] hover:bg-[#FEF2F2]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Delete</span>
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center">
              <FileCheck2 className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">
                No document requests found
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Create a draft request from a checklist template or custom
                items.
              </p>
              {!isReadOnly && (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>New request</span>
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
        title="New document request"
        description="Save a draft checklist to customize later, or create and send the portal invitation immediately."
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit((vals) =>
            createMutation.mutate({
              values: vals,
              mode: submitModeRef.current,
            }),
          )}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="req-client">Client</Label>
              <Select id="req-client" {...register('clientId')}>
                <option value="">Select active client...</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              {errors.clientId && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.clientId.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="req-template">Template (optional)</Label>
              <Select
                id="req-template"
                {...register('templateId')}
                onChange={(e) => {
                  const id = e.target.value;
                  setValue('templateId', id);
                  setSelectedTemplateId(id);
                }}
              >
                <option value="">Custom checklist (no template)</option>
                {templatesList.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.itemsCount})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="req-title">Request title</Label>
              <Input
                id="req-title"
                placeholder="October 2025 Bookkeeping Close"
                {...register('title')}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="req-due">Due date</Label>
              <Input id="req-due" type="date" {...register('dueAt')} />
              {errors.dueAt && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.dueAt.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="req-instructions">Client instructions (optional)</Label>
            <Textarea
              id="req-instructions"
              rows={2}
              placeholder="Upload PDF statements or CSV exports covering the full period."
              {...register('instructions')}
            />
          </div>

          <div className="border-t border-[#E2E0D8] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">
                Checklist items ({fields.length})
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ title: '', description: '', isRequired: true })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add item</span>
              </Button>
            </div>

            {errors.items?.root && (
              <p className="text-xs text-[#DC2626]">
                {errors.items.root.message}
              </p>
            )}

            <div className="space-y-2.5">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="rounded-md border border-[#E2E0D8] bg-[#FAF9F6] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder={`Requested document #${idx + 1}`}
                        {...register(`items.${idx}.title`)}
                      />
                      {errors.items?.[idx]?.title && (
                        <p className="mt-1 text-xs text-[#DC2626]">
                          {errors.items[idx]?.title?.message}
                        </p>
                      )}
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(idx)}
                        aria-label={`Remove item ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[#DC2626]" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Guidance (optional)"
                    {...register(`items.${idx}.description`)}
                  />
                  <label className="flex items-center gap-2 text-xs text-[#475569]">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
                      {...register(`items.${idx}.isRequired`)}
                    />
                    <span>Required document</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => {
                submitModeRef.current = 'draft';
                setSubmitMode('draft');
              }}
            >
              {createMutation.isPending && submitMode === 'draft'
                ? 'Saving...'
                : 'Create draft request'}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              onClick={() => {
                submitModeRef.current = 'send';
                setSubmitMode('send');
              }}
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {createMutation.isPending && submitMode === 'send'
                  ? 'Sending...'
                  : 'Create & send request'}
              </span>
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel "${cancelTarget?.title ?? 'request'}"`}
        description="Cancelling revokes active portal access, blocks further client uploads, and preserves uploaded files and audit logs."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="list-cancel-reason">
              Cancellation reason (optional)
            </Label>
            <Textarea
              id="list-cancel-reason"
              rows={2}
              placeholder="Superseded by updated engagement scope..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
            >
              Keep request
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancelMutation.mutate({
                  id: cancelTarget.id,
                  reason: cancelReason,
                });
              }}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm cancel'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(reopenTarget)}
        onClose={() => setReopenTarget(null)}
        title={`Reopen "${reopenTarget?.title ?? 'request'}"`}
        description="Reopening restores this request from CANCELLED status while keeping previously revoked portal links disabled. You can issue a fresh portal link from the request detail page."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReopenTarget(null)}
          >
            Keep cancelled
          </Button>
          <Button
            type="button"
            disabled={reopenMutation.isPending}
            onClick={() => {
              if (!reopenTarget) return;
              reopenMutation.mutate(reopenTarget.id);
            }}
          >
            {reopenMutation.isPending ? 'Reopening...' : 'Confirm reopen'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Permanently delete "${deleteTarget?.title ?? 'draft'}"`}
        description="Permanent deletion is allowed only for unused drafts with zero uploaded files, portal links, or email history."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTarget(null)}
          >
            Keep draft
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              deleteMutation.mutate(deleteTarget.id);
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-52 rounded bg-[#F3F1EC] animate-pulse" />
          <div className="h-64 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
        </div>
      }
    >
      <RequestsContent />
    </React.Suspense>
  );
}
