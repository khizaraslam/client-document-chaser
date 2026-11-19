import { z } from 'zod';
import {
  EmailStatus,
  FileScanStatus,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
} from './enums';

export const PORTAL_ALLOWED_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'docx',
  'xlsx',
  'csv',
] as const;

export type PortalAllowedExtension = (typeof PORTAL_ALLOWED_EXTENSIONS)[number];

export const PORTAL_PRESIGN_REQUEST_SCHEMA = z.object({
  requestItemId: z.string().uuid('Invalid checklist item identifier'),
  fileName: z.string().trim().min(1, 'File name is required').max(255),
  mimeType: z.string().trim().min(3, 'File type is required').max(120),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive('File must not be empty')
    .max(100 * 1024 * 1024, 'File exceeds maximum allowed size'),
});

export const PORTAL_CONFIRM_UPLOAD_SCHEMA = z.object({
  fileId: z.string().uuid('Invalid file identifier'),
});

export const ISSUE_PORTAL_LINK_SCHEMA = z.object({
  sendEmail: z.boolean().optional().default(false),
});

export type PortalPresignRequestInput = z.infer<
  typeof PORTAL_PRESIGN_REQUEST_SCHEMA
>;
export type PortalConfirmUploadInput = z.infer<
  typeof PORTAL_CONFIRM_UPLOAD_SCHEMA
>;
export type IssuePortalLinkInput = z.infer<typeof ISSUE_PORTAL_LINK_SCHEMA>;

export type PortalAccessLifecycleStatus =
  | 'NOT_ISSUED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED';

export interface PortalAccessSummary {
  id: string;
  status: PortalAccessLifecycleStatus;
  recipientEmail: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
}

export interface EmailDeliverySummary {
  id: string;
  status: EmailStatus;
  recipientEmail: string;
  templateName: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileSummary {
  id: string;
  requestId: string;
  requestItemId: string;
  requestItemTitle: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  detectedMimeType: string | null;
  sizeBytes: number;
  scanStatus: FileScanStatus;
  scanDetails: string | null;
  uploadedAt: string | null;
  createdAt: string;
}

export interface SignedDownloadResponse {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface IssuePortalLinkResponse {
  portalUrl: string;
  expiresAt: string;
  portalAccess: PortalAccessSummary;
  emailDelivery: EmailDeliverySummary | null;
}

export interface PortalUploadedFileDto {
  id: string;
  requestItemId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: FileScanStatus;
  uploadedAt: string | null;
}

export interface PortalItemReviewSummary {
  decision: ReviewDecision;
  notes: string | null;
  reviewedAt: string;
}

export interface PortalChecklistItemDto {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: RequestItemStatus;
  sortOrder: number;
  acceptedMimeTypes: string[];
  files: PortalUploadedFileDto[];
  latestReview?: PortalItemReviewSummary | null;
}

export interface PortalViewResponse {
  firmName: string;
  clientName: string;
  recipientEmail: string;
  requestId: string;
  title: string;
  instructions: string | null;
  status: RequestStatus;
  dueAt: string;
  expiresAt: string;
  maxFileSizeBytes: number;
  allowedExtensions: readonly string[];
  items: PortalChecklistItemDto[];
}

export interface PortalPresignResponse {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface PortalConfirmUploadResponse {
  file: PortalUploadedFileDto;
  itemStatus: RequestItemStatus;
  requestStatus: RequestStatus;
}
