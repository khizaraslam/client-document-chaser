import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { OrganizationSubscriptionEntity } from '../../database/entities/organization-subscription.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditModule } from '../audit/audit.module';
import { ClamavService } from './clamav.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UploadedFileEntity,
      DocumentRequestEntity,
      OrganizationSubscriptionEntity,
    ]),
    AuditModule,
  ],
  controllers: [FilesController],
  providers: [S3StorageService, ClamavService, FilesService],
  exports: [S3StorageService, ClamavService, FilesService],
})
export class FilesModule {}
