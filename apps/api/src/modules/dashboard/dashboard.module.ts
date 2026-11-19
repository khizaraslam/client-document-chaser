import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { EmailEventEntity } from '../../database/entities/email-event.entity';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { AuditModule } from '../audit/audit.module';
import { PlansModule } from '../plans/plans.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientEntity,
      DocumentRequestEntity,
      RequestItemEntity,
      RecurrenceEntity,
      EmailEventEntity,
    ]),
    PlansModule,
    AuditModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
