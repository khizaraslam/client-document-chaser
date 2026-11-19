import 'reflect-metadata';
import {
  ClientEntityType,
  ClientStatus,
  CreateClientContactSchema,
  CreateClientSchema,
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  PlanCode,
  RecurrenceFrequency,
  RequestItemStatus,
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
import { ClamavService } from '../src/modules/files/clamav.service';
import { FilesService } from '../src/modules/files/files.service';
import { S3StorageService } from '../src/modules/files/s3-storage.service';
import { EmailTemplatesService } from '../src/modules/notifications/email-templates.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { PortalService } from '../src/modules/portal/portal.service';
import { RecurrencesService } from '../src/modules/requests/recurrences.service';
import { RequestsService } from '../src/modules/requests/requests.service';
import { TemplatesService } from '../src/modules/templates/templates.service';

async function createEnhancementsDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_enhancements_test',
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

class InMemoryS3Mock {
  private readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  getBucketName(): string {
    return 'client-docs-private';
  }
  isConfigured(): boolean {
    return true;
  }
  seedObject(key: string, body: Buffer, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }
  async createPresignedPutUrl(params: { key: string; contentType: string }) {
    return `https://silo.local/client-docs-private/${encodeURIComponent(params.key)}?sig=put`;
  }
  async putObjectBuffer(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }) {
    this.objects.set(params.key, {
      body: params.body,
      contentType: params.contentType,
    });
  }
  async headObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) throw new Error('NoSuchKey');
    return {
      contentLength: obj.body.length,
      contentType: obj.contentType,
      etag: '"mock-etag"',
    };
  }
  async getObjectBytes(key: string, maxBytes?: number) {
    const obj = this.objects.get(key);
    if (!obj) throw new Error('NoSuchKey');
    return maxBytes ? obj.body.subarray(0, maxBytes) : obj.body;
  }
  async createPresignedGetUrl(params: {
    key: string;
    downloadFilename: string;
    contentType: string;
  }) {
    return `https://silo.local/client-docs-private/${encodeURIComponent(params.key)}?download=${encodeURIComponent(params.downloadFilename)}`;
  }
  async deleteObject(key: string) {
    this.objects.delete(key);
  }
}

jest.setTimeout(20000);

