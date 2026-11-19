import {
  AuthMeResponse,
  MembershipStatus,
  SessionInfoItem,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccessJwtPayload } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  slugifyFirmName,
  verifyPassword,
} from '../../common/utils/crypto.util';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RefreshSessionEntity } from '../../database/entities/refresh-session.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterFirmDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';

export interface AuthTokenBundle {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  me: AuthMeResponse;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepo: Repository<MembershipEntity>,
    @InjectRepository(RefreshSessionEntity)
    private readonly refreshSessionRepo: Repository<RefreshSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async registerFirm(
    dto: RegisterFirmDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokenBundle & { emailDispatchStatus: string }> {
    this.assertValidTimezone(dto.timezone);
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalizedEmail })
      .getOne();

    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const rawVerifyToken = generateOpaqueToken(32);
    const verifyTokenHash = hashToken(rawVerifyToken);
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { user, organization, membership, outboxEvent } =
      await this.dataSource.transaction(async (manager) => {
        const userRepo = manager.getRepository(UserEntity);
        const orgRepo = manager.getRepository(OrganizationEntity);
        const membershipRepo = manager.getRepository(MembershipEntity);

        const savedUser = await userRepo.save(
          userRepo.create({
            email: normalizedEmail,
            fullName: dto.fullName.trim(),
            passwordHash,
            emailVerifyTokenHash: verifyTokenHash,
            emailVerifyExpiresAt: verifyExpiresAt,
            lastLoginAt: new Date(),
          }),
        );

        const savedOrg = await orgRepo.save(
          orgRepo.create({
            name: dto.firmName.trim(),
            slug: slugifyFirmName(dto.firmName),
            country: dto.country,
            timezone: dto.timezone.trim(),
          }),
        );

        const savedMembership = await membershipRepo.save(
          membershipRepo.create({
            organizationId: savedOrg.id,
            userId: savedUser.id,
            role: UserRole.OWNER,
            status: MembershipStatus.ACTIVE,
          }),
        );

        await this.plansService.initializeTrialSubscription(
          savedOrg.id,
          manager,
        );

        await this.auditService.record(
          {
            organizationId: savedOrg.id,
            actorUserId: savedUser.id,
            action: 'FIRM_REGISTERED',
            resourceType: 'organization',
            resourceId: savedOrg.id,
            metadata: { country: savedOrg.country, timezone: savedOrg.timezone },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        // Never store raw verification tokens in outbox payloads
        const savedOutbox = await this.notificationsService.enqueueOutboxEvent(
          {
            organizationId: savedOrg.id,
            aggregateType: 'user',
            aggregateId: savedUser.id,
            eventType: 'auth.verify_email',
            idempotencyKey: `verify-email:${savedUser.id}:${verifyTokenHash.slice(0, 12)}`,
            recipientEmail: savedUser.email,
            templateName: 'email_verification',
            payload: { fullName: savedUser.fullName },
          },
          manager,
        );

        return {
          user: savedUser,
          organization: savedOrg,
          membership: savedMembership,
          outboxEvent: savedOutbox,
        };
      });

    const rendered = this.notificationsService
      .getTemplates()
      .buildVerificationEmail({
        fullName: user.fullName,
        token: rawVerifyToken,
      });

    const emailResult = await this.notificationsService.dispatchEmail({
      organizationId: organization.id,
      outboxEventId: outboxEvent.id,
      recipientEmail: user.email,
      templateName: 'email_verification',
      rendered,
      idempotencyKey: outboxEvent.idempotencyKey,
    });

    const tokens = await this.issueSessionTokens({
      user,
      membership,
      organization,
      ipAddress,
      userAgent,
    });

    return {
      ...tokens,
      emailDispatchStatus: emailResult.sent
        ? 'SENT'
        : emailResult.errorMessage ?? 'FAILED',
    };
  }

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokenBundle> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalizedEmail })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        organization: { deletedAt: IsNull() },
      },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });

    if (!membership || !membership.organization) {
      throw new UnauthorizedException(
        'No active organization membership found for this account',
      );
    }

    await this.userRepo.update({ id: user.id }, { lastLoginAt: new Date() });
    user.lastLoginAt = new Date();

    await this.auditService.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: 'USER_LOGGED_IN',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: ipAddress ?? null,
    });

    return this.issueSessionTokens({
      user,
      membership,
      organization: membership.organization,
      ipAddress,
      userAgent,
    });
  }

  async refresh(
    rawRefreshToken: string | undefined,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokenBundle> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const existingSession = await this.refreshSessionRepo.findOne({
      where: { tokenHash },
      relations: { user: true, organization: true },
    });

    if (!existingSession) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    // Reuse detection: revoked or already-rotated token compromises the entire family
    if (existingSession.revokedAt || existingSession.replacedById) {
      await this.refreshSessionRepo.update(
        { familyId: existingSession.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      await this.auditService.record({
        organizationId: existingSession.organizationId,
        actorUserId: existingSession.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        resourceType: 'refresh_session',
        resourceId: existingSession.familyId,
        ipAddress: ipAddress ?? null,
      });

      throw new UnauthorizedException(
        'Session security violation detected; please sign in again',
      );
    }

    if (existingSession.expiresAt.getTime() <= Date.now()) {
      await this.refreshSessionRepo.update(
        { id: existingSession.id },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh session has expired');
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        userId: existingSession.userId,
        organizationId: existingSession.organizationId,
        status: MembershipStatus.ACTIVE,
        organization: { deletedAt: IsNull() },
      },
      relations: { organization: true, user: true },
    });

    if (!membership || !membership.user || !membership.organization) {
      throw new UnauthorizedException('Active firm membership no longer exists');
    }

    const newRawRefresh = generateOpaqueToken(48);
    const newHash = hashToken(newRawRefresh);
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    const newSession = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshSessionEntity);
      const created = await repo.save(
        repo.create({
          userId: membership.userId,
          organizationId: membership.organizationId,
          familyId: existingSession.familyId,
          tokenHash: newHash,
          userAgent: userAgent?.slice(0, 512) ?? existingSession.userAgent,
          ipAddress: ipAddress ?? existingSession.ipAddress,
          expiresAt,
        }),
      );

      await repo.update(
        { id: existingSession.id },
        {
          revokedAt: new Date(),
          replacedById: created.id,
        },
      );

      return created;
    });

    const accessToken = await this.signAccessToken({
      sub: membership.user.id,
      orgId: membership.organizationId,
      membershipId: membership.id,
      familyId: newSession.familyId,
    });

    const me = await this.buildMeResponse(
      membership.user,
      membership,
      membership.organization,
    );

    return {
      accessToken,
      refreshToken: newRawRefresh,
      csrfToken: generateOpaqueToken(24),
      me,
    };
  }

  async logout(
    rawRefreshToken: string | undefined,
    auth?: AuthenticatedContext,
    ipAddress?: string,
  ): Promise<void> {
    let resolvedOrgId = auth?.organizationId;
    let resolvedUserId = auth?.userId;

    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const session = await this.refreshSessionRepo.findOne({
        where: { tokenHash, revokedAt: IsNull() },
      });
      if (session) {
        await this.refreshSessionRepo.update(
          { id: session.id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        resolvedOrgId ??= session.organizationId;
        resolvedUserId ??= session.userId;
      }
    }

    if (resolvedOrgId && resolvedUserId) {
      await this.auditService.record({
        organizationId: resolvedOrgId,
        actorUserId: resolvedUserId,
        action: 'USER_LOGGED_OUT',
        resourceType: 'user',
        resourceId: resolvedUserId,
        ipAddress: ipAddress ?? null,
      });
    }
  }

  async logoutAll(
    auth: AuthenticatedContext,
    ipAddress?: string,
  ): Promise<void> {
    await this.refreshSessionRepo.update(
      { userId: auth.userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'ALL_SESSIONS_REVOKED',
      resourceType: 'user',
      resourceId: auth.userId,
      ipAddress: ipAddress ?? null,
    });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ verified: boolean }> {
    const tokenHash = hashToken(dto.token.trim());
    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: tokenHash },
    });

    if (
      !user ||
      !user.emailVerifyExpiresAt ||
      user.emailVerifyExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Email verification link is invalid or has expired',
      );
    }

    await this.userRepo.update(
      { id: user.id },
      {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null,
      },
    );

    return { verified: true };
  }

  async resendVerification(
    auth: AuthenticatedContext,
  ): Promise<{ dispatched: boolean; message: string }> {
    const user = await this.userRepo.findOne({ where: { id: auth.userId } });
    if (!user) {
      throw new NotFoundException('User account not found');
    }

    if (user.emailVerifiedAt) {
      return { dispatched: false, message: 'Email is already verified' };
    }

    const rawToken = generateOpaqueToken(32);
    const verifyTokenHash = hashToken(rawToken);
    const outboxEvent = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update(
        { id: user.id },
        {
          emailVerifyTokenHash: verifyTokenHash,
          emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      );

      // Never store raw verification tokens in outbox payloads
      return this.notificationsService.enqueueOutboxEvent(
        {
          organizationId: auth.organizationId,
          aggregateType: 'user',
          aggregateId: user.id,
          eventType: 'auth.verify_email_resent',
          idempotencyKey: `verify-email-resend:${user.id}:${verifyTokenHash.slice(0, 12)}`,
          recipientEmail: user.email,
          templateName: 'email_verification',
          payload: { fullName: user.fullName },
        },
        manager,
      );
    });

    const rendered = this.notificationsService
      .getTemplates()
      .buildVerificationEmail({
        fullName: user.fullName,
        token: rawToken,
      });

    const result = await this.notificationsService.dispatchEmail({
      organizationId: auth.organizationId,
      outboxEventId: outboxEvent.id,
      recipientEmail: user.email,
      templateName: 'email_verification',
      rendered,
      idempotencyKey: outboxEvent.idempotencyKey,
    });

    return {
      dispatched: result.sent,
      message: result.sent
        ? 'Verification email dispatched'
        : result.errorMessage ?? 'Email service unavailable',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalizedEmail })
      .getOne();

    if (user) {
      const rawToken = generateOpaqueToken(32);
      const resetTokenHash = hashToken(rawToken);
      const membership = await this.membershipRepo.findOne({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
      });

      const outboxEvent = await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(UserEntity).update(
          { id: user.id },
          {
            passwordResetTokenHash: resetTokenHash,
            passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        );

        // Never store raw password reset tokens in outbox payloads
        return this.notificationsService.enqueueOutboxEvent(
          {
            organizationId: membership?.organizationId ?? null,
            aggregateType: 'user',
            aggregateId: user.id,
            eventType: 'auth.password_reset',
            idempotencyKey: `password-reset:${user.id}:${resetTokenHash.slice(0, 12)}`,
            recipientEmail: user.email,
            templateName: 'password_reset',
            payload: { fullName: user.fullName },
          },
          manager,
        );
      });

      const rendered = this.notificationsService
        .getTemplates()
        .buildPasswordResetEmail({
          fullName: user.fullName,
          token: rawToken,
        });

      await this.notificationsService.dispatchEmail({
        organizationId: membership?.organizationId ?? null,
        outboxEventId: outboxEvent.id,
        recipientEmail: user.email,
        templateName: 'password_reset',
        rendered,
        idempotencyKey: outboxEvent.idempotencyKey,
      });
    }

    return {
      message:
        'If an account exists for that email address, password reset instructions have been processed.',
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
  ): Promise<{ reset: boolean }> {
    const tokenHash = hashToken(dto.token.trim());
    const user = await this.userRepo.findOne({
      where: { passwordResetTokenHash: tokenHash },
    });

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Password reset token is invalid or has expired',
      );
    }

    const newHash = await hashPassword(dto.newPassword);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserEntity).update(
        { id: user.id },
        {
          passwordHash: newHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      );

      await manager.getRepository(RefreshSessionEntity).update(
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      const membership = await manager.getRepository(MembershipEntity).findOne({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
      });
      if (membership) {
        await this.auditService.record(
          {
            organizationId: membership.organizationId,
            actorUserId: user.id,
            action: 'PASSWORD_RESET_COMPLETED',
            resourceType: 'user',
            resourceId: user.id,
            ipAddress: ipAddress ?? null,
          },
          manager,
        );
      }
    });

    return { reset: true };
  }

  async getMe(auth: AuthenticatedContext): Promise<AuthMeResponse> {
    const membership = await this.membershipRepo.findOne({
      where: {
        id: auth.membershipId,
        userId: auth.userId,
        organizationId: auth.organizationId,
      },
      relations: { user: true, organization: true },
    });

    if (!membership || !membership.user || !membership.organization) {
      throw new UnauthorizedException('Session membership not found');
    }

    return this.buildMeResponse(
      membership.user,
      membership,
      membership.organization,
    );
  }

  async listSessions(auth: AuthenticatedContext): Promise<SessionInfoItem[]> {
    const now = new Date();
    const sessions = await this.refreshSessionRepo.find({
      where: {
        userId: auth.userId,
        organizationId: auth.organizationId,
        revokedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    return sessions
      .filter((s) => s.expiresAt.getTime() > now.getTime())
      .map((s) => ({
        id: s.id,
        familyId: s.familyId,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: s.familyId === auth.sessionFamilyId,
      }));
  }

  async revokeSession(
    auth: AuthenticatedContext,
    sessionId: string,
  ): Promise<void> {
    const session = await this.refreshSessionRepo.findOne({
      where: {
        id: sessionId,
        userId: auth.userId,
        organizationId: auth.organizationId,
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.refreshSessionRepo.update(
      { id: session.id },
      { revokedAt: new Date() },
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'SESSION_REVOKED',
      resourceType: 'refresh_session',
      resourceId: session.id,
    });
  }

  async issueSessionTokens(params: {
    user: UserEntity;
    membership: MembershipEntity;
    organization: OrganizationEntity;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuthTokenBundle> {
    const familyId = crypto.randomUUID();
    const rawRefreshToken = generateOpaqueToken(48);
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    await this.refreshSessionRepo.save(
      this.refreshSessionRepo.create({
        userId: params.user.id,
        organizationId: params.organization.id,
        familyId,
        tokenHash: hashToken(rawRefreshToken),
        userAgent: params.userAgent?.slice(0, 512) ?? null,
        ipAddress: params.ipAddress ?? null,
        expiresAt,
      }),
    );

    const accessToken = await this.signAccessToken({
      sub: params.user.id,
      orgId: params.organization.id,
      membershipId: params.membership.id,
      familyId,
    });

    const me = await this.buildMeResponse(
      params.user,
      params.membership,
      params.organization,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      csrfToken: generateOpaqueToken(24),
      me,
    };
  }

  private async signAccessToken(payload: AccessJwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    });
  }

  private async buildMeResponse(
    user: UserEntity,
    membership: MembershipEntity,
    organization: OrganizationEntity,
  ): Promise<AuthMeResponse> {
    const subscription = await this.plansService.getSubscriptionSummary(
      organization.id,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: Boolean(user.emailVerifiedAt),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      },
      membership: {
        id: membership.id,
        role: membership.role,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        country: organization.country,
        timezone: organization.timezone,
      },
      subscription,
    };
  }

  private assertValidTimezone(timezone: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
    }
  }
}
