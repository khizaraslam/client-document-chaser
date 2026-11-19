import {
  DocumentReviewItem,
  FileScanStatus,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { DocumentReviewEntity } from '../../database/entities/document-review.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import { MarkItemUnderReviewDto, ReviewDecisionDto } from './reviews.dto';

export interface ReviewItemResult {
  review: DocumentReviewItem;
  itemStatus: RequestItemStatus;
  requestStatus: RequestStatus;
  completedAt: string | null;
}

export interface MarkUnderReviewResult {
  itemId: string;
  itemStatus: RequestItemStatus;
  requestStatus: RequestStatus;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(DocumentReviewEntity)
    private readonly reviewRepo: Repository<DocumentReviewEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    @InjectRepository(RequestItemEntity)
    private readonly itemRepo: Repository<RequestItemEntity>,
    @InjectRepository(UploadedFileEntity)
    private readonly fileRepo: Repository<UploadedFileEntity>,
    @InjectRepository(ClientContactEntity)
    private readonly contactRepo: Repository<ClientContactEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listReviewsForRequest(
    auth: AuthenticatedContext,
    requestId: string,
  ): Promise<DocumentReviewItem[]> {
    await this.findAuthorizedRequest(auth, requestId);

    const rows = await this.reviewRepo.find({
      where: { organizationId: auth.organizationId, requestId },
      relations: { reviewerUser: true },
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => this.mapReview(row));
  }

  async markItemUnderReview(
    auth: AuthenticatedContext,
    requestId: string,
    itemId: string,
    dto: MarkItemUnderReviewDto = {},
    ipAddress?: string,
  ): Promise<MarkUnderReviewResult> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.DRAFT ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot mark items under review for a request in ${request.status} status`,
      );
    }

    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        requestId: request.id,
        organizationId: auth.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const files = await this.fileRepo.find({
      where: {
        organizationId: auth.organizationId,
        requestId: request.id,
        requestItemId: item.id,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    const usableFiles = files.filter(
      (f) => f.scanStatus !== FileScanStatus.PENDING_UPLOAD,
    );
    if (usableFiles.length === 0) {
      throw new BadRequestException(
        'Cannot mark a checklist item under review before any file has been uploaded',
      );
    }

    const cleanFile = usableFiles.find(
      (f) => f.scanStatus === FileScanStatus.CLEAN,
    );
    if (!cleanFile) {
      throw new BadRequestException(
        'At least one verified clean file is required before marking this item under review',
      );
    }

    const noteText = dto.notes?.trim() || null;

    const nextRequestStatus = await this.dataSource.transaction(
      async (manager) => {
        await manager.getRepository(RequestItemEntity).update(
          { id: item.id, organizationId: auth.organizationId },
          { status: RequestItemStatus.UNDER_REVIEW },
        );

        let updatedReqStatus = request.status;
        if (
          request.status === RequestStatus.COMPLETED ||
          request.status === RequestStatus.SENT ||
          request.status === RequestStatus.OVERDUE
        ) {
          updatedReqStatus = RequestStatus.IN_PROGRESS;
          await manager.getRepository(DocumentRequestEntity).update(
            { id: request.id, organizationId: auth.organizationId },
            { status: updatedReqStatus, completedAt: null },
          );
        }

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'REQUEST_ITEM_UNDER_REVIEW',
            resourceType: 'request_item',
            resourceId: item.id,
            metadata: {
              requestId: request.id,
              itemTitle: item.title,
              notes: noteText,
            },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        return updatedReqStatus;
      },
    );

    return {
      itemId: item.id,
      itemStatus: RequestItemStatus.UNDER_REVIEW,
      requestStatus: nextRequestStatus,
    };
  }

  async reviewItem(
    auth: AuthenticatedContext,
    requestId: string,
    itemId: string,
    dto: ReviewDecisionDto,
    ipAddress?: string,
  ): Promise<ReviewItemResult> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.DRAFT ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot review documents for a request in ${request.status} status`,
      );
    }

    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        requestId: request.id,
        organizationId: auth.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const trimmedNotes = dto.notes?.trim() || null;
    if (dto.decision === ReviewDecision.REJECTED && !trimmedNotes) {
      throw new BadRequestException(
        'Provide a rejection reason so the client knows what to re-upload',
      );
    }

    const itemFiles = await this.fileRepo.find({
      where: {
        organizationId: auth.organizationId,
        requestId: request.id,
        requestItemId: item.id,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    const submittedFiles = itemFiles.filter(
      (f) => f.scanStatus !== FileScanStatus.PENDING_UPLOAD,
    );

    let targetFile: UploadedFileEntity | null = null;
    if (dto.uploadedFileId) {
      const explicitFile = itemFiles.find((f) => f.id === dto.uploadedFileId);
      if (!explicitFile) {
        throw new NotFoundException(
          'Specified uploaded file was not found on this checklist item',
        );
      }
      targetFile = explicitFile;
    } else {
      targetFile =
        submittedFiles.find((f) => f.scanStatus === FileScanStatus.CLEAN) ??
        submittedFiles[0] ??
        null;
    }

    if (dto.decision === ReviewDecision.ACCEPTED) {
      if (!targetFile) {
        throw new BadRequestException(
          'Cannot accept a checklist item that has no verified clean uploaded file',
        );
      }
      if (targetFile.scanStatus !== FileScanStatus.CLEAN) {
        throw new BadRequestException(
          `Cannot accept a file in ${targetFile.scanStatus} scan status; only CLEAN verified files may be accepted`,
        );
      }
    } else {
      // Rejection requires either an uploaded file or an item already submitted/under review
      if (!targetFile && item.status === RequestItemStatus.PENDING) {
        throw new BadRequestException(
          'Cannot reject a checklist item before the client has submitted a document',
        );
      }
    }

    const nextItemStatus =
      dto.decision === ReviewDecision.ACCEPTED
        ? RequestItemStatus.ACCEPTED
        : RequestItemStatus.REJECTED;

    const now = new Date();

    const { savedReview, nextRequestStatus, nextCompletedAt, becameCompleted } =
      await this.dataSource.transaction(async (manager) => {
        const itemRepo = manager.getRepository(RequestItemEntity);
        const reqRepo = manager.getRepository(DocumentRequestEntity);
        const reviewRepo = manager.getRepository(DocumentReviewEntity);

        await itemRepo.update(
          { id: item.id, organizationId: auth.organizationId },
          { status: nextItemStatus },
        );

        const createdReview = await reviewRepo.save(
          reviewRepo.create({
            organizationId: auth.organizationId,
            requestId: request.id,
            requestItemId: item.id,
            uploadedFileId: targetFile?.id ?? null,
            reviewerUserId: auth.userId,
            decision: dto.decision,
            notes: trimmedNotes,
          }),
        );

        const allItems = await itemRepo.find({
          where: { organizationId: auth.organizationId, requestId: request.id },
        });
        const requiredItems = allItems.filter((i) => i.isRequired);
        const completionScope =
          requiredItems.length > 0 ? requiredItems : allItems;
        const allRequiredAccepted =
          completionScope.length > 0 &&
          completionScope.every(
            (i) => i.status === RequestItemStatus.ACCEPTED,
          );

        let computedStatus = request.status;
        let computedCompletedAt = request.completedAt;
        let transitionedToCompleted = false;

        if (allRequiredAccepted) {
          computedStatus = RequestStatus.COMPLETED;
          computedCompletedAt = request.completedAt ?? now;
          transitionedToCompleted = request.status !== RequestStatus.COMPLETED;
        } else {
          computedStatus = RequestStatus.IN_PROGRESS;
          computedCompletedAt = null;
        }

        if (
          computedStatus !== request.status ||
          (computedCompletedAt?.getTime() ?? null) !==
            (request.completedAt?.getTime() ?? null)
        ) {
          await reqRepo.update(
            { id: request.id, organizationId: auth.organizationId },
            {
              status: computedStatus,
              completedAt: computedCompletedAt,
            },
          );
        }

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action:
              dto.decision === ReviewDecision.ACCEPTED
                ? 'DOCUMENT_ITEM_ACCEPTED'
                : 'DOCUMENT_ITEM_REJECTED',
            resourceType: 'request_item',
            resourceId: item.id,
            metadata: {
              requestId: request.id,
              reviewId: createdReview.id,
              uploadedFileId: targetFile?.id ?? null,
              itemTitle: item.title,
              notes: trimmedNotes,
            },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        if (transitionedToCompleted) {
          await this.auditService.record(
            {
              organizationId: auth.organizationId,
              actorUserId: auth.userId,
              action: 'DOCUMENT_REQUEST_COMPLETED',
              resourceType: 'document_request',
              resourceId: request.id,
              metadata: {
                completedAt: computedCompletedAt?.toISOString(),
              },
              ipAddress: ipAddress ?? null,
            },
            manager,
          );
        }

        return {
          savedReview: createdReview,
          nextRequestStatus: computedStatus,
          nextCompletedAt: computedCompletedAt,
          becameCompleted: transitionedToCompleted,
        };
      });

    // Dispatch client notifications after transaction commits (fail-safe; never exposes raw portal token)
    if (dto.decision === ReviewDecision.REJECTED && trimmedNotes) {
      await this.dispatchRejectionNotification({
        organizationId: auth.organizationId,
        request,
        item,
        reviewId: savedReview.id,
        rejectionReason: trimmedNotes,
      });
    } else if (becameCompleted) {
      await this.dispatchCompletionNotification({
        organizationId: auth.organizationId,
        request,
        reviewId: savedReview.id,
      });
    }

    return {
      review: {
        ...this.mapReview(savedReview),
        reviewerName: auth.fullName,
      },
      itemStatus: nextItemStatus,
      requestStatus: nextRequestStatus,
      completedAt: nextCompletedAt ? nextCompletedAt.toISOString() : null,
    };
  }

  private async dispatchRejectionNotification(params: {
    organizationId: string;
    request: DocumentRequestEntity;
    item: RequestItemEntity;
    reviewId: string;
    rejectionReason: string;
  }): Promise<void> {
    const primaryContact = await this.findPrimaryContact(
      params.organizationId,
      params.request.clientId,
    );
    if (!primaryContact) return;

    const org = await this.orgRepo.findOne({
      where: { id: params.organizationId },
    });
    if (!org) return;

    const rendered = this.notificationsService
      .getTemplates()
      .buildDocumentRejectedEmail({
        firmName: org.name,
        clientName: params.request.client?.name ?? 'Client',
        recipientName: primaryContact.fullName,
        requestTitle: params.request.title,
        itemTitle: params.item.title,
        rejectionReason: params.rejectionReason,
      });

    const idempotencyKey = `review-rejected:${params.reviewId}`;
    const outbox = await this.notificationsService.enqueueOutboxEvent({
      organizationId: params.organizationId,
      aggregateType: 'document_request',
      aggregateId: params.request.id,
      eventType: 'review.item_rejected',
      idempotencyKey,
      recipientEmail: primaryContact.email,
      templateName: 'document_rejected',
      payload: {
        requestId: params.request.id,
        requestItemId: params.item.id,
        reviewId: params.reviewId,
        renderedEmail: rendered,
      },
    });

    await this.notificationsService.dispatchEmail({
      organizationId: params.organizationId,
      outboxEventId: outbox.id,
      recipientEmail: primaryContact.email,
      templateName: 'document_rejected',
      rendered,
      idempotencyKey,
    });
  }

  private async dispatchCompletionNotification(params: {
    organizationId: string;
    request: DocumentRequestEntity;
    reviewId: string;
  }): Promise<void> {
    const primaryContact = await this.findPrimaryContact(
      params.organizationId,
      params.request.clientId,
    );
    if (!primaryContact) return;

    const org = await this.orgRepo.findOne({
      where: { id: params.organizationId },
    });
    if (!org) return;

    const rendered = this.notificationsService
      .getTemplates()
      .buildRequestCompletedEmail({
        firmName: org.name,
        clientName: params.request.client?.name ?? 'Client',
        recipientName: primaryContact.fullName,
        requestTitle: params.request.title,
      });

    const idempotencyKey = `request-completed:${params.request.id}:${params.reviewId}`;
    const outbox = await this.notificationsService.enqueueOutboxEvent({
      organizationId: params.organizationId,
      aggregateType: 'document_request',
      aggregateId: params.request.id,
      eventType: 'request.completed',
      idempotencyKey,
      recipientEmail: primaryContact.email,
      templateName: 'request_completed',
      payload: {
        requestId: params.request.id,
        reviewId: params.reviewId,
        renderedEmail: rendered,
      },
    });

    await this.notificationsService.dispatchEmail({
      organizationId: params.organizationId,
      outboxEventId: outbox.id,
      recipientEmail: primaryContact.email,
      templateName: 'request_completed',
      rendered,
      idempotencyKey,
    });
  }

  private async findPrimaryContact(
    organizationId: string,
    clientId: string,
  ): Promise<ClientContactEntity | null> {
    const contacts = await this.contactRepo.find({
      where: {
        organizationId,
        clientId,
        isActive: true,
        deletedAt: IsNull(),
      },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return contacts[0] ?? null;
  }

  private async findAuthorizedRequest(
    auth: AuthenticatedContext,
    requestId: string,
  ): Promise<DocumentRequestEntity> {
    const request = await this.requestRepo.findOne({
      where: {
        id: requestId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
      relations: { client: true },
    });
    if (!request || !request.client || request.client.deletedAt) {
      throw new NotFoundException('Document request not found');
    }

    if (
      auth.role === UserRole.STAFF &&
      request.client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to review documents for this unassigned client',
      );
    }

    return request;
  }

  private async assertWorkspaceWritable(organizationId: string): Promise<void> {
    const subscription =
      await this.plansService.getSubscriptionSummary(organizationId);
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }
  }

  private mapReview(row: DocumentReviewEntity): DocumentReviewItem {
    return {
      id: row.id,
      organizationId: row.organizationId,
      requestId: row.requestId,
      requestItemId: row.requestItemId,
      uploadedFileId: row.uploadedFileId,
      reviewerUserId: row.reviewerUserId,
      reviewerName: row.reviewerUser?.fullName ?? null,
      decision: row.decision,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
