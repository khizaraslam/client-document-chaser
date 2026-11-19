import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailEventEntity } from '../../database/entities/email-event.entity';
import { OutboxEventEntity } from '../../database/entities/outbox-event.entity';
import { EmailTemplatesService } from './email-templates.service';
import { NotificationsOutboxProcessor } from './notifications-outbox.processor';
import { NotificationsService } from './notifications.service';
import { ResendWebhookController } from './resend-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEventEntity, EmailEventEntity]),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [ResendWebhookController],
  providers: [
    NotificationsService,
    EmailTemplatesService,
    NotificationsOutboxProcessor,
  ],
  exports: [NotificationsService, EmailTemplatesService],
})
export class NotificationsModule {}
