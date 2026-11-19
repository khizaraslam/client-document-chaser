import 'reflect-metadata';
import {
  ClientEntityType,
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  OutboxStatus,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
  SubscriptionStatus,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
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
  DocumentReviewEntity,
  EmailEventEntity,
  MembershipEntity,
  OrganizationEntity,
  OrganizationSubscriptionEntity,
  OutboxEventEntity,
  PlanEntity,
  PortalAccessEntity,
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
import { RequestsService } from '../src/modules/requests/requests.service';
import { ReviewsService } from '../src/modules/reviews/reviews.service';

async function createReviewsInMemoryDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_reviews_test',
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

class InMemoryS3StorageMock {
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

  async createPresignedPutUrl(params: { key: string }): Promise<string> {
    return `https://silo.local/client-docs-private/${encodeURIComponent(params.key)}?X-Amz-Signature=mockput`;
  }

  async putObjectBuffer(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    this.objects.set(params.key, {
      body: params.body,
      contentType: params.contentType,
    });
  }

  async headObject(key: string) {
    const found = this.objects.get(key);
    if (!found) throw new Error('NoSuchKey');
    return {
      contentLength: found.body.length,
      contentType: found.contentType,
      etag: '"mock-etag"',
    };
  }

  async getObjectBytes(key: string, maxBytes?: number): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) throw new Error('NoSuchKey');
    return maxBytes ? found.body.subarray(0, maxBytes) : found.body;
  }

  async createPresignedGetUrl(params: { key: string }): Promise<string> {
    return `https://silo.local/client-docs-private/${encodeURIComponent(params.key)}?X-Amz-Signature=mockget`;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

describe('Phase 2: Document Review Workflow', () => {
  let dataSource: DataSource;
  let configValues: Record<string, unknown>;
  let configService: ConfigService;
  let authService: AuthService;
  let plansService: PlansService;
  let auditService: AuditService;
  let clientsService: ClientsService;
  let notificationsService: NotificationsService;
  let s3Mock: InMemoryS3StorageMock;
  let clamavService: ClamavService;
  let filesService: FilesService;
  let requestsService: RequestsService;
  let portalService: PortalService;
  let reviewsService: ReviewsService;
  let sentEmails: Array<{
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  }>;

  beforeEach(async () => {
    dataSource = await createReviewsInMemoryDataSource();
    sentEmails = [];
    configValues = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      APP_PUBLIC_URL: 'https://portal.oakridge.test',
      PORTAL_TOKEN_TTL_HOURS: 168,
      PORTAL_MAX_FILE_SIZE_MB: 10,
      RESEND_API_KEY: 're_test_key_reviews',
      EMAIL_FROM: 'Oakridge Advisory <notifications@oakridge.test>',
      MALWARE_SCAN_ENABLED: false,
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: 39999,
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
    const emailTemplates = new EmailTemplatesService(configService);
    notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      emailTemplates,
    );

    (notificationsService as unknown as { resendClient: unknown }).resendClient = {
      emails: {
        send: async (payload: {
          from: string;
          to: string[];
          subject: string;
          html: string;
          text: string;
        }) => {
          sentEmails.push(payload);
          return {
            data: { id: `re_${crypto.randomUUID().slice(0, 12)}` },
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

    s3Mock = new InMemoryS3StorageMock();
    clamavService = new ClamavService(configService);
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

    reviewsService = new ReviewsService(
      dataSource,
      dataSource.getRepository(DocumentReviewEntity),
      dataSource.getRepository(DocumentRequestEntity),
      dataSource.getRepository(RequestItemEntity),
      dataSource.getRepository(UploadedFileEntity),
      dataSource.getRepository(ClientContactEntity),
      dataSource.getRepository(OrganizationEntity),
      plansService,
      auditService,
      notificationsService,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function seedFirmRequestAndPortal(email = 'alice@oakridge.test') {
    const reg = await authService.registerFirm(
      {
        firmName: 'Oakridge Advisory CPA',
        country: OrganizationCountry.UK,
        timezone: 'Europe/London',
        fullName: 'Alice Reviewer',
        email,
        password: 'StrongPassword123',
      },
      '127.0.0.1',
      'jest',
    );

    const ownerAuth: AuthenticatedContext = {
      userId: reg.me.user.id,
      email: reg.me.user.email,
      fullName: reg.me.user.fullName,
      organizationId: reg.me.organization.id,
      membershipId: reg.me.membership.id,
      role: reg.me.membership.role,
    };

    const client = await clientsService.createClient(ownerAuth, {
      name: 'Summit Logistics Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'Ben Carter',
        email: 'ben@summit.test',
      },
    });

    const createdRequest = await requestsService.createRequest(ownerAuth, {
      clientId: client.id,
      title: 'Annual Tax Close',
      instructions: 'Please upload clean PDF files.',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      items: [
        { title: 'Signed Tax Return', isRequired: true },
        { title: 'Bank Statement', isRequired: true },
        { title: 'Optional Notes', isRequired: false },
      ],
    });

    const sent = await requestsService.sendRequest(ownerAuth, createdRequest.id);
    const issued = await requestsService.issueFreshPortalLink(
      ownerAuth,
      createdRequest.id,
      { sendEmail: false },
    );
    const portalToken = issued.portalUrl.split('/portal/')[1]!;

    return { ownerAuth, client, request: sent, portalToken };
  }

  async function uploadPdfForItem(
    portalToken: string,
    requestItemId: string,
    filename: string,
  ) {
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
    );
    return portalService.uploadViaApiFallback(
      portalToken,
      requestItemId,
      {
        originalname: filename,
        mimetype: 'application/pdf',
        size: pdfBytes.length,
        buffer: pdfBytes,
      },
      '127.0.0.1',
    );
  }

  it('rejects accepting an item without a CLEAN file and requires a reason for rejections', async () => {
    const { ownerAuth, client, request, portalToken } =
      await seedFirmRequestAndPortal();
    const firstItem = request.items[0]!;

    await expect(
      reviewsService.reviewItem(ownerAuth, request.id, firstItem.id, {
        decision: ReviewDecision.ACCEPTED,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      reviewsService.markItemUnderReview(ownerAuth, request.id, firstItem.id),
    ).rejects.toThrow(BadRequestException);

    await uploadPdfForItem(portalToken, firstItem.id, 'signed-tax-return.pdf');

    const fileRepo = dataSource.getRepository(UploadedFileEntity);
    const quarantinedFile = await fileRepo.save(
      fileRepo.create({
        organizationId: ownerAuth.organizationId,
        requestId: request.id,
        requestItemId: request.items[1]!.id,
        clientId: client.id,
        originalFilename: 'suspect.pdf',
        sanitizedFilename: 'suspect.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '256',
        storageBucket: 'client-docs-private',
        storageKey: 'quarantined/key.pdf',
        scanStatus: FileScanStatus.QUARANTINED,
      }),
    );

    await expect(
      reviewsService.reviewItem(ownerAuth, request.id, request.items[1]!.id, {
        decision: ReviewDecision.ACCEPTED,
        uploadedFileId: quarantinedFile.id,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      reviewsService.reviewItem(ownerAuth, request.id, firstItem.id, {
        decision: ReviewDecision.REJECTED,
        notes: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles full reject -> re-upload -> under review -> accept -> auto-complete -> revert on subsequent rejection', async () => {
    const { ownerAuth, request, portalToken } =
      await seedFirmRequestAndPortal();
    const requiredItem1 = request.items[0]!;
    const requiredItem2 = request.items[1]!;

    await uploadPdfForItem(portalToken, requiredItem1.id, 'tax-v1.pdf');
    await uploadPdfForItem(portalToken, requiredItem2.id, 'bank-v1.pdf');

    const beforeEmailsCount = sentEmails.length;

    const underReview = await reviewsService.markItemUnderReview(
      ownerAuth,
      request.id,
      requiredItem1.id,
    );
    expect(underReview.itemStatus).toBe(RequestItemStatus.UNDER_REVIEW);
    expect(underReview.requestStatus).toBe(RequestStatus.IN_PROGRESS);

    const rejectResult = await reviewsService.reviewItem(
      ownerAuth,
      request.id,
      requiredItem1.id,
      {
        decision: ReviewDecision.REJECTED,
        notes: 'Page 2 signature is cut off. Please re-upload full scan.',
      },
    );

    expect(rejectResult.itemStatus).toBe(RequestItemStatus.REJECTED);
    expect(rejectResult.requestStatus).toBe(RequestStatus.IN_PROGRESS);
    expect(sentEmails.length).toBe(beforeEmailsCount + 1);
    const rejectionEmail = sentEmails[sentEmails.length - 1]!;
    expect(rejectionEmail.to).toEqual(['ben@summit.test']);
    expect(rejectionEmail.html).toContain('Page 2 signature is cut off');
    expect(rejectionEmail.html).not.toContain(portalToken);

    const outboxEvents = await dataSource
      .getRepository(OutboxEventEntity)
      .find({ where: { aggregateId: request.id } });
    const rejectedOutbox = outboxEvents.find(
      (e) => e.eventType === 'review.item_rejected',
    );
    expect(rejectedOutbox).toBeDefined();
    expect(rejectedOutbox!.status).toBe(OutboxStatus.PROCESSED);
    expect(JSON.stringify(rejectedOutbox!.payload)).not.toContain(portalToken);

    const portalAfterReject = await portalService.getPortalView(portalToken);
    const portalItem1 = portalAfterReject.items.find(
      (i) => i.id === requiredItem1.id,
    )!;
    expect(portalItem1.status).toBe(RequestItemStatus.REJECTED);
    expect(portalItem1.latestReview?.decision).toBe(ReviewDecision.REJECTED);
    expect(portalItem1.latestReview?.notes).toContain('Page 2 signature');

    await uploadPdfForItem(portalToken, requiredItem1.id, 'tax-v2-signed.pdf');
    const portalAfterReupload = await portalService.getPortalView(portalToken);
    expect(
      portalAfterReupload.items.find((i) => i.id === requiredItem1.id)?.status,
    ).toBe(RequestItemStatus.UPLOADED);

    const accept1 = await reviewsService.reviewItem(
      ownerAuth,
      request.id,
      requiredItem1.id,
      {
        decision: ReviewDecision.ACCEPTED,
        notes: 'Signature verified.',
      },
    );
    expect(accept1.itemStatus).toBe(RequestItemStatus.ACCEPTED);
    expect(accept1.requestStatus).toBe(RequestStatus.IN_PROGRESS);
    expect(accept1.completedAt).toBeNull();

    const accept2 = await reviewsService.reviewItem(
      ownerAuth,
      request.id,
      requiredItem2.id,
      {
        decision: ReviewDecision.ACCEPTED,
      },
    );
    expect(accept2.itemStatus).toBe(RequestItemStatus.ACCEPTED);
    expect(accept2.requestStatus).toBe(RequestStatus.COMPLETED);
    expect(accept2.completedAt).toBeTruthy();

    const requestDetail = await requestsService.getRequest(ownerAuth, request.id);
    expect(requestDetail.status).toBe(RequestStatus.COMPLETED);
    expect(requestDetail.reviews?.length).toBe(3);
    expect(
      requestDetail.items.find((i) => i.id === requiredItem1.id)?.latestReview
        ?.decision,
    ).toBe(ReviewDecision.ACCEPTED);

    const emailEvents = await dataSource
      .getRepository(EmailEventEntity)
      .find({ where: { organizationId: ownerAuth.organizationId } });
    expect(
      emailEvents.some(
        (e) =>
          e.templateName === 'request_completed' &&
          e.status === EmailStatus.SENT,
      ),
    ).toBe(true);

    const revertReject = await reviewsService.reviewItem(
      ownerAuth,
      request.id,
      requiredItem2.id,
      {
        decision: ReviewDecision.REJECTED,
        notes: 'Missing final December page.',
      },
    );
    expect(revertReject.itemStatus).toBe(RequestItemStatus.REJECTED);
    expect(revertReject.requestStatus).toBe(RequestStatus.IN_PROGRESS);
    expect(revertReject.completedAt).toBeNull();
  });

  it('enforces tenant isolation, staff assignment scoping, and read-only trial lock on reviews', async () => {
    const { ownerAuth, request, portalToken } =
      await seedFirmRequestAndPortal();
    const item = request.items[0]!;
    await uploadPdfForItem(portalToken, item.id, 'doc.pdf');

    const otherReg = await authService.registerFirm(
      {
        firmName: 'Other Firm LLP',
        country: OrganizationCountry.UK,
        timezone: 'Europe/London',
        fullName: 'Other Owner',
        email: 'other@firm.test',
        password: 'StrongPassword123',
      },
      '127.0.0.1',
      'jest',
    );
    const otherOwnerAuth: AuthenticatedContext = {
      userId: otherReg.me.user.id,
      email: otherReg.me.user.email,
      fullName: otherReg.me.user.fullName,
      organizationId: otherReg.me.organization.id,
      membershipId: otherReg.me.membership.id,
      role: otherReg.me.membership.role,
    };

    await expect(
      reviewsService.listReviewsForRequest(otherOwnerAuth, request.id),
    ).rejects.toThrow(NotFoundException);

    const userRepo = dataSource.getRepository(UserEntity);
    const staffUser = await userRepo.save(
      userRepo.create({
        email: 'staff@oakridge.test',
        fullName: 'Sam Staff',
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      }),
    );
    const staffAuth: AuthenticatedContext = {
      userId: staffUser.id,
      email: staffUser.email,
      fullName: staffUser.fullName,
      organizationId: ownerAuth.organizationId,
      membershipId: crypto.randomUUID(),
      role: UserRole.STAFF,
    };

    await expect(
      reviewsService.reviewItem(staffAuth, request.id, item.id, {
        decision: ReviewDecision.ACCEPTED,
      }),
    ).rejects.toThrow(ForbiddenException);

    await dataSource.getRepository(OrganizationSubscriptionEntity).update(
      { organizationId: ownerAuth.organizationId },
      {
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    );

    await expect(
      reviewsService.reviewItem(ownerAuth, request.id, item.id, {
        decision: ReviewDecision.ACCEPTED,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
