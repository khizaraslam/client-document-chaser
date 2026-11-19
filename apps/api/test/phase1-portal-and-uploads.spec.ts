import 'reflect-metadata';
// import { describe, it, expect, vi } from 'vitest';
import {
  ClientEntityType,
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  RequestItemStatus,
  RequestStatus,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { AuthenticatedContext } from '../src/common/types/auth-context.type';
import { hashToken } from '../src/common/utils/crypto.util';
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


async function createPhase1PortalInMemoryDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_phase1_portal_test',
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
  public readonly deletedKeys: string[] = [];

  getBucketName(): string {
    return 'client-docs-private';
  }

  isConfigured(): boolean {
    return true;
  }

  seedObject(key: string, body: Buffer, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }

  hasObject(key: string): boolean {
    return this.objects.has(key);
  }

  async createPresignedPutUrl(params: {
    key: string;
    contentType: string;
  }): Promise<string> {
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
    if (!found) {
      throw new Error('NoSuchKey');
    }
    return {
      contentLength: found.body.length,
      contentType: found.contentType,
      etag: '"mock-etag"',
    };
  }

  async getObjectBytes(key: string, maxBytes?: number): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) {
      throw new Error('NoSuchKey');
    }
    return maxBytes ? found.body.subarray(0, maxBytes) : found.body;
  }

  async createPresignedGetUrl(params: {
    key: string;
    downloadFilename: string;
    contentType: string;
  }): Promise<string> {
    return `https://silo.local/client-docs-private/${encodeURIComponent(params.key)}?response-content-disposition=attachment&X-Amz-Signature=mockget`;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    this.deletedKeys.push(key);
  }
}

