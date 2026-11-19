import { AuditEventEntity } from './audit-event.entity';
import { ClientContactEntity } from './client-contact.entity';
import { ClientEntity } from './client.entity';
import { DocumentRequestEntity } from './document-request.entity';
import { DocumentReviewEntity } from './document-review.entity';
import { EmailEventEntity } from './email-event.entity';
import { InvitationEntity } from './invitation.entity';
import { MembershipEntity } from './membership.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { OrganizationEntity } from './organization.entity';
import { OutboxEventEntity } from './outbox-event.entity';
import { PlanEntity } from './plan.entity';
import { PortalAccessEntity } from './portal-access.entity';
import { RecurrenceEntity } from './recurrence.entity';
import { RefreshSessionEntity } from './refresh-session.entity';
import { RequestItemEntity } from './request-item.entity';
import { TemplateItemEntity } from './template-item.entity';
import { TemplateEntity } from './template.entity';
import { UploadedFileEntity } from './uploaded-file.entity';
import { UserEntity } from './user.entity';

export const PHASE1_ENTITIES = [
  UserEntity,
  OrganizationEntity,
  MembershipEntity,
  RefreshSessionEntity,
  InvitationEntity,
  PlanEntity,
  OrganizationSubscriptionEntity,
  AuditEventEntity,
  OutboxEventEntity,
  EmailEventEntity,
];

export const PHASE2_ENTITIES = [
  ClientEntity,
  ClientContactEntity,
  TemplateEntity,
  TemplateItemEntity,
  RecurrenceEntity,
  DocumentRequestEntity,
  RequestItemEntity,
  DocumentReviewEntity,
];

export const PORTAL_AND_FILE_ENTITIES = [
  PortalAccessEntity,
  UploadedFileEntity,
];

export const ALL_ENTITIES = [
  ...PHASE1_ENTITIES,
  ...PHASE2_ENTITIES,
  ...PORTAL_AND_FILE_ENTITIES,
];

export {
  AuditEventEntity,
  ClientContactEntity,
  ClientEntity,
  DocumentRequestEntity,
  DocumentReviewEntity,
  EmailEventEntity,
  InvitationEntity,
  MembershipEntity,
  OrganizationEntity,
  OrganizationSubscriptionEntity,
  OutboxEventEntity,
  PlanEntity,
  PortalAccessEntity,
  RecurrenceEntity,
  RefreshSessionEntity,
  RequestItemEntity,
  TemplateEntity,
  TemplateItemEntity,
  UploadedFileEntity,
  UserEntity,
};
