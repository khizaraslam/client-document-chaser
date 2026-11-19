import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { PortalAccessEntity } from '../../database/entities/portal-access.entity';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { TemplateItemEntity } from '../../database/entities/template-item.entity';
import { TemplateEntity } from '../../database/entities/template.entity';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import { RecurrencesController } from './recurrences.controller';
import { RecurrencesProcessor } from './recurrences.processor';
import { RecurrencesService } from './recurrences.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentRequestEntity,
      RequestItemEntity,
      RecurrenceEntity,
      ClientEntity,
      ClientContactEntity,
      TemplateEntity,
      TemplateItemEntity,
      OrganizationEntity,
      PortalAccessEntity,
    ]),
    BullModule.registerQueue({ name: 'recurrences' }),
    PlansModule,
    AuditModule,
    NotificationsModule,
    FilesModule,
  ],
  controllers: [RequestsController, RecurrencesController],
  providers: [RequestsService, RecurrencesService, RecurrencesProcessor],
  exports: [RequestsService, RecurrencesService],
})
export class RequestsModule {}
