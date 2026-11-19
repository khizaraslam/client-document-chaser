import {
  ClientEntityType,
  ClientStatus,
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  PortalAccessLifecycleStatus,
  RecurrenceFrequency,
  RecurrenceStatus,
  RequestItemStatus,
  RequestStatus,
  TemplateCategory,
} from '@cdc/contracts';

export const ENTITY_TYPE_LABELS: Record<ClientEntityType, string> = {
  [ClientEntityType.SOLE_TRADER]: 'Sole Trader / Proprietor',
  [ClientEntityType.PARTNERSHIP]: 'Partnership',
  [ClientEntityType.LLC]: 'LLC',
  [ClientEntityType.CORP]: 'Corporation (C/S-Corp)',
  [ClientEntityType.LTD]: 'Private Limited (Ltd)',
  [ClientEntityType.LLP]: 'LLP',
  [ClientEntityType.CHARITY]: 'Charity / Non-Profit',
  [ClientEntityType.TRUST]: 'Trust',
  [ClientEntityType.INDIVIDUAL]: 'Individual Tax Client',
};

export const COUNTRY_LABELS: Record<OrganizationCountry, string> = {
  [OrganizationCountry.US]: 'United States',
  [OrganizationCountry.UK]: 'United Kingdom',
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  [TemplateCategory.ONBOARDING]: 'Onboarding & KYC',
  [TemplateCategory.TAX_RETURN]: 'Tax Return',
  [TemplateCategory.BOOKKEEPING]: 'Bookkeeping Close',
  [TemplateCategory.VAT_SALES_TAX]: 'VAT / Sales Tax',
  [TemplateCategory.PAYROLL]: 'Payroll',
  [TemplateCategory.AUDIT]: 'Audit & Assurance',
  [TemplateCategory.GENERAL]: 'General',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.DRAFT]: 'Draft',
  [RequestStatus.SENT]: 'Sent',
  [RequestStatus.IN_PROGRESS]: 'In Progress',
  [RequestStatus.COMPLETED]: 'Completed',
  [RequestStatus.OVERDUE]: 'Overdue',
  [RequestStatus.CANCELLED]: 'Cancelled',
};

export const REQUEST_ITEM_STATUS_LABELS: Record<RequestItemStatus, string> = {
  [RequestItemStatus.PENDING]: 'Pending',
  [RequestItemStatus.UPLOADED]: 'Uploaded',
  [RequestItemStatus.UNDER_REVIEW]: 'Under Review',
  [RequestItemStatus.ACCEPTED]: 'Accepted',
  [RequestItemStatus.REJECTED]: 'Rejected',
};

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  [RecurrenceFrequency.MONTHLY]: 'Monthly',
  [RecurrenceFrequency.QUARTERLY]: 'Quarterly',
  [RecurrenceFrequency.ANNUAL]: 'Annual',
};

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  [EmailStatus.QUEUED]: 'Queued',
  [EmailStatus.SENT]: 'Accepted by Resend (pending delivery)',
  [EmailStatus.DELIVERED]: 'Delivered',
  [EmailStatus.BOUNCED]: 'Bounced',
  [EmailStatus.COMPLAINED]: 'Complained',
  [EmailStatus.FAILED_MISSING_CREDENTIALS]: 'Failed (missing Resend config)',
  [EmailStatus.FAILED]: 'Failed',
};

export const FILE_SCAN_STATUS_LABELS: Record<FileScanStatus, string> = {
  [FileScanStatus.PENDING_UPLOAD]: 'Pending upload',
  [FileScanStatus.SCANNING]: 'Verifying',
  [FileScanStatus.CLEAN]: 'Verified',
  [FileScanStatus.QUARANTINED]: 'Quarantined',
  [FileScanStatus.INFECTED]: 'Infected (rejected)',
  [FileScanStatus.REJECTED]: 'Rejected',
};

