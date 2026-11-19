import {
  ClientStatus,
  DashboardAttentionRequestItem,
  DashboardSummaryResponse,
  EmailStatus,
  RecurrenceStatus,
  RequestItemStatus,
  RequestStatus,
  UserRole,
} from '@cdc/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { EmailEventEntity } from '../../database/entities/email-event.entity';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    @InjectRepository(RequestItemEntity)
    private readonly itemRepo: Repository<RequestItemEntity>,
    @InjectRepository(RecurrenceEntity)
    private readonly recurrenceRepo: Repository<RecurrenceEntity>,
    @InjectRepository(EmailEventEntity)
    private readonly emailEventRepo: Repository<EmailEventEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  async getSummary(
    auth: AuthenticatedContext,
  ): Promise<DashboardSummaryResponse> {
    const isStaff = auth.role === UserRole.STAFF;
    const isAdminOrOwner =
      auth.role === UserRole.OWNER || auth.role === UserRole.ADMIN;

    const subscription = await this.plansService.getSubscriptionSummary(
      auth.organizationId,
    );

    const clientsQb = this.clientRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere('c.status = :activeStatus', {
        activeStatus: ClientStatus.ACTIVE,
      });

    if (isStaff) {
      clientsQb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    }

    const requestsQb = this.requestRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.client', 'c')
      .where('r.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('r.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL');

    if (isStaff) {
      requestsQb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    }

    const recurrencesQb = this.recurrenceRepo
      .createQueryBuilder('rec')
      .innerJoin('rec.client', 'c')
      .where('rec.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('rec.status = :recStatus', {
        recStatus: RecurrenceStatus.ACTIVE,
      })
      .andWhere('c.deleted_at IS NULL');

    if (isStaff) {
      recurrencesQb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    }

    const [
      activeClientsCount,
      requests,
      activeRecurrencesCount,
      failedEmailsCount,
      recentAuditEvents,
    ] = await Promise.all([
      clientsQb.getCount(),
      requestsQb.getMany(),
      recurrencesQb.getCount(),
      isAdminOrOwner
        ? this.emailEventRepo.count({
            where: {
              organizationId: auth.organizationId,
              status: In([
                EmailStatus.FAILED,
                EmailStatus.FAILED_MISSING_CREDENTIALS,
                EmailStatus.BOUNCED,
                EmailStatus.COMPLAINED,
              ]),
            },
          })
        : Promise.resolve(0),
      isAdminOrOwner
        ? this.auditService.listForOrganization(auth.organizationId, 10)
        : Promise.resolve([]),
    ]);

    const requestIds = requests.map((r) => r.id);
    const items =
      requestIds.length > 0
        ? await this.itemRepo.find({
            where: {
              organizationId: auth.organizationId,
              requestId: In(requestIds),
            },
          })
        : [];

    const itemsByRequest = new Map<string, RequestItemEntity[]>();
    for (const item of items) {
      const list = itemsByRequest.get(item.requestId) ?? [];
      list.push(item);
      itemsByRequest.set(item.requestId, list);
    }

    const nowMs = Date.now();
    let draftRequestsCount = 0;
    let sentRequestsCount = 0;
    let inProgressRequestsCount = 0;
    let completedRequestsCount = 0;
    let cancelledRequestsCount = 0;
    let overdueRequestsCount = 0;
    let awaitingReviewItemsCount = 0;
    let rejectedItemsCount = 0;

    const attentionCandidates: Array<{
      item: DashboardAttentionRequestItem;
      priority: number;
    }> = [];

    for (const req of requests) {
      if (req.status === RequestStatus.DRAFT) draftRequestsCount++;
      else if (req.status === RequestStatus.SENT) sentRequestsCount++;
      else if (req.status === RequestStatus.IN_PROGRESS)
        inProgressRequestsCount++;
      else if (req.status === RequestStatus.COMPLETED) completedRequestsCount++;
      else if (req.status === RequestStatus.CANCELLED) cancelledRequestsCount++;

      const isOverdue =
        req.status === RequestStatus.OVERDUE ||
        ((req.status === RequestStatus.SENT ||
          req.status === RequestStatus.IN_PROGRESS) &&
          req.dueAt.getTime() < nowMs);

      if (isOverdue) {
        overdueRequestsCount++;
      }

      const reqItems = itemsByRequest.get(req.id) ?? [];
      const completedItemsCount = reqItems.filter(
        (i) => i.status === RequestItemStatus.ACCEPTED,
      ).length;
      const reqAwaitingReviewCount = reqItems.filter(
        (i) =>
          i.status === RequestItemStatus.UPLOADED ||
          i.status === RequestItemStatus.UNDER_REVIEW,
      ).length;
      const reqRejectedCount = reqItems.filter(
        (i) => i.status === RequestItemStatus.REJECTED,
      ).length;

      if (
        req.status !== RequestStatus.CANCELLED &&
        req.status !== RequestStatus.DRAFT
      ) {
        awaitingReviewItemsCount += reqAwaitingReviewCount;
        rejectedItemsCount += reqRejectedCount;
      }

      if (
        req.status !== RequestStatus.COMPLETED &&
        req.status !== RequestStatus.CANCELLED
      ) {
        // Prioritize: overdue > awaiting review > rejected > sent/in_progress > draft
        const priority = isOverdue
          ? 0
          : reqAwaitingReviewCount > 0
            ? 1
            : reqRejectedCount > 0
              ? 2
              : req.status === RequestStatus.DRAFT
                ? 4
                : 3;

        attentionCandidates.push({
          priority,
          item: {
            id: req.id,
            title: req.title,
            clientId: req.clientId,
            clientName: req.client?.name ?? 'Client',
            status: req.status,
            dueAt: req.dueAt.toISOString(),
            isOverdue,
            completedItemsCount,
            totalItemsCount: reqItems.length,
            awaitingReviewItemsCount: reqAwaitingReviewCount,
            rejectedItemsCount: reqRejectedCount,
          },
        });
      }
    }

    attentionCandidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (
        new Date(a.item.dueAt).getTime() - new Date(b.item.dueAt).getTime()
      );
    });

    const openRequestsCount =
      draftRequestsCount +
      sentRequestsCount +
      inProgressRequestsCount +
      requests.filter((r) => r.status === RequestStatus.OVERDUE).length;

    const trialEndsMs = new Date(subscription.trialEndsAt).getTime();
    const trialDaysRemaining = Math.max(
      0,
      Math.ceil((trialEndsMs - nowMs) / 86_400_000),
    );

    const storagePercentUsed =
      subscription.maxStorageBytes > 0
        ? Math.min(
            100,
            Math.round(
              (subscription.storageBytesUsed / subscription.maxStorageBytes) *
                100,
            ),
          )
        : 0;

    const emailPercentUsed =
      subscription.maxEmailsPerMonth > 0
        ? Math.min(
            100,
            Math.round(
              (subscription.emailsSentThisPeriod /
                subscription.maxEmailsPerMonth) *
                100,
            ),
          )
        : 0;

    return {
      metrics: {
        activeClientsCount,
        totalRequestsCount: requests.length,
        draftRequestsCount,
        sentRequestsCount,
        inProgressRequestsCount,
        completedRequestsCount,
        cancelledRequestsCount,
        overdueRequestsCount,
        openRequestsCount,
        awaitingReviewItemsCount,
        rejectedItemsCount,
        activeRecurrencesCount,
        failedEmailsCount,
      },
      usage: {
        storageBytesUsed: subscription.storageBytesUsed,
        maxStorageBytes: subscription.maxStorageBytes,
        storagePercentUsed,
        emailsSentThisPeriod: subscription.emailsSentThisPeriod,
        maxEmailsPerMonth: subscription.maxEmailsPerMonth,
        emailPercentUsed,
        activeClientsCount: subscription.activeClientsCount,
        maxActiveClients: subscription.maxActiveClients,
      },
      trial: {
        status: subscription.status,
        planCode: subscription.planCode,
        planName: subscription.planName,
        trialStartsAt: subscription.trialStartsAt,
        trialEndsAt: subscription.trialEndsAt,
        daysRemaining: trialDaysRemaining,
        isReadOnly: subscription.isReadOnly,
      },
      attentionRequests: attentionCandidates.slice(0, 8).map((c) => c.item),
      recentAuditEvents,
    };
  }
}
