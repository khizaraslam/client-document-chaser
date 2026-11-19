export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum OrganizationCountry {
  US = 'US',
  UK = 'UK',
}

export enum PlanCode {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  TRIAL_EXPIRED = 'TRIAL_EXPIRED',
  READ_ONLY = 'READ_ONLY',
}

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum EmailStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  BOUNCED = 'BOUNCED',
  COMPLAINED = 'COMPLAINED',
  FAILED_MISSING_CREDENTIALS = 'FAILED_MISSING_CREDENTIALS',
  FAILED = 'FAILED',
}

export enum AuditActorType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  PORTAL_CLIENT = 'PORTAL_CLIENT',
}

export enum RequestStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum RequestItemStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum FileScanStatus {
  PENDING_UPLOAD = 'PENDING_UPLOAD',
  QUARANTINED = 'QUARANTINED',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  REJECTED = 'REJECTED',
}

export enum ReviewDecision {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum RecurrenceFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

export enum RecurrenceStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum ClientEntityType {
  SOLE_TRADER = 'SOLE_TRADER',
  PARTNERSHIP = 'PARTNERSHIP',
  LLC = 'LLC',
  CORP = 'CORP',
  LTD = 'LTD',
  LLP = 'LLP',
  CHARITY = 'CHARITY',
  TRUST = 'TRUST',
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum TemplateCategory {
  ONBOARDING = 'ONBOARDING',
  TAX_RETURN = 'TAX_RETURN',
  BOOKKEEPING = 'BOOKKEEPING',
  VAT_SALES_TAX = 'VAT_SALES_TAX',
  PAYROLL = 'PAYROLL',
  AUDIT = 'AUDIT',
  GENERAL = 'GENERAL',
}
