import 'reflect-metadata';
import {
  EmailStatus,
  OrganizationCountry,
  OutboxStatus,
  PlanCode,
  SubscriptionStatus,
  UserRole,
} from '@cdc/contracts';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataType, newDb } from 'pg-mem';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { hashToken } from '../src/common/utils/crypto.util';
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
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { PlansService } from '../src/modules/plans/plans.service';

async function createInMemoryDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'cdc_test',
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

describe('Auth, Refresh Rotation & Tenant Isolation (Integration)', () => {
  let dataSource: DataSource;
  let authService: AuthService;
  let membershipsService: MembershipsService;
  let organizationsService: OrganizationsService;
  let auditService: AuditService;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource();

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
    const plansService = new PlansService(
      dataSource.getRepository(PlanEntity),
      dataSource.getRepository(OrganizationSubscriptionEntity),
      configService,
    );
    auditService = new AuditService(dataSource.getRepository(AuditEventEntity));
    const templatesService = new EmailTemplatesService(configService);
    const notificationsService = new NotificationsService(
      dataSource.getRepository(OutboxEventEntity),
      dataSource.getRepository(EmailEventEntity),
      configService,
      templatesService,
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

    organizationsService = new OrganizationsService(
      dataSource.getRepository(OrganizationEntity),
      plansService,
      auditService,
    );
  });

  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('registers a firm with OWNER role, 14-day STARTER trial, outbox event, and honest missing-Resend-credentials email status', async () => {
    const res = await authService.registerFirm(
      {
        fullName: 'Alice Ledger',
        email: 'alice@ledgerfirm.com',
        password: 'StrongPassword123',
        firmName: 'Ledger & Associates',
        country: OrganizationCountry.US,
        timezone: 'America/New_York',
      },
      '127.0.0.1',
      'jest-agent',
    );

    expect(res.me.user.email).toBe('alice@ledgerfirm.com');
    expect(res.me.membership.role).toBe(UserRole.OWNER);
    expect(res.me.subscription.planCode).toBe(PlanCode.STARTER);
    expect(res.me.subscription.status).toBe(SubscriptionStatus.TRIALING);
    expect(res.emailDispatchStatus).toContain('RESEND_API_KEY is not configured');

    const emailEvents = await dataSource.getRepository(EmailEventEntity).find();
    expect(emailEvents).toHaveLength(1);
    expect(emailEvents[0]?.status).toBe(EmailStatus.FAILED_MISSING_CREDENTIALS);

    const outboxEvents = await dataSource.getRepository(OutboxEventEntity).find();
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.eventType).toBe('auth.verify_email');
    expect(outboxEvents[0]?.status).toBe(OutboxStatus.FAILED);
    expect(outboxEvents[0]?.attempts).toBe(1);
    expect(emailEvents[0]?.outboxEventId).toBe(outboxEvents[0]?.id);
  });

  it('rotates refresh tokens and revokes entire session family on reuse', async () => {
    const reg = await authService.registerFirm({
      fullName: 'Bob Auditor',
      email: 'bob@ukaudit.co.uk',
      password: 'StrongPassword123',
      firmName: 'UK Audit Partners',
      country: OrganizationCountry.UK,
      timezone: 'Europe/London',
    });

    const firstRefresh = reg.refreshToken;
    const rotated = await authService.refresh(firstRefresh, '127.0.0.1', 'jest');
    expect(rotated.refreshToken).not.toBe(firstRefresh);

    // Reusing the already-rotated firstRefresh triggers reuse detection
    await expect(
      authService.refresh(firstRefresh, '127.0.0.1', 'attacker'),
    ).rejects.toThrow(UnauthorizedException);

    // Even the previously valid rotated token is now revoked because family was compromised
    await expect(
      authService.refresh(rotated.refreshToken, '127.0.0.1', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('prevents cross-tenant access and IDOR mutations across organizations', async () => {
    const firmA = await authService.registerFirm({
      fullName: 'Firm A Owner',
      email: 'owner@firma.com',
      password: 'StrongPassword123',
      firmName: 'Firm A LLP',
      country: OrganizationCountry.US,
      timezone: 'America/Chicago',
    });

    const firmB = await authService.registerFirm({
      fullName: 'Firm B Owner',
      email: 'owner@firmb.co.uk',
      password: 'StrongPassword123',
      firmName: 'Firm B Chartered',
      country: OrganizationCountry.UK,
      timezone: 'Europe/London',
    });

    const authContextB = {
      userId: firmB.me.user.id,
      email: firmB.me.user.email,
      fullName: firmB.me.user.fullName,
      organizationId: firmB.me.organization.id,
      membershipId: firmB.me.membership.id,
      role: UserRole.OWNER,
    };

    // Firm B cannot modify Firm A's membership ID (IDOR protection)
    await expect(
      membershipsService.updateMemberRole(
        authContextB,
        firmA.me.membership.id,
        { role: UserRole.STAFF },
      ),
    ).rejects.toThrow(NotFoundException);

    // Firm B cannot remove Firm A's membership ID
    await expect(
      membershipsService.removeMember(authContextB, firmA.me.membership.id),
    ).rejects.toThrow(NotFoundException);

    // Firm B audit events never include Firm A events
    const firmBAudit = await auditService.listForOrganization(
      firmB.me.organization.id,
    );
    expect(
      firmBAudit.every((e) => e.resourceId !== firmA.me.organization.id),
    ).toBe(true);
  });

  it('logs USER_LOGGED_OUT from refresh session on public logout and revokes sessions on password reset', async () => {
    const reg = await authService.registerFirm({
      fullName: 'Claire Vance',
      email: 'claire@vance.co.uk',
      password: 'StrongPassword123',
      firmName: 'Vance Chartered',
      country: OrganizationCountry.UK,
      timezone: 'Europe/London',
    });

    await authService.logout(reg.refreshToken, undefined, '127.0.0.1');

    const auditAfterLogout = await auditService.listForOrganization(
      reg.me.organization.id,
    );
    expect(auditAfterLogout.some((e) => e.action === 'USER_LOGGED_OUT')).toBe(
      true,
    );

    const login2 = await authService.login({
      email: 'claire@vance.co.uk',
      password: 'StrongPassword123',
    });

    // Inject known password reset token hash to exercise resetPassword end-to-end
    const rawResetToken = 'reset-token-1234567890';
    await dataSource.getRepository(UserEntity).update(
      { id: reg.me.user.id },
      {
        passwordResetTokenHash: hashToken(rawResetToken),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      },
    );

    await authService.resetPassword({
      token: rawResetToken,
      newPassword: 'UpdatedPassword123',
    });

    // Prior refresh session from login2 must be revoked
    await expect(
      authService.refresh(login2.refreshToken),
    ).rejects.toThrow(UnauthorizedException);

    // New password logs in cleanly
    const login3 = await authService.login({
      email: 'claire@vance.co.uk',
      password: 'UpdatedPassword123',
    });
    expect(login3.me.user.email).toBe('claire@vance.co.uk');
  });

  it('revokes active sessions when a team member is removed and enforces read-only trial locks', async () => {
    const owner = await authService.registerFirm({
      fullName: 'Firm Owner',
      email: 'owner@trialtest.com',
      password: 'StrongPassword123',
      firmName: 'Trial Test CPA',
      country: OrganizationCountry.US,
      timezone: 'America/New_York',
    });

    const ownerAuth = {
      userId: owner.me.user.id,
      email: owner.me.user.email,
      fullName: owner.me.user.fullName,
      organizationId: owner.me.organization.id,
      membershipId: owner.me.membership.id,
      role: UserRole.OWNER,
    };

    await membershipsService.inviteMember(ownerAuth, {
      email: 'staff@trialtest.com',
      role: UserRole.STAFF,
    });

    const rawInviteToken = 'invite-token-1234567890';
    await dataSource.getRepository(InvitationEntity).update(
      { organizationId: owner.me.organization.id, email: 'staff@trialtest.com' },
      { tokenHash: hashToken(rawInviteToken) },
    );

    const accepted = await membershipsService.acceptInvitation({
      token: rawInviteToken,
      fullName: 'Staff Accountant',
      password: 'StaffPassword123',
    });
    expect(accepted.accepted).toBe(true);

    const staffLogin = await authService.login({
      email: 'staff@trialtest.com',
      password: 'StaffPassword123',
    });

    // Removing the staff member revokes their active refresh session immediately
    await membershipsService.removeMember(ownerAuth, staffLogin.me.membership.id);
    const staffSessions = await dataSource
      .getRepository(RefreshSessionEntity)
      .find({ where: { userId: staffLogin.me.user.id } });
    expect(staffSessions.every((s) => s.revokedAt !== null)).toBe(true);

    // Expire trial to verify read-only lock blocks organization updates
    await dataSource.getRepository(OrganizationSubscriptionEntity).update(
      { organizationId: owner.me.organization.id },
      { trialEndsAt: new Date(Date.now() - 86_400_000) },
    );

    await expect(
      organizationsService.updateCurrent(ownerAuth, { name: 'Blocked Rename' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