describe('Phase 1: Secure Client Portal, Document Upload & Email Delivery', () => {
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
  let sentEmails: Array<{
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    idempotencyKey?: string;
  }>;
  let nextResendBehavior: 'ok' | 'api_error';

  function buildServices() {
    const emailTemplates = new EmailTemplatesService(configService);
    notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      emailTemplates,
    );

    // Stub Resend client transport cleanly without network calls
    (notificationsService as unknown as { resendClient: unknown }).resendClient =
      configValues['RESEND_API_KEY']
        ? {
            emails: {
              send: async (
                payload: {
                  from: string;
                  to: string[];
                  subject: string;
                  html: string;
                  text: string;
                },
                opts?: { idempotencyKey?: string },
              ) => {
                if (nextResendBehavior === 'api_error') {
                  return {
                    data: null,
                    error: { message: 'Resend domain not verified' },
                  };
                }
                sentEmails.push({
                  ...payload,
                  idempotencyKey: opts?.idempotencyKey,
                });
                return {
                  data: { id: `re_${crypto.randomUUID().slice(0, 12)}` },
                  error: null,
                };
              },
            },
          }
        : null;

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
  }

  beforeEach(async () => {
    dataSource = await createPhase1PortalInMemoryDataSource();
    sentEmails = [];
    nextResendBehavior = 'ok';

    configValues = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      APP_PUBLIC_URL: 'https://portal.vanceaccounting.test',
      PORTAL_TOKEN_TTL_HOURS: 168,
      PORTAL_MAX_FILE_SIZE_MB: 10,
      RESEND_API_KEY: 're_test_mock_key',
      EMAIL_FROM: 'Vance Accounting <docs@vanceaccounting.test>',
      RESEND_FROM_EMAIL: 'Fallback <fallback@example.com>',
      RESEND_WEBHOOK_SECRET: 'whsec_dGVzdHNlY3JldGtleWZvcnJlc2VuZHdlYmhvb2s=',
      MALWARE_SCAN_ENABLED: false,
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: 39999,
    };

    configService = {
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
    s3Mock = new InMemoryS3StorageMock();
    buildServices();

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
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function setupFirmAndDraftRequest(email = 'owner@firm-a.test') {
    const reg = await authService.registerFirm(
      {
        fullName: 'Claire Vance',
        email,
        password: 'StrongPassword123',
        firmName: 'Vance Chartered Accountants',
        country: OrganizationCountry.UK,
        timezone: 'Europe/London',
      },
      '127.0.0.1',
      'jest',
    );
    const auth: AuthenticatedContext = {
      userId: reg.me.user.id,
      email: reg.me.user.email,
      fullName: reg.me.user.fullName,
      organizationId: reg.me.organization.id,
      membershipId: reg.me.membership.id,
      role: reg.me.membership.role,
    };

    const client = await clientsService.createClient(auth, {
      name: 'Oakridge Holdings Ltd',
      entityType: ClientEntityType.LTD,
      country: OrganizationCountry.UK,
      primaryContact: {
        fullName: 'James Oakridge',
        email: 'james@oakridge.test',
      },
    });

    const request = await requestsService.createRequest(auth, {
      clientId: client.id,
      title: 'Q4 VAT & Bank Statements',
      instructions: 'Please upload PDF or PNG files.',
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      items: [
        {
          title: 'Business Bank Statement',
          description: 'October–December PDF statement',
          isRequired: true,
        },
        {
          title: 'Director ID Photo',
          isRequired: false,
        },
      ],
    });

    return { auth, client, request };
  }

  function extractTokenFromSentEmail(htmlOrText: string): string {
    const match = htmlOrText.match(/\/portal\/([A-Za-z0-9_-]+)/);
    if (!match?.[1]) {
      throw new Error('Portal token not found in email body');
    }
    return match[1];
  }

  it('sends request with hashed portal token only, dispatches Resend email, and prevents duplicate sends', async () => {
    const { auth, request } = await setupFirmAndDraftRequest();
    sentEmails = [];

    const sent = await requestsService.sendRequest(auth, request.id);
    expect(sent.status).toBe(RequestStatus.SENT);
    expect(sent.recipientEmail).toBe('james@oakridge.test');
    expect(sent.emailDelivery?.status).toBe(EmailStatus.SENT);
    expect(sent.portalAccess?.status).toBe('ACTIVE');

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.from).toBe(
      'Vance Accounting <docs@vanceaccounting.test>',
    );
    expect(sentEmails[0]!.to).toEqual(['james@oakridge.test']);
    expect(sentEmails[0]!.idempotencyKey).toBe(`request-sent:${request.id}`);

    const rawToken = extractTokenFromSentEmail(sentEmails[0]!.text);
    expect(rawToken.length).toBeGreaterThanOrEqual(32);

    // Ensure raw token is NOT stored in portal_accesses, outbox_events, or audit_events
    const portalRow = await dataSource
      .getRepository(PortalAccessEntity)
      .findOneOrFail({ where: { requestId: request.id } });
    expect(portalRow.tokenHash).toBe(hashToken(rawToken));
    expect(JSON.stringify(portalRow)).not.toContain(rawToken);

    const outboxRows = await dataSource.getRepository(OutboxEventEntity).find();
    expect(JSON.stringify(outboxRows)).not.toContain(rawToken);

    const auditRows = await dataSource.getRepository(AuditEventEntity).find();
    expect(JSON.stringify(auditRows)).not.toContain(rawToken);

    // Duplicate send or duplicate resend while already SENT must fail
    await expect(
      requestsService.sendRequest(auth, request.id),
    ).rejects.toThrow(BadRequestException);
    await expect(
      requestsService.resendRequestEmail(auth, request.id),
    ).rejects.toThrow(ConflictException);
    expect(sentEmails).toHaveLength(1);
  });

  it('records FAILED_MISSING_CREDENTIALS and allows clean retry without duplicate active tokens', async () => {
    configValues['RESEND_API_KEY'] = '';
    buildServices();

    const { auth, request } = await setupFirmAndDraftRequest();
    sentEmails = [];
    const sent = await requestsService.sendRequest(auth, request.id);
    expect(sent.emailDelivery?.status).toBe(
      EmailStatus.FAILED_MISSING_CREDENTIALS,
    );
    expect(sentEmails).toHaveLength(0);

    // Restore Resend credentials and retry
    configValues['RESEND_API_KEY'] = 're_test_restored';
    buildServices();
    sentEmails = [];

    const retried = await requestsService.resendRequestEmail(auth, request.id);
    expect(retried.emailDelivery?.status).toBe(EmailStatus.SENT);
    expect(sentEmails).toHaveLength(1);

    const activeLinks = await dataSource
      .getRepository(PortalAccessEntity)
      .find({ where: { requestId: request.id } });
    const unrevoked = activeLinks.filter((p) => !p.revokedAt);
    expect(unrevoked).toHaveLength(1);
  });

  it('enforces portal token expiry, revocation, rotation, and non-leaking errors', async () => {
    const { auth, request } = await setupFirmAndDraftRequest();
    sentEmails = [];
    await requestsService.sendRequest(auth, request.id);
    const firstToken = extractTokenFromSentEmail(sentEmails[0]!.text);

    // Valid portal view
    const view = await portalService.getPortalView(firstToken);
    expect(view.firmName).toBe('Vance Chartered Accountants');
    expect(view.clientName).toBe('Oakridge Holdings Ltd');
    expect(view.items).toHaveLength(2);

    // Unknown token
    await expect(
      portalService.getPortalView('non-existent-random-token-123456'),
    ).rejects.toThrow(NotFoundException);

    // Issue fresh link revokes previous token
    const issued = await requestsService.issueFreshPortalLink(auth, request.id, {
      sendEmail: false,
    });
    const secondToken = extractTokenFromSentEmail(issued.portalUrl);
    expect(secondToken).not.toBe(firstToken);

    await expect(portalService.getPortalView(firstToken)).rejects.toThrow(
      ForbiddenException,
    );
    const view2 = await portalService.getPortalView(secondToken);
    expect(view2.title).toBe(request.title);

    // Explicit revocation blocks access
    await requestsService.revokePortalAccess(auth, request.id);
    await expect(portalService.getPortalView(secondToken)).rejects.toThrow(
      ForbiddenException,
    );

    // Expired token check
    const issued2 = await requestsService.issueFreshPortalLink(
      auth,
      request.id,
      { sendEmail: false },
    );
    const thirdToken = extractTokenFromSentEmail(issued2.portalUrl);
    await dataSource
      .getRepository(PortalAccessEntity)
      .update(
        { tokenHash: hashToken(thirdToken) },
        { expiresAt: new Date(Date.now() - 60_000) },
      );
    await expect(portalService.getPortalView(thirdToken)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('validates presigned upload, verifies PDF magic bytes, prevents confirm replay, and rejects spoofed executables', async () => {
    const { auth, request } = await setupFirmAndDraftRequest();
    sentEmails = [];
    await requestsService.sendRequest(auth, request.id);
    const token = extractTokenFromSentEmail(sentEmails[0]!.text);
    const item = request.items[0]!;

    // Block dangerous/double extensions
    await expect(
      portalService.createPresignedUpload(token, {
        requestItemId: item.id,
        fileName: 'statement.pdf.exe',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(BadRequestException);

    // Valid PDF presign + PUT + confirm
    const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const presign = await portalService.createPresignedUpload(token, {
      requestItemId: item.id,
      fileName: '../q4 bank statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: validPdf.length,
    });
    expect(presign.uploadUrl).toContain('silo.local');

    const pendingRecord = await dataSource
      .getRepository(UploadedFileEntity)
      .findOneOrFail({ where: { id: presign.fileId } });
    expect(pendingRecord.sanitizedFilename).toBe('q4-bank-statement.pdf');
    expect(pendingRecord.scanStatus).toBe(FileScanStatus.PENDING_UPLOAD);

    s3Mock.seedObject(pendingRecord.storageKey, validPdf, 'application/pdf');

    const confirmed = await portalService.confirmUpload(token, {
      fileId: presign.fileId,
    });
    expect(confirmed.file.scanStatus).toBe(FileScanStatus.CLEAN);
    expect(confirmed.itemStatus).toBe(RequestItemStatus.UPLOADED);
    // Must move to IN_PROGRESS, NOT COMPLETED
    expect(confirmed.requestStatus).toBe(RequestStatus.IN_PROGRESS);

    // Replay confirm must fail with ConflictException and NOT double-increment storage
    await expect(
      portalService.confirmUpload(token, { fileId: presign.fileId }),
    ).rejects.toThrow(ConflictException);

    const sub = await plansService.getSubscriptionSummary(auth.organizationId);
    expect(sub.storageBytesUsed).toBe(validPdf.length);

    // Spoofed executable disguised as .pdf must be rejected & deleted from S3
    const fakePdfWithMzHeader = Buffer.from('MZ\x90\x00\x03\x00\x00\x00fake-exe');
    const spoofPresign = await portalService.createPresignedUpload(token, {
      requestItemId: request.items[1]!.id,
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: fakePdfWithMzHeader.length,
    });
    const spoofRecord = await dataSource
      .getRepository(UploadedFileEntity)
      .findOneOrFail({ where: { id: spoofPresign.fileId } });
    s3Mock.seedObject(
      spoofRecord.storageKey,
      fakePdfWithMzHeader,
      'application/pdf',
    );

    await expect(
      portalService.confirmUpload(token, { fileId: spoofPresign.fileId }),
    ).rejects.toThrow(BadRequestException);

    expect(s3Mock.hasObject(spoofRecord.storageKey)).toBe(false);
    const updatedSpoof = await dataSource
      .getRepository(UploadedFileEntity)
      .findOneOrFail({ where: { id: spoofPresign.fileId } });
    expect(updatedSpoof.scanStatus).toBe(FileScanStatus.REJECTED);
  });

  it('quarantines files when malware scanning is enabled but ClamAV is unavailable, and supports API fallback upload', async () => {
    const { auth, request } = await setupFirmAndDraftRequest();
    sentEmails = [];
    await requestsService.sendRequest(auth, request.id);
    const token = extractTokenFromSentEmail(sentEmails[0]!.text);

    // 1. API fallback upload with valid PNG
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const fallbackResult = await portalService.uploadViaApiFallback(
      token,
      request.items[0]!.id,
      {
        originalname: 'id-card.png',
        mimetype: 'image/png',
        size: validPng.length,
        buffer: validPng,
      },
    );
    expect(fallbackResult.file.scanStatus).toBe(FileScanStatus.CLEAN);
    expect(fallbackResult.itemStatus).toBe(RequestItemStatus.UPLOADED);

    // 2. Enable ClamAV pointing to unreachable port -> file MUST be QUARANTINED, not CLEAN
    configValues['MALWARE_SCAN_ENABLED'] = true;
    configValues['CLAMAV_PORT'] = 39999;
    buildServices();

    const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const quarantineRes = await portalService.uploadViaApiFallback(
      token,
      request.items[1]!.id,
      {
        originalname: 'scan.jpg',
        mimetype: 'image/jpeg',
        size: validJpg.length,
        buffer: validJpg,
      },
    );
    expect(quarantineRes.file.scanStatus).toBe(FileScanStatus.QUARANTINED);
    expect(quarantineRes.itemStatus).toBe(RequestItemStatus.PENDING);

    // Quarantined file cannot be downloaded by admin
    await expect(
      filesService.getSignedDownloadUrl(auth, quarantineRes.file.id),
    ).rejects.toThrow(BadRequestException);

    // Clean file CAN be downloaded with short-lived signed URL
    const download = await filesService.getSignedDownloadUrl(
      auth,
      fallbackResult.file.id,
    );
    expect(download.downloadUrl).toContain('X-Amz-Signature=mockget');
    expect(download.expiresInSeconds).toBe(120);
  });

  it('enforces cross-tenant isolation on files, portal links, and Resend webhooks', async () => {
    const firmA = await setupFirmAndDraftRequest('owner-a@firm-a.test');
    sentEmails = [];
    await requestsService.sendRequest(firmA.auth, firmA.request.id);
    const token = extractTokenFromSentEmail(sentEmails[0]!.text);

    const validPdf = Buffer.from('%PDF-1.4\n%test');
    const uploaded = await portalService.uploadViaApiFallback(
      token,
      firmA.request.items[0]!.id,
      {
        originalname: 'tax.pdf',
        mimetype: 'application/pdf',
        size: validPdf.length,
        buffer: validPdf,
      },
    );

    const firmB = await authService.registerFirm(
      {
        fullName: 'Other Partner',
        email: 'owner-b@firm-b.test',
        password: 'StrongPassword123',
        firmName: 'Firm B LLP',
        country: OrganizationCountry.US,
        timezone: 'America/New_York',
      },
      '127.0.0.1',
      'jest',
    );
    const authB: AuthenticatedContext = {
      userId: firmB.me.user.id,
      email: firmB.me.user.email,
      fullName: firmB.me.user.fullName,
      organizationId: firmB.me.organization.id,
      membershipId: firmB.me.membership.id,
      role: firmB.me.membership.role,
    };

    await expect(
      filesService.getSignedDownloadUrl(authB, uploaded.file.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.revokePortalAccess(authB, firmA.request.id),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestsService.issueFreshPortalLink(authB, firmA.request.id, {
        sendEmail: false,
      }),
    ).rejects.toThrow(NotFoundException);

    // Resend webhook verification updates SENT -> DELIVERED
    const emailEvent = await dataSource
      .getRepository(EmailEventEntity)
      .findOneOrFail({
        where: {
          organizationId: firmA.auth.organizationId,
          templateName: 'document_request_sent',
        },
      });
    expect(emailEvent.status).toBe(EmailStatus.SENT);

    const webhookPayload = {
      type: 'email.delivered',
      data: { email_id: emailEvent.providerMessageId ?? undefined },
    };
    const rawBody = JSON.stringify(webhookPayload);
    const svixId = 'msg_123';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const secretBytes = Buffer.from(
      String(configValues['RESEND_WEBHOOK_SECRET']).slice(6),
      'base64',
    );
    const sig = crypto
      .createHmac('sha256', secretBytes)
      .update(`${svixId}.${svixTimestamp}.${rawBody}`)
      .digest('base64');

    await expect(
      notificationsService.handleResendWebhook({
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature: 'v1,bad_signature',
        payload: webhookPayload,
      }),
    ).rejects.toThrow(UnauthorizedException);

    const webhookResult = await notificationsService.handleResendWebhook({
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature: `v1,${sig}`,
      payload: webhookPayload,
    });
    expect(webhookResult.processed).toBe(true);

    const updatedDetail = await requestsService.getRequest(
      firmA.auth,
      firmA.request.id,
    );
    expect(updatedDetail.emailDelivery?.status).toBe(EmailStatus.DELIVERED);
  });
});
