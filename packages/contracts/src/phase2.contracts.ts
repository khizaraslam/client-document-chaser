import { z } from 'zod';
import {
  ClientEntityType,
  ClientStatus,
  OrganizationCountry,
  RecurrenceFrequency,
  RecurrenceStatus,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
  TemplateCategory,
} from './enums';
import type {
  EmailDeliverySummary,
  IssuePortalLinkResponse,
  PortalAccessSummary,
  UploadedFileSummary,
} from './portal.contracts';

const optionalTrimmedText = (max: number) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().trim().max(max).optional(),
  );

const optionalUuid = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
  z.string().uuid('Invalid identifier').nullable().optional(),
);

export const DEFAULT_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

// -----------------------------------------------------------------------------
// Clients & Client Contacts
// -----------------------------------------------------------------------------

export const CreateClientContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Contact name is required').max(120),
  email: z.string().trim().email('Enter a valid contact email').max(255),
  phone: optionalTrimmedText(40),
  roleTitle: optionalTrimmedText(80),
  isPrimary: z.boolean().optional(),
});

export const UpdateClientContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Contact name is required').max(120).optional(),
  email: z.string().trim().email('Enter a valid contact email').max(255).optional(),
  phone: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(40).nullable().optional(),
  ),
  roleTitle: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(80).nullable().optional(),
  ),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const optionalEmail = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().trim().email('Enter a valid client email').max(255).optional(),
);

const nullableEmail = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
  z.string().trim().email('Enter a valid client email').max(255).nullable().optional(),
);

export const CreateClientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required').max(150),
  companyName: optionalTrimmedText(180),
  email: optionalEmail,
  phone: optionalTrimmedText(40),
  address: optionalTrimmedText(500),
  referenceCode: optionalTrimmedText(60),
  entityType: z.nativeEnum(ClientEntityType),
  country: z.nativeEnum(OrganizationCountry),
  assignedUserId: optionalUuid,
  notes: optionalTrimmedText(2000),
  primaryContact: CreateClientContactSchema.optional(),
});

export const UpdateClientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required').max(150).optional(),
  companyName: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(180).nullable().optional(),
  ),
  email: nullableEmail,
  phone: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(40).nullable().optional(),
  ),
  address: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(500).nullable().optional(),
  ),
  referenceCode: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(60).nullable().optional(),
  ),
  entityType: z.nativeEnum(ClientEntityType).optional(),
  country: z.nativeEnum(OrganizationCountry).optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  assignedUserId: optionalUuid,
  notes: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(2000).nullable().optional(),
  ),
});

export type CreateClientContactInput = z.infer<typeof CreateClientContactSchema>;
export type UpdateClientContactInput = z.infer<typeof UpdateClientContactSchema>;
export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;

export interface ClientContactItem {
  id: string;
  clientId: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleTitle: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  referenceCode: string | null;
  entityType: ClientEntityType;
  country: OrganizationCountry;
  status: ClientStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  contactsCount: number;
  openRequestsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDetail extends ClientSummary {
  notes: string | null;
  contacts: ClientContactItem[];
}

export interface ClientUploadedFileSummary extends UploadedFileSummary {
  requestTitle: string;
  requestStatus: RequestStatus;
}

// -----------------------------------------------------------------------------
// Templates & Template Items
// -----------------------------------------------------------------------------

export const TemplateItemInputSchema = z.object({
  title: z.string().trim().min(2, 'Item title is required').max(160),
  description: optionalTrimmedText(1000),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(500).optional(),
  acceptedMimeTypes: z.array(z.string().trim().min(3).max(120)).min(1).max(20).optional(),
});

export const UpdateTemplateItemSchema = z.object({
  title: z.string().trim().min(2, 'Item title is required').max(160).optional(),
  description: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(1000).nullable().optional(),
  ),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(500).optional(),
  acceptedMimeTypes: z.array(z.string().trim().min(3).max(120)).min(1).max(20).optional(),
});

export const CreateTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Template name is required').max(150),
  description: optionalTrimmedText(1000),
  category: z.nativeEnum(TemplateCategory),
  items: z.array(TemplateItemInputSchema).min(1, 'Add at least one checklist item').max(50),
});

export const UpdateTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Template name is required').max(150).optional(),
  description: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(1000).nullable().optional(),
  ),
  category: z.nativeEnum(TemplateCategory).optional(),
});

export type TemplateItemInput = z.infer<typeof TemplateItemInputSchema>;
export type UpdateTemplateItemInput = z.infer<typeof UpdateTemplateItemSchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

export interface TemplateItemDto {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  sortOrder: number;
  acceptedMimeTypes: string[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  isSystem: boolean;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateSummary {
  items: TemplateItemDto[];
}

// -----------------------------------------------------------------------------
// Document Requests & Request Items
// -----------------------------------------------------------------------------

export const RequestItemInputSchema = z.object({
  title: z.string().trim().min(2, 'Item title is required').max(160),
  description: optionalTrimmedText(1000),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(500).optional(),
  acceptedMimeTypes: z.array(z.string().trim().min(3).max(120)).min(1).max(20).optional(),
});

export const UpdateRequestItemSchema = z.object({
  title: z.string().trim().min(2, 'Item title is required').max(160).optional(),
  description: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(1000).nullable().optional(),
  ),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(500).optional(),
  acceptedMimeTypes: z.array(z.string().trim().min(3).max(120)).min(1).max(20).optional(),
});

export const CreateDocumentRequestSchema = z
  .object({
    clientId: z.string().uuid('Select a client'),
    templateId: optionalUuid,
    title: z.string().trim().min(2, 'Request title is required').max(180),
    instructions: optionalTrimmedText(4000),
    dueAt: z.string().min(1, 'Due date is required'),
    items: z.array(RequestItemInputSchema).max(50).optional(),
  })
  .refine(
    (val) => Boolean(val.templateId) || (Array.isArray(val.items) && val.items.length > 0),
    {
      message: 'Select a template or add at least one checklist item',
      path: ['items'],
    },
  );

export const UpdateDocumentRequestSchema = z.object({
  clientId: z.string().uuid('Select a valid client').optional(),
  title: z.string().trim().min(2, 'Request title is required').max(180).optional(),
  instructions: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(4000).nullable().optional(),
  ),
  dueAt: z.string().min(1).optional(),
});

