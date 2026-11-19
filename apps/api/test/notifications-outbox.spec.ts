import 'reflect-metadata';
import {
  EmailStatus,
  OrganizationCountry,
  OutboxStatus,
  UserRole,
} from '@cdc/contracts';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import {
  AuditEventEntity,
  EmailEventEntity,
  InvitationEntity,
  MembershipEntity,
  OrganizationEntity,
  OrganizationSubscriptionEntity,
  OutboxEventEntity,
  PHASE1_ENTITIES,
  PlanEntity,
  RefreshSessionEntity,
  UserEntity,
} from '../src/database/entities';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { MembershipsService } from '../src/modules/memberships/memberships.service';
import { EmailTemplatesService } from '../src/modules/notifications/email-templates.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PlansService } from '../src/modules/plans/plans.service';

async function createInMemoryDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_outbox_test',
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
    entities: PHASE1_ENTITIES,
    synchronize: true,
  });

  await ds.initialize();
  return ds;
}

describe('Phase 1: Resend & Outbox Integration', () => {
  let dataSource: DataSource;
  let configValues: Record<string, unknown>;
  let configService: ConfigService;
  let notificationsService: NotificationsService;
  let authService: AuthService;
  let membershipsService: MembershipsService;
  let sendMock: jest.Mock;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource();

    configValues = {
      JWT_ACCESS_SECRET: 'test-jwt-secret-at-least-32-characters',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_TTL_DAYS: 30,
      TRIAL_DAYS: 14,
      TRIAL_EXPIRED_READ_ONLY: true,
      APP_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test_key_123',
      EMAIL_FROM: 'Client Document Chaser <notifications@firm.test>',
    };

    configService = {
      get: <T>(key: string, defaultValue?: T): T =>
        (key in configValues ? configValues[key] : defaultValue) as T,
    } as unknown as ConfigService;

    const plansService = new PlansService(
      dataSource.getRepository(PlanEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      configService,
    );
    const auditService = new AuditService(
      dataSource.getRepository(AuditEventEntity),
    );
    const templates = new EmailTemplatesService(configService);
    notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      templates,
    );

    sendMock = jest.fn(async () => ({
      data: { id: `re_msg_${crypto.randomUUID().slice(0, 8)}` },
      error: null,
    }));
    (
      notificationsService as unknown as {
        resendClient: { emails: { send: typeof sendMock } };
      }
    ).resendClient = {
      emails: { send: sendMock },
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

    membershipsService = new MembershipsService(
      dataSource,
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(InvitationEntity),
      dataSource.getRepository(OrganizationEntity),
      dataSource.getRepository(UserEntity),
      plansService,
      auditService,
      notificationsService,
    );
  });

  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('wires outboxEventId and idempotencyKey across registerFirm, resendVerification, forgotPassword, and inviteMember without storing raw tokens', async () => {
    const reg = await authService.registerFirm({
      fullName: 'Ada Lovelace',
      email: 'ada@analytical.co.uk',
      password: 'StrongPassword123',
      firmName: 'Analytical Partners',
      country: OrganizationCountry.UK,
      timezone: 'Europe/London',
    });

    expect(reg.emailDispatchStatus).toBe('SENT');

    const auth = {
      userId: reg.me.user.id,
      email: reg.me.user.email,
      fullName: reg.me.user.fullName,
      organizationId: reg.me.organization.id,
      membershipId: reg.me.membership.id,
      role: UserRole.OWNER,
    };

    const resendRes = await authService.resendVerification(auth);
    expect(resendRes.dispatched).toBe(true);

    await authService.forgotPassword({ email: 'ada@analytical.co.uk' });

    const inviteRes = await membershipsService.inviteMember(auth, {
      email: 'babbage@analytical.co.uk',
      role: UserRole.ADMIN,
    });
    expect(inviteRes.emailDispatchStatus).toBe('SENT');

    expect(sendMock).toHaveBeenCalledTimes(4);

    // Every Resend call receives a deterministic idempotencyKey header option
    for (const call of sendMock.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    }

    const outboxes = await dataSource.getRepository(OutboxEventEntity).find({
      order: { createdAt: 'ASC' },
    });
    expect(outboxes).toHaveLength(4);
    expect(outboxes.map((o) => o.eventType)).toEqual([
      'auth.verify_email',
      'auth.verify_email_resent',
      'auth.password_reset',
      'team.invitation_created',
    ]);

    for (const outbox of outboxes) {
      expect(outbox.status).toBe(OutboxStatus.PROCESSED);
      expect(outbox.attempts).toBe(1);
      expect(outbox.processedAt).not.toBeNull();
      // Raw tokens must never be persisted inside outbox payloads
      const serialized = JSON.stringify(outbox.payload);
      expect(serialized).not.toContain('token=');
      expect(serialized).not.toContain('verify-email?token');
      expect(serialized).not.toContain('reset-password?token');
      expect(serialized).not.toContain('accept-invite?token');
    }

    const emailEvents = await dataSource.getRepository(EmailEventEntity).find();
    expect(emailEvents).toHaveLength(4);
    for (const evt of emailEvents) {
      expect(evt.status).toBe(EmailStatus.SENT);
      expect(evt.outboxEventId).not.toBeNull();
    }
  });

  it('prevents duplicate sends for already-PROCESSED outbox events', async () => {
    const outbox = await notificationsService.enqueueOutboxEvent({
      organizationId: null,
      aggregateType: 'user',
      aggregateId: crypto.randomUUID(),
      eventType: 'test.notice',
      idempotencyKey: `notice:${crypto.randomUUID()}`,
      recipientEmail: 'client@example.com',
      templateName: 'notice',
      payload: {},
    });

    const rendered = {
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    };

    const first = await notificationsService.dispatchEmail({
      organizationId: null,
      outboxEventId: outbox.id,
      recipientEmail: 'client@example.com',
      templateName: 'notice',
      rendered,
      idempotencyKey: outbox.idempotencyKey,
    });
    expect(first.sent).toBe(true);

    const second = await notificationsService.dispatchEmail({
      organizationId: null,
      outboxEventId: outbox.id,
      recipientEmail: 'client@example.com',
      templateName: 'notice',
      rendered,
      idempotencyKey: outbox.idempotencyKey,
    });
    expect(second.sent).toBe(true);
    expect(second.emailEventId).toBe(first.emailEventId);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('records FAILED status and retries due non-secret outbox events safely', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Temporary Resend rate limit' },
    });

    const rendered = {
      subject: 'Document status update',
      html: '<p>Accepted</p>',
      text: 'Accepted',
    };

    const outbox = await notificationsService.enqueueOutboxEvent({
      organizationId: null,
      aggregateType: 'document_request',
      aggregateId: crypto.randomUUID(),
      eventType: 'review.completed',
      idempotencyKey: `review:${crypto.randomUUID()}`,
      recipientEmail: 'client@example.com',
      templateName: 'review_update',
      payload: {
        renderedEmail: rendered,
      },
    });

    const firstAttempt = await notificationsService.dispatchEmail({
      organizationId: null,
      outboxEventId: outbox.id,
      recipientEmail: 'client@example.com',
      templateName: 'review_update',
      rendered,
      idempotencyKey: outbox.idempotencyKey,
    });
    expect(firstAttempt.sent).toBe(false);
    expect(firstAttempt.status).toBe(EmailStatus.FAILED);

    const failedOutbox = await dataSource
      .getRepository(OutboxEventEntity)
      .findOneByOrFail({ id: outbox.id });
    expect(failedOutbox.status).toBe(OutboxStatus.FAILED);
    expect(failedOutbox.attempts).toBe(1);
    expect(failedOutbox.lastError).toBe('Temporary Resend rate limit');
    expect(failedOutbox.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Simulate due retry time reached
    await dataSource
      .getRepository(OutboxEventEntity)
      .update({ id: outbox.id }, { nextAttemptAt: new Date(Date.now() - 1000) });

    sendMock.mockResolvedValueOnce({
      data: { id: 're_msg_retry_ok' },
      error: null,
    });

    const retriedCount = await notificationsService.retryDueOutboxEvents();
    expect(retriedCount).toBe(1);

    const completedOutbox = await dataSource
      .getRepository(OutboxEventEntity)
      .findOneByOrFail({ id: outbox.id });
    expect(completedOutbox.status).toBe(OutboxStatus.PROCESSED);
    expect(completedOutbox.attempts).toBe(2);
    expect(completedOutbox.lastError).toBeNull();
  });
});