export const PORTAL_STATUS_LABELS: Record<PortalAccessLifecycleStatus, string> = {
  NOT_ISSUED: 'Not issued',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

export function clientStatusClass(status: ClientStatus): string {
  return status === ClientStatus.ACTIVE
    ? 'text-[#0F766E] font-medium'
    : 'text-[#64748B] font-medium';
}

export function requestStatusClass(status: RequestStatus, isOverdue?: boolean): string {
  if (isOverdue || status === RequestStatus.OVERDUE) {
    return 'text-[#DC2626] font-medium';
  }
  switch (status) {
    case RequestStatus.COMPLETED:
      return 'text-[#0F766E] font-medium';
    case RequestStatus.SENT:
    case RequestStatus.IN_PROGRESS:
      return 'text-[#1D4ED8] font-medium';
    case RequestStatus.CANCELLED:
      return 'text-[#64748B] font-medium';
    case RequestStatus.DRAFT:
    default:
      return 'text-[#B45309] font-medium';
  }
}

export function emailStatusClass(status: EmailStatus): string {
  switch (status) {
    case EmailStatus.DELIVERED:
      return 'text-[#0F766E] font-medium';
    case EmailStatus.SENT:
    case EmailStatus.QUEUED:
      return 'text-[#1D4ED8] font-medium';
    case EmailStatus.BOUNCED:
    case EmailStatus.COMPLAINED:
    case EmailStatus.FAILED:
    case EmailStatus.FAILED_MISSING_CREDENTIALS:
    default:
      return 'text-[#DC2626] font-medium';
  }
}

export function fileScanStatusClass(status: FileScanStatus): string {
  switch (status) {
    case FileScanStatus.CLEAN:
      return 'text-[#0F766E] font-medium';
    case FileScanStatus.QUARANTINED:
      return 'text-[#B45309] font-medium';
    case FileScanStatus.INFECTED:
    case FileScanStatus.REJECTED:
      return 'text-[#DC2626] font-medium';
    default:
      return 'text-[#475569] font-medium';
  }
}

export function portalStatusClass(status: PortalAccessLifecycleStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'text-[#0F766E] font-medium';
    case 'EXPIRED':
      return 'text-[#B45309] font-medium';
    case 'REVOKED':
      return 'text-[#DC2626] font-medium';
    case 'NOT_ISSUED':
    default:
      return 'text-[#64748B] font-medium';
  }
}

export function recurrenceStatusClass(status: RecurrenceStatus): string {
  return status === RecurrenceStatus.ACTIVE
    ? 'text-[#0F766E] font-medium'
    : 'text-[#B45309] font-medium';
}

export function requestItemStatusClass(status: RequestItemStatus): string {
  switch (status) {
    case RequestItemStatus.ACCEPTED:
      return 'text-[#0F766E] font-medium';
    case RequestItemStatus.REJECTED:
      return 'text-[#DC2626] font-medium';
    case RequestItemStatus.UNDER_REVIEW:
    case RequestItemStatus.UPLOADED:
      return 'text-[#1D4ED8] font-medium';
    case RequestItemStatus.PENDING:
    default:
      return 'text-[#64748B] font-medium';
  }
}

export function toDateInputValue(daysFromNow = 14): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: 'Client created',
  CLIENT_UPDATED: 'Client profile updated',
  CLIENT_ARCHIVED: 'Client archived',
  CLIENT_RESTORED: 'Client restored to active',
  CLIENT_DELETED: 'Client permanently deleted',
  CLIENT_CONTACT_ADDED: 'Contact added',
  CLIENT_CONTACT_UPDATED: 'Contact updated',
  CLIENT_CONTACT_PRIMARY_CHANGED: 'Primary contact changed',
  CLIENT_CONTACT_DEACTIVATED: 'Contact deactivated',
  CLIENT_CONTACT_REACTIVATED: 'Contact reactivated',
  CLIENT_CONTACT_DELETED: 'Contact removed',
  DOCUMENT_REQUEST_CREATED: 'Document request created',
  DOCUMENT_REQUEST_UPDATED: 'Document request updated',
  DOCUMENT_REQUEST_ITEM_ADDED: 'Checklist item added',
  DOCUMENT_REQUEST_ITEM_UPDATED: 'Checklist item updated',
  DOCUMENT_REQUEST_ITEM_DELETED: 'Checklist item removed',
  DOCUMENT_REQUEST_SENT: 'Request sent to client',
  DOCUMENT_REQUEST_EMAIL_RETRIED: 'Invitation email retried',
  DOCUMENT_REQUEST_CANCELLED: 'Document request cancelled',
  DOCUMENT_REQUEST_REOPENED: 'Document request reopened',
  DOCUMENT_REQUEST_DELETED: 'Draft request permanently deleted',
  DOCUMENT_REQUEST_COMPLETED: 'Document request completed',
  DOCUMENT_ITEM_ACCEPTED: 'Document accepted',
  DOCUMENT_ITEM_REJECTED: 'Document rejected',
  REQUEST_ITEM_UNDER_REVIEW: 'Document marked under review',
  PORTAL_LINK_ISSUED: 'Fresh portal link issued',
  PORTAL_LINK_REVOKED: 'Portal link revoked',
  PORTAL_ACCESSED: 'Client opened portal link',
  FILE_UPLOAD_PRESIGNED: 'Client initiated document upload',
  FILE_UPLOADED: 'Client uploaded document',
  PORTAL_FILE_UPLOADED: 'Client uploaded document',
  FILE_DOWNLOAD_URL_ISSUED: 'Document downloaded',
  FILE_DOWNLOAD_SIGNED: 'Document downloaded',
  RECURRENCE_CREATED: 'Recurring schedule created',
  RECURRENCE_UPDATED: 'Recurring schedule updated',
  RECURRENCE_REQUEST_GENERATED: 'Recurring request generated',
};

export function formatAuditAction(action: string): string {
  if (AUDIT_ACTION_LABELS[action]) {
    return AUDIT_ACTION_LABELS[action];
  }
  return action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

