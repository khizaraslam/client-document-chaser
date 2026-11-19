import 'reflect-metadata';
import {
  ClientEntityType,
  ClientStatus,
  OrganizationCountry,
  PlanCode,
  RecurrenceFrequency,
  RecurrenceStatus,
  RequestStatus,
  SubscriptionStatus,
  TemplateCategory,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { AuthenticatedContext } from '../src/common/types/auth-context.type';
import {
  ALL_ENTITIES,
  AuditEventEntity,
  ClientContactEntity,
  ClientEntity,
  DocumentRequestEntity,
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
} from '../src/database/entities';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { FilesService } from '../src/modules/files/files.service';
import { S3StorageService } from '../src/modules/files/s3-storage.service';
import { EmailTemplatesService } from '../src/modules/notifications/email-templates.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { RecurrencesService } from '../src/modules/requests/recurrences.service';
import { RequestsService } from '../src/modules/requests/requests.service';
import { TemplatesService } from '../src/modules/templates/templates.service';

async function createPhase2InMemoryDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_phase2_test',
  });
  db.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'PostgreSQL 16.0',
  });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  const ds = await db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: ALL_ENTITIES,
    synchronize: true,
  });

  await ds.initialize();
  return ds;
}

describe('Phase 2 Core Domain: Clients, Templates, Requests & Recurrences', () => {
  let dataSource: DataSource;
  let authService: AuthService;
  let plansService: PlansService;
  let auditService: AuditService;
  let clientsService: ClientsService;
  let templatesService: TemplatesService;
  let requestsService: RequestsService;
  let recurrencesService: RecurrencesService;

  beforeEach(async () => {
    dataSource = await createPhase2InMemoryDataSource();

    const configValues: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      RESEND_API_KEY: '',
      RESEND_FROM_EMAIL: 'Test <test@example.com>',
    };

    const configService = {
      get: <T>(key: string, defaultValue?: T): T =>
        (key in configValues ? configValues[key] : defaultValue) as T,
    } as unknown as ConfigService;

    const jwtService = new JwtService({});
    plansService = new PlansService(
      dataSource.getRepository(PlanEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      configService,
    );
    auditService = new AuditService(dataSource.getRepository(AuditEventEntity));
    const emailTemplatesService = new EmailTemplatesService(configService);
    const notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      emailTemplatesService,
    );

    authService = new AuthService(
      dataSource,
      dataSource.getRepository(UserEntity),
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RefreshSessionEntity),
      jwtService,
      configService,
      plansService,
      auditService,
      notificationsService,
    );

    clientsService = new ClientsService(
      dataSource,
      dataSource.getRepository(ClientEntity),
      dataSource.getRepository(ClientContactEntity),
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(DocumentRequestEntity),
      plansService,
      auditService,
    );

    templatesService = new TemplatesService(
      dataSource,
      dataSource.getRepository(TemplateEntity),
      dataSource.getRepository(TemplateItemEntity),
      dataSource.getRepository(RecurrenceEntity),
      plansService,
      auditService,
    );

    const s3StorageService = new S3StorageService(configService);
    const filesService = new FilesService(
      dataSource.getRepository(UploadedFileEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      s3StorageService,
      auditService,
    );

    requestsService = new RequestsService(
      dataSource,
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(RequestItemEntity),
      dataSource.getRepository(ClientEntity),
      dataSource.getRepository(ClientContactEntity),
      dataSource.getRepository(TemplateEntity),
      dataSource.getRepository(TemplateItemEntity),
      dataSource.getRepository(PortalAccessEntity),
      dataSource.getRepository(OrganizationEntity),
      configService,
      plansService,
      auditService,
      notificationsService,
      filesService,
    );

    recurrencesService = new RecurrencesService(
      dataSource,
      dataSource.getRepository(RecurrenceEntity),
      dataSource.getRepository(ClientEntity),
      dataSource.getRepository(TemplateEntity),
      dataSource.getRepository(TemplateItemEntity),
      dataSource.getRepository(OrganizationEntity),
      dataSource.getRepository(DocumentRequestEntity),
      plansService,
      auditService,
      requestsService,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function registerFirm(
    email: string,
    firmName: string,
    country = OrganizationCountry.UK,
  ): Promise<AuthenticatedContext> {
    const res = await authService.registerFirm(
      {
        fullName: `${firmName} Owner`,
        email,
        password: 'StrongPassword123',
        firmName,
        country,
        timezone:
          country === OrganizationCountry.UK
            ? 'Europe/London'
            : 'America/New_York',
      },
      '127.0.0.1',
      'vitest',
    );
    return {
      userId: res.me.user.id,
      email: res.me.user.email,
      fullName: res.me.user.fullName,
      organizationId: res.me.organization.id,
      membershipId: res.me.membership.id,
      role: res.me.membership.role,
    };
  }

  async function addStaffMember(
    orgId: string,
    email: string,
    fullName: string,
  ): Promise<AuthenticatedContext> {
    const userRepo = dataSource.getRepository(UserEntity);
    const membershipRepo = dataSource.getRepository(MembershipEntity);
    const user = await userRepo.save(
      userRepo.create({
        email,
        fullName,
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      }),
    );
    const membership = await membershipRepo.save(
      membershipRepo.create({
        organizationId: orgId,
        userId: user.id,
        role: UserRole.STAFF,
      }),
    );
    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: orgId,
      membershipId: membership.id,
      role: UserRole.STAFF,
    };
  }

  it('enforces client quota, syncs activeClientsCount, and maintains single primary contact invariant', async () => {
    const firmA = await registerFirm('owner-a@firm.co.uk', 'Vance LLP');

    // Restrict Starter plan maxActiveClients to 2 for quota test
    const planRepo = dataSource.getRepository(PlanEntity);
    await planRepo.update({ code: PlanCode.STARTER }, { maxActiveClients: 2 });

    const c1 = await clientsService.createClient(firmA, {
      name: 'Oakridge Holdings Ltd',
      referenceCode: 'OAK-01',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'Claire Bennett',
        email: 'claire@oakridge.co.uk',
        isPrimary: true,
      },
    });
    expect(c1.contacts).toHaveLength(1);
    expect(c1.contacts[0]?.isPrimary).toBe(true);

    // Add second contact marked primary -> first loses primary flag
    const c1Second = await clientsService.createContact(firmA, c1.id, {
      fullName: 'Daniel Bennett',
      email: 'daniel@oakridge.co.uk',
      isPrimary: true,
    });
    expect(c1Second.isPrimary).toBe(true);

    const c1Contacts = await clientsService.listContacts(firmA, c1.id);
    expect(c1Contacts.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(c1Contacts.find((c) => c.id === c1Second.id)?.isPrimary).toBe(true);

    // Deleting current primary auto-promotes remaining contact
    await clientsService.deleteContact(firmA, c1.id, c1Second.id);
    const remainingContacts = await clientsService.listContacts(firmA, c1.id);
    expect(remainingContacts).toHaveLength(1);
    expect(remainingContacts[0]?.isPrimary).toBe(true);

    // Create second active client
    const c2 = await clientsService.createClient(firmA, {
      name: 'Northstar Logistics LLC',
      entityType: ClientEntityType.LLC,
      country: OrganizationCountry.US,
    });

    // Third active client hits maxActiveClients = 2 quota
    await expect(
      clientsService.createClient(firmA, {
        name: 'Quota Overflow Corp',
        entityType: ClientEntityType.CORP,
        country: OrganizationCountry.US,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Archiving c2 frees a quota slot
    await clientsService.updateClient(firmA, c2.id, {
      status: ClientStatus.ARCHIVED,
    });
    const subAfterArchive = await plansService.getSubscriptionSummary(
      firmA.organizationId,
    );
    expect(subAfterArchive.activeClientsCount).toBe(1);

    const c3 = await clientsService.createClient(firmA, {
      name: 'Harbor Dental LLP',
      entityType: ClientEntityType.LLP,
      country: OrganizationCountry.UK,
    });
    expect(c3.status).toBe(ClientStatus.ACTIVE);

    // Soft deleting c3 decrements activeClientsCount back to 1
    await clientsService.deleteClient(firmA, c3.id);
    const subAfterDelete = await plansService.getSubscriptionSummary(
      firmA.organizationId,
    );
    expect(subAfterDelete.activeClientsCount).toBe(1);
  });

  it('enforces cross-tenant isolation and STAFF client-assignment scoping across all Phase 2 services', async () => {
    const firmA = await registerFirm('owner-a@alpha.co.uk', 'Alpha Partners');
    const firmB = await registerFirm('owner-b@beta.co.uk', 'Beta Accounting');
    const staffA = await addStaffMember(
      firmA.organizationId,
      'staff@alpha.co.uk',
      'Sam Staff',
    );

    const assignedClient = await clientsService.createClient(firmA, {
      name: 'Assigned Client Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      assignedUserId: staffA.userId,
      primaryContact: {
        fullName: 'Alice Contact',
        email: 'alice@assigned.co.uk',
      },
    });

    const unassignedClient = await clientsService.createClient(firmA, {
      name: 'Unassigned Client Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
    });

    const starter = await templatesService.seedStarterPack(firmA);
    const tplId = starter.templates[0]!.id;

    // Firm B cannot access Firm A's client, template, or create requests against Firm A's client
    await expect(
      clientsService.getClient(firmB, assignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(templatesService.getTemplate(firmB, tplId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      requestsService.createRequest(firmB, {
        clientId: assignedClient.id,
        templateId: tplId,
        title: 'Cross-tenant probe',
        dueAt: '2026-12-31T23:59:59.000Z',
      }),
    ).rejects.toThrow(NotFoundException);

    // STAFF sees only assigned clients
    const staffClients = await clientsService.listClients(staffA, {});
    expect(staffClients.map((c) => c.id)).toEqual([assignedClient.id]);

    // STAFF cannot read or create requests/recurrences for unassigned clients
    await expect(
      clientsService.getClient(staffA, unassignedClient.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      requestsService.createRequest(staffA, {
        clientId: unassignedClient.id,
        templateId: tplId,
        title: 'Unauthorized request',
        dueAt: '2026-12-31T23:59:59.000Z',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      recurrencesService.createRecurrence(staffA, {
        clientId: unassignedClient.id,
        templateId: tplId,
        titleTemplate: 'Unauthorized schedule {{period}}',
        frequency: RecurrenceFrequency.MONTHLY,
        dayOfMonth: 1,
      }),
    ).rejects.toThrow(ForbiddenException);

    // STAFF can create & send request for their assigned client
    const staffRequest = await requestsService.createRequest(staffA, {
      clientId: assignedClient.id,
      templateId: tplId,
      title: 'Assigned Client Monthly Pack',
      dueAt: '2026-12-31T23:59:59.000Z',
    });
    expect(staffRequest.items.length).toBeGreaterThan(0);

    // Firm B cannot access or cancel Firm A's request
    await expect(
      requestsService.getRequest(firmB, staffRequest.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.cancelRequest(firmB, staffRequest.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('snapshots template items into document requests and handles send/cancel transitions + outbox events', async () => {
    const firm = await registerFirm('owner@snapshot.com', 'Snapshot CPA', OrganizationCountry.US);
    const starter = await templatesService.seedStarterPack(firm);
    expect(starter.createdCount).toBe(4);
    // Idempotent second call creates 0 duplicates
    const secondSeed = await templatesService.seedStarterPack(firm);
    expect(secondSeed.createdCount).toBe(0);

    const tpl = await templatesService.getTemplate(firm, starter.templates[0]!.id);
    const initialCount = tpl.items.length;

    const clientNoContact = await clientsService.createClient(firm, {
      name: 'No Contact Corp',
      entityType: ClientEntityType.CORP,
      country: OrganizationCountry.US,
    });

    const draft = await requestsService.createRequest(firm, {
      clientId: clientNoContact.id,
      templateId: tpl.id,
      title: 'November Close',
      dueAt: '2026-12-15T23:59:59.000Z',
    });
    expect(draft.status).toBe(RequestStatus.DRAFT);
    expect(draft.items).toHaveLength(initialCount);

    // Modifying template afterwards does not mutate the existing request snapshot
    await templatesService.addItem(firm, tpl.id, {
      title: 'Newly Added Template Item',
      isRequired: false,
    });
    const reloadedRequest = await requestsService.getRequest(firm, draft.id);
    expect(reloadedRequest.items).toHaveLength(initialCount);

    // Sending without any client contacts fails cleanly
    await expect(requestsService.sendRequest(firm, draft.id)).rejects.toThrow(
      BadRequestException,
    );

    // Add contact, then send request -> transitions to SENT + writes outbox event
    await clientsService.createContact(firm, clientNoContact.id, {
      fullName: 'Jordan Lee',
      email: 'jordan@nocontact.com',
      isPrimary: true,
    });

    const sent = await requestsService.sendRequest(firm, draft.id);
    expect(sent.status).toBe(RequestStatus.SENT);
    expect(sent.sentAt).not.toBeNull();

    const outbox = await dataSource.getRepository(OutboxEventEntity).find({
      where: { organizationId: firm.organizationId },
    });
    expect(
      outbox.some(
        (evt) =>
          evt.eventType === 'request.sent' &&
          evt.aggregateId === draft.id,
      ),
    ).toBe(true);

    const audits = await dataSource.getRepository(AuditEventEntity).find({
      where: { organizationId: firm.organizationId, resourceId: draft.id },
    });
    expect(audits.some((a) => a.action === 'DOCUMENT_REQUEST_SENT')).toBe(true);

    // Cancel request
    const cancelled = await requestsService.cancelRequest(firm, draft.id);
    expect(cancelled.status).toBe(RequestStatus.CANCELLED);
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it('generates idempotent recurring requests, protects referenced templates, and enforces read-only trial lock', async () => {
    const firm = await registerFirm('owner@recurring.co.uk', 'Recurring UK');

    const tpl = await templatesService.createTemplate(firm, {
      name: 'Monthly Close',
      category: TemplateCategory.BOOKKEEPING,
      items: [
        { title: 'Bank statement', isRequired: true },
        { title: 'Payroll register', isRequired: false },
      ],
    });
    const cloned = await templatesService.cloneTemplate(firm, tpl.id);
    expect(cloned.name).toContain('(Copy)');
    expect(cloned.items).toHaveLength(2);

    const client = await clientsService.createClient(firm, {
      name: 'Cedar Retail Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'Emma Wright',
        email: 'emma@cedarretail.co.uk',
      },
    });

    const schedule = await recurrencesService.createRecurrence(firm, {
      clientId: client.id,
      templateId: tpl.id,
      titleTemplate: 'Monthly Close — {{period}}',
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 5,
      dueDaysAfterIssue: 10,
      timezone: 'Europe/London',
    });
    expect(schedule.status).toBe(RecurrenceStatus.ACTIVE);

    // Referenced template cannot be deleted while active recurrence uses it
    await expect(templatesService.deleteTemplate(firm, tpl.id)).rejects.toThrow(
      ConflictException,
    );

    // Triggering generates a request with periodKey and snapshots template items
    const generated = await recurrencesService.triggerRecurrence(
      firm,
      schedule.id,
    );
    expect(generated.recurrenceId).toBe(schedule.id);
    expect(generated.periodKey).toMatch(/^\d{4}-\d{2}$/);
    expect(generated.title).toContain(generated.periodKey!);
    expect(generated.items).toHaveLength(2);

    // Re-triggering for the same period is idempotently rejected with ConflictException
    await expect(
      recurrencesService.triggerRecurrence(firm, schedule.id),
    ).rejects.toThrow(ConflictException);

    // Expire workspace trial -> read-only lock blocks Phase 2 writes
    await dataSource.getRepository(OrganizationSubscriptionEntity).update(
      { organizationId: firm.organizationId },
      {
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    );

    await expect(
      clientsService.createClient(firm, {
        name: 'Blocked Client',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      requestsService.createRequest(firm, {
        clientId: client.id,
        templateId: tpl.id,
        title: 'Blocked Request',
        dueAt: '2026-12-31T23:59:59.000Z',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      recurrencesService.updateRecurrence(firm, schedule.id, {
        status: RecurrenceStatus.PAUSED,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