export const CancelDocumentRequestSchema = z.object({
  reason: optionalTrimmedText(1000),
});

export const ReopenDocumentRequestSchema = z.object({
  dueAt: z.string().min(1).optional(),
  issuePortalLink: z.boolean().optional().default(false),
  sendEmail: z.boolean().optional().default(false),
});

export type RequestItemInput = z.infer<typeof RequestItemInputSchema>;
export type UpdateRequestItemInput = z.infer<typeof UpdateRequestItemSchema>;
export type CreateDocumentRequestInput = z.infer<typeof CreateDocumentRequestSchema>;
export type UpdateDocumentRequestInput = z.infer<typeof UpdateDocumentRequestSchema>;
export type CancelDocumentRequestInput = z.infer<typeof CancelDocumentRequestSchema>;
export type ReopenDocumentRequestInput = z.infer<typeof ReopenDocumentRequestSchema>;

export const ReviewDecisionInputSchema = z
  .object({
    decision: z.nativeEnum(ReviewDecision),
    uploadedFileId: optionalUuid,
    notes: optionalTrimmedText(2000),
  })
  .refine(
    (val) =>
      val.decision !== ReviewDecision.REJECTED ||
      Boolean(val.notes && val.notes.trim().length > 0),
    {
      message:
        'Provide a rejection reason so the client knows what to re-upload',
      path: ['notes'],
    },
  );

export const MarkItemUnderReviewSchema = z.object({
  notes: optionalTrimmedText(1000),
});

export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInputSchema>;
export type MarkItemUnderReviewInput = z.infer<typeof MarkItemUnderReviewSchema>;

export interface DocumentReviewItem {
  id: string;
  organizationId: string;
  requestId: string;
  requestItemId: string;
  uploadedFileId: string | null;
  reviewerUserId: string | null;
  reviewerName: string | null;
  decision: ReviewDecision;
  notes: string | null;
  createdAt: string;
}

export interface RequestItemSummary {
  id: string;
  requestId: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: RequestItemStatus;
  sortOrder: number;
  acceptedMimeTypes: string[];
  latestReview?: DocumentReviewItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRequestSummary {
  id: string;
  clientId: string;
  clientName: string;
  templateId: string | null;
  recurrenceId: string | null;
  periodKey: string | null;
  title: string;
  status: RequestStatus;
  isOverdue: boolean;
  dueAt: string;
  sentAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  totalItemsCount: number;
  completedItemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestClientSummary {
  id: string;
  name: string;
  companyName: string | null;
  referenceCode: string | null;
  entityType: ClientEntityType;
  country: OrganizationCountry;
  status: ClientStatus;
  email: string | null;
  phone: string | null;
  address: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
}

export interface DocumentRequestDetail extends DocumentRequestSummary {
  instructions: string | null;
  cancellationReason: string | null;
  items: RequestItemSummary[];
  client?: RequestClientSummary;
  recipientEmail?: string | null;
  emailDelivery?: EmailDeliverySummary | null;
  portalAccess?: PortalAccessSummary | null;
  files?: UploadedFileSummary[];
  reviews?: DocumentReviewItem[];
  issuedPortalLink?: IssuePortalLinkResponse | null;
}

// -----------------------------------------------------------------------------
// Recurring Request Schedules
// -----------------------------------------------------------------------------

export const CreateRecurrenceSchema = z.object({
  clientId: z.string().uuid('Select a client'),
  templateId: z.string().uuid('Select a template'),
  titleTemplate: z
    .string()
    .trim()
    .min(2, 'Schedule title template is required')
    .max(180),
  instructions: optionalTrimmedText(4000),
  frequency: z.nativeEnum(RecurrenceFrequency),
  dayOfMonth: z.coerce.number().int().min(1, 'Day must be between 1 and 28').max(28, 'Day must be between 1 and 28'),
  dueDaysAfterIssue: z.coerce.number().int().min(1).max(90).default(14),
  timezone: optionalTrimmedText(100),
});

export const UpdateRecurrenceSchema = z.object({
  titleTemplate: z.string().trim().min(2).max(180).optional(),
  instructions: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().trim().max(4000).nullable().optional(),
  ),
  frequency: z.nativeEnum(RecurrenceFrequency).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  dueDaysAfterIssue: z.coerce.number().int().min(1).max(90).optional(),
  timezone: z.string().trim().min(3).max(100).optional(),
  status: z.nativeEnum(RecurrenceStatus).optional(),
});

export type CreateRecurrenceInput = z.infer<typeof CreateRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof UpdateRecurrenceSchema>;

export interface RecurrenceSummary {
  id: string;
  clientId: string;
  clientName: string;
  templateId: string;
  templateName: string;
  titleTemplate: string;
  instructions: string | null;
  frequency: RecurrenceFrequency;
  dayOfMonth: number;
  dueDaysAfterIssue: number;
  timezone: string;
  status: RecurrenceStatus;
  nextRunAt: string;
  lastRunAt: string | null;
  lastPeriodKey: string | null;
  createdAt: string;
  updatedAt: string;
}
