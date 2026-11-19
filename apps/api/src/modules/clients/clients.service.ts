import {
  AuditEventItem,
  ClientContactItem,
  ClientDetail,
  ClientStatus,
  ClientSummary,
  ClientUploadedFileSummary,
  FileScanStatus,
  MembershipStatus,
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
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { AuditEventEntity } from '../../database/entities/audit-event.entity';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { OrganizationSubscriptionEntity } from '../../database/entities/organization-subscription.entity';
import { PortalAccessEntity } from '../../database/entities/portal-access.entity';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import {
  CreateClientContactDto,
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientContactDto,
  UpdateClientDto,
} from './clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(ClientContactEntity)
    private readonly contactRepo: Repository<ClientContactEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepo: Repository<MembershipEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  async listClients(
    auth: AuthenticatedContext,
    query: ListClientsQueryDto,
  ): Promise<ClientSummary[]> {
    const qb = this.clientRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.assignedUser', 'au')
      .where('c.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('c.deleted_at IS NULL');

    if (auth.role === UserRole.STAFF) {
      qb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    } else if (query.assignedUserId) {
      qb.andWhere('c.assigned_user_id = :assignedUserId', {
        assignedUserId: query.assignedUserId,
      });
    }

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(c.name) LIKE :term OR LOWER(COALESCE(c.company_name, '')) LIKE :term OR LOWER(COALESCE(c.email, '')) LIKE :term OR LOWER(COALESCE(c.reference_code, '')) LIKE :term)`,
        { term },
      );
    }

    qb.orderBy('c.created_at', 'DESC');
    const clients = await qb.getMany();
    if (clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);
    const contacts = await this.contactRepo.find({
      where: {
        organizationId: auth.organizationId,
        clientId: In(clientIds),
        deletedAt: IsNull(),
      },
      order: { isActive: 'DESC', isPrimary: 'DESC', createdAt: 'ASC' },
    });

    const openRequests = await this.requestRepo.find({
      where: {
        organizationId: auth.organizationId,
        clientId: In(clientIds),
        deletedAt: IsNull(),
        status: In([
          RequestStatus.DRAFT,
          RequestStatus.SENT,
          RequestStatus.IN_PROGRESS,
          RequestStatus.OVERDUE,
        ]),
      },
    });

    const contactsByClient = new Map<string, ClientContactEntity[]>();
    for (const contact of contacts) {
      const arr = contactsByClient.get(contact.clientId) ?? [];
      arr.push(contact);
      contactsByClient.set(contact.clientId, arr);
    }

    const openCountsByClient = new Map<string, number>();
    for (const req of openRequests) {
      openCountsByClient.set(
        req.clientId,
        (openCountsByClient.get(req.clientId) ?? 0) + 1,
      );
    }

    return clients.map((client) => {
      const clientContacts = contactsByClient.get(client.id) ?? [];
      const activeContacts = clientContacts.filter((c) => c.isActive);
      const primary =
        activeContacts.find((c) => c.isPrimary) ?? activeContacts[0] ?? null;

      return {
        id: client.id,
        name: client.name,
        companyName: client.companyName ?? null,
        email: client.email ?? null,
        phone: client.phone ?? null,
        address: client.address ?? null,
        referenceCode: client.referenceCode,
        entityType: client.entityType,
        country: client.country,
        status: client.status,
        assignedUserId: client.assignedUserId,
        assignedUserName: client.assignedUser?.fullName ?? null,
        primaryContactName: primary?.fullName ?? null,
        primaryContactEmail: primary?.email ?? null,
        primaryContactPhone: primary?.phone ?? null,
        contactsCount: activeContacts.length,
        openRequestsCount: openCountsByClient.get(client.id) ?? 0,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
      };
    });
  }

  async getClient(
    auth: AuthenticatedContext,
    clientId: string,
  ): Promise<ClientDetail> {
    const client = await this.findAuthorizedClient(auth, clientId);
    const contacts = await this.contactRepo.find({
      where: {
        organizationId: auth.organizationId,
        clientId: client.id,
        deletedAt: IsNull(),
      },
      order: { isActive: 'DESC', isPrimary: 'DESC', createdAt: 'ASC' },
    });

    const openRequestsCount = await this.requestRepo.count({
      where: {
        organizationId: auth.organizationId,
        clientId: client.id,
        deletedAt: IsNull(),
        status: In([
          RequestStatus.DRAFT,
          RequestStatus.SENT,
          RequestStatus.IN_PROGRESS,
          RequestStatus.OVERDUE,
        ]),
      },
    });

    const activeContacts = contacts.filter((c) => c.isActive);
    const primary =
      activeContacts.find((c) => c.isPrimary) ?? activeContacts[0] ?? null;

    return {
      id: client.id,
      name: client.name,
      companyName: client.companyName ?? null,
      email: client.email ?? null,
      phone: client.phone ?? null,
      address: client.address ?? null,
      referenceCode: client.referenceCode,
      entityType: client.entityType,
      country: client.country,
      status: client.status,
      assignedUserId: client.assignedUserId,
      assignedUserName: client.assignedUser?.fullName ?? null,
      primaryContactName: primary?.fullName ?? null,
      primaryContactEmail: primary?.email ?? null,
      primaryContactPhone: primary?.phone ?? null,
      contactsCount: activeContacts.length,
      openRequestsCount,
      notes: client.notes,
      contacts: contacts.map((c) => this.mapContact(c)),
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }

  async listClientFiles(
    auth: AuthenticatedContext,
    clientId: string,
  ): Promise<ClientUploadedFileSummary[]> {
    const client = await this.findAuthorizedClient(auth, clientId);
    const fileRepo = this.dataSource.getRepository(UploadedFileEntity);

    const files = await fileRepo.find({
      where: {
        organizationId: auth.organizationId,
        clientId: client.id,
        deletedAt: IsNull(),
      },
      relations: { request: true, requestItem: true },
      order: { createdAt: 'DESC' },
    });

    return files
      .filter(
        (f) =>
          f.scanStatus !== FileScanStatus.PENDING_UPLOAD &&
          f.request &&
          !f.request.deletedAt,
      )
      .map((f) => ({
        id: f.id,
        requestId: f.requestId,
        requestTitle: f.request.title,
        requestStatus: f.request.status,
        requestItemId: f.requestItemId,
        requestItemTitle: f.requestItem?.title ?? 'Checklist item',
        originalFilename: f.originalFilename,
        sanitizedFilename: f.sanitizedFilename,
        mimeType: f.detectedMimeType || f.mimeType,
        detectedMimeType: f.detectedMimeType,
        sizeBytes: Number(f.sizeBytes),
        scanStatus: f.scanStatus,
        scanDetails: f.scanDetails,
        uploadedAt: f.uploadedAt ? f.uploadedAt.toISOString() : null,
        createdAt: f.createdAt.toISOString(),
      }));
  }

  async listClientActivity(
    auth: AuthenticatedContext,
    clientId: string,
  ): Promise<AuditEventItem[]> {
    const client = await this.findAuthorizedClient(auth, clientId);

    const [contacts, requests, files, recurrences, portals, orgEvents] =
      await Promise.all([
        this.contactRepo.find({
          where: { organizationId: auth.organizationId, clientId: client.id },
          withDeleted: true,
          select: ['id'],
        }),
        this.requestRepo.find({
          where: { organizationId: auth.organizationId, clientId: client.id },
          withDeleted: true,
          select: ['id'],
        }),
        this.dataSource.getRepository(UploadedFileEntity).find({
          where: { organizationId: auth.organizationId, clientId: client.id },
          withDeleted: true,
          select: ['id'],
        }),
        this.dataSource.getRepository(RecurrenceEntity).find({
          where: { organizationId: auth.organizationId, clientId: client.id },
          select: ['id'],
        }),
        this.dataSource.getRepository(PortalAccessEntity).find({
          where: { organizationId: auth.organizationId, clientId: client.id },
          select: ['id'],
        }),
        this.dataSource.getRepository(AuditEventEntity).find({
          where: { organizationId: auth.organizationId },
          order: { createdAt: 'DESC' },
          take: 200,
        }),
      ]);

    const contactIds = new Set(contacts.map((c) => c.id));
    const requestIds = new Set(requests.map((r) => r.id));
    const fileIds = new Set(files.map((f) => f.id));
    const recurrenceIds = new Set(recurrences.map((r) => r.id));
    const portalIds = new Set(portals.map((p) => p.id));

    const matching = orgEvents.filter((evt) => {
      if (evt.resourceType === 'client' && evt.resourceId === client.id) {
        return true;
      }
      if (
        evt.resourceType === 'client_contact' &&
        evt.resourceId &&
        contactIds.has(evt.resourceId)
      ) {
        return true;
      }
      if (
        evt.resourceType === 'document_request' &&
        evt.resourceId &&
        requestIds.has(evt.resourceId)
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
        evt.resourceType === 'recurrence' &&
        evt.resourceId &&
        recurrenceIds.has(evt.resourceId)
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
        typeof evt.metadata?.['clientId'] === 'string' &&
        evt.metadata['clientId'] === client.id
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

  async createClient(
    auth: AuthenticatedContext,
    dto: CreateClientDto,
    ipAddress?: string,
  ): Promise<ClientDetail> {
    const subscription = await this.assertWorkspaceWritable(auth.organizationId);

    const activeClientsCount = await this.clientRepo.count({
      where: {
        organizationId: auth.organizationId,
        status: ClientStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });

    if (activeClientsCount >= subscription.maxActiveClients) {
      throw new ForbiddenException(
        `Active client limit reached (${subscription.maxActiveClients} clients on ${subscription.planName} plan)`,
      );
    }

    if (dto.assignedUserId) {
      await this.assertAssigneeBelongsToOrg(
        auth.organizationId,
        dto.assignedUserId,
      );
    }

    const trimmedName = dto.name.trim();
    await this.assertUniqueClientName(auth.organizationId, trimmedName);

    const trimmedRef = dto.referenceCode?.trim() || null;
    if (trimmedRef) {
      await this.assertUniqueReferenceCode(auth.organizationId, trimmedRef);
    }

    const createdId = await this.dataSource.transaction(async (manager) => {
      const clientRepo = manager.getRepository(ClientEntity);
      const contactRepo = manager.getRepository(ClientContactEntity);

      const savedClient = await clientRepo.save(
        clientRepo.create({
          organizationId: auth.organizationId,
          name: trimmedName,
          companyName: dto.companyName?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          address: dto.address?.trim() || null,
          referenceCode: trimmedRef,
          entityType: dto.entityType,
          country: dto.country,
          status: ClientStatus.ACTIVE,
          assignedUserId: dto.assignedUserId ?? null,
          notes: dto.notes?.trim() || null,
        }),
      );

      if (dto.primaryContact) {
        await contactRepo.save(
          contactRepo.create({
            organizationId: auth.organizationId,
            clientId: savedClient.id,
            fullName: dto.primaryContact.fullName.trim(),
            email: dto.primaryContact.email.trim().toLowerCase(),
            phone: dto.primaryContact.phone?.trim() || null,
            roleTitle: dto.primaryContact.roleTitle?.trim() || null,
            isPrimary: true,
            isActive: true,
          }),
        );
      }

      await this.syncActiveClientsQuota(auth.organizationId, manager);

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'CLIENT_CREATED',
          resourceType: 'client',
          resourceId: savedClient.id,
          metadata: {
            name: savedClient.name,
            companyName: savedClient.companyName,
            entityType: savedClient.entityType,
            country: savedClient.country,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedClient.id;
    });

    return this.getClient(auth, createdId);
  }

  async updateClient(
    auth: AuthenticatedContext,
    clientId: string,
    dto: UpdateClientDto,
    ipAddress?: string,
  ): Promise<ClientDetail> {
    const subscription = await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    if (auth.role === UserRole.STAFF) {
      if (dto.assignedUserId !== undefined || dto.status !== undefined) {
        throw new ForbiddenException(
          'Only firm Owners and Admins can reassign or archive clients',
        );
      }
    }

    if (
      dto.status === ClientStatus.ACTIVE &&
      client.status === ClientStatus.ARCHIVED
    ) {
      const activeCount = await this.clientRepo.count({
        where: {
          organizationId: auth.organizationId,
          status: ClientStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
      if (activeCount >= subscription.maxActiveClients) {
        throw new ForbiddenException(
          `Active client limit reached (${subscription.maxActiveClients} clients on ${subscription.planName} plan)`,
        );
      }
    }

    if (dto.assignedUserId) {
      await this.assertAssigneeBelongsToOrg(
        auth.organizationId,
        dto.assignedUserId,
      );
    }

    const nextName =
      dto.name === undefined ? undefined : dto.name.trim();
    if (nextName && nextName.toLowerCase() !== client.name.toLowerCase()) {
      await this.assertUniqueClientName(
        auth.organizationId,
        nextName,
        client.id,
      );
    }

    const nextRef =
      dto.referenceCode === undefined
        ? undefined
        : dto.referenceCode?.trim() || null;
    if (nextRef && nextRef !== client.referenceCode) {
      await this.assertUniqueReferenceCode(
        auth.organizationId,
        nextRef,
        client.id,
      );
    }

    const updates: Partial<ClientEntity> = {};
    if (nextName !== undefined) updates.name = nextName;
    if (dto.companyName !== undefined) {
      updates.companyName = dto.companyName?.trim() || null;
    }
    if (dto.email !== undefined) {
      updates.email = dto.email?.trim().toLowerCase() || null;
    }
    if (dto.phone !== undefined) {
      updates.phone = dto.phone?.trim() || null;
    }
    if (dto.address !== undefined) {
      updates.address = dto.address?.trim() || null;
    }
    if (nextRef !== undefined) updates.referenceCode = nextRef;
    if (dto.entityType !== undefined) updates.entityType = dto.entityType;
    if (dto.country !== undefined) updates.country = dto.country;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.assignedUserId !== undefined) {
      updates.assignedUserId = dto.assignedUserId ?? null;
    }
    if (dto.notes !== undefined) updates.notes = dto.notes?.trim() || null;

    if (Object.keys(updates).length > 0) {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(ClientEntity)
          .update({ id: client.id, organizationId: auth.organizationId }, updates);

        await this.syncActiveClientsQuota(auth.organizationId, manager);

        let action = 'CLIENT_UPDATED';
        if (
          dto.status === ClientStatus.ARCHIVED &&
          client.status === ClientStatus.ACTIVE
        ) {
          action = 'CLIENT_ARCHIVED';
        } else if (
          dto.status === ClientStatus.ACTIVE &&
          client.status === ClientStatus.ARCHIVED
        ) {
          action = 'CLIENT_RESTORED';
        }

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action,
            resourceType: 'client',
            resourceId: client.id,
            metadata: updates,
            ipAddress: ipAddress ?? null,
          },
          manager,
        );
      });
    }

    return this.getClient(auth, client.id);
  }

  async archiveClient(
    auth: AuthenticatedContext,
    clientId: string,
    ipAddress?: string,
  ): Promise<ClientDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    if (client.status === ClientStatus.ARCHIVED) {
      throw new BadRequestException('Client is already archived');
    }

    return this.updateClient(
      auth,
      clientId,
      { status: ClientStatus.ARCHIVED },
      ipAddress,
    );
  }

  async restoreClient(
    auth: AuthenticatedContext,
    clientId: string,
    ipAddress?: string,
  ): Promise<ClientDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    if (client.status === ClientStatus.ACTIVE) {
      throw new BadRequestException('Client is already active');
    }

    return this.updateClient(
      auth,
      clientId,
      { status: ClientStatus.ACTIVE },
      ipAddress,
    );
  }

  async deleteClient(
    auth: AuthenticatedContext,
    clientId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    const [
      requestCount,
      fileCount,
      recurrenceCount,
      portalCount,
      clientAuditEvents,
    ] = await Promise.all([
      this.requestRepo.count({
        where: { organizationId: auth.organizationId, clientId: client.id },
        withDeleted: true,
      }),
      this.dataSource.getRepository(UploadedFileEntity).count({
        where: { organizationId: auth.organizationId, clientId: client.id },
        withDeleted: true,
      }),
      this.dataSource.getRepository(RecurrenceEntity).count({
        where: { organizationId: auth.organizationId, clientId: client.id },
      }),
      this.dataSource.getRepository(PortalAccessEntity).count({
        where: { organizationId: auth.organizationId, clientId: client.id },
      }),
      this.dataSource.getRepository(AuditEventEntity).find({
        where: {
          organizationId: auth.organizationId,
          resourceType: 'client',
          resourceId: client.id,
        },
        select: ['id', 'action'],
      }),
    ]);

    const hasAuditDependencies = clientAuditEvents.some(
      (evt) => evt.action !== 'CLIENT_CREATED',
    );

    if (
      requestCount > 0 ||
      fileCount > 0 ||
      recurrenceCount > 0 ||
      portalCount > 0 ||
      hasAuditDependencies
    ) {
      throw new ConflictException(
        'Cannot permanently delete this client because associated document requests, uploaded files, schedules, or audit history exist. Archive this client instead.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ClientContactEntity).delete({
        clientId: client.id,
        organizationId: auth.organizationId,
      });

      await manager.getRepository(ClientEntity).delete({
        id: client.id,
        organizationId: auth.organizationId,
      });

      await this.syncActiveClientsQuota(auth.organizationId, manager);

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'CLIENT_DELETED',
          resourceType: 'client',
          resourceId: client.id,
          metadata: { name: client.name },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });
  }

  async listContacts(
    auth: AuthenticatedContext,
    clientId: string,
  ): Promise<ClientContactItem[]> {
    const client = await this.findAuthorizedClient(auth, clientId);
    const contacts = await this.contactRepo.find({
      where: {
        organizationId: auth.organizationId,
        clientId: client.id,
        deletedAt: IsNull(),
      },
      order: { isActive: 'DESC', isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return contacts.map((c) => this.mapContact(c));
  }

  async createContact(
    auth: AuthenticatedContext,
    clientId: string,
    dto: CreateClientContactDto,
    ipAddress?: string,
  ): Promise<ClientContactItem> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);
    const normalizedEmail = dto.email.trim().toLowerCase();

    const duplicate = await this.contactRepo
      .createQueryBuilder('cc')
      .where('cc.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('cc.client_id = :clientId', { clientId: client.id })
      .andWhere('LOWER(cc.email) = :email', { email: normalizedEmail })
      .andWhere('cc.deleted_at IS NULL')
      .getOne();

    if (duplicate) {
      throw new ConflictException(
        'A contact with this email already exists for this client',
      );
    }

    const activeCount = await this.contactRepo.count({
      where: {
        organizationId: auth.organizationId,
        clientId: client.id,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
    const makePrimary = Boolean(dto.isPrimary) || activeCount === 0;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientContactEntity);

      if (makePrimary) {
        await repo.update(
          {
            organizationId: auth.organizationId,
            clientId: client.id,
            isPrimary: true,
          },
          { isPrimary: false },
        );
      }

      const created = await repo.save(
        repo.create({
          organizationId: auth.organizationId,
          clientId: client.id,
          fullName: dto.fullName.trim(),
          email: normalizedEmail,
          phone: dto.phone?.trim() || null,
          roleTitle: dto.roleTitle?.trim() || null,
          isPrimary: makePrimary,
          isActive: true,
        }),
      );

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'CLIENT_CONTACT_ADDED',
          resourceType: 'client_contact',
          resourceId: created.id,
          metadata: {
            clientId: client.id,
            email: created.email,
            isPrimary: created.isPrimary,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return created;
    });

    return this.mapContact(saved);
  }

  async updateContact(
    auth: AuthenticatedContext,
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDto,
    ipAddress?: string,
  ): Promise<ClientContactItem> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    const contact = await this.contactRepo.findOne({
      where: {
        id: contactId,
        clientId: client.id,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!contact) {
      throw new NotFoundException('Client contact not found');
    }

    const nextIsActive =
      dto.isActive !== undefined ? dto.isActive : contact.isActive;
    if (dto.isPrimary === true && !nextIsActive) {
      throw new BadRequestException(
        'Cannot mark an inactive contact as the primary contact',
      );
    }

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== contact.email.toLowerCase()) {
        const duplicate = await this.contactRepo
          .createQueryBuilder('cc')
          .where('cc.organization_id = :orgId', { orgId: auth.organizationId })
          .andWhere('cc.client_id = :clientId', { clientId: client.id })
          .andWhere('LOWER(cc.email) = :email', { email: normalizedEmail })
          .andWhere('cc.deleted_at IS NULL')
          .getOne();
        if (duplicate) {
          throw new ConflictException(
            'Another contact with this email already exists for this client',
          );
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientContactEntity);

      let makePrimary = dto.isPrimary;
      if (dto.isActive === false) {
        makePrimary = false;
      } else if (dto.isActive === true && !contact.isActive) {
        const existingActivePrimary = await repo.findOne({
          where: {
            organizationId: auth.organizationId,
            clientId: client.id,
            isActive: true,
            isPrimary: true,
            deletedAt: IsNull(),
          },
        });
        if (!existingActivePrimary && makePrimary !== false) {
          makePrimary = true;
        }
      }

      if (makePrimary === true) {
        await repo.update(
          {
            organizationId: auth.organizationId,
            clientId: client.id,
            isPrimary: true,
          },
          { isPrimary: false },
        );
      }

      const updates: Partial<ClientContactEntity> = {};
      if (dto.fullName !== undefined) updates.fullName = dto.fullName.trim();
      if (dto.email !== undefined) updates.email = dto.email.trim().toLowerCase();
      if (dto.phone !== undefined) updates.phone = dto.phone?.trim() || null;
      if (dto.roleTitle !== undefined) {
        updates.roleTitle = dto.roleTitle?.trim() || null;
      }
      if (dto.isActive !== undefined) updates.isActive = dto.isActive;
      if (makePrimary !== undefined) updates.isPrimary = makePrimary;

      if (Object.keys(updates).length > 0) {
        await repo.update(
          { id: contact.id, organizationId: auth.organizationId },
          updates,
        );
      }

      // If this contact was active primary and got deactivated or lost primary, promote next active contact if none primary remains
      if (
        contact.isPrimary &&
        (dto.isActive === false || dto.isPrimary === false)
      ) {
        const nextActive = await repo.findOne({
          where: {
            organizationId: auth.organizationId,
            clientId: client.id,
            isActive: true,
            deletedAt: IsNull(),
          },
          order: { createdAt: 'ASC' },
        });
        if (nextActive && nextActive.id !== contact.id) {
          await repo.update(
            { id: nextActive.id, organizationId: auth.organizationId },
            { isPrimary: true },
          );
        }
      }

      let action = 'CLIENT_CONTACT_UPDATED';
      if (dto.isActive === false && contact.isActive) {
        action = 'CLIENT_CONTACT_DEACTIVATED';
      } else if (dto.isActive === true && !contact.isActive) {
        action = 'CLIENT_CONTACT_REACTIVATED';
      } else if (makePrimary === true && !contact.isPrimary) {
        action = 'CLIENT_CONTACT_PRIMARY_CHANGED';
      }

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action,
          resourceType: 'client_contact',
          resourceId: contact.id,
          metadata: {
            clientId: client.id,
            emailChanged:
              dto.email !== undefined &&
              dto.email.trim().toLowerCase() !== contact.email.toLowerCase(),
            isActive: updates.isActive ?? contact.isActive,
            isPrimary: updates.isPrimary ?? contact.isPrimary,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });

    const refreshed = await this.contactRepo.findOneOrFail({
      where: { id: contact.id, organizationId: auth.organizationId },
    });
    return this.mapContact(refreshed);
  }

  async deactivateContact(
    auth: AuthenticatedContext,
    clientId: string,
    contactId: string,
    ipAddress?: string,
  ): Promise<ClientContactItem> {
    return this.updateContact(
      auth,
      clientId,
      contactId,
      { isActive: false },
      ipAddress,
    );
  }

  async reactivateContact(
    auth: AuthenticatedContext,
    clientId: string,
    contactId: string,
    ipAddress?: string,
  ): Promise<ClientContactItem> {
    return this.updateContact(
      auth,
      clientId,
      contactId,
      { isActive: true },
      ipAddress,
    );
  }

  async deleteContact(
    auth: AuthenticatedContext,
    clientId: string,
    contactId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const client = await this.findAuthorizedClient(auth, clientId);

    const contact = await this.contactRepo.findOne({
      where: {
        id: contactId,
        clientId: client.id,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!contact) {
      throw new NotFoundException('Client contact not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientContactEntity);
      await repo.softDelete({
        id: contact.id,
        organizationId: auth.organizationId,
      });

      if (contact.isPrimary) {
        const nextContact = await repo.findOne({
          where: {
            organizationId: auth.organizationId,
            clientId: client.id,
            isActive: true,
            deletedAt: IsNull(),
          },
          order: { createdAt: 'ASC' },
        });
        if (nextContact) {
          await repo.update(
            { id: nextContact.id, organizationId: auth.organizationId },
            { isPrimary: true },
          );
        }
      }

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'CLIENT_CONTACT_DELETED',
          resourceType: 'client_contact',
          resourceId: contact.id,
          metadata: { clientId: client.id, email: contact.email },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });
  }

  async findAuthorizedClient(
    auth: AuthenticatedContext,
    clientId: string,
  ): Promise<ClientEntity> {
    const client = await this.clientRepo.findOne({
      where: {
        id: clientId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
      relations: { assignedUser: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (
      auth.role === UserRole.STAFF &&
      client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to this unassigned client',
      );
    }

    return client;
  }

  private async assertAssigneeBelongsToOrg(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.membershipRepo.findOne({
      where: {
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new BadRequestException(
        'Assigned user must be an active member of this firm',
      );
    }
  }

  private async assertUniqueClientName(
    organizationId: string,
    name: string,
    excludeClientId?: string,
  ): Promise<void> {
    const qb = this.clientRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name })
      .andWhere('c.deleted_at IS NULL');

    if (excludeClientId) {
      qb.andWhere('c.id != :excludeClientId', { excludeClientId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `A client named "${name}" already exists in this firm`,
      );
    }
  }

  private async assertUniqueReferenceCode(
    organizationId: string,
    referenceCode: string,
    excludeClientId?: string,
  ): Promise<void> {
    const qb = this.clientRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('LOWER(c.reference_code) = LOWER(:ref)', { ref: referenceCode })
      .andWhere('c.deleted_at IS NULL');

    if (excludeClientId) {
      qb.andWhere('c.id != :excludeClientId', { excludeClientId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `A client with reference code "${referenceCode}" already exists`,
      );
    }
  }

  private async syncActiveClientsQuota(
    organizationId: string,
    manager: EntityManager,
  ): Promise<void> {
    const count = await manager.getRepository(ClientEntity).count({
      where: {
        organizationId,
        status: ClientStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    await manager
      .getRepository(OrganizationSubscriptionEntity)
      .update({ organizationId }, { activeClientsCount: count });
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

  private mapContact(c: ClientContactEntity): ClientContactItem {
    return {
      id: c.id,
      clientId: c.clientId,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      roleTitle: c.roleTitle,
      isPrimary: c.isPrimary,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
