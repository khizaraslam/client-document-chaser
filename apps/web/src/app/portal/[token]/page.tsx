'use client';

import {
  FileScanStatus,
  PortalConfirmUploadResponse,
  PortalPresignResponse,
  PortalViewResponse,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
} from '@cdc/contracts';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  UploadCloud,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FILE_SCAN_STATUS_LABELS,
  fileScanStatusClass,
  formatFileSize,
  REQUEST_ITEM_STATUS_LABELS,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

interface ItemUploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
  successMessage: string | null;
}

const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
  'text/csv': ['.csv'],
};

function resolveAcceptAttribute(acceptedMimeTypes: string[]): string {
  if (!acceptedMimeTypes || acceptedMimeTypes.length === 0) {
    return '.pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv';
  }
  const exts = acceptedMimeTypes.flatMap(
    (mime) => MIME_TO_EXTENSIONS[mime.toLowerCase()] ?? [],
  );
  return exts.length > 0
    ? Array.from(new Set(exts)).join(',')
    : '.pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv';
}

function putFileWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(95, Math.round((event.loaded / event.total) * 90)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(95);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      reject(new Error('DIRECT_STORAGE_NETWORK_OR_CORS_ERROR'));
    };
    xhr.send(file);
  });
}

function postMultipartWithProgress(
  url: string,
  requestItemId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<PortalConfirmUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('requestItemId', requestItemId);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(95, Math.round((event.loaded / event.total) * 95)));
      }
    };
    xhr.onload = () => {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        onProgress(100);
        resolve(parsed as unknown as PortalConfirmUploadResponse);
      } else {
        const message =
          typeof parsed?.['message'] === 'string'
            ? parsed['message']
            : `Upload failed (${xhr.status})`;
        reject(new Error(message));
      }
    };
    xhr.onerror = () => {
      reject(new Error('Network error while uploading file'));
    };
    xhr.send(formData);
  });
}

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [portal, setPortal] = React.useState<PortalViewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [itemStates, setItemStates] = React.useState<
    Record<string, ItemUploadState>
  >({});

  const loadPortal = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/portal/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(
          data?.message ||
            'This upload link is invalid, expired, or has been revoked.',
        );
        setPortal(null);
      } else {
        setPortal(data as PortalViewResponse);
      }
    } catch {
      setLoadError(
        'Unable to reach the document portal right now. Please try again shortly.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const setItemUploadState = (
    itemId: string,
    patch: Partial<ItemUploadState>,
  ) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        uploading: prev[itemId]?.uploading ?? false,
        progress: prev[itemId]?.progress ?? 0,
        error: prev[itemId]?.error ?? null,
        successMessage: prev[itemId]?.successMessage ?? null,
        ...patch,
      },
    }));
  };

  const handleFileSelected = async (
    requestItemId: string,
    file: File | null,
  ) => {
    if (!file || !portal || !token) return;

    if (file.size <= 0) {
      setItemUploadState(requestItemId, {
        error: 'Selected file is empty.',
        successMessage: null,
      });
      return;
    }
    if (file.size > portal.maxFileSizeBytes) {
      setItemUploadState(requestItemId, {
        error: `File exceeds the maximum limit of ${formatFileSize(portal.maxFileSizeBytes)}.`,
        successMessage: null,
      });
      return;
    }

    setItemUploadState(requestItemId, {
      uploading: true,
      progress: 10,
      error: null,
      successMessage: null,
    });

    const encodedToken = encodeURIComponent(token);

    try {
      // Primary path: presigned PUT directly to private S3/PGSTY Silo storage
      const presignRes = await fetch(
        `/api/v1/portal/${encodedToken}/upload-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestItemId,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          }),
        },
      );
      const presignBody = await presignRes.json().catch(() => null);
      if (!presignRes.ok) {
        throw new Error(
          presignBody?.message || 'Unable to prepare secure file upload.',
        );
      }

      const presign = presignBody as PortalPresignResponse;
      let outcome: PortalConfirmUploadResponse;

      try {
        await putFileWithProgress(
          presign.uploadUrl,
          file,
          presign.headers,
          (pct) => setItemUploadState(requestItemId, { progress: pct }),
        );

        const confirmRes = await fetch(
          `/api/v1/portal/${encodedToken}/confirm-upload`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: presign.fileId }),
          },
        );
        const confirmBody = await confirmRes.json().catch(() => null);
        if (!confirmRes.ok) {
          throw new Error(
            confirmBody?.message || 'File verification failed after upload.',
          );
        }
        outcome = confirmBody as PortalConfirmUploadResponse;
      } catch (storageErr) {
        // Fallback path when PGSTY Silo browser CORS prevents direct PUT
        if (
          storageErr instanceof Error &&
          storageErr.message === 'DIRECT_STORAGE_NETWORK_OR_CORS_ERROR'
        ) {
          outcome = await postMultipartWithProgress(
            `/api/v1/portal/${encodedToken}/upload`,
            requestItemId,
            file,
            (pct) => setItemUploadState(requestItemId, { progress: pct }),
          );
        } else {
          throw storageErr;
        }
      }

      setItemUploadState(requestItemId, {
        uploading: false,
        progress: 100,
        error:
          outcome.file.scanStatus === FileScanStatus.QUARANTINED
            ? 'File uploaded and placed in quarantine pending security scan verification.'
            : null,
        successMessage:
          outcome.file.scanStatus === FileScanStatus.CLEAN
            ? `Uploaded and verified: ${outcome.file.originalFilename}`
            : null,
      });

      await loadPortal();
    } catch (err) {
      setItemUploadState(requestItemId, {
        uploading: false,
        progress: 0,
        error:
          err instanceof Error
            ? err.message
            : 'Upload failed. Please check the file type and try again.',
        successMessage: null,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="h-10 w-64 rounded bg-[#F3F1EC] animate-pulse" />
          <div className="h-44 rounded-lg border border-[#E2E0D8] bg-white animate-pulse" />
          <div className="h-64 rounded-lg border border-[#E2E0D8] bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !portal) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] px-4 py-16">
        <div className="mx-auto max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#0F172A]">
                <AlertCircle className="h-5 w-5 text-[#DC2626]" />
                <span>Portal link unavailable</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <p>
                {loadError ||
                  'This upload link is invalid, expired, or has been revoked.'}
              </p>
              <p className="text-xs text-[#64748B]">
                If you still need to submit financial documents, please reply to
                your accounting firm and ask them to issue a fresh portal link.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const submittedCount = portal.items.filter(
    (item) =>
      item.status === RequestItemStatus.UPLOADED ||
      item.status === RequestItemStatus.UNDER_REVIEW ||
      item.status === RequestItemStatus.ACCEPTED,
  ).length;

  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E0D8] pb-5">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#0F766E]">
              <Lock className="h-3.5 w-3.5" />
              <span>{portal.firmName} · Secure Client Portal</span>
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#0F172A]">
              {portal.title}
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Prepared for <strong className="text-[#0F172A]">{portal.clientName}</strong>
              {' · '}
              <span className="tabular-nums">
                Due {formatShortDate(portal.dueAt)}
              </span>
            </p>
          </div>

          <div className="rounded-md border border-[#E2E0D8] bg-white px-3.5 py-2 text-right text-xs">
            <p className="text-[#64748B]">Checklist progress</p>
            <p className="mt-0.5 font-display text-base font-bold text-[#0F172A] tabular-nums">
              {submittedCount} / {portal.items.length} submitted
            </p>
          </div>
        </header>

        {portal.status === RequestStatus.COMPLETED && (
          <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-sm text-[#065F46]">
            All required documents for this checklist have been reviewed and
            accepted. No further uploads are needed.
          </div>
        )}

        {portal.instructions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Instructions from {portal.firmName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-[#334155]">
                {portal.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {portal.items.map((item, idx) => {
            const state = itemStates[item.id];
            const acceptAttr = resolveAcceptAttribute(item.acceptedMimeTypes);
            const hasVerifiedFile = item.files.some(
              (f) => f.scanStatus === FileScanStatus.CLEAN,
            );
            const isRejected = item.status === RequestItemStatus.REJECTED;
            const isAccepted = item.status === RequestItemStatus.ACCEPTED;
            const isCompletedRequest = portal.status === RequestStatus.COMPLETED;

            return (
              <Card key={item.id}>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-xs text-[#64748B]">
                          {idx + 1}.
                        </span>
                        <h2 className="text-base font-semibold text-[#0F172A]">
                          {item.title}
                        </h2>
                        <span className="text-xs font-medium text-[#64748B]">
                          · {item.isRequired ? 'Required' : 'Optional'}
                        </span>
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-[#475569]">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {isAccepted && (
                        <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
                      )}
                      {isRejected && (
                        <AlertCircle className="h-4 w-4 text-[#DC2626]" />
                      )}
                      {!isAccepted && !isRejected && hasVerifiedFile && (
                        <CheckCircle2 className="h-4 w-4 text-[#1D4ED8]" />
                      )}
                      <span
                        className={
                          isAccepted
                            ? 'text-[#0F766E]'
                            : isRejected
                              ? 'text-[#DC2626]'
                              : hasVerifiedFile
                                ? 'text-[#1D4ED8]'
                                : 'text-[#475569]'
                        }
                      >
                        {REQUEST_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                  </div>

                  {isRejected && item.latestReview?.notes && (
                    <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-xs text-[#991B1B]">
                      <p className="font-semibold">
                        Replacement requested by {portal.firmName}
                      </p>
                      <p className="mt-1">{item.latestReview.notes}</p>
                    </div>
                  )}

                  {isAccepted &&
                    item.latestReview?.decision === ReviewDecision.ACCEPTED &&
                    item.latestReview.notes && (
                      <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs text-[#065F46]">
                        Reviewer note: {item.latestReview.notes}
                      </div>
                    )}

                  {item.files.length > 0 && (
                    <div className="rounded-md border border-[#E2E0D8] bg-[#FAF9F6] divide-y divide-[#E2E0D8]">
                      {item.files.map((uploaded) => (
                        <div
                          key={uploaded.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
                            <span className="font-medium text-[#0F172A] truncate">
                              {uploaded.originalFilename}
                            </span>
                            <span className="text-[#64748B] tabular-nums">
                              ({formatFileSize(uploaded.sizeBytes)})
                            </span>
                          </div>
                          <span className={fileScanStatusClass(uploaded.scanStatus)}>
                            {FILE_SCAN_STATUS_LABELS[uploaded.scanStatus]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {state?.uploading && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#475569]">
                        <span>Uploading and verifying document...</span>
                        <span className="tabular-nums">{state.progress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E0D8]">
                        <div
                          className="h-full bg-[#0F766E] transition-all duration-200"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {state?.error && (
                    <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
                      {state.error}
                    </div>
                  )}

                  {state?.successMessage && (
                    <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs text-[#065F46]">
                      {state.successMessage}
                    </div>
                  )}

                  {!isCompletedRequest && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <p className="text-[11px] text-[#64748B]">
                        Accepted: {acceptAttr.replace(/\./g, '').toUpperCase()} ·
                        Max {formatFileSize(portal.maxFileSizeBytes)}
                      </p>
                      <label className="inline-flex cursor-pointer">
                        <input
                          type="file"
                          className="sr-only"
                          accept={acceptAttr}
                          disabled={Boolean(state?.uploading)}
                          onChange={(e) => {
                            const selected = e.target.files?.[0] ?? null;
                            e.target.value = '';
                            void handleFileSelected(item.id, selected);
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            isRejected
                              ? 'default'
                              : hasVerifiedFile
                                ? 'outline'
                                : 'default'
                          }
                          disabled={Boolean(state?.uploading)}
                          onClick={(e) => {
                            const input =
                              e.currentTarget.parentElement?.querySelector(
                                'input[type="file"]',
                              ) as HTMLInputElement | null;
                            input?.click();
                          }}
                        >
                          <UploadCloud className="h-4 w-4" />
                          <span>
                            {state?.uploading
                              ? 'Uploading...'
                              : isRejected
                                ? 'Upload replacement document'
                                : hasVerifiedFile
                                  ? 'Upload another file'
                                  : 'Upload document'}
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <footer className="border-t border-[#E2E0D8] pt-4 text-center text-xs text-[#64748B]">
          Files are encrypted in transit and stored privately for{' '}
          {portal.firmName}. Portal link expires{' '}
          {formatShortDate(portal.expiresAt)}.
        </footer>
      </div>
    </div>
  );
}
