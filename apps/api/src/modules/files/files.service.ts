import {
  FileScanStatus,
  SignedDownloadResponse,
  UploadedFileSummary,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { OrganizationSubscriptionEntity } from '../../database/entities/organization-subscription.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditService } from '../audit/audit.service';
import { S3StorageService } from './s3-storage.service';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(UploadedFileEntity)
    private readonly fileRepo: Repository<UploadedFileEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    @InjectRepository(OrganizationSubscriptionEntity)
    private readonly subscriptionRepo: Repository<OrganizationSubscriptionEntity>,
    private readonly s3Storage: S3StorageService,
    private readonly auditService: AuditService,
  ) {}

  async listFilesForRequest(
    auth: AuthenticatedContext,
    requestId: string,
  ): Promise<UploadedFileSummary[]> {
    const request = await this.requestRepo.findOne({
      where: {
        id: requestId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
      relations: { client: true },
    });

    if (!request || !request.client || request.client.deletedAt) {
      throw new NotFoundException('Document request not found');
    }

    if (
      auth.role === UserRole.STAFF &&
      request.client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to files for this unassigned client',
      );
    }

    const files = await this.fileRepo.find({
      where: {
        organizationId: auth.organizationId,
        requestId: request.id,
        deletedAt: IsNull(),
      },
      relations: { requestItem: true },
      order: { createdAt: 'DESC' },
    });

    return files
      .filter((f) => f.scanStatus !== FileScanStatus.PENDING_UPLOAD)
      .map((f) => ({
        id: f.id,
        requestId: f.requestId,
        requestItemId: f.requestItemId,
        requestItemTitle: f.requestItem?.title ?? 'Checklist item',
        originalFilename: f.originalFilename,
        sanitizedFilename: f.sanitizedFilename,
        mimeType: f.detectedMimeType || f.mimeType,
        detectedMimeType: f.detectedMimeType,
        sizeBytes: Number(f.sizeBytes),
        scanStatus: f.scanStatus,
        scanDetails: f.scanDetails,
        uploadedAt: f.uploadedAt ? f.uploadedAt.toISOString() : null,
        createdAt: f.createdAt.toISOString(),
      }));
  }

  async getSignedDownloadUrl(
    auth: AuthenticatedContext,
    fileId: string,
    ipAddress?: string,
  ): Promise<SignedDownloadResponse> {
    const file = await this.fileRepo.findOne({
      where: {
        id: fileId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
      relations: { request: { client: true } },
    });

    if (!file || !file.request || file.request.deletedAt) {
      throw new NotFoundException('File not found');
    }

    if (
      auth.role === UserRole.STAFF &&
      file.request.client?.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to download files for this unassigned client',
      );
    }

    if (file.scanStatus !== FileScanStatus.CLEAN) {
      throw new BadRequestException(
        `File cannot be downloaded because its verification status is ${file.scanStatus}`,
      );
    }

    const expiresInSeconds = 120;
    const effectiveMime = file.detectedMimeType || file.mimeType;
    const downloadUrl = await this.s3Storage.createPresignedGetUrl({
      key: file.storageKey,
      downloadFilename: file.sanitizedFilename,
      contentType: effectiveMime,
      expiresInSeconds,
    });

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'FILE_DOWNLOAD_URL_ISSUED',
      resourceType: 'uploaded_file',
      resourceId: file.id,
      metadata: {
        requestId: file.requestId,
        requestItemId: file.requestItemId,
        sizeBytes: Number(file.sizeBytes),
      },
      ipAddress: ipAddress ?? null,
    });

    return {
      fileId: file.id,
      fileName: file.sanitizedFilename,
      mimeType: effectiveMime,
      sizeBytes: Number(file.sizeBytes),
      downloadUrl,
      expiresInSeconds,
    };
  }

  async incrementOrganizationStorage(
    organizationId: string,
    deltaBytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (deltaBytes <= 0) return;
    const repo = manager
      ? manager.getRepository(OrganizationSubscriptionEntity)
      : this.subscriptionRepo;
    const sub = await repo.findOne({ where: { organizationId } });
    if (!sub) return;
    const nextBytes = BigInt(sub.storageBytesUsed || '0') + BigInt(deltaBytes);
    await repo.update(
      { id: sub.id },
      { storageBytesUsed: nextBytes.toString() },
    );
  }
}
