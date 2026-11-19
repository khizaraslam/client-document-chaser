'use client';

import {
  AuditEventItem,
  AuthMeResponse,
  ClientStatus,
  ClientSummary,
  DocumentRequestDetail,
  EmailStatus,
  FileScanStatus,
  IssuePortalLinkResponse,
  RequestItemInput,
  RequestItemInputSchema,
  RequestItemStatus,
  RequestItemSummary,
  RequestStatus,
  ReviewDecision,
  SignedDownloadResponse,
  UpdateDocumentRequestInput,
  UpdateDocumentRequestSchema,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  XCircle,
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
  EMAIL_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  FILE_SCAN_STATUS_LABELS,
  PORTAL_STATUS_LABELS,
  REQUEST_ITEM_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  clientStatusClass,
  emailStatusClass,
  fileScanStatusClass,
  formatAuditAction,
  formatFileSize,
  portalStatusClass,
  requestItemStatusClass,
  requestStatusClass,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

type PendingIssuedAction =
  | { type: 'meta'; values: UpdateDocumentRequestInput }
  | { type: 'saveItem'; values: RequestItemInput; editingItemId: string | null }
  | { type: 'deleteItem'; item: RequestItemSummary }
  | null;

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] =
    React.useState<RequestItemSummary | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [confirmReopenOpen, setConfirmReopenOpen] = React.useState(false);
  const [reopenDueAt, setReopenDueAt] = React.useState('');
  const [reopenIssueLink, setReopenIssueLink] = React.useState(false);
  const [reopenSendEmail, setReopenSendEmail] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = React.useState(false);
  const [pendingIssuedAction, setPendingIssuedAction] =
    React.useState<PendingIssuedAction>(null);
  const [issuedLinkData, setIssuedLinkData] =
    React.useState<IssuePortalLinkResponse | null>(null);
  const [downloadingFileId, setDownloadingFileId] = React.useState<string | null>(
    null,
  );
  const [rejectingItem, setRejectingItem] =
    React.useState<RequestItemSummary | null>(null);
  const [rejectionNotes, setRejectionNotes] = React.useState('');

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);
  const canDeleteRequests =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;

  const requestQuery = useQuery({
    queryKey: ['requests', requestId],
    queryFn: () => apiRequest<DocumentRequestDetail>(`/requests/${requestId}`),
    enabled: Boolean(requestId),
  });

  const activityQuery = useQuery({
    queryKey: ['requests', requestId, 'activity'],
    queryFn: () =>
      apiRequest<AuditEventItem[]>(`/requests/${requestId}/activity`),
    enabled: Boolean(requestId),
  });

  const activeClientsQuery = useQuery({
    queryKey: ['clients', 'active-for-reassign'],
    queryFn: () =>
      apiRequest<ClientSummary[]>(`/clients?status=${ClientStatus.ACTIVE}`),
    enabled:
      Boolean(requestQuery.data) &&
      requestQuery.data?.status === RequestStatus.DRAFT,
  });

  const metaForm = useForm<UpdateDocumentRequestInput>({
    resolver: zodResolver(UpdateDocumentRequestSchema),
  });

  React.useEffect(() => {
    if (requestQuery.data) {
      metaForm.reset({
        clientId: requestQuery.data.clientId,
        title: requestQuery.data.title,
        instructions: requestQuery.data.instructions ?? '',
        dueAt: requestQuery.data.dueAt.slice(0, 10),
      });
      setReopenDueAt(requestQuery.data.dueAt.slice(0, 10));
    }
  }, [requestQuery.data, metaForm]);

  const itemForm = useForm<RequestItemInput>({
    resolver: zodResolver(RequestItemInputSchema),
    defaultValues: {
      title: '',
      description: '',
      isRequired: true,
    },
  });

  const openAddItem = () => {
    setEditingItem(null);
    itemForm.reset({ title: '', description: '', isRequired: true });
    setItemDialogOpen(true);
  };

  const openEditItem = (item: RequestItemSummary) => {
    setEditingItem(item);
    itemForm.reset({
      title: item.title,
      description: item.description ?? '',
      isRequired: item.isRequired,
    });
    setItemDialogOpen(true);
  };

  const invalidateRequestData = () => {
    queryClient.invalidateQueries({ queryKey: ['requests', requestId] });
    queryClient.invalidateQueries({
      queryKey: ['requests', requestId, 'activity'],
    });
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const updateMetaMutation = useMutation({
    mutationFn: (values: UpdateDocumentRequestInput) => {
      const payload: UpdateDocumentRequestInput = {
        title: values.title,
        instructions: values.instructions,
        dueAt:
          values.dueAt && !values.dueAt.includes('T')
            ? `${values.dueAt}T23:59:59.000Z`
            : values.dueAt,
      };
      if (
        requestQuery.data?.status === RequestStatus.DRAFT &&
        values.clientId &&
        values.clientId !== requestQuery.data.clientId
      ) {
        payload.clientId = values.clientId;
      }
      return apiRequest<DocumentRequestDetail>(`/requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setPendingIssuedAction(null);
      invalidateRequestData();
      notify({ variant: 'success', title: 'Request details updated' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const saveItemMutation = useMutation({
    mutationFn: ({
      values,
      editingItemId,
    }: {
      values: RequestItemInput;
      editingItemId: string | null;
    }) => {
      if (editingItemId) {
        return apiRequest(`/requests/${requestId}/items/${editingItemId}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });
      }
      return apiRequest(`/requests/${requestId}/items`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: (_, vars) => {
      setPendingIssuedAction(null);
      setItemDialogOpen(false);
      invalidateRequestData();
      notify({
        variant: 'success',
        title: vars.editingItemId
          ? 'Checklist item updated'
          : 'Checklist item added',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Failed to save checklist item',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/requests/${requestId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setPendingIssuedAction(null);
      invalidateRequestData();
      notify({ variant: 'success', title: 'Checklist item removed' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not remove item',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest<DocumentRequestDetail>(`/requests/${requestId}/send`, {
        method: 'POST',
      }),
    onSuccess: (updated) => {
      invalidateRequestData();

      const emailStatus = updated.emailDelivery?.status;
      if (emailStatus === EmailStatus.SENT) {
        notify({
          variant: 'success',
          title: 'Request sent & email accepted by Resend',
          description: `Portal invitation accepted by Resend for ${updated.recipientEmail ?? 'primary contact'}.`,
        });
      } else {
        notify({
          variant: 'error',
          title: 'Request marked SENT, but email failed to send',
          description:
            updated.emailDelivery?.errorMessage ||
            'Check Resend credentials and retry sending from the delivery panel.',
        });
      }
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not send request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const resendEmailMutation = useMutation({
    mutationFn: () =>
      apiRequest<DocumentRequestDetail>(`/requests/${requestId}/resend-email`, {
        method: 'POST',
      }),
    onSuccess: (updated) => {
      invalidateRequestData();
      const status = updated.emailDelivery?.status;
      if (status === EmailStatus.SENT) {
        notify({
          variant: 'success',
          title: 'Portal email accepted by Resend',
          description: `Invitation email accepted for ${updated.recipientEmail ?? 'recipient'}.`,
        });
      } else {
        notify({
          variant: 'error',
          title: 'Email retry failed',
          description:
            updated.emailDelivery?.errorMessage || 'Resend rejected the email.',
        });
      }
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not retry email',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const issuePortalLinkMutation = useMutation({
    mutationFn: (sendEmail: boolean) =>
      apiRequest<IssuePortalLinkResponse>(
        `/requests/${requestId}/portal-link`,
        {
          method: 'POST',
          body: JSON.stringify({ sendEmail }),
        },
      ),
    onSuccess: (data) => {
      invalidateRequestData();
      setIssuedLinkData(data);
      notify({
        variant: 'success',
        title: 'Fresh portal link issued',
        description: data.emailDelivery
          ? `Previous link revoked. Email status: ${EMAIL_STATUS_LABELS[data.emailDelivery.status]}.`
          : 'Previous link revoked. Copy the new URL now — it cannot be retrieved later.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not issue portal link',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const revokePortalMutation = useMutation({
    mutationFn: () =>
      apiRequest<DocumentRequestDetail>(
        `/requests/${requestId}/revoke-portal`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setConfirmRevokeOpen(false);
      invalidateRequestData();
      notify({
        variant: 'success',
        title: 'Portal link revoked',
        description: 'Clients can no longer access the previous portal URL.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not revoke portal link',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest<DocumentRequestDetail>(`/requests/${requestId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      }),
    onSuccess: () => {
      setConfirmCancelOpen(false);
      setCancelReason('');
      invalidateRequestData();
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
    mutationFn: () =>
      apiRequest<DocumentRequestDetail>(`/requests/${requestId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          dueAt: reopenDueAt ? `${reopenDueAt}T23:59:59.000Z` : undefined,
          issuePortalLink: reopenIssueLink,
          sendEmail: reopenIssueLink ? reopenSendEmail : false,
        }),
      }),
    onSuccess: (updated) => {
      setConfirmReopenOpen(false);
      setReopenIssueLink(false);
      setReopenSendEmail(false);
      invalidateRequestData();
      if (updated.issuedPortalLink) {
        setIssuedLinkData(updated.issuedPortalLink);
      }
      notify({
        variant: 'success',
        title: 'Document request reopened',
        description: `Status restored to ${REQUEST_STATUS_LABELS[updated.status]}. Previous revoked links remain invalid.`,
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
    mutationFn: () => apiRequest(`/requests/${requestId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      notify({ variant: 'success', title: 'Draft request permanently deleted' });
      router.replace('/app/requests');
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

  const markUnderReviewMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/requests/${requestId}/items/${itemId}/under-review`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      invalidateRequestData();
      notify({ variant: 'success', title: 'Item marked under review' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update item review status',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const reviewItemMutation = useMutation({
    mutationFn: ({
      itemId,
      decision,
      notes,
    }: {
      itemId: string;
      decision: ReviewDecision;
      notes?: string;
    }) =>
      apiRequest(`/requests/${requestId}/items/${itemId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes }),
      }),
    onSuccess: (_, vars) => {
      setRejectingItem(null);
      setRejectionNotes('');
      invalidateRequestData();
      notify({
        variant: 'success',
        title:
          vars.decision === ReviewDecision.ACCEPTED
            ? 'Document accepted'
            : 'Document rejected',
        description:
          vars.decision === ReviewDecision.REJECTED
            ? 'Client has been notified to upload a replacement document.'
            : 'Checklist item approved.',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not submit document review',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const handleCopyIssuedLink = async () => {
    if (!issuedLinkData?.portalUrl) return;
    try {
      await navigator.clipboard.writeText(issuedLinkData.portalUrl);
      notify({ variant: 'success', title: 'Portal URL copied to clipboard' });
    } catch {
      notify({
        variant: 'error',
        title: 'Clipboard access blocked',
        description: 'Select and copy the URL manually from the box below.',
      });
    }
  };

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

  if (requestQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 rounded bg-[#F3F1EC] animate-pulse" />
        <div className="h-64 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
      </div>
    );
  }

  if (requestQuery.isError || !requestQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/requests"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to document requests</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <span>
            {requestQuery.error instanceof ApiClientError
              ? requestQuery.error.message
              : 'Unable to load document request.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => requestQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const req = requestQuery.data;
  const isTerminal =
    req.status === RequestStatus.COMPLETED ||
    req.status === RequestStatus.CANCELLED;
  const canEdit = !isReadOnly && !isTerminal;
  const isIssuedRequest = req.status !== RequestStatus.DRAFT;
  const files = Array.isArray(req.files) ? req.files : [];
  const items = Array.isArray(req.items) ? req.items : [];
  const canReassignClient =
    canEdit &&
    req.status === RequestStatus.DRAFT &&
    !req.sentAt &&
    files.length === 0 &&
    !req.portalAccess;
  const canDeleteDraft =
    canDeleteRequests &&
    !isReadOnly &&
    req.status === RequestStatus.DRAFT &&
    !req.sentAt &&
    files.length === 0 &&
    !req.portalAccess;

  const portalStatus = req.portalAccess?.status ?? 'NOT_ISSUED';
  const emailDelivery = req.emailDelivery ?? null;
  const canRetryEmail =
    !isReadOnly &&
    !isTerminal &&
    req.status !== RequestStatus.DRAFT &&
    (!emailDelivery ||
      emailDelivery.status === EmailStatus.FAILED ||
      emailDelivery.status === EmailStatus.FAILED_MISSING_CREDENTIALS ||
      emailDelivery.status === EmailStatus.BOUNCED);

  const itemStatusById = new Map(items.map((item) => [item.id, item.status]));
  const activeClients = Array.isArray(activeClientsQuery.data)
    ? activeClientsQuery.data
    : [];
  const activityEvents = Array.isArray(activityQuery.data)
    ? activityQuery.data
    : [];
  const canReopenWithLink = Boolean(req.sentAt || files.length > 0);
  const clientIsArchived = req.client?.status === ClientStatus.ARCHIVED;

  const handleMetaSubmit = (values: UpdateDocumentRequestInput) => {
    if (isIssuedRequest) {
      setPendingIssuedAction({ type: 'meta', values });
    } else {
      updateMetaMutation.mutate(values);
    }
  };

  const handleItemSubmit = (values: RequestItemInput) => {
    const editingItemId = editingItem?.id ?? null;
    if (isIssuedRequest) {
      setItemDialogOpen(false);
      setPendingIssuedAction({ type: 'saveItem', values, editingItemId });
    } else {
      saveItemMutation.mutate({ values, editingItemId });
    }
  };

  const handleDeleteItem = (item: RequestItemSummary) => {
    if (isIssuedRequest) {
      setPendingIssuedAction({ type: 'deleteItem', item });
    } else {
      deleteItemMutation.mutate(item.id);
    }
  };

  const confirmIssuedEdit = () => {
    if (!pendingIssuedAction) return;
    if (pendingIssuedAction.type === 'meta') {
      updateMetaMutation.mutate(pendingIssuedAction.values);
    } else if (pendingIssuedAction.type === 'saveItem') {
      saveItemMutation.mutate({
        values: pendingIssuedAction.values,
        editingItemId: pendingIssuedAction.editingItemId,
      });
    } else if (pendingIssuedAction.type === 'deleteItem') {
      deleteItemMutation.mutate(pendingIssuedAction.item.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/requests"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to document requests</span>
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-[#0F172A]">
            {req.title}
          </h1>
          <p className="mt-1 text-xs text-[#475569]">
            <span className={requestStatusClass(req.status, req.isOverdue)}>
              {req.isOverdue ? 'Overdue' : REQUEST_STATUS_LABELS[req.status]}
            </span>
            {' · '}
            <Link
              href={`/app/clients/${req.clientId}`}
              className="font-medium text-[#0F172A] hover:underline"
            >
              {req.clientName}
            </Link>
            {' · '}
            <span className="tabular-nums">
              Due {formatShortDate(req.dueAt)}
            </span>
            {req.periodKey && (
              <>
                {' · '}
                <span className="font-mono-tabular">
                  Period {req.periodKey}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {req.status === RequestStatus.DRAFT && (
            <Button
              type="button"
              disabled={isReadOnly || sendMutation.isPending || clientIsArchived}
              onClick={() => sendMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              <span>{sendMutation.isPending ? 'Sending...' : 'Send request'}</span>
            </Button>
          )}
          {!isTerminal && (
            <Button
              type="button"
              variant="outline"
              disabled={isReadOnly || cancelMutation.isPending}
              onClick={() => {
                setCancelReason('');
                setConfirmCancelOpen(true);
              }}
            >
              <Ban className="h-4 w-4" />
              <span>Cancel request</span>
            </Button>
          )}
          {req.status === RequestStatus.CANCELLED && !isReadOnly && (
            <Button
              type="button"
              disabled={reopenMutation.isPending || clientIsArchived}
              onClick={() => {
                setReopenDueAt(req.dueAt.slice(0, 10));
                setReopenIssueLink(false);
                setReopenSendEmail(false);
                setConfirmReopenOpen(true);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reopen request</span>
            </Button>
          )}
          {canDeleteDraft && (
            <Button
              type="button"
              variant="ghost"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmDeleteOpen(true)}
              className="text-[#DC2626] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete draft</span>
            </Button>
          )}
        </div>
      </div>

      {req.status === RequestStatus.CANCELLED && (
        <div className="rounded-md border border-[#E2E0D8] bg-[#F3F1EC] px-4 py-3 text-xs text-[#334155]">
          <p className="font-medium text-[#0F172A]">
            Request cancelled
            {req.cancelledAt ? ` on ${formatShortDate(req.cancelledAt)}` : ''}
          </p>
          {req.cancellationReason && (
            <p className="mt-1">
              <strong>Reason:</strong> {req.cancellationReason}
            </p>
          )}
          {clientIsArchived && (
            <p className="mt-1 text-[#991B1B]">
              The associated client is archived. Restore the client before
              reopening this request.
            </p>
          )}
        </div>
      )}

      {req.client && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-[#0F766E]" />
              <span>Client Summary</span>
            </CardTitle>
            <Link
              href={`/app/clients/${req.client.id}`}
              className="text-xs font-medium text-[#0F766E] hover:underline"
            >
              View client profile
            </Link>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <p className="text-[#64748B]">Client entity</p>
              <p className="mt-1 font-medium text-[#0F172A]">
                {req.client.name}
              </p>
              <p className="mt-0.5 text-[#64748B]">
                {ENTITY_TYPE_LABELS[req.client.entityType]} ·{' '}
                {COUNTRY_LABELS[req.client.country]}
              </p>
            </div>
            <div>
              <p className="text-[#64748B]">Client status &amp; reference</p>
              <p className="mt-1">
                <span className={clientStatusClass(req.client.status)}>
                  {req.client.status}
                </span>
                {req.client.referenceCode && (
                  <span className="ml-2 font-mono-tabular text-[#64748B]">
                    {req.client.referenceCode}
                  </span>
                )}
              </p>
              {req.client.companyName &&
                req.client.companyName !== req.client.name && (
                  <p className="mt-0.5 text-[#64748B]">
                    {req.client.companyName}
                  </p>
                )}
            </div>
            <div>
              <p className="text-[#64748B]">Primary contact</p>
              <p className="mt-1 font-medium text-[#0F172A]">
                {req.client.primaryContactName ?? 'No active primary contact'}
              </p>
              {req.client.primaryContactEmail && (
                <p className="mt-0.5 text-[#64748B] break-all">
                  {req.client.primaryContactEmail}
                </p>
              )}
            </div>
            <div>
              <p className="text-[#64748B]">Client contact details</p>
              <p className="mt-1 text-[#0F172A] break-all">
                {req.client.email || req.client.primaryContactPhone || '—'}
              </p>
              {req.client.phone && (
                <p className="mt-0.5 font-mono-tabular text-[#64748B]">
                  {req.client.phone}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {req.status !== RequestStatus.DRAFT && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#0F766E]" />
              <span>Client Portal &amp; Email Delivery</span>
            </CardTitle>
            {!isTerminal && !isReadOnly && (
              <div className="flex flex-wrap items-center gap-2">
                {canRetryEmail && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={resendEmailMutation.isPending}
                    onClick={() => resendEmailMutation.mutate()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>
                      {resendEmailMutation.isPending
                        ? 'Retrying...'
                        : 'Retry email'}
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={issuePortalLinkMutation.isPending}
                  onClick={() => issuePortalLinkMutation.mutate(false)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>
                    {issuePortalLinkMutation.isPending
                      ? 'Issuing...'
                      : 'Issue fresh link'}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={issuePortalLinkMutation.isPending}
                  onClick={() => issuePortalLinkMutation.mutate(true)}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Issue &amp; email new link</span>
                </Button>
                {portalStatus === 'ACTIVE' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={revokePortalMutation.isPending}
                    onClick={() => setConfirmRevokeOpen(true)}
                    className="text-[#DC2626] hover:bg-[#FEF2F2]"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Revoke link</span>
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div>
                <p className="text-[#64748B]">Recipient email</p>
                <p className="mt-1 font-medium text-[#0F172A] break-all">
                  {req.recipientEmail ?? 'No primary contact'}
                </p>
              </div>
              <div>
                <p className="text-[#64748B]">Email delivery status</p>
                <p className="mt-1">
                  {emailDelivery ? (
                    <span className={emailStatusClass(emailDelivery.status)}>
                      {EMAIL_STATUS_LABELS[emailDelivery.status]}
                    </span>
                  ) : (
                    <span className="text-[#64748B]">Not sent</span>
                  )}
                </p>
                {emailDelivery?.providerMessageId && (
                  <p className="mt-0.5 font-mono-tabular text-[11px] text-[#64748B] truncate">
                    ID: {emailDelivery.providerMessageId}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[#64748B]">Portal link status</p>
                <p className="mt-1">
                  <span className={portalStatusClass(portalStatus)}>
                    {PORTAL_STATUS_LABELS[portalStatus]}
                  </span>
                </p>
                {req.portalAccess && (
                  <p className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                    {req.portalAccess.revokedAt
                      ? `Revoked ${formatShortDate(req.portalAccess.revokedAt)}`
                      : `Expires ${formatShortDate(req.portalAccess.expiresAt)}`}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[#64748B]">Client portal activity</p>
                <p className="mt-1 font-medium text-[#0F172A] tabular-nums">
                  {req.portalAccess
                    ? `${req.portalAccess.accessCount} visit(s)`
                    : '—'}
                </p>
                {req.portalAccess?.lastAccessedAt && (
                  <p className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                    Last opened{' '}
                    {formatShortDate(req.portalAccess.lastAccessedAt)}
                  </p>
                )}
              </div>
            </div>

            {emailDelivery?.errorMessage && (
              <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
                <strong>Email delivery error:</strong>{' '}
                {emailDelivery.errorMessage}
              </div>
            )}

            <p className="text-[11px] text-[#64748B]">
              Security note: Only SHA-256 hashes of portal tokens are stored.
              Existing links cannot be retrieved after sending; use{' '}
              <strong>Issue fresh link</strong> to revoke the old link and copy
              a replacement URL once.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Request Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={metaForm.handleSubmit(handleMetaSubmit)}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="req-edit-client">Client</Label>
                {canReassignClient ? (
                  <Select
                    id="req-edit-client"
                    {...metaForm.register('clientId')}
                  >
                    <option value={req.clientId}>{req.clientName}</option>
                    {activeClients
                      .filter((c) => c.id !== req.clientId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                ) : (
                  <>
                    <Input
                      id="req-edit-client"
                      disabled
                      value={req.clientName}
                    />
                    <p className="mt-1 text-[11px] text-[#64748B]">
                      Client assignment is locked once a request has been sent or
                      has portal/upload activity.
                    </p>
                  </>
                )}
              </div>

              <div>
                <Label htmlFor="req-edit-title">Title</Label>
                <Input
                  id="req-edit-title"
                  disabled={!canEdit}
                  {...metaForm.register('title')}
                />
                {metaForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-[#DC2626]">
                    {metaForm.formState.errors.title.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="req-edit-due">Due date</Label>
                <Input
                  id="req-edit-due"
                  type="date"
                  disabled={!canEdit}
                  {...metaForm.register('dueAt')}
                />
              </div>

              <div>
                <Label htmlFor="req-edit-inst">Client instructions</Label>
                <Textarea
                  id="req-edit-inst"
                  rows={3}
                  disabled={!canEdit}
                  {...metaForm.register('instructions')}
                />
              </div>

              <div className="border-t border-[#E2E0D8] pt-3 text-xs text-[#64748B] space-y-1 tabular-nums">
                <p>Created: {formatShortDate(req.createdAt)}</p>
                {req.sentAt && <p>Sent: {formatShortDate(req.sentAt)}</p>}
                {req.cancelledAt && (
                  <p>Cancelled: {formatShortDate(req.cancelledAt)}</p>
                )}
              </div>

              {canEdit && (
                <Button
                  type="submit"
                  disabled={updateMetaMutation.isPending}
                >
                  {updateMetaMutation.isPending ? 'Saving...' : 'Save changes'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              Requested Documents ({req.completedItemsCount}/{req.totalItemsCount})
            </CardTitle>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openAddItem}
              >
                <Plus className="h-4 w-4" />
                <span>Add item</span>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const itemFiles = files.filter((f) => f.requestItemId === item.id);
                const hasUploadedFiles = itemFiles.length > 0;
                const hasCleanFile = itemFiles.some(
                  (f) => f.scanStatus === FileScanStatus.CLEAN,
                );
                const canReview =
                  !isReadOnly &&
                  req.status !== RequestStatus.DRAFT &&
                  req.status !== RequestStatus.CANCELLED &&
                  hasUploadedFiles;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F3F1EC] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0F172A]">
                        <span className="mr-2 font-mono-tabular text-xs text-[#64748B]">
                          {idx + 1}.
                        </span>
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="mt-1 text-xs text-[#475569]">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[#64748B]">
                        <span className={requestItemStatusClass(item.status)}>
                          {REQUEST_ITEM_STATUS_LABELS[item.status]}
                        </span>
                        {' · '}
                        {item.isRequired ? 'Required' : 'Optional'}
                        {hasUploadedFiles && ' · Has uploaded file'}
                      </p>
                      {item.latestReview && (
                        <p
                          className={`mt-1 text-xs ${
                            item.latestReview.decision === ReviewDecision.REJECTED
                              ? 'text-[#DC2626]'
                              : 'text-[#0F766E]'
                          }`}
                        >
                          {item.latestReview.decision === ReviewDecision.REJECTED
                            ? 'Rejected'
                            : 'Accepted'}
                          {item.latestReview.reviewerName
                            ? ` by ${item.latestReview.reviewerName}`
                            : ''}
                          {item.latestReview.notes
                            ? `: ${item.latestReview.notes}`
                            : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {canReview &&
                        item.status === RequestItemStatus.UPLOADED &&
                        hasCleanFile && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={markUnderReviewMutation.isPending}
                            onClick={() =>
                              markUnderReviewMutation.mutate(item.id)
                            }
                          >
                            Under review
                          </Button>
                        )}
                      {canReview &&
                        item.status !== RequestItemStatus.ACCEPTED && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!hasCleanFile || reviewItemMutation.isPending}
                            title={
                              hasCleanFile
                                ? 'Accept document'
                                : 'Only CLEAN verified files can be accepted'
                            }
                            onClick={() =>
                              reviewItemMutation.mutate({
                                itemId: item.id,
                                decision: ReviewDecision.ACCEPTED,
                              })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Accept</span>
                          </Button>
                        )}
                      {canReview && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={reviewItemMutation.isPending}
                          onClick={() => {
                            setRejectingItem(item);
                            setRejectionNotes('');
                          }}
                          className="text-[#DC2626] hover:bg-[#FEF2F2]"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject</span>
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditItem(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                              items.length <= 1 ||
                              hasUploadedFiles ||
                              deleteItemMutation.isPending
                            }
                            title={
                              hasUploadedFiles
                                ? 'Cannot remove checklist item with uploaded files'
                                : 'Remove item'
                            }
                            aria-label={`Remove ${item.title}`}
                            onClick={() => handleDeleteItem(item)}
                            className="text-[#DC2626] hover:bg-[#FEF2F2]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {Array.isArray(req.reviews) && req.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#0F766E]" />
              <span>Document Review History ({req.reviews.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {req.reviews.map((review) => {
                const reviewedItem = items.find(
                  (i) => i.id === review.requestItemId,
                );
                return (
                  <div
                    key={review.id}
                    className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F3F1EC] pb-2.5 last:border-0 last:pb-0 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F172A]">
                        <span
                          className={
                            review.decision === ReviewDecision.ACCEPTED
                              ? 'text-[#0F766E]'
                              : 'text-[#DC2626]'
                          }
                        >
                          {review.decision === ReviewDecision.ACCEPTED
                            ? 'Accepted'
                            : 'Rejected'}
                        </span>
                        {reviewedItem ? ` · ${reviewedItem.title}` : ''}
                      </p>
                      <p className="mt-0.5 text-[#64748B]">
                        Reviewer: {review.reviewerName ?? 'Team Member'}
                        {review.notes ? ` · Note: ${review.notes}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[#64748B] tabular-nums">
                      {formatShortDate(review.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submitted Files ({files.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <p className="text-sm text-[#64748B]">
                No documents have been uploaded by the client yet.
              </p>
            ) : (
              <div className="divide-y divide-[#F3F1EC]">
                {files.map((file) => {
                  const itemStatus = itemStatusById.get(file.requestItemId);
                  return (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] truncate">
                          {file.originalFilename}
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          <span>{file.requestItemTitle}</span>
                          {itemStatus && (
                            <>
                              {' · '}
                              <span>
                                Review:{' '}
                                {REQUEST_ITEM_STATUS_LABELS[itemStatus]}
                              </span>
                            </>
                          )}
                          {' · '}
                          <span className="tabular-nums">
                            {formatFileSize(file.sizeBytes)}
                          </span>
                          {' · '}
                          <span className={fileScanStatusClass(file.scanStatus)}>
                            {FILE_SCAN_STATUS_LABELS[file.scanStatus]}
                          </span>
                          {file.uploadedAt && (
                            <>
                              {' · '}
                              <span className="tabular-nums">
                                Uploaded {formatShortDate(file.uploadedAt)}
                              </span>
                            </>
                          )}
                        </p>
                        {file.scanDetails &&
                          file.scanStatus === FileScanStatus.QUARANTINED && (
                            <p className="mt-1 text-xs text-[#B45309]">
                              {file.scanDetails}
                            </p>
                          )}
                      </div>
                      <div className="shrink-0">
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
                              ? 'Preparing...'
                              : 'Download'}
                          </span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#0F766E]" />
              <span>Request Activity &amp; Audit History</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityQuery.isLoading ? (
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            ) : activityQuery.isError ? (
              <p className="text-xs text-[#991B1B]">
                Unable to load request activity history.
              </p>
            ) : activityEvents.length === 0 ? (
              <p className="text-sm text-[#64748B]">
                No activity events recorded yet.
              </p>
            ) : (
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
                        {typeof evt.metadata?.['recipientEmail'] === 'string' &&
                          ` · ${evt.metadata['recipientEmail']}`}
                        {typeof evt.metadata?.['reason'] === 'string' &&
                          ` · Reason: ${evt.metadata['reason']}`}
                        {typeof evt.metadata?.['restoredStatus'] === 'string' &&
                          ` · Restored to ${evt.metadata['restoredStatus']}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[#64748B] tabular-nums">
                      {formatShortDate(evt.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        title={editingItem ? 'Edit request item' : 'Add request item'}
        description="Requested items appear on the client upload checklist."
      >
        <form
          onSubmit={itemForm.handleSubmit(handleItemSubmit)}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="req-item-title">Document title</Label>
            <Input
              id="req-item-title"
              placeholder="Corporate credit card statements"
              {...itemForm.register('title')}
            />
            {itemForm.formState.errors.title && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {itemForm.formState.errors.title.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="req-item-desc">Instructions for client</Label>
            <Textarea
              id="req-item-desc"
              rows={2}
              placeholder="PDF or CSV export from online banking."
              {...itemForm.register('description')}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
              {...itemForm.register('isRequired')}
            />
            <span>Required document</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveItemMutation.isPending}>
              {saveItemMutation.isPending ? 'Saving...' : 'Save item'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(pendingIssuedAction)}
        onClose={() => setPendingIssuedAction(null)}
        title="Confirm update to issued request"
        description="This request has already been sent to the client. Applying changes updates the live checklist and instructions immediately without revoking valid portal links."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingIssuedAction(null)}
          >
            Discard change
          </Button>
          <Button
            type="button"
            disabled={
              updateMetaMutation.isPending ||
              saveItemMutation.isPending ||
              deleteItemMutation.isPending
            }
            onClick={confirmIssuedEdit}
          >
            Confirm update
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(issuedLinkData)}
        onClose={() => setIssuedLinkData(null)}
        title="One-time portal link generated"
        description="Copy this portal URL now. The previous link has been revoked."
      >
        <div className="space-y-4">
          <div className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-xs text-[#92400E]">
            For security, Client Document Chaser stores only the SHA-256 hash of
            this token. You will not be able to retrieve this raw link again
            after closing this dialog.
          </div>

          <div>
            <Label htmlFor="issued-portal-url">Client portal URL</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="issued-portal-url"
                readOnly
                value={issuedLinkData?.portalUrl ?? ''}
                className="font-mono-tabular text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyIssuedLink}
              >
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => setIssuedLinkData(null)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmRevokeOpen}
        onClose={() => setConfirmRevokeOpen(false)}
        title="Revoke client portal link"
        description="The client will immediately lose access via the current portal URL until you issue a new link."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmRevokeOpen(false)}
          >
            Keep link active
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={revokePortalMutation.isPending}
            onClick={() => revokePortalMutation.mutate()}
          >
            {revokePortalMutation.isPending ? 'Revoking...' : 'Confirm revoke'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        title="Cancel document request"
        description="Cancelled requests stop waiting for uploads, revoke any active portal link, and preserve existing documents and audit history."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="cancel-reason">Cancellation reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              placeholder="Client switched engagement scope..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCancelOpen(false)}
            >
              Keep request
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm cancel'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmReopenOpen}
        onClose={() => setConfirmReopenOpen(false)}
        title="Reopen document request"
        description="Reopening restores this request from CANCELLED status while preserving previous portal and cancellation history. Old revoked tokens stay permanently invalid."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="reopen-due">Due date</Label>
            <Input
              id="reopen-due"
              type="date"
              value={reopenDueAt}
              onChange={(e) => setReopenDueAt(e.target.value)}
            />
          </div>

          {canReopenWithLink && (
            <div className="space-y-2 rounded-md border border-[#E2E0D8] bg-[#FAF9F6] p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
                <input
                  type="checkbox"
                  checked={reopenIssueLink}
                  onChange={(e) => {
                    setReopenIssueLink(e.target.checked);
                    if (!e.target.checked) setReopenSendEmail(false);
                  }}
                  className="h-4 w-4 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
                />
                <span>Issue a fresh portal link immediately</span>
              </label>

              {reopenIssueLink && (
                <label className="flex items-center gap-2 pl-6 text-xs text-[#475569]">
                  <input
                    type="checkbox"
                    checked={reopenSendEmail}
                    onChange={(e) => setReopenSendEmail(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[#D6D3C9] text-[#0F766E] focus:ring-[#0F766E]"
                  />
                  <span>Email fresh link to primary contact</span>
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmReopenOpen(false)}
            >
              Keep cancelled
            </Button>
            <Button
              type="button"
              disabled={reopenMutation.isPending}
              onClick={() => reopenMutation.mutate()}
            >
              {reopenMutation.isPending ? 'Reopening...' : 'Confirm reopen'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Permanently delete draft request"
        description="Permanent deletion removes this unused draft checklist permanently. Requests that have been sent or contain files or portal history cannot be deleted."
      >
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmDeleteOpen(false)}
          >
            Keep draft
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Confirm delete'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(rejectingItem)}
        onClose={() => {
          setRejectingItem(null);
          setRejectionNotes('');
        }}
        title={
          rejectingItem
            ? `Reject "${rejectingItem.title}"`
            : 'Reject uploaded document'
        }
        description="Provide a clear reason for the client. They will be notified and prompted to upload a replacement document through the portal."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rejectingItem) return;
            const trimmed = rejectionNotes.trim();
            if (!trimmed) return;
            reviewItemMutation.mutate({
              itemId: rejectingItem.id,
              decision: ReviewDecision.REJECTED,
              notes: trimmed,
            });
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="reject-reason-notes">Rejection reason *</Label>
            <Textarea
              id="reject-reason-notes"
              rows={3}
              required
              placeholder="e.g., Signature page is missing or uploaded PDF is unreadable."
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectingItem(null);
                setRejectionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                !rejectionNotes.trim() || reviewItemMutation.isPending
              }
            >
              {reviewItemMutation.isPending
                ? 'Submitting rejection...'
                : 'Reject document'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
