import 'reflect-metadata';
import {
  ClientEntityType,
  OrganizationCountry,
  RequestItemStatus,
  UserRole,
} from '@cdc/contracts';
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
import { OrganizationEntity } from '../src/database/entities/organization.entity';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { FilesService } from '../src/modules/files/files.service';
import { S3StorageService } from '../src/modules/files/s3-storage.service';
import { EmailTemplatesService } from '../src/modules/notifications/email-templates.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { RequestsService } from '../src/modules/requests/requests.service';

async function createDashboardInMemoryDb(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_dashboard_test',
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

describe('Phase 3: Dashboard Backend Aggregation & Scoping', () => {
  let dataSource: DataSource;
  let configService: ConfigService;
  let plansService: PlansService;
  let auditService: AuditService;
  let notificationsService: NotificationsService;
  let authService: AuthService;
  let clientsService: ClientsService;
  let requestsService: RequestsService;
  let dashboardService: DashboardService;

  beforeEach(async () => {
    dataSource = await createDashboardInMemoryDb();

    const configValues: Record<string, unknown> = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      PORTAL_TOKEN_TTL_HOURS: 168,
    };

    configService = {
      get: <T>(key: string, defaultValue?: T): T =>
        (key in configValues ? configValues[key] : defaultValue) as T,
    } as unknown as ConfigService;

    plansService = new PlansService(
      dataSource.getRepository(PlanEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      configService,
    );
    await plansService.ensureDefaultPlans();

    auditService = new AuditService(dataSource.getRepository(AuditEventEntity));
    notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      new EmailTemplatesService(configService),
    );

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

    const filesService = new FilesService(
      dataSource.getRepository(UploadedFileEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      {
        getBucketName: () => 'client-docs-private',
        createPresignedGetUrl: async () => 'https://signed.local/file',
      } as unknown as S3StorageService,
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

    dashboardService = new DashboardService(
      dataSource.getRepository(ClientEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(RequestItemEntity),
      dataSource.getRepository(RecurrenceEntity),
      dataSource.getRepository(EmailEventEntity),
      plansService,
      auditService,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('aggregates tenant metrics, awaiting reviews, overdue requests, and enforces STAFF + tenant isolation', async () => {
    const firmA = await authService.registerFirm(
      {
        firmName: 'Firm Alpha LLP',
        country: OrganizationCountry.US,
        timezone: 'America/New_York',
        fullName: 'Owner Alpha',
        email: 'owner@alpha.test',
        password: 'StrongPassword123',
      },
      '127.0.0.1',
      'jest',
    );
    const ownerAuth: AuthenticatedContext = {
      userId: firmA.me.user.id,
      email: firmA.me.user.email,
      fullName: firmA.me.user.fullName,
      organizationId: firmA.me.organization.id,
      membershipId: firmA.me.membership.id,
      role: UserRole.OWNER,
    };

    const userRepo = dataSource.getRepository(UserEntity);
    const memberRepo = dataSource.getRepository(MembershipEntity);
    const staffUser = await userRepo.save(
      userRepo.create({
        email: 'staff@alpha.test',
        fullName: 'Staff Alpha',
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      }),
    );
    const staffMembership = await memberRepo.save(
      memberRepo.create({
        organizationId: ownerAuth.organizationId,
        userId: staffUser.id,
        role: UserRole.STAFF,
      }),
    );
    const staffAuth: AuthenticatedContext = {
      userId: staffUser.id,
      email: staffUser.email,
      fullName: staffUser.fullName,
      organizationId: ownerAuth.organizationId,
      membershipId: staffMembership.id,
      role: UserRole.STAFF,
    };

    const assignedClient = await clientsService.createClient(ownerAuth, {
      name: 'Assigned Corp',
      entityType: ClientEntityType.CORP,
      country: OrganizationCountry.US,
      assignedUserId: staffUser.id,
      primaryContact: { fullName: 'Contact 1', email: 'c1@assigned.test' },
    });

    const unassignedClient = await clientsService.createClient(ownerAuth, {
      name: 'Unassigned LLC',
      entityType: ClientEntityType.LLC,
      country: OrganizationCountry.US,
      primaryContact: { fullName: 'Contact 2', email: 'c2@unassigned.test' },
    });

    // Request 1: SENT and overdue for assignedClient with 1 item UPLOADED (awaiting review)
    const req1 = await requestsService.createRequest(ownerAuth, {
      clientId: assignedClient.id,
      title: 'Overdue Assigned Request',
      dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      items: [{ title: 'Bank Statement', isRequired: true }],
    });
    await requestsService.sendRequest(ownerAuth, req1.id);
    await dataSource
      .getRepository(RequestItemEntity)
      .update({ id: req1.items[0]!.id }, { status: RequestItemStatus.UPLOADED });

    // Request 2: DRAFT for unassignedClient
    await requestsService.createRequest(ownerAuth, {
      clientId: unassignedClient.id,
      title: 'Draft Unassigned Request',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      items: [{ title: 'W-9 Form', isRequired: true }],
    });

    // Firm Beta data must remain completely invisible to Firm Alpha
    const firmB = await authService.registerFirm(
      {
        firmName: 'Firm Beta CPA',
        country: OrganizationCountry.US,
        timezone: 'America/New_York',
        fullName: 'Owner Beta',
        email: 'owner@beta.test',
        password: 'StrongPassword123',
      },
      '127.0.0.1',
      'jest',
    );
    const betaAuth: AuthenticatedContext = {
      userId: firmB.me.user.id,
      email: firmB.me.user.email,
      fullName: firmB.me.user.fullName,
      organizationId: firmB.me.organization.id,
      membershipId: firmB.me.membership.id,
      role: UserRole.OWNER,
    };
    const betaClient = await clientsService.createClient(betaAuth, {
      name: 'Beta Confidential Co',
      entityType: ClientEntityType.LLC,
      country: OrganizationCountry.US,
      primaryContact: { fullName: 'Beta', email: 'b@beta.test' },
    });
    await requestsService.createRequest(betaAuth, {
      clientId: betaClient.id,
      title: 'Beta Request',
      dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      items: [{ title: 'Beta Item', isRequired: true }],
    });

    const ownerSummary = await dashboardService.getSummary(ownerAuth);
    expect(ownerSummary.metrics.activeClientsCount).toBe(2);
    expect(ownerSummary.metrics.totalRequestsCount).toBe(2);
    expect(ownerSummary.metrics.openRequestsCount).toBe(2);
    expect(ownerSummary.metrics.overdueRequestsCount).toBe(1);
    expect(ownerSummary.metrics.awaitingReviewItemsCount).toBe(1);
    expect(ownerSummary.attentionRequests[0]!.id).toBe(req1.id);
    expect(ownerSummary.attentionRequests[0]!.isOverdue).toBe(true);
    expect(ownerSummary.recentAuditEvents.length).toBeGreaterThan(0);
    // Missing RESEND_API_KEY in test config caused email_verification + request_sent failed email events
    expect(ownerSummary.metrics.failedEmailsCount).toBeGreaterThanOrEqual(2);

    // STAFF sees only assigned client, its requests, and no org audit logs / failed email counts
    const staffSummary = await dashboardService.getSummary(staffAuth);
    expect(staffSummary.metrics.activeClientsCount).toBe(1);
    expect(staffSummary.metrics.totalRequestsCount).toBe(1);
    expect(staffSummary.attentionRequests).toHaveLength(1);
    expect(staffSummary.attentionRequests[0]!.clientId).toBe(
      assignedClient.id,
    );
    expect(staffSummary.recentAuditEvents).toEqual([]);
    expect(staffSummary.metrics.failedEmailsCount).toBe(0);
  });
});
