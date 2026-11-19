import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { DocumentReviewEntity } from '../../database/entities/document-review.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentReviewEntity,
      DocumentRequestEntity,
      RequestItemEntity,
      UploadedFileEntity,
      ClientContactEntity,
      OrganizationEntity,
    ]),
    PlansModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
