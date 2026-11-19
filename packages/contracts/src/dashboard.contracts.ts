import {
  PlanCode,
  RequestStatus,
  SubscriptionStatus,
} from './enums';
import { AuditEventItem } from './organization.contracts';

export interface DashboardAttentionRequestItem {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  status: RequestStatus;
  dueAt: string;
  isOverdue: boolean;
  completedItemsCount: number;
  totalItemsCount: number;
  awaitingReviewItemsCount: number;
  rejectedItemsCount: number;
}

export interface DashboardSummaryResponse {
  metrics: {
    activeClientsCount: number;
    totalRequestsCount: number;
    draftRequestsCount: number;
    sentRequestsCount: number;
    inProgressRequestsCount: number;
    completedRequestsCount: number;
    cancelledRequestsCount: number;
    overdueRequestsCount: number;
    openRequestsCount: number;
    awaitingReviewItemsCount: number;
    rejectedItemsCount: number;
    activeRecurrencesCount: number;
    failedEmailsCount: number;
  };
  usage: {
    storageBytesUsed: number;
    maxStorageBytes: number;
    storagePercentUsed: number;
    emailsSentThisPeriod: number;
    maxEmailsPerMonth: number;
    emailPercentUsed: number;
    activeClientsCount: number;
    maxActiveClients: number;
  };
  trial: {
    status: SubscriptionStatus;
    planCode: PlanCode;
    planName: string;
    trialStartsAt: string;
    trialEndsAt: string;
    daysRemaining: number;
    isReadOnly: boolean;
  };
  attentionRequests: DashboardAttentionRequestItem[];
  recentAuditEvents: AuditEventItem[];
}
