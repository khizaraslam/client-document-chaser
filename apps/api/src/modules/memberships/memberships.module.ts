import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RefreshSessionEntity } from '../../database/entities/refresh-session.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipEntity,
      InvitationEntity,
      OrganizationEntity,
      UserEntity,
      RefreshSessionEntity,
    ]),
    PlansModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
