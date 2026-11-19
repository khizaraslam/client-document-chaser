import {
  AuditEventItem,
  ClientStatus,
  DEFAULT_ACCEPTED_MIME_TYPES,
  DocumentRequestDetail,
  DocumentRequestSummary,
  DocumentReviewItem,
  EmailDeliverySummary,
  EmailStatus,
  FileScanStatus,
  IssuePortalLinkResponse,
  PortalAccessLifecycleStatus,
  PortalAccessSummary,
  RequestItemStatus,
  RequestItemSummary,
  RequestStatus,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import {
  generateOpaqueToken,
  hashToken,
} from '../../common/utils/crypto.util';
import { AuditEventEntity } from '../../database/entities/audit-event.entity';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { DocumentReviewEntity } from '../../database/entities/document-review.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { OutboxEventEntity } from '../../database/entities/outbox-event.entity';
import { PortalAccessEntity } from '../../database/entities/portal-access.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { TemplateItemEntity } from '../../database/entities/template-item.entity';
import { TemplateEntity } from '../../database/entities/template.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import {
  CancelDocumentRequestDto,
  CreateDocumentRequestDto,
  IssuePortalLinkDto,
  ListRequestsQueryDto,
  ReopenDocumentRequestDto,
  RequestItemDtoInput,
  UpdateDocumentRequestDto,
  UpdateRequestItemDto,
} from './requests.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    @InjectRepository(RequestItemEntity)
    private readonly itemRepo: Repository<RequestItemEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(ClientContactEntity)
    private readonly contactRepo: Repository<ClientContactEntity>,
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectRepository(TemplateItemEntity)
    private readonly templateItemRepo: Repository<TemplateItemEntity>,
    @InjectRepository(PortalAccessEntity)
    private readonly portalAccessRepo: Repository<PortalAccessEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly configService: ConfigService,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly filesService: FilesService,
  ) {}

  async listRequests(
    auth: AuthenticatedContext,
    query: ListRequestsQueryDto,
  ): Promise<DocumentRequestSummary[]> {
    const qb = this.requestRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.client', 'c')
      .where('r.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('r.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL');

    if (auth.role === UserRole.STAFF) {
      qb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    }

    if (query.clientId) {
      qb.andWhere('r.client_id = :clientId', { clientId: query.clientId });
    }

    if (query.status) {
      if (query.status === RequestStatus.OVERDUE) {
        qb.andWhere(
          '(r.status = :overdueStatus OR (r.status IN (:...openStatuses) AND r.due_at < :now))',
          {
            overdueStatus: RequestStatus.OVERDUE,
            openStatuses: [RequestStatus.SENT, RequestStatus.IN_PROGRESS],
            now: new Date(),
          },
        );
      } else {
        qb.andWhere('r.status = :status', { status: query.status });
      }
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(r.title) LIKE :term OR LOWER(c.name) LIKE :term)', {
        term,
      });
    }

    qb.orderBy('r.due_at', 'ASC').addOrderBy('r.created_at', 'DESC');
    const requests = await qb.getMany();
    if (requests.length === 0) return [];

    const items = await this.itemRepo.find({
      where: {
        organizationId: auth.organizationId,
        requestId: In(requests.map((r) => r.id)),
      },
    });

    const itemsByRequest = new Map<string, RequestItemEntity[]>();
    for (const item of items) {
      const list = itemsByRequest.get(item.requestId) ?? [];
      list.push(item);
      itemsByRequest.set(item.requestId, list);
    }

    return requests.map((req) =>
      this.mapSummary(req, itemsByRequest.get(req.id) ?? []),
    );
  }

  async getRequest(
    auth: AuthenticatedContext,
    requestId: string,
  ): Promise<DocumentRequestDetail> {
    const request = await this.findAuthorizedRequest(auth, requestId);
    const items = await this.itemRepo.find({
      where: {
        organizationId: auth.organizationId,
        requestId: request.id,
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const [latestPortalAccess, emailDelivery, files, primaryContact, reviews] =
      await Promise.all([
        this.portalAccessRepo.findOne({
          where: {
            organizationId: auth.organizationId,
            requestId: request.id,
          },
          order: { createdAt: 'DESC' },
        }),
        this.notificationsService.getLatestEmailDeliveryForAggregate(
          auth.organizationId,
          'document_request',
          request.id,
        ),
        this.filesService.listFilesForRequest(auth, request.id),
        this.findPrimaryContact(auth.organizationId, request.clientId),
        this.dataSource.getRepository(DocumentReviewEntity).find({
          where: {
            organizationId: auth.organizationId,
            requestId: request.id,
          },
          relations: { reviewerUser: true },
          order: { createdAt: 'DESC' },
        }),
      ]);

    const mappedReviews: DocumentReviewItem[] = reviews.map((row) => ({
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
    }));

    const latestReviewByItem = new Map<string, DocumentReviewItem>();
    for (const review of mappedReviews) {
      if (!latestReviewByItem.has(review.requestItemId)) {
        latestReviewByItem.set(review.requestItemId, review);
      }
    }

    const recipientEmail =
      latestPortalAccess?.recipientEmail ?? primaryContact?.email ?? null;

    return {
      ...this.mapSummary(request, items),
      instructions: request.instructions,
      cancellationReason: request.cancellationReason ?? null,
      items: items.map((item) => ({
        ...this.mapItem(item),
        latestReview: latestReviewByItem.get(item.id) ?? null,
      })),
      client: {
        id: request.client.id,
        name: request.client.name,
        companyName: request.client.companyName ?? null,
        referenceCode: request.client.referenceCode ?? null,
        entityType: request.client.entityType,
        country: request.client.country,
        status: request.client.status,
        email: request.client.email ?? null,
        phone: request.client.phone ?? null,
        address: request.client.address ?? null,
        primaryContactName: primaryContact?.fullName ?? null,
        primaryContactEmail: primaryContact?.email ?? null,
        primaryContactPhone: primaryContact?.phone ?? null,
      },
      recipientEmail,
      emailDelivery,
      portalAccess: latestPortalAccess
        ? this.mapPortalAccess(latestPortalAccess)
        : null,
      files,
      reviews: mappedReviews,
    };
  }

  async listRequestActivity(
    auth: AuthenticatedContext,
    requestId: string,
  ): Promise<AuditEventItem[]> {
    const request = await this.findAuthorizedRequest(auth, requestId);

    const [items, files, portals, orgEvents] = await Promise.all([
      this.itemRepo.find({
        where: { organizationId: auth.organizationId, requestId: request.id },
        select: ['id'],
      }),
      this.dataSource.getRepository(UploadedFileEntity).find({
        where: { organizationId: auth.organizationId, requestId: request.id },
        withDeleted: true,
        select: ['id'],
      }),
      this.portalAccessRepo.find({
        where: { organizationId: auth.organizationId, requestId: request.id },
        select: ['id'],
      }),
      this.dataSource.getRepository(AuditEventEntity).find({
        where: { organizationId: auth.organizationId },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
    ]);

    const itemIds = new Set(items.map((i) => i.id));
    const fileIds = new Set(files.map((f) => f.id));
    const portalIds = new Set(portals.map((p) => p.id));

    const matching = orgEvents.filter((evt) => {
      if (
        evt.resourceType === 'document_request' &&
        evt.resourceId === request.id
      ) {
        return true;
      }
      if (
        evt.resourceType === 'request_item' &&
        evt.resourceId &&
        itemIds.has(evt.resourceId)
      ) {
        return true;
      }
      if (
        evt.resourceType === 'uploaded_file' &&
        evt.resourceId &&
        fileIds.has(evt.resourceId)
      ) {
        return true;
      }
      if (
        evt.resourceType === 'portal_access' &&
        evt.resourceId &&
        portalIds.has(evt.resourceId)
      ) {
        return true;
      }
      if (
        typeof evt.metadata?.['requestId'] === 'string' &&
        evt.metadata['requestId'] === request.id
      ) {
        return true;
      }
      return false;
    });

    return matching.slice(0, 50).map((row) => ({
      id: row.id,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createRequest(
    auth: AuthenticatedContext,
    dto: CreateDocumentRequestDto,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const client = await this.clientRepo.findOne({
      where: {
        id: dto.clientId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (
      auth.role === UserRole.STAFF &&
      client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to create requests for this unassigned client',
      );
    }
    if (client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot create document requests for an archived client',
      );
    }

    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid due date');
    }

    let snapshotItems: RequestItemDtoInput[] = [];
    let resolvedTemplateId: string | null = null;

    if (dto.templateId) {
      const template = await this.templateRepo.findOne({
        where: {
          id: dto.templateId,
          organizationId: auth.organizationId,
          deletedAt: IsNull(),
        },
      });
      if (!template) {
        throw new NotFoundException('Template not found');
      }
      resolvedTemplateId = template.id;

      if (dto.items && dto.items.length > 0) {
        snapshotItems = dto.items;
      } else {
        const templateItems = await this.templateItemRepo.find({
          where: {
            organizationId: auth.organizationId,
            templateId: template.id,
          },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        });
        snapshotItems = templateItems.map((ti) => ({
          title: ti.title,
          description: ti.description ?? undefined,
          isRequired: ti.isRequired,
          sortOrder: ti.sortOrder,
          acceptedMimeTypes: ti.acceptedMimeTypes,
        }));
      }
    } else if (dto.items && dto.items.length > 0) {
      snapshotItems = dto.items;
    }

    if (snapshotItems.length === 0) {
      throw new BadRequestException(
        'A document request must include at least one checklist item',
      );
    }

    const createdId = await this.dataSource.transaction(async (manager) => {
      const reqRepo = manager.getRepository(DocumentRequestEntity);
      const itemRepo = manager.getRepository(RequestItemEntity);

      const savedReq = await reqRepo.save(
        reqRepo.create({
          organizationId: auth.organizationId,
          clientId: client.id,
          templateId: resolvedTemplateId,
          title: dto.title.trim(),
          instructions: dto.instructions?.trim() || null,
          status: RequestStatus.DRAFT,
          dueAt,
          createdByUserId: auth.userId,
        }),
      );

      for (let i = 0; i < snapshotItems.length; i++) {
        const input = snapshotItems[i]!;
        await itemRepo.save(
          itemRepo.create({
            organizationId: auth.organizationId,
            requestId: savedReq.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            isRequired: input.isRequired ?? true,
            status: RequestItemStatus.PENDING,
            sortOrder: input.sortOrder ?? i,
            acceptedMimeTypes:
              input.acceptedMimeTypes && input.acceptedMimeTypes.length > 0
                ? input.acceptedMimeTypes
                : [...DEFAULT_ACCEPTED_MIME_TYPES],
          }),
        );
      }

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'DOCUMENT_REQUEST_CREATED',
          resourceType: 'document_request',
          resourceId: savedReq.id,
          metadata: {
            clientId: client.id,
            templateId: resolvedTemplateId,
            itemsCount: snapshotItems.length,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedReq.id;
    });

    return this.getRequest(auth, createdId);
  }

  async updateRequest(
    auth: AuthenticatedContext,
    requestId: string,
    dto: UpdateDocumentRequestDto,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot modify a ${request.status.toLowerCase()} document request`,
      );
    }

    const updates: Partial<DocumentRequestEntity> = {};

    if (dto.clientId !== undefined && dto.clientId !== request.clientId) {
      const [fileCount, portalCount, outboxCount] = await Promise.all([
        this.dataSource.getRepository(UploadedFileEntity).count({
          where: { organizationId: auth.organizationId, requestId: request.id },
          withDeleted: true,
        }),
        this.portalAccessRepo.count({
          where: { organizationId: auth.organizationId, requestId: request.id },
        }),
        this.dataSource.getRepository(OutboxEventEntity).count({
          where: {
            organizationId: auth.organizationId,
            aggregateType: 'document_request',
            aggregateId: request.id,
          },
        }),
      ]);

      if (
        request.status !== RequestStatus.DRAFT ||
        request.sentAt !== null ||
        fileCount > 0 ||
        portalCount > 0 ||
        outboxCount > 0
      ) {
        throw new BadRequestException(
          'Cannot change the client after a request has been sent or has portal or upload activity',
        );
      }

      const targetClient = await this.clientRepo.findOne({
        where: {
          id: dto.clientId,
          organizationId: auth.organizationId,
          deletedAt: IsNull(),
        },
      });
      if (!targetClient) {
        throw new NotFoundException('Target client not found');
      }
      if (
        auth.role === UserRole.STAFF &&
        targetClient.assignedUserId !== auth.userId
      ) {
        throw new ForbiddenException(
          'You do not have access to reassign requests to this unassigned client',
        );
      }
      if (targetClient.status !== ClientStatus.ACTIVE) {
        throw new BadRequestException(
          'Cannot reassign a document request to an archived client',
        );
      }
      updates.clientId = targetClient.id;
    }

    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.instructions !== undefined) {
      updates.instructions = dto.instructions?.trim() || null;
    }
    if (dto.dueAt !== undefined) {
      const parsed = new Date(dto.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid due date');
      }
      updates.dueAt = parsed;

      if (
        request.status === RequestStatus.OVERDUE &&
        parsed.getTime() > Date.now()
      ) {
        const uploadedCount = await this.dataSource
          .getRepository(UploadedFileEntity)
          .count({
            where: {
              organizationId: auth.organizationId,
              requestId: request.id,
              deletedAt: IsNull(),
              scanStatus: In([
                FileScanStatus.CLEAN,
                FileScanStatus.QUARANTINED,
              ]),
            },
          });
        updates.status =
          uploadedCount > 0 ? RequestStatus.IN_PROGRESS : RequestStatus.SENT;
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.requestRepo.update(
        { id: request.id, organizationId: auth.organizationId },
        updates,
      );
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'DOCUMENT_REQUEST_UPDATED',
        resourceType: 'document_request',
        resourceId: request.id,
        metadata: updates,
        ipAddress: ipAddress ?? null,
      });
    }

    return this.getRequest(auth, request.id);
  }

  async addItem(
    auth: AuthenticatedContext,
    requestId: string,
    dto: RequestItemDtoInput,
    ipAddress?: string,
  ): Promise<RequestItemSummary> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot add items to a ${request.status.toLowerCase()} request`,
      );
    }

    const existingCount = await this.itemRepo.count({
      where: { organizationId: auth.organizationId, requestId: request.id },
    });

    const saved = await this.itemRepo.save(
      this.itemRepo.create({
        organizationId: auth.organizationId,
        requestId: request.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        isRequired: dto.isRequired ?? true,
        status: RequestItemStatus.PENDING,
        sortOrder: dto.sortOrder ?? existingCount,
        acceptedMimeTypes:
          dto.acceptedMimeTypes && dto.acceptedMimeTypes.length > 0
            ? dto.acceptedMimeTypes
            : [...DEFAULT_ACCEPTED_MIME_TYPES],
      }),
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'DOCUMENT_REQUEST_ITEM_ADDED',
      resourceType: 'request_item',
      resourceId: saved.id,
      metadata: { requestId: request.id, title: saved.title },
      ipAddress: ipAddress ?? null,
    });

    return this.mapItem(saved);
  }

  async updateItem(
    auth: AuthenticatedContext,
    requestId: string,
    itemId: string,
    dto: UpdateRequestItemDto,
    ipAddress?: string,
  ): Promise<RequestItemSummary> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot modify items on a ${request.status.toLowerCase()} request`,
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
      throw new NotFoundException('Request item not found');
    }

    const updates: Partial<RequestItemEntity> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.description !== undefined) {
      updates.description = dto.description?.trim() || null;
    }
    if (dto.isRequired !== undefined) updates.isRequired = dto.isRequired;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.acceptedMimeTypes !== undefined) {
      updates.acceptedMimeTypes = dto.acceptedMimeTypes;
    }

    if (Object.keys(updates).length > 0) {
      await this.itemRepo.update(
        { id: item.id, organizationId: auth.organizationId },
        updates,
      );
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'DOCUMENT_REQUEST_ITEM_UPDATED',
        resourceType: 'request_item',
        resourceId: item.id,
        metadata: { requestId: request.id, title: updates.title ?? item.title },
        ipAddress: ipAddress ?? null,
      });
    }

    const refreshed = await this.itemRepo.findOneOrFail({
      where: { id: item.id, organizationId: auth.organizationId },
    });
    return this.mapItem(refreshed);
  }

  async deleteItem(
    auth: AuthenticatedContext,
    requestId: string,
    itemId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot remove items from a ${request.status.toLowerCase()} request`,
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
      throw new NotFoundException('Request item not found');
    }

    const attachedFilesCount = await this.dataSource
      .getRepository(UploadedFileEntity)
      .count({
        where: {
          organizationId: auth.organizationId,
          requestId: request.id,
          requestItemId: item.id,
        },
        withDeleted: true,
      });

    if (attachedFilesCount > 0) {
      throw new ConflictException(
        'Cannot remove a checklist item that has uploaded files. Submitted documents must be preserved.',
      );
    }

    const itemCount = await this.itemRepo.count({
      where: { requestId: request.id, organizationId: auth.organizationId },
    });
    if (itemCount <= 1) {
      throw new BadRequestException(
        'A document request must have at least one checklist item',
      );
    }

    await this.itemRepo.delete({
      id: item.id,
      organizationId: auth.organizationId,
    });

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'DOCUMENT_REQUEST_ITEM_DELETED',
      resourceType: 'request_item',
      resourceId: item.id,
      metadata: { requestId: request.id, title: item.title },
      ipAddress: ipAddress ?? null,
    });
  }

  async sendRequest(
    auth: AuthenticatedContext,
    requestId: string,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (request.status !== RequestStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT requests can be sent (current status: ${request.status})`,
      );
    }

    if (request.client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot send a document request for an archived client',
      );
    }

    const itemCount = await this.itemRepo.count({
      where: { requestId: request.id, organizationId: auth.organizationId },
    });
    if (itemCount === 0) {
      throw new BadRequestException(
        'Add at least one checklist item before sending this request',
      );
    }

    const primaryContact = await this.findPrimaryContact(
      auth.organizationId,
      request.clientId,
    );
    if (!primaryContact) {
      throw new BadRequestException(
        'Add at least one active client contact before sending this document request',
      );
    }

    const org = await this.orgRepo.findOneOrFail({
      where: { id: auth.organizationId },
    });

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = this.computePortalExpiry();
    const sentAt = new Date();
    const idempotencyKey = `request-sent:${request.id}`;

    const outboxEvent = await this.dataSource.transaction(async (manager) => {
      const reqUpdate = await manager
        .getRepository(DocumentRequestEntity)
        .createQueryBuilder()
        .update(DocumentRequestEntity)
        .set({ status: RequestStatus.SENT, sentAt })
        .where('id = :id', { id: request.id })
        .andWhere('organization_id = :orgId', { orgId: auth.organizationId })
        .andWhere('status = :draftStatus', {
          draftStatus: RequestStatus.DRAFT,
        })
        .execute();

      if ((reqUpdate.affected ?? 0) === 0) {
        throw new ConflictException('Document request has already been sent');
      }

      const portalRepo = manager.getRepository(PortalAccessEntity);
      await portalRepo.update(
        {
          organizationId: auth.organizationId,
          requestId: request.id,
          revokedAt: IsNull(),
        },
        { revokedAt: sentAt },
      );

      const savedPortal = await portalRepo.save(
        portalRepo.create({
          organizationId: auth.organizationId,
          requestId: request.id,
          clientId: request.clientId,
          tokenHash,
          recipientEmail: primaryContact.email,
          expiresAt,
          createdByUserId: auth.userId,
        }),
      );

      // Never store raw portal token in outbox payloads
      const outbox = await this.notificationsService.enqueueOutboxEvent(
        {
          organizationId: auth.organizationId,
          aggregateType: 'document_request',
          aggregateId: request.id,
          eventType: 'request.sent',
          idempotencyKey,
          recipientEmail: primaryContact.email,
          templateName: 'document_request_sent',
          payload: {
            requestId: request.id,
            clientId: request.clientId,
            portalAccessId: savedPortal.id,
            title: request.title,
            dueAt: request.dueAt.toISOString(),
          },
        },
        manager,
      );

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'DOCUMENT_REQUEST_SENT',
          resourceType: 'document_request',
          resourceId: request.id,
          metadata: {
            recipientEmail: primaryContact.email,
            itemsCount: itemCount,
            portalAccessId: savedPortal.id,
            expiresAt: expiresAt.toISOString(),
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return outbox;
    });

    const templates = this.notificationsService.getTemplates();
    const portalUrl = templates.buildPortalUrl(rawToken);
    const rendered = templates.buildDocumentRequestPortalEmail({
      firmName: org.name,
      clientName: request.client.name,
      recipientName: primaryContact.fullName,
      requestTitle: request.title,
      dueAt: request.dueAt,
      instructions: request.instructions,
      itemsCount: itemCount,
      portalUrl,
      expiresAt,
    });

    await this.notificationsService.dispatchEmail({
      organizationId: auth.organizationId,
      outboxEventId: outboxEvent.id,
      recipientEmail: primaryContact.email,
      templateName: 'document_request_sent',
      rendered,
      idempotencyKey,
    });

    return this.getRequest(auth, request.id);
  }

  async resendRequestEmail(
    auth: AuthenticatedContext,
    requestId: string,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.DRAFT ||
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot resend portal email for a request in ${request.status} status`,
      );
    }

    const latestDelivery =
      await this.notificationsService.getLatestEmailDeliveryForAggregate(
        auth.organizationId,
        'document_request',
        request.id,
      );

    if (
      latestDelivery &&
      (latestDelivery.status === EmailStatus.SENT ||
        latestDelivery.status === EmailStatus.DELIVERED ||
        latestDelivery.status === EmailStatus.QUEUED)
    ) {
      throw new ConflictException(
        'An email invitation was already accepted or queued. Issue a fresh portal link if you want to revoke the previous link and send a new email.',
      );
    }

    const primaryContact = await this.findPrimaryContact(
      auth.organizationId,
      request.clientId,
    );
    if (!primaryContact) {
      throw new BadRequestException(
        'Add at least one active client contact before retrying email delivery',
      );
    }

    const itemCount = await this.itemRepo.count({
      where: { requestId: request.id, organizationId: auth.organizationId },
    });
    const org = await this.orgRepo.findOneOrFail({
      where: { id: auth.organizationId },
    });

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = this.computePortalExpiry();
    const now = new Date();

    const { savedPortal, outboxEvent, idempotencyKey } =
      await this.dataSource.transaction(async (manager) => {
        const portalRepo = manager.getRepository(PortalAccessEntity);
        await portalRepo.update(
          {
            organizationId: auth.organizationId,
            requestId: request.id,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );

        const portal = await portalRepo.save(
          portalRepo.create({
            organizationId: auth.organizationId,
            requestId: request.id,
            clientId: request.clientId,
            tokenHash,
            recipientEmail: primaryContact.email,
            expiresAt,
            createdByUserId: auth.userId,
          }),
        );

        const retryKey = `request-resend:${portal.id}`;
        const outbox = await this.notificationsService.enqueueOutboxEvent(
          {
            organizationId: auth.organizationId,
            aggregateType: 'document_request',
            aggregateId: request.id,
            eventType: 'request.email_retried',
            idempotencyKey: retryKey,
            recipientEmail: primaryContact.email,
            templateName: 'document_request_sent',
            payload: {
              requestId: request.id,
              clientId: request.clientId,
              portalAccessId: portal.id,
              title: request.title,
            },
          },
          manager,
        );

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'DOCUMENT_REQUEST_EMAIL_RETRIED',
            resourceType: 'document_request',
            resourceId: request.id,
            metadata: {
              recipientEmail: primaryContact.email,
              portalAccessId: portal.id,
            },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        return { savedPortal: portal, outboxEvent: outbox, idempotencyKey: retryKey };
      });

    const templates = this.notificationsService.getTemplates();
    const portalUrl = templates.buildPortalUrl(rawToken);
    const rendered = templates.buildDocumentRequestPortalEmail({
      firmName: org.name,
      clientName: request.client.name,
      recipientName: primaryContact.fullName,
      requestTitle: request.title,
      dueAt: request.dueAt,
      instructions: request.instructions,
      itemsCount: itemCount,
      portalUrl,
      expiresAt: savedPortal.expiresAt,
    });

    await this.notificationsService.dispatchEmail({
      organizationId: auth.organizationId,
      outboxEventId: outboxEvent.id,
      recipientEmail: primaryContact.email,
      templateName: 'document_request_sent',
      rendered,
      idempotencyKey,
    });

    return this.getRequest(auth, request.id);
  }

  async issueFreshPortalLink(
    auth: AuthenticatedContext,
    requestId: string,
    dto: IssuePortalLinkDto,
    ipAddress?: string,
  ): Promise<IssuePortalLinkResponse> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status === RequestStatus.DRAFT ||
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot issue a portal link for a request in ${request.status} status`,
      );
    }

    const primaryContact = await this.findPrimaryContact(
      auth.organizationId,
      request.clientId,
    );
    if (!primaryContact) {
      throw new BadRequestException(
        'Add at least one active client contact before issuing a portal link',
      );
    }

    const itemCount = await this.itemRepo.count({
      where: { requestId: request.id, organizationId: auth.organizationId },
    });
    const org = await this.orgRepo.findOneOrFail({
      where: { id: auth.organizationId },
    });

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = this.computePortalExpiry();
    const now = new Date();
    const shouldEmail = Boolean(dto.sendEmail);

    const { savedPortal, outboxEvent, idempotencyKey } =
      await this.dataSource.transaction(async (manager) => {
        const portalRepo = manager.getRepository(PortalAccessEntity);
        await portalRepo.update(
          {
            organizationId: auth.organizationId,
            requestId: request.id,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );

        const portal = await portalRepo.save(
          portalRepo.create({
            organizationId: auth.organizationId,
            requestId: request.id,
            clientId: request.clientId,
            tokenHash,
            recipientEmail: primaryContact.email,
            expiresAt,
            createdByUserId: auth.userId,
          }),
        );

        const key = `portal-link-issued:${portal.id}`;
        const outbox = shouldEmail
          ? await this.notificationsService.enqueueOutboxEvent(
              {
                organizationId: auth.organizationId,
                aggregateType: 'document_request',
                aggregateId: request.id,
                eventType: 'request.portal_link_issued',
                idempotencyKey: key,
                recipientEmail: primaryContact.email,
                templateName: 'document_request_sent',
                payload: {
                  requestId: request.id,
                  clientId: request.clientId,
                  portalAccessId: portal.id,
                  title: request.title,
                },
              },
              manager,
            )
          : null;

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'PORTAL_LINK_ISSUED',
            resourceType: 'document_request',
            resourceId: request.id,
            metadata: {
              portalAccessId: portal.id,
              recipientEmail: primaryContact.email,
              sendEmail: shouldEmail,
              expiresAt: expiresAt.toISOString(),
            },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        return { savedPortal: portal, outboxEvent: outbox, idempotencyKey: key };
      });

    const templates = this.notificationsService.getTemplates();
    const portalUrl = templates.buildPortalUrl(rawToken);

    let emailDelivery: EmailDeliverySummary | null = null;
    if (shouldEmail && outboxEvent) {
      const rendered = templates.buildDocumentRequestPortalEmail({
        firmName: org.name,
        clientName: request.client.name,
        recipientName: primaryContact.fullName,
        requestTitle: request.title,
        dueAt: request.dueAt,
        instructions: request.instructions,
        itemsCount: itemCount,
        portalUrl,
        expiresAt: savedPortal.expiresAt,
      });

      await this.notificationsService.dispatchEmail({
        organizationId: auth.organizationId,
        outboxEventId: outboxEvent.id,
        recipientEmail: primaryContact.email,
        templateName: 'document_request_sent',
        rendered,
        idempotencyKey,
      });

      emailDelivery =
        await this.notificationsService.getLatestEmailDeliveryForAggregate(
          auth.organizationId,
          'document_request',
          request.id,
        );
    }

    return {
      portalUrl,
      expiresAt: savedPortal.expiresAt.toISOString(),
      portalAccess: this.mapPortalAccess(savedPortal),
      emailDelivery,
    };
  }

  async revokePortalAccess(
    auth: AuthenticatedContext,
    requestId: string,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    const activePortal = await this.portalAccessRepo.findOne({
      where: {
        organizationId: auth.organizationId,
        requestId: request.id,
        revokedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!activePortal) {
      throw new BadRequestException(
        'No active portal link exists for this request',
      );
    }

    const revokedAt = new Date();
    await this.portalAccessRepo.update(
      { id: activePortal.id, organizationId: auth.organizationId },
      { revokedAt },
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'PORTAL_LINK_REVOKED',
      resourceType: 'document_request',
      resourceId: request.id,
      metadata: {
        portalAccessId: activePortal.id,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.getRequest(auth, request.id);
  }

  async cancelRequest(
    auth: AuthenticatedContext,
    requestId: string,
    dtoOrIp?: CancelDocumentRequestDto | string,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    const resolvedDto =
      typeof dtoOrIp === 'string' || dtoOrIp === undefined ? {} : dtoOrIp;
    const resolvedIp =
      typeof dtoOrIp === 'string' ? dtoOrIp : ipAddress;
    const reason = resolvedDto.reason?.trim() || null;

    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel a request that is already ${request.status}`,
      );
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(DocumentRequestEntity).update(
        { id: request.id, organizationId: auth.organizationId },
        {
          status: RequestStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: reason,
        },
      );

      await manager.getRepository(PortalAccessEntity).update(
        {
          organizationId: auth.organizationId,
          requestId: request.id,
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'DOCUMENT_REQUEST_CANCELLED',
          resourceType: 'document_request',
          resourceId: request.id,
          metadata: reason ? { reason } : {},
          ipAddress: resolvedIp ?? null,
        },
        manager,
      );
    });

    return this.getRequest(auth, request.id);
  }

  async reopenRequest(
    auth: AuthenticatedContext,
    requestId: string,
    dto: ReopenDocumentRequestDto = {},
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (request.status !== RequestStatus.CANCELLED) {
      throw new BadRequestException(
        `Only CANCELLED requests can be reopened (current status: ${request.status})`,
      );
    }

    if (request.client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot reopen a document request for an archived client. Restore the client first.',
      );
    }

    let nextDueAt: Date | undefined;
    if (dto.dueAt !== undefined) {
      const parsed = new Date(dto.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid due date');
      }
      nextDueAt = parsed;
    }

    const [uploadedFilesCount, nonPendingItemsCount] = await Promise.all([
      this.dataSource.getRepository(UploadedFileEntity).count({
        where: {
          organizationId: auth.organizationId,
          requestId: request.id,
          deletedAt: IsNull(),
          scanStatus: In([FileScanStatus.CLEAN, FileScanStatus.QUARANTINED]),
        },
      }),
      this.itemRepo.count({
        where: {
          organizationId: auth.organizationId,
          requestId: request.id,
          status: In([
            RequestItemStatus.UPLOADED,
            RequestItemStatus.UNDER_REVIEW,
            RequestItemStatus.ACCEPTED,
            RequestItemStatus.REJECTED,
          ]),
        },
      }),
    ]);

    const hasSubmissions = uploadedFilesCount > 0 || nonPendingItemsCount > 0;
    let restoredStatus: RequestStatus;
    if (request.sentAt === null && !hasSubmissions) {
      restoredStatus = RequestStatus.DRAFT;
    } else if (hasSubmissions) {
      restoredStatus = RequestStatus.IN_PROGRESS;
    } else {
      restoredStatus = RequestStatus.SENT;
    }

    if (dto.issuePortalLink && restoredStatus === RequestStatus.DRAFT) {
      throw new BadRequestException(
        'Reopened draft requests must be sent before issuing a portal link',
      );
    }

    const previousCancelledAt = request.cancelledAt
      ? request.cancelledAt.toISOString()
      : null;
    const previousCancellationReason = request.cancellationReason ?? null;

    await this.dataSource.transaction(async (manager) => {
      const updates: Partial<DocumentRequestEntity> = {
        status: restoredStatus,
        cancelledAt: null,
        cancellationReason: null,
      };
      if (nextDueAt) {
        updates.dueAt = nextDueAt;
      }

      const result = await manager
        .getRepository(DocumentRequestEntity)
        .createQueryBuilder()
        .update(DocumentRequestEntity)
        .set(updates)
        .where('id = :id', { id: request.id })
        .andWhere('organization_id = :orgId', { orgId: auth.organizationId })
        .andWhere('status = :cancelledStatus', {
          cancelledStatus: RequestStatus.CANCELLED,
        })
        .execute();

      if ((result.affected ?? 0) === 0) {
        throw new ConflictException('Document request is no longer cancelled');
      }

      // Note: Previously revoked/expired PortalAccessEntity rows remain untouched so old tokens stay invalid.
      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'DOCUMENT_REQUEST_REOPENED',
          resourceType: 'document_request',
          resourceId: request.id,
          metadata: {
            restoredStatus,
            previousCancelledAt,
            previousCancellationReason,
            dueAt: nextDueAt ? nextDueAt.toISOString() : undefined,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });

    let issuedPortalLink: IssuePortalLinkResponse | null = null;
    if (dto.issuePortalLink) {
      issuedPortalLink = await this.issueFreshPortalLink(
        auth,
        request.id,
        { sendEmail: Boolean(dto.sendEmail) },
        ipAddress,
      );
    }

    const detail = await this.getRequest(auth, request.id);
    return issuedPortalLink ? { ...detail, issuedPortalLink } : detail;
  }

  async deleteRequest(
    auth: AuthenticatedContext,
    requestId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const request = await this.findAuthorizedRequest(auth, requestId);

    if (
      request.status !== RequestStatus.DRAFT ||
      request.sentAt !== null ||
      request.cancelledAt !== null
    ) {
      throw new ConflictException(
        'Cannot permanently delete this request because it has already been issued or cancelled. Cancel active requests instead.',
      );
    }

    const [filesCount, portalsCount, outboxCount, auditEvents] =
      await Promise.all([
        this.dataSource.getRepository(UploadedFileEntity).count({
          where: { organizationId: auth.organizationId, requestId: request.id },
          withDeleted: true,
        }),
        this.portalAccessRepo.count({
          where: { organizationId: auth.organizationId, requestId: request.id },
        }),
        this.dataSource.getRepository(OutboxEventEntity).count({
          where: {
            organizationId: auth.organizationId,
            aggregateType: 'document_request',
            aggregateId: request.id,
          },
        }),
        this.dataSource.getRepository(AuditEventEntity).find({
          where: {
            organizationId: auth.organizationId,
            resourceType: 'document_request',
            resourceId: request.id,
          },
          select: ['id', 'action'],
        }),
      ]);

    const hasLifecycleAudits = auditEvents.some(
      (evt) =>
        evt.action !== 'DOCUMENT_REQUEST_CREATED' &&
        evt.action !== 'RECURRENCE_REQUEST_GENERATED',
    );

    if (
      filesCount > 0 ||
      portalsCount > 0 ||
      outboxCount > 0 ||
      hasLifecycleAudits
    ) {
      throw new ConflictException(
        'Cannot permanently delete this request because dependent uploaded files, portal links, email history, or audit records exist. Cancel the request instead.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RequestItemEntity).delete({
        organizationId: auth.organizationId,
        requestId: request.id,
      });

      await manager.getRepository(DocumentRequestEntity).delete({
        id: request.id,
        organizationId: auth.organizationId,
      });

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'DOCUMENT_REQUEST_DELETED',
          resourceType: 'document_request',
          resourceId: request.id,
          metadata: {
            clientId: request.clientId,
            title: request.title,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });
  }

  private async findPrimaryContact(
    organizationId: string,
    clientId: string,
  ): Promise<ClientContactEntity | null> {
    const contacts = await this.contactRepo.find({
      where: {
        clientId,
        organizationId,
        isActive: true,
        deletedAt: IsNull(),
      },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return contacts[0] ?? null;
  }

  private computePortalExpiry(): Date {
    const ttlHours = this.configService.get<number>(
      'PORTAL_TOKEN_TTL_HOURS',
      168,
    );
    return new Date(Date.now() + ttlHours * 3_600_000);
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
        'You do not have access to document requests for this unassigned client',
      );
    }

    return request;
  }

  private async assertWorkspaceWritable(organizationId: string) {
    const subscription =
      await this.plansService.getSubscriptionSummary(organizationId);
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }
    return subscription;
  }

  private mapPortalAccess(access: PortalAccessEntity): PortalAccessLifecycleStatus extends never ? never : PortalAccessSummary {
    let status: PortalAccessLifecycleStatus = 'ACTIVE';
    if (access.revokedAt) {
      status = 'REVOKED';
    } else if (access.expiresAt.getTime() <= Date.now()) {
      status = 'EXPIRED';
    }

    return {
      id: access.id,
      status,
      recipientEmail: access.recipientEmail,
      expiresAt: access.expiresAt.toISOString(),
      revokedAt: access.revokedAt ? access.revokedAt.toISOString() : null,
      lastAccessedAt: access.lastAccessedAt
        ? access.lastAccessedAt.toISOString()
        : null,
      accessCount: access.accessCount,
      createdAt: access.createdAt.toISOString(),
    };
  }

  private mapSummary(
    req: DocumentRequestEntity,
    items: RequestItemEntity[],
  ): DocumentRequestSummary {
    const isOverdue =
      (req.status === RequestStatus.SENT ||
        req.status === RequestStatus.IN_PROGRESS ||
        req.status === RequestStatus.OVERDUE) &&
      req.dueAt.getTime() < Date.now();

    const completedItemsCount = items.filter(
      (i) => i.status === RequestItemStatus.ACCEPTED,
    ).length;

    return {
      id: req.id,
      clientId: req.clientId,
      clientName: req.client?.name ?? 'Client',
      templateId: req.templateId,
      recurrenceId: req.recurrenceId,
      periodKey: req.periodKey,
      title: req.title,
      status: req.status,
      isOverdue,
      dueAt: req.dueAt.toISOString(),
      sentAt: req.sentAt ? req.sentAt.toISOString() : null,
      completedAt: req.completedAt ? req.completedAt.toISOString() : null,
      cancelledAt: req.cancelledAt ? req.cancelledAt.toISOString() : null,
      totalItemsCount: items.length,
      completedItemsCount,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
    };
  }

  private mapItem(item: RequestItemEntity): RequestItemSummary {
    return {
      id: item.id,
      requestId: item.requestId,
      title: item.title,
      description: item.description,
      isRequired: item.isRequired,
      status: item.status,
      sortOrder: item.sortOrder,
      acceptedMimeTypes: item.acceptedMimeTypes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
