import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import {
  ALL_ENTITIES,
  MembershipEntity,
  RefreshSessionEntity,
} from './database/entities';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlansModule } from './modules/plans/plans.module';
import { PortalModule } from './modules/portal/portal.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TemplatesModule } from './modules/templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        return {
          type: 'postgres',
          ...(databaseUrl
            ? { url: databaseUrl }
            : {
                host: configService.get<string>('DB_HOST', 'localhost'),
                port: configService.get<number>('DB_PORT', 5433),
                username: configService.get<string>('DB_USERNAME', 'cdc_user'),
                password: configService.get<string>(
                  'DB_PASSWORD',
                  'cdc_dev_password',
                ),
                database: configService.get<string>(
                  'DB_NAME',
                  'client_doc_chaser',
                ),
              }),
          ssl: configService.get<boolean>('DB_SSL', false)
            ? { rejectUnauthorized: false }
            : false,
          entities: ALL_ENTITIES,
          synchronize: false,
          migrationsRun: false,
          logging: configService.get<string>('NODE_ENV') === 'development',
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          const parsed = new URL(redisUrl);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parsed.port ? Number(parsed.port) : 6379,
              password: parsed.password || undefined,
              maxRetriesPerRequest: null,
            },
          };
        }
        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([MembershipEntity, RefreshSessionEntity]),
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    ClientsModule,
    TemplatesModule,
    RequestsModule,
    PortalModule,
    FilesModule,
    ReviewsModule,
    NotificationsModule,
    RemindersModule,
    DashboardModule,
    AuditModule,
    PlansModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
