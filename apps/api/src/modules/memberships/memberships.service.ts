import {
  MembershipStatus,
  TeamRosterResponse,
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
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
} from '../../common/utils/crypto.util';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RefreshSessionEntity } from '../../database/entities/refresh-session.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AcceptInviteDto } from '../auth/auth.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import { InviteMemberDto, UpdateMemberRoleDto } from './memberships.dto';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepo: Repository<MembershipEntity>,
    @InjectRepository(InvitationEntity)
    private readonly invitationRepo: Repository<InvitationEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getTeamRoster(organizationId: string): Promise<TeamRosterResponse> {
    const members = await this.membershipRepo.find({
      where: { organizationId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    const now = new Date();
    const invitations = await this.invitationRepo.find({
      where: {
        organizationId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      relations: { invitedByUser: true },
      order: { createdAt: 'DESC' },
    });

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.role,
        status: m.status,
        emailVerified: Boolean(m.user.emailVerifiedAt),
        createdAt: m.createdAt.toISOString(),
      })),
      pendingInvitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        invitedByEmail: inv.invitedByUser?.email ?? 'Team Admin',
      })),
    };
  }

  async inviteMember(
    auth: AuthenticatedContext,
    dto: InviteMemberDto,
    ipAddress?: string,
  ) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const subscription = await this.plansService.getSubscriptionSummary(
      auth.organizationId,
    );
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }

    const activeMembersCount = await this.membershipRepo.count({
      where: {
        organizationId: auth.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    const pendingInvitesCount = await this.invitationRepo.count({
      where: {
        organizationId: auth.organizationId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (activeMembersCount + pendingInvitesCount >= subscription.maxTeamSeats) {
      throw new ForbiddenException(
        `Team seat limit reached (${subscription.maxTeamSeats} seats on ${subscription.planName} plan)`,
      );
    }

    const existingMember = await this.membershipRepo
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .where('m.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('LOWER(u.email) = :email', { email: normalizedEmail })
      .getOne();

    if (existingMember) {
      throw new ConflictException(
        'This user is already a member of your organization',
      );
    }

    const existingPending = await this.invitationRepo.findOne({
      where: {
        organizationId: auth.organizationId,
        email: normalizedEmail,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'An active invitation already exists for this email address',
      );
    }

    const org = await this.orgRepo.findOne({
      where: { id: auth.organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);

    const { invitation, outboxEvent } = await this.dataSource.transaction(
      async (manager) => {
        const saved = await manager.getRepository(InvitationEntity).save(
          manager.getRepository(InvitationEntity).create({
            organizationId: auth.organizationId,
            invitedByUserId: auth.userId,
            email: normalizedEmail,
            role: dto.role,
            tokenHash,
            expiresAt,
          }),
        );

        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'TEAM_MEMBER_INVITED',
            resourceType: 'invitation',
            resourceId: saved.id,
            metadata: { email: normalizedEmail, role: dto.role },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        // Never store raw invitation tokens in outbox payloads
        const savedOutbox = await this.notificationsService.enqueueOutboxEvent(
          {
            organizationId: auth.organizationId,
            aggregateType: 'invitation',
            aggregateId: saved.id,
            eventType: 'team.invitation_created',
            idempotencyKey: `invite:${saved.id}`,
            recipientEmail: normalizedEmail,
            templateName: 'team_invitation',
            payload: { role: dto.role, firmName: org.name },
          },
          manager,
        );

        return { invitation: saved, outboxEvent: savedOutbox };
      },
    );

    const rendered = this.notificationsService
      .getTemplates()
      .buildTeamInvitationEmail({
        firmName: org.name,
        inviterName: auth.fullName,
        role: dto.role,
        token: rawToken,
      });

    const emailResult = await this.notificationsService.dispatchEmail({
      organizationId: auth.organizationId,
      outboxEventId: outboxEvent.id,
      recipientEmail: normalizedEmail,
      templateName: 'team_invitation',
      rendered,
      idempotencyKey: outboxEvent.idempotencyKey,
    });

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
        invitedByEmail: auth.email,
      },
      emailDispatchStatus: emailResult.sent
        ? 'SENT'
        : emailResult.errorMessage ?? 'FAILED',
    };
  }

  async revokeInvitation(
    auth: AuthenticatedContext,
    invitationId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const invitation = await this.invitationRepo.findOne({
      where: {
        id: invitationId,
        organizationId: auth.organizationId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      },
    });
    if (!invitation) {
      throw new NotFoundException('Pending invitation not found');
    }

    await this.invitationRepo.update(
      { id: invitation.id, organizationId: auth.organizationId },
      { revokedAt: new Date() },
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'TEAM_INVITATION_REVOKED',
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { email: invitation.email },
      ipAddress: ipAddress ?? null,
    });
  }

  async acceptInvitation(dto: AcceptInviteDto, ipAddress?: string) {
    const tokenHash = hashToken(dto.token.trim());
    const invitation = await this.invitationRepo.findOne({
      where: {
        tokenHash,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
      },
      relations: { organization: true },
    });

    if (
      !invitation ||
      invitation.expiresAt.getTime() <= Date.now() ||
      !invitation.organization ||
      invitation.organization.deletedAt
    ) {
      throw new BadRequestException('Invitation link is invalid or has expired');
    }

    const existingUser = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', {
        email: invitation.email.toLowerCase(),
      })
      .getOne();

    let user: UserEntity;
    if (!existingUser) {
      if (!dto.fullName || !dto.password) {
        throw new BadRequestException(
          'Full name and password are required to accept this invitation',
        );
      }
      const passwordHash = await hashPassword(dto.password);
      user = await this.dataSource.transaction(async (manager) => {
        const createdUser = await manager.getRepository(UserEntity).save(
          manager.getRepository(UserEntity).create({
            email: invitation.email.toLowerCase(),
            fullName: dto.fullName!.trim(),
            passwordHash,
            emailVerifiedAt: new Date(),
          }),
        );

        await manager.getRepository(MembershipEntity).save(
          manager.getRepository(MembershipEntity).create({
            organizationId: invitation.organizationId,
            userId: createdUser.id,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
          }),
        );

        await manager.getRepository(InvitationEntity).update(
          { id: invitation.id },
          { acceptedAt: new Date() },
        );

        await this.auditService.record(
          {
            organizationId: invitation.organizationId,
            actorUserId: createdUser.id,
            action: 'TEAM_INVITATION_ACCEPTED',
            resourceType: 'invitation',
            resourceId: invitation.id,
            metadata: { role: invitation.role },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        return createdUser;
      });
    } else {
      const existingMembership = await this.membershipRepo.findOne({
        where: {
          organizationId: invitation.organizationId,
          userId: existingUser.id,
        },
      });
      if (existingMembership) {
        throw new ConflictException(
          'Account is already a member of this organization',
        );
      }

      user = await this.dataSource.transaction(async (manager) => {
        if (!existingUser.emailVerifiedAt) {
          await manager.getRepository(UserEntity).update(
            { id: existingUser.id },
            { emailVerifiedAt: new Date() },
          );
        }

        await manager.getRepository(MembershipEntity).save(
          manager.getRepository(MembershipEntity).create({
            organizationId: invitation.organizationId,
            userId: existingUser.id,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
          }),
        );

        await manager.getRepository(InvitationEntity).update(
          { id: invitation.id },
          { acceptedAt: new Date() },
        );

        await this.auditService.record(
          {
            organizationId: invitation.organizationId,
            actorUserId: existingUser.id,
            action: 'TEAM_INVITATION_ACCEPTED',
            resourceType: 'invitation',
            resourceId: invitation.id,
            metadata: { role: invitation.role },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );

        return existingUser;
      });
    }

    return {
      accepted: true,
      email: user.email,
      organizationName: invitation.organization.name,
      role: invitation.role,
    };
  }

  async updateMemberRole(
    auth: AuthenticatedContext,
    membershipId: string,
    dto: UpdateMemberRoleDto,
    ipAddress?: string,
  ) {
    if (auth.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only a firm Owner can change member roles');
    }

    await this.assertWorkspaceWritable(auth.organizationId);

    const target = await this.membershipRepo.findOne({
      where: {
        id: membershipId,
        organizationId: auth.organizationId,
      },
    });
    if (!target) {
      throw new NotFoundException('Team member not found');
    }

    if (target.role === UserRole.OWNER && dto.role !== UserRole.OWNER) {
      const ownerCount = await this.membershipRepo.count({
        where: {
          organizationId: auth.organizationId,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the sole Owner of the organization',
        );
      }
    }

    await this.membershipRepo.update(
      { id: target.id, organizationId: auth.organizationId },
      { role: dto.role },
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'TEAM_MEMBER_ROLE_UPDATED',
      resourceType: 'membership',
      resourceId: target.id,
      metadata: { previousRole: target.role, newRole: dto.role },
      ipAddress: ipAddress ?? null,
    });

    return { updated: true, role: dto.role };
  }

  async removeMember(
    auth: AuthenticatedContext,
    membershipId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const target = await this.membershipRepo.findOne({
      where: {
        id: membershipId,
        organizationId: auth.organizationId,
      },
    });
    if (!target) {
      throw new NotFoundException('Team member not found');
    }

    if (target.id === auth.membershipId) {
      throw new BadRequestException('You cannot remove your own membership');
    }

    if (target.role === UserRole.OWNER) {
      throw new ForbiddenException(
        'Firm owners cannot be removed without transferring ownership',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RefreshSessionEntity).update(
        {
          userId: target.userId,
          organizationId: auth.organizationId,
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );

      await manager.getRepository(MembershipEntity).delete({
        id: target.id,
        organizationId: auth.organizationId,
      });

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'TEAM_MEMBER_REMOVED',
          resourceType: 'membership',
          resourceId: target.id,
          metadata: { removedUserId: target.userId },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    });
  }

  private async assertWorkspaceWritable(organizationId: string): Promise<void> {
    const subscription =
      await this.plansService.getSubscriptionSummary(organizationId);
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }
  }
}