describe('Client & Document Request Management Enhancements', () => {
  let dataSource: DataSource;
  let authService: AuthService;
  let plansService: PlansService;
  let auditService: AuditService;
  let clientsService: ClientsService;
  let templatesService: TemplatesService;
  let filesService: FilesService;
  let requestsService: RequestsService;
  let recurrencesService: RecurrencesService;
  let portalService: PortalService;
  let notificationsService: NotificationsService;
  let s3Mock: InMemoryS3Mock;
  let sentEmails: Array<{ to: string[]; subject: string; html: string }>;

  beforeEach(async () => {
    dataSource = await createEnhancementsDataSource();
    s3Mock = new InMemoryS3Mock();
    sentEmails = [];

    const configValues: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'Docs <docs@firm.test>',
      PORTAL_TOKEN_TTL_HOURS: 168,
      CLAMAV_ENABLED: false,
      MAX_UPLOAD_FILE_BYTES: 26_214_400,
    };
    const configService = {
      get: <T>(key: string, defaultValue?: T): T =>
        (key in configValues ? configValues[key] : defaultValue) as T,
    } as unknown as ConfigService;

    plansService = new PlansService(
      dataSource.getRepository(PlanEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      configService,
    );
    auditService = new AuditService(dataSource.getRepository(AuditEventEntity));
    const templates = new EmailTemplatesService(configService);
    notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      templates,
    );
    (notificationsService as unknown as { resendClient: unknown }).resendClient =
      {
        emails: {
          send: async (payload: {
            to: string[];
            subject: string;
            html: string;
          }) => {
            sentEmails.push(payload);
            return {
              data: { id: `re_${crypto.randomUUID().slice(0, 10)}` },
              error: null,
            };
          },
        },
      };

    authService = new AuthService(
      dataSource,
      dataSource.getRepository(UserEntity),
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RefreshSessionEntity),
      new JwtService({}),
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

    filesService = new FilesService(
      dataSource.getRepository(UploadedFileEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      s3Mock as unknown as S3StorageService,
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

    const clamavService = new ClamavService(configService);
    portalService = new PortalService(
      dataSource,
      dataSource.getRepository(PortalAccessEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(RequestItemEntity),
      dataSource.getRepository(UploadedFileEntity),
      configService,
      s3Mock as unknown as S3StorageService,
      clamavService,
      filesService,
      auditService,
    );

    await plansService.ensureDefaultPlans();
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function seedFirm(label: string) {
    const res = await authService.registerFirm(
      {
        fullName: `${label} Owner`,
        email: `${label.toLowerCase()}@firm.test`,
        password: 'FirmPassword123',
        firmName: `${label} Accountants`,
        country: OrganizationCountry.UK,
        timezone: 'Europe/London',
      },
      '127.0.0.1',
    );
    const ownerCtx: AuthenticatedContext = {
      userId: res.me.user.id,
      organizationId: res.me.organization.id,
      role: UserRole.OWNER,
      membershipId: res.me.membership.id,
      email: res.me.user.email,
      fullName: res.me.user.fullName,
    };
    return { ownerCtx, res };
  }

  async function seedStaff(orgId: string, email: string, fullName: string) {
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
        status: 'ACTIVE' as MembershipEntity['status'],
      }),
    );
    const staffCtx: AuthenticatedContext = {
      userId: user.id,
      organizationId: orgId,
      role: UserRole.STAFF,
      membershipId: membership.id,
      email,
      fullName,
    };
    return staffCtx;
  }

  function extractTokenFromEmail(html: string): string {
    const match = /\/portal\/([A-Za-z0-9_-]+)/.exec(html);
    if (!match?.[1]) throw new Error('Portal token missing in email HTML');
    return match[1];
  }

  // =========================================================================
  // CLIENT MANAGEMENT TESTS
  // =========================================================================

  it('creates, edits, searches, and views full client profile, files, and activity', async () => {
    const { ownerCtx } = await seedFirm('Alpha');

    const created = await clientsService.createClient(ownerCtx, {
      name: 'Beacon Logistics Ltd',
      companyName: 'Beacon Freight Group',
      email: 'finance@beacon.test',
      phone: '+44 20 7946 0100',
      address: '10 Victoria St, London',
      referenceCode: 'BEA-001',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      notes: 'VAT registered quarterly',
      primaryContact: {
        fullName: 'Arthur Pendelton',
        email: 'arthur@beacon.test',
        phone: '+44 20 7946 0101',
        roleTitle: 'CFO',
        isPrimary: true,
      },
    });

    expect(created.companyName).toBe('Beacon Freight Group');
    expect(created.email).toBe('finance@beacon.test');
    expect(created.phone).toBe('+44 20 7946 0100');
    expect(created.address).toBe('10 Victoria St, London');
    expect(created.primaryContactPhone).toBe('+44 20 7946 0101');

    // Duplicate name and reference code rejected
    await expect(
      clientsService.createClient(ownerCtx, {
        name: 'beacon logistics ltd',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
      }),
    ).rejects.toThrow(ConflictException);

    await expect(
      clientsService.createClient(ownerCtx, {
        name: 'Different Name Ltd',
        referenceCode: 'bea-001',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
      }),
    ).rejects.toThrow(ConflictException);

    // Search by companyName and email
    const byCompany = await clientsService.listClients(ownerCtx, {
      search: 'Freight Group',
    });
    expect(byCompany).toHaveLength(1);
    expect(byCompany[0]?.id).toBe(created.id);

    const byEmail = await clientsService.listClients(ownerCtx, {
      search: 'finance@beacon.test',
    });
    expect(byEmail).toHaveLength(1);

    // Update profile fields
    const updated = await clientsService.updateClient(ownerCtx, created.id, {
      companyName: 'Beacon Freight UK Ltd',
      phone: '+44 20 7946 0999',
      address: '20 Bishopsgate, London',
    });
    expect(updated.companyName).toBe('Beacon Freight UK Ltd');
    expect(updated.phone).toBe('+44 20 7946 0999');

    // Activity contains CLIENT_CREATED and CLIENT_UPDATED
    const activity = await clientsService.listClientActivity(
      ownerCtx,
      created.id,
    );
    expect(activity.map((e) => e.action)).toEqual(
      expect.arrayContaining(['CLIENT_CREATED', 'CLIENT_UPDATED']),
    );

    // Schema validation checks
    expect(
      CreateClientSchema.safeParse({
        name: 'A',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
      }).success,
    ).toBe(false);
    expect(
      CreateClientSchema.safeParse({
        name: 'Valid Name',
        email: 'not-an-email',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
      }).success,
    ).toBe(false);
  });

  it('archives and restores clients, blocking new requests while preserving data, and enforces restricted permanent deletion', async () => {
    const { ownerCtx } = await seedFirm('ArchiveTest');

    const unusedClient = await clientsService.createClient(ownerCtx, {
      name: 'Unused Prospect Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
    });
    const busyClient = await clientsService.createClient(ownerCtx, {
      name: 'Active Retainer Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'Maya Lin',
        email: 'maya@retainer.test',
      },
    });

    // Unused client with only CLIENT_CREATED can be permanently deleted
    await clientsService.deleteClient(ownerCtx, unusedClient.id);
    await expect(
      clientsService.getClient(ownerCtx, unusedClient.id),
    ).rejects.toThrow(NotFoundException);

    // Create and send a request + upload file for busyClient
    const req = await requestsService.createRequest(ownerCtx, {
      clientId: busyClient.id,
      title: 'Q1 Accounts',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      items: [{ title: 'Bank Statement', isRequired: true }],
    });
    await requestsService.sendRequest(ownerCtx, req.id);
    const rawToken = extractTokenFromEmail(
      sentEmails[sentEmails.length - 1]!.html,
    );

    const presign = await portalService.createPresignedUpload(rawToken, {
      requestItemId: req.items[0]!.id,
      fileName: 'january.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
    });
    const obj = await dataSource.getRepository(UploadedFileEntity).findOneByOrFail({
      id: presign.fileId,
    });
    s3Mock.seedObject(obj.storageKey, Buffer.from('%PDF-1.4\nabc'), 'application/pdf');
    await portalService.confirmUpload(rawToken, { fileId: presign.fileId });

    // Attempt permanent deletion on busyClient -> blocked with ConflictException
    await expect(
      clientsService.deleteClient(ownerCtx, busyClient.id),
    ).rejects.toThrow(ConflictException);

    // Archive busyClient
    const archived = await clientsService.archiveClient(ownerCtx, busyClient.id);
    expect(archived.status).toBe(ClientStatus.ARCHIVED);

    // Default ACTIVE list omits archived client; ARCHIVED tab returns it
    const activeOnly = await clientsService.listClients(ownerCtx, {
      status: ClientStatus.ACTIVE,
    });
    expect(activeOnly.some((c) => c.id === busyClient.id)).toBe(false);

    // Creating a new request for archived client fails
    await expect(
      requestsService.createRequest(ownerCtx, {
        clientId: busyClient.id,
        title: 'Blocked Request',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        items: [{ title: 'Item', isRequired: true }],
      }),
    ).rejects.toThrow(BadRequestException);

    // Preserved files, requests, and activity are still intact
    const files = await clientsService.listClientFiles(ownerCtx, busyClient.id);
    expect(files).toHaveLength(1);
    expect(files[0]?.originalFilename).toBe('january.pdf');

    const activity = await clientsService.listClientActivity(
      ownerCtx,
      busyClient.id,
    );
    expect(activity.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'CLIENT_ARCHIVED',
        'DOCUMENT_REQUEST_CREATED',
        'DOCUMENT_REQUEST_SENT',
        'PORTAL_FILE_UPLOADED',
      ]),
    );

    // Quota check on restore
    const sub = await dataSource
      .getRepository(OrganizationSubscriptionEntity)
      .findOneByOrFail({ organizationId: ownerCtx.organizationId });
    await dataSource
      .getRepository(PlanEntity)
      .update({ id: sub.planId }, { maxActiveClients: 0 });
    await expect(
      clientsService.restoreClient(ownerCtx, busyClient.id),
    ).rejects.toThrow(ForbiddenException);

    await dataSource
      .getRepository(PlanEntity)
      .update({ id: sub.planId }, { maxActiveClients: 25 });
    const restored = await clientsService.restoreClient(ownerCtx, busyClient.id);
    expect(restored.status).toBe(ClientStatus.ACTIVE);

    // New request works again after restore
    const nextReq = await requestsService.createRequest(ownerCtx, {
      clientId: busyClient.id,
      title: 'Post-Restore Request',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      items: [{ title: 'Ledger', isRequired: true }],
    });
    expect(nextReq.status).toBe(RequestStatus.DRAFT);
  });

  // =========================================================================
  // CLIENT CONTACT MANAGEMENT TESTS
  // =========================================================================

  it('manages contacts, single active primary invariant, and deactivate/reactivate workflows', async () => {
    const { ownerCtx } = await seedFirm('ContactsFirm');

    const client = await clientsService.createClient(ownerCtx, {
      name: 'Meridian Partners LLP',
      entityType: ClientEntityType.LLP,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'Alice Primary',
        email: 'alice@meridian.test',
      },
    });

    const c1 = client.contacts[0]!;
    expect(c1.isPrimary).toBe(true);
    expect(c1.isActive).toBe(true);

    // Add second contact as primary -> first contact demoted automatically
    const c2 = await clientsService.createContact(ownerCtx, client.id, {
      fullName: 'Bob Secondary',
      email: 'bob@meridian.test',
      roleTitle: 'Controller',
      isPrimary: true,
    });
    expect(c2.isPrimary).toBe(true);

    const afterAdd = await clientsService.listContacts(ownerCtx, client.id);
    expect(afterAdd.filter((c) => c.isPrimary && c.isActive)).toHaveLength(1);
    expect(afterAdd.find((c) => c.id === c1.id)?.isPrimary).toBe(false);

    // Duplicate email rejected
    await expect(
      clientsService.createContact(ownerCtx, client.id, {
        fullName: 'Dup',
        email: 'BOB@meridian.test',
      }),
    ).rejects.toThrow(ConflictException);

    // Validation check on invalid contact email
    expect(
      CreateClientContactSchema.safeParse({
        fullName: 'Bad',
        email: 'invalid-email',
      }).success,
    ).toBe(false);

    // Deactivating primary contact Bob auto-promotes active Alice to primary
    const bobDeactivated = await clientsService.deactivateContact(
      ownerCtx,
      client.id,
      c2.id,
    );
    expect(bobDeactivated.isActive).toBe(false);
    expect(bobDeactivated.isPrimary).toBe(false);

    const afterDeactivate = await clientsService.getClient(ownerCtx, client.id);
    expect(afterDeactivate.contactsCount).toBe(1);
    expect(afterDeactivate.primaryContactEmail).toBe('alice@meridian.test');
    expect(
      afterDeactivate.contacts.find((c) => c.id === c1.id)?.isPrimary,
    ).toBe(true);

    // Marking an inactive contact as primary is blocked
    await expect(
      clientsService.updateContact(ownerCtx, client.id, c2.id, {
        isPrimary: true,
      }),
    ).rejects.toThrow(BadRequestException);

    // Deactivating last active contact leaves no active contacts -> sendRequest fails clearly
    await clientsService.deactivateContact(ownerCtx, client.id, c1.id);
    const draftReq = await requestsService.createRequest(ownerCtx, {
      clientId: client.id,
      title: 'No Active Contact Test',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      items: [{ title: 'Tax Return', isRequired: true }],
    });
    await expect(
      requestsService.sendRequest(ownerCtx, draftReq.id),
    ).rejects.toThrow(BadRequestException);

    // Reactivating Alice automatically promotes her to primary since none active
    const aliceReactivated = await clientsService.reactivateContact(
      ownerCtx,
      client.id,
      c1.id,
    );
    expect(aliceReactivated.isActive).toBe(true);
    expect(aliceReactivated.isPrimary).toBe(true);

    const activity = await clientsService.listClientActivity(
      ownerCtx,
      client.id,
    );
    expect(activity.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'CLIENT_CONTACT_ADDED',
        'CLIENT_CONTACT_DEACTIVATED',
        'CLIENT_CONTACT_REACTIVATED',
      ]),
    );
  });

  // =========================================================================
  // DOCUMENT REQUEST MANAGEMENT & LIFECYCLE TESTS
  // =========================================================================

  it('supports draft reassignment, checklist file protection, issued edits preserving portal, cancel with reason, reopen without old token, and restricted draft delete', async () => {
    const { ownerCtx } = await seedFirm('ReqFirm');

    const clientA = await clientsService.createClient(ownerCtx, {
      name: 'Client Alpha Ltd',
      companyName: 'Alpha Holdings',
      email: 'alpha@client.test',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: { fullName: 'Ann Alpha', email: 'ann@alpha.test' },
    });
    const clientB = await clientsService.createClient(ownerCtx, {
      name: 'Client Beta Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: { fullName: 'Ben Beta', email: 'ben@beta.test' },
    });
    const archivedClient = await clientsService.createClient(ownerCtx, {
      name: 'Archived Gamma Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
    });
    await clientsService.archiveClient(ownerCtx, archivedClient.id);

    // 1. Draft delete succeeds on unused draft
    const disposableDraft = await requestsService.createRequest(ownerCtx, {
      clientId: clientA.id,
      title: 'Disposable Draft',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      items: [{ title: 'Temp doc', isRequired: true }],
    });
    await requestsService.deleteRequest(ownerCtx, disposableDraft.id);
    await expect(
      requestsService.getRequest(ownerCtx, disposableDraft.id),
    ).rejects.toThrow(NotFoundException);

    // 2. Reassign client safely while request is unused DRAFT (blocked for archived target)
    const draft = await requestsService.createRequest(ownerCtx, {
      clientId: clientA.id,
      title: 'Reassignable Request',
      instructions: 'Initial notes',
      dueAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      items: [
        { title: 'Item One', isRequired: true },
        { title: 'Item Two', isRequired: false },
      ],
    });
    await expect(
      requestsService.updateRequest(ownerCtx, draft.id, {
        clientId: archivedClient.id,
      }),
    ).rejects.toThrow(BadRequestException);

    const reassigned = await requestsService.updateRequest(ownerCtx, draft.id, {
      clientId: clientB.id,
      title: 'Updated Beta Request',
    });
    expect(reassigned.clientId).toBe(clientB.id);
    expect(reassigned.client?.name).toBe('Client Beta Ltd');

    // 3. Send request -> email sent & portal link active; unsafe reassignment & permanent deletion now blocked
    await requestsService.sendRequest(ownerCtx, draft.id);
    const token1 = extractTokenFromEmail(
      sentEmails[sentEmails.length - 1]!.html,
    );

    await expect(
      requestsService.updateRequest(ownerCtx, draft.id, {
        clientId: clientA.id,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      requestsService.deleteRequest(ownerCtx, draft.id),
    ).rejects.toThrow(ConflictException);

    // 4. Editing issued request updates portal view dynamically WITHOUT invalidating valid token1
    await requestsService.updateRequest(ownerCtx, draft.id, {
      title: 'Live Updated Title',
      instructions: 'Live Updated Instructions',
    });
    const addedItem = await requestsService.addItem(ownerCtx, draft.id, {
      title: 'Extra Bank Statement',
      isRequired: true,
    });
    await requestsService.updateItem(ownerCtx, draft.id, addedItem.id, {
      title: 'Updated Extra Bank Statement',
    });

    const portalViewAfterEdit = await portalService.getPortalView(token1);
    expect(portalViewAfterEdit.title).toBe('Live Updated Title');
    expect(portalViewAfterEdit.instructions).toBe('Live Updated Instructions');
    expect(
      portalViewAfterEdit.items.some(
        (i) => i.title === 'Updated Extra Bank Statement',
      ),
    ).toBe(true);

    // 5. Client uploads file to Item One -> Item One is now protected from deletion
    const itemOneId = reassigned.items[0]!.id;
    const presign = await portalService.createPresignedUpload(token1, {
      requestItemId: itemOneId,
      fileName: 'statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
    });
    const uploadedRow = await dataSource
      .getRepository(UploadedFileEntity)
      .findOneByOrFail({ id: presign.fileId });
    s3Mock.seedObject(
      uploadedRow.storageKey,
      Buffer.from('%PDF-1.4\n123'),
      'application/pdf',
    );
    await portalService.confirmUpload(token1, { fileId: presign.fileId });

    // Signed download works cleanly (regression check)
    const signedDownload = await filesService.getSignedDownloadUrl(
      ownerCtx,
      presign.fileId,
    );
    expect(signedDownload.downloadUrl).toContain('statement.pdf');

    // Deleting checklist item with uploaded file throws ConflictException
    await expect(
      requestsService.deleteItem(ownerCtx, draft.id, itemOneId),
    ).rejects.toThrow(ConflictException);

    // Item without files can still be deleted cleanly
    await requestsService.deleteItem(ownerCtx, draft.id, addedItem.id);

    // 6. Cancel request with reason -> revokes portal link, blocks uploads, preserves files/email/audit
    const emailCountBeforeCancel = sentEmails.length;
    const cancelled = await requestsService.cancelRequest(ownerCtx, draft.id, {
      reason: 'Engagement paused pending fee agreement',
    });
    expect(cancelled.status).toBe(RequestStatus.CANCELLED);
    expect(cancelled.cancellationReason).toBe(
      'Engagement paused pending fee agreement',
    );
    expect(cancelled.portalAccess?.status).toBe('REVOKED');
    expect(cancelled.files).toHaveLength(1);
    expect(sentEmails.length).toBe(emailCountBeforeCancel); // no unsolicited cancellation email

    await expect(portalService.getPortalView(token1)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      portalService.createPresignedUpload(token1, {
        requestItemId: itemOneId,
        fileName: 'blocked.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Cannot delete cancelled request
    await expect(
      requestsService.deleteRequest(ownerCtx, draft.id),
    ).rejects.toThrow(ConflictException);

    // 7. Reopening blocked while client is archived, succeeds when restored, DOES NOT reactivate token1
    await clientsService.archiveClient(ownerCtx, clientB.id);
    await expect(
      requestsService.reopenRequest(ownerCtx, draft.id, {}),
    ).rejects.toThrow(BadRequestException);
    await clientsService.restoreClient(ownerCtx, clientB.id);

    const reopenedWithoutLink = await requestsService.reopenRequest(
      ownerCtx,
      draft.id,
      { issuePortalLink: false },
    );
    expect(reopenedWithoutLink.status).toBe(RequestStatus.IN_PROGRESS);
    expect(reopenedWithoutLink.cancellationReason).toBeNull();
    expect(reopenedWithoutLink.portalAccess?.status).toBe('REVOKED');
    // Old revoked token must STILL be rejected
    await expect(portalService.getPortalView(token1)).rejects.toThrow(
      ForbiddenException,
    );

    // Re-cancel and reopen WITH fresh link issuance
    await requestsService.cancelRequest(ownerCtx, draft.id, {
      reason: 'Second pause',
    });
    const reopenedWithLink = await requestsService.reopenRequest(
      ownerCtx,
      draft.id,
      { issuePortalLink: true, sendEmail: true },
    );
    expect(reopenedWithLink.status).toBe(RequestStatus.IN_PROGRESS);
    expect(reopenedWithLink.issuedPortalLink?.portalUrl).toBeDefined();
    expect(reopenedWithLink.portalAccess?.status).toBe('ACTIVE');

    const token2 = extractTokenFromEmail(
      sentEmails[sentEmails.length - 1]!.html,
    );
    expect(token2).not.toBe(token1);
    const portalView2 = await portalService.getPortalView(token2);
    expect(portalView2.requestId).toBe(draft.id);

    // Request activity records full audit chain
    const reqActivity = await requestsService.listRequestActivity(
      ownerCtx,
      draft.id,
    );
    expect(reqActivity.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'DOCUMENT_REQUEST_CREATED',
        'DOCUMENT_REQUEST_UPDATED',
        'DOCUMENT_REQUEST_SENT',
        'DOCUMENT_REQUEST_ITEM_ADDED',
        'DOCUMENT_REQUEST_ITEM_UPDATED',
        'DOCUMENT_REQUEST_ITEM_DELETED',
        'PORTAL_FILE_UPLOADED',
        'FILE_DOWNLOAD_URL_ISSUED',
        'DOCUMENT_REQUEST_CANCELLED',
        'DOCUMENT_REQUEST_REOPENED',
        'PORTAL_LINK_ISSUED',
      ]),
    );
  });

  // =========================================================================
  // SECURITY, TENANT ISOLATION, READ-ONLY & RECURRENCE REGRESSION TESTS
  // =========================================================================

  it('enforces cross-tenant isolation, STAFF assignment checks, read-only lock, and keeps templates/recurrences working', async () => {
    const { ownerCtx: firmAOwner } = await seedFirm('FirmA');
    const { ownerCtx: firmBOwner } = await seedFirm('FirmB');
    const staffUser = await seedStaff(
      firmAOwner.organizationId,
      'staff@firma.test',
      'Staff Member',
    );

    const unassignedClient = await clientsService.createClient(firmAOwner, {
      name: 'Unassigned A Client',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
    });
    const assignedClient = await clientsService.createClient(firmAOwner, {
      name: 'Assigned A Client',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      assignedUserId: staffUser.userId,
      primaryContact: { fullName: 'Sam', email: 'sam@assigned.test' },
    });

    const req = await requestsService.createRequest(firmAOwner, {
      clientId: unassignedClient.id,
      title: 'Confidential Request',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      items: [{ title: 'Tax Filing', isRequired: true }],
    });

    // Cross-tenant isolation (Firm B vs Firm A)
    await expect(
      clientsService.getClient(firmBOwner, unassignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      clientsService.listClientFiles(firmBOwner, unassignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      clientsService.listClientActivity(firmBOwner, unassignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      clientsService.archiveClient(firmBOwner, unassignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      clientsService.deleteClient(firmBOwner, unassignedClient.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.getRequest(firmBOwner, req.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.listRequestActivity(firmBOwner, req.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.cancelRequest(firmBOwner, req.id, { reason: 'Attack' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.deleteRequest(firmBOwner, req.id),
    ).rejects.toThrow(NotFoundException);

    // STAFF isolation on unassigned client & request
    await expect(
      clientsService.getClient(staffUser, unassignedClient.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      clientsService.listClientFiles(staffUser, unassignedClient.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      requestsService.getRequest(staffUser, req.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      requestsService.updateRequest(staffUser, req.id, {
        clientId: assignedClient.id,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Template + Recurrence regression check
    const tpl = await templatesService.createTemplate(firmAOwner, {
      name: 'Monthly Pack',
      category: TemplateCategory.BOOKKEEPING,
      items: [{ title: 'Bank CSV', isRequired: true }],
    });
    const recurrence = await recurrencesService.createRecurrence(firmAOwner, {
      clientId: assignedClient.id,
      templateId: tpl.id,
      titleTemplate: 'Monthly Close {{period}}',
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 5,
      dueDaysAfterIssue: 10,
    });
    expect(recurrence.id).toBeDefined();

    // Client with recurrence cannot be permanently deleted
    await expect(
      clientsService.deleteClient(firmAOwner, assignedClient.id),
    ).rejects.toThrow(ConflictException);

    // Read-only trial blocks mutations
    await dataSource.getRepository(OrganizationSubscriptionEntity).update(
      { organizationId: firmAOwner.organizationId },
      {
        status: SubscriptionStatus.READ_ONLY,
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    );
    await expect(
      clientsService.archiveClient(firmAOwner, assignedClient.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      requestsService.cancelRequest(firmAOwner, req.id),
    ).rejects.toThrow(ForbiddenException);
  });
});
