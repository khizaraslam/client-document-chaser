import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RefreshSessionEntity } from '../../database/entities/refresh-session.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      OrganizationEntity,
      MembershipEntity,
      RefreshSessionEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_ACCESS_EXPIRES_IN',
            '15m',
          ) as NonNullable<import('@nestjs/jwt').JwtSignOptions['expiresIn']>,
        },
      }),
    }),
    PlansModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
