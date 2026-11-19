import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { PortalAccessEntity } from '../../database/entities/portal-access.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PortalAccessEntity,
      DocumentRequestEntity,
      RequestItemEntity,
      UploadedFileEntity,
    ]),
    FilesModule,
    AuditModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
