import {
  AuditActorType,
  FileScanStatus,
  PORTAL_ALLOWED_EXTENSIONS,
  PortalConfirmUploadResponse,
  PortalItemReviewSummary,
  PortalPresignResponse,
  PortalUploadedFileDto,
  PortalViewResponse,
  RequestItemStatus,
  RequestStatus,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import * as path from 'path';
import { DataSource, IsNull, Repository } from 'typeorm';
import { hashToken, safeTimingCompare } from '../../common/utils/crypto.util';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { DocumentReviewEntity } from '../../database/entities/document-review.entity';
import { PortalAccessEntity } from '../../database/entities/portal-access.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { UploadedFileEntity } from '../../database/entities/uploaded-file.entity';
import { AuditService } from '../audit/audit.service';
import { ClamavService } from '../files/clamav.service';
import {
  inspectUploadedContentSignature,
  validateDeclaredUploadFile,
} from '../files/file-security.util';
import { FilesService } from '../files/files.service';
import { S3StorageService } from '../files/s3-storage.service';
import { ConfirmPortalUploadDto, CreatePortalPresignDto } from './portal.dto';

export interface FallbackUploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class PortalService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PortalAccessEntity)
    private readonly portalAccessRepo: Repository<PortalAccessEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    @InjectRepository(RequestItemEntity)
    private readonly itemRepo: Repository<RequestItemEntity>,
    @InjectRepository(UploadedFileEntity)
    private readonly fileRepo: Repository<UploadedFileEntity>,
    private readonly configService: ConfigService,
    private readonly s3Storage: S3StorageService,
    private readonly clamavService: ClamavService,
    private readonly filesService: FilesService,
    private readonly auditService: AuditService,
  ) {}

  getMaxFileSizeBytes(): number {
    const maxMb = this.configService.get<number>('PORTAL_MAX_FILE_SIZE_MB', 25);
    return maxMb * 1024 * 1024;
  }

  async getPortalView(rawToken: string): Promise<PortalViewResponse> {
    const portalAccess = await this.resolveActivePortalAccess(rawToken);

    await this.portalAccessRepo.update(
      { id: portalAccess.id, organizationId: portalAccess.organizationId },
      {
        lastAccessedAt: new Date(),
        accessCount: portalAccess.accessCount + 1,
      },
    );

    const items = await this.itemRepo.find({
      where: {
        organizationId: portalAccess.organizationId,
        requestId: portalAccess.requestId,
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const files = await this.fileRepo.find({
      where: {
        organizationId: portalAccess.organizationId,
        requestId: portalAccess.requestId,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    const reviews = await this.dataSource
      .getRepository(DocumentReviewEntity)
      .find({
        where: {
          organizationId: portalAccess.organizationId,
          requestId: portalAccess.requestId,
        },
        order: { createdAt: 'DESC' },
      });

    const latestReviewByItem = new Map<string, PortalItemReviewSummary>();
    for (const review of reviews) {
      if (!latestReviewByItem.has(review.requestItemId)) {
        latestReviewByItem.set(review.requestItemId, {
          decision: review.decision,
          notes: review.notes,
          reviewedAt: review.createdAt.toISOString(),
        });
      }
    }

    const filesByItem = new Map<string, PortalUploadedFileDto[]>();
    for (const file of files) {
      if (
        file.scanStatus === FileScanStatus.PENDING_UPLOAD ||
        file.scanStatus === FileScanStatus.REJECTED ||
        file.scanStatus === FileScanStatus.INFECTED
      ) {
        continue;
      }
      const list = filesByItem.get(file.requestItemId) ?? [];
      list.push(this.mapPortalFile(file));
      filesByItem.set(file.requestItemId, list);
    }

    return {
      firmName: portalAccess.organization?.name ?? 'Accounting Firm',
      clientName: portalAccess.request.client?.name ?? 'Client',
      recipientEmail: portalAccess.recipientEmail,
      requestId: portalAccess.requestId,
      title: portalAccess.request.title,
      instructions: portalAccess.request.instructions,
      status: portalAccess.request.status,
      dueAt: portalAccess.request.dueAt.toISOString(),
      expiresAt: portalAccess.expiresAt.toISOString(),
      maxFileSizeBytes: this.getMaxFileSizeBytes(),
      allowedExtensions: PORTAL_ALLOWED_EXTENSIONS,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        isRequired: item.isRequired,
        status: item.status,
        sortOrder: item.sortOrder,
        acceptedMimeTypes: item.acceptedMimeTypes,
        files: filesByItem.get(item.id) ?? [],
        latestReview: latestReviewByItem.get(item.id) ?? null,
      })),
    };
  }

  async createPresignedUpload(
    rawToken: string,
    dto: CreatePortalPresignDto,
  ): Promise<PortalPresignResponse> {
    const portalAccess = await this.resolveActivePortalAccess(rawToken);
    this.assertRequestAcceptingUploads(portalAccess.request);

    const item = await this.itemRepo.findOne({
      where: {
        id: dto.requestItemId,
        requestId: portalAccess.requestId,
        organizationId: portalAccess.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found for this request');
    }

    const maxFileSizeBytes = this.getMaxFileSizeBytes();
    const { sanitizedFilename, descriptor } = validateDeclaredUploadFile({
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      maxFileSizeBytes,
      itemAcceptedMimeTypes: item.acceptedMimeTypes,
    });

    const storageKey = this.buildStorageKey({
      organizationId: portalAccess.organizationId,
      clientId: portalAccess.clientId,
      requestId: portalAccess.requestId,
      itemId: item.id,
      sanitizedFilename,
    });

    const fileEntity = await this.fileRepo.save(
      this.fileRepo.create({
        organizationId: portalAccess.organizationId,
        requestId: portalAccess.requestId,
        requestItemId: item.id,
        clientId: portalAccess.clientId,
        portalAccessId: portalAccess.id,
        originalFilename: path.posix
          .basename(dto.fileName.replace(/\\/g, '/'))
          .slice(0, 255),
        sanitizedFilename,
        mimeType: descriptor.canonicalMimeType,
        detectedMimeType: null,
        sizeBytes: String(dto.sizeBytes),
        storageBucket: this.s3Storage.getBucketName(),
        storageKey,
        scanStatus: FileScanStatus.PENDING_UPLOAD,
      }),
    );

    const expiresInSeconds = 900;
    const uploadUrl = await this.s3Storage.createPresignedPutUrl({
      key: storageKey,
      contentType: descriptor.canonicalMimeType,
      expiresInSeconds,
    });

    return {
      fileId: fileEntity.id,
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': descriptor.canonicalMimeType,
      },
      expiresInSeconds,
    };
  }

  async confirmUpload(
    rawToken: string,
    dto: ConfirmPortalUploadDto,
    ipAddress?: string,
  ): Promise<PortalConfirmUploadResponse> {
    const portalAccess = await this.resolveActivePortalAccess(rawToken);
    this.assertRequestAcceptingUploads(portalAccess.request);

    // Atomic replay protection: only a single concurrent request can transition PENDING_UPLOAD -> SCANNING
    const lockResult = await this.fileRepo
      .createQueryBuilder()
      .update(UploadedFileEntity)
      .set({ scanStatus: FileScanStatus.SCANNING })
      .where('id = :fileId', { fileId: dto.fileId })
      .andWhere('organization_id = :organizationId', {
        organizationId: portalAccess.organizationId,
      })
      .andWhere('request_id = :requestId', {
        requestId: portalAccess.requestId,
      })
      .andWhere('scan_status = :pendingStatus', {
        pendingStatus: FileScanStatus.PENDING_UPLOAD,
      })
      .andWhere('deleted_at IS NULL')
      .execute();

    if ((lockResult.affected ?? 0) === 0) {
      const existing = await this.fileRepo.findOne({
        where: {
          id: dto.fileId,
          organizationId: portalAccess.organizationId,
          requestId: portalAccess.requestId,
          deletedAt: IsNull(),
        },
      });
      if (!existing) {
        throw new NotFoundException('Pending upload record not found');
      }
      if (
        existing.scanStatus === FileScanStatus.CLEAN ||
        existing.scanStatus === FileScanStatus.SCANNING ||
        existing.scanStatus === FileScanStatus.QUARANTINED
      ) {
        throw new ConflictException('This upload has already been confirmed');
      }
      throw new BadRequestException(
        `This upload cannot be confirmed (current status: ${existing.scanStatus})`,
      );
    }

    const file = await this.fileRepo.findOneOrFail({
      where: {
        id: dto.fileId,
        organizationId: portalAccess.organizationId,
        requestId: portalAccess.requestId,
      },
    });

    let headMeta: { contentLength: number; contentType: string | null };
    try {
      headMeta = await this.s3Storage.headObject(file.storageKey);
    } catch {
      await this.fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.REJECTED,
          scanDetails: 'Uploaded object not found in private storage',
        },
      );
      throw new BadRequestException(
        'Uploaded file was not found in storage. Please upload again.',
      );
    }

    const maxFileSizeBytes = this.getMaxFileSizeBytes();
    if (
      headMeta.contentLength <= 0 ||
      headMeta.contentLength > maxFileSizeBytes ||
      headMeta.contentLength !== Number(file.sizeBytes)
    ) {
      await this.safeDeleteObject(file.storageKey);
      await this.fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.REJECTED,
          scanDetails:
            'Uploaded object size did not match declared metadata or exceeded limit',
        },
      );
      throw new BadRequestException(
        'Uploaded file size does not match declared upload metadata',
      );
    }

    const ext = path.posix
      .extname(file.sanitizedFilename)
      .replace('.', '')
      .toLowerCase();

    const inspectionBuffer = await this.s3Storage.getObjectBytes(
      file.storageKey,
      this.clamavService.isEnabled() ? undefined : 65_536,
    );

    const signature = inspectUploadedContentSignature({
      buffer: inspectionBuffer,
      expectedExtension: ext,
    });

    if (!signature.valid) {
      await this.safeDeleteObject(file.storageKey);
      await this.fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.REJECTED,
          detectedMimeType: signature.detectedMimeType,
          scanDetails: signature.reason ?? 'Content signature mismatch',
        },
      );
      await this.auditService.record({
        organizationId: portalAccess.organizationId,
        actorType: AuditActorType.PORTAL_CLIENT,
        action: 'PORTAL_FILE_REJECTED',
        resourceType: 'uploaded_file',
        resourceId: file.id,
        metadata: {
          requestId: portalAccess.requestId,
          requestItemId: file.requestItemId,
          reason: signature.reason ?? 'Signature mismatch',
        },
        ipAddress: ipAddress ?? null,
      });
      throw new BadRequestException(
        signature.reason || 'Uploaded file content does not match declared type',
      );
    }

    const scanResult = await this.clamavService.scanBuffer(inspectionBuffer);

    return this.finalizeVerifiedUpload({
      portalAccess,
      file,
      detectedMimeType: signature.detectedMimeType,
      actualSizeBytes: headMeta.contentLength,
      scanResult,
      ipAddress,
    });
  }

  async uploadViaApiFallback(
    rawToken: string,
    requestItemId: string,
    uploaded: FallbackUploadedFileInput | undefined,
    ipAddress?: string,
  ): Promise<PortalConfirmUploadResponse> {
    const portalAccess = await this.resolveActivePortalAccess(rawToken);
    this.assertRequestAcceptingUploads(portalAccess.request);

    if (!uploaded || !uploaded.buffer || uploaded.buffer.length === 0) {
      throw new BadRequestException('Select a non-empty file to upload');
    }

    const item = await this.itemRepo.findOne({
      where: {
        id: requestItemId,
        requestId: portalAccess.requestId,
        organizationId: portalAccess.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found for this request');
    }

    const maxFileSizeBytes = this.getMaxFileSizeBytes();
    const { sanitizedFilename, descriptor } = validateDeclaredUploadFile({
      fileName: uploaded.originalname,
      mimeType: uploaded.mimetype,
      sizeBytes: uploaded.buffer.length,
      maxFileSizeBytes,
      itemAcceptedMimeTypes: item.acceptedMimeTypes,
    });

    const signature = inspectUploadedContentSignature({
      buffer: uploaded.buffer,
      expectedExtension: descriptor.extension,
    });
    if (!signature.valid) {
      await this.auditService.record({
        organizationId: portalAccess.organizationId,
        actorType: AuditActorType.PORTAL_CLIENT,
        action: 'PORTAL_FILE_REJECTED',
        resourceType: 'request_item',
        resourceId: item.id,
        metadata: {
          requestId: portalAccess.requestId,
          reason: signature.reason ?? 'Signature mismatch',
        },
        ipAddress: ipAddress ?? null,
      });
      throw new BadRequestException(
        signature.reason || 'Uploaded file content does not match declared type',
      );
    }

    const storageKey = this.buildStorageKey({
      organizationId: portalAccess.organizationId,
      clientId: portalAccess.clientId,
      requestId: portalAccess.requestId,
      itemId: item.id,
      sanitizedFilename,
    });

    await this.s3Storage.putObjectBuffer({
      key: storageKey,
      body: uploaded.buffer,
      contentType: descriptor.canonicalMimeType,
    });

    const file = await this.fileRepo.save(
      this.fileRepo.create({
        organizationId: portalAccess.organizationId,
        requestId: portalAccess.requestId,
        requestItemId: item.id,
        clientId: portalAccess.clientId,
        portalAccessId: portalAccess.id,
        originalFilename: path.posix
          .basename(uploaded.originalname.replace(/\\/g, '/'))
          .slice(0, 255),
        sanitizedFilename,
        mimeType: descriptor.canonicalMimeType,
        detectedMimeType: signature.detectedMimeType,
        sizeBytes: String(uploaded.buffer.length),
        storageBucket: this.s3Storage.getBucketName(),
        storageKey,
        scanStatus: FileScanStatus.SCANNING,
      }),
    );

    const scanResult = await this.clamavService.scanBuffer(uploaded.buffer);

    return this.finalizeVerifiedUpload({
      portalAccess,
      file,
      detectedMimeType: signature.detectedMimeType,
      actualSizeBytes: uploaded.buffer.length,
      scanResult,
      ipAddress,
    });
  }

  private async finalizeVerifiedUpload(params: {
    portalAccess: PortalAccessEntity;
    file: UploadedFileEntity;
    detectedMimeType: string | null;
    actualSizeBytes: number;
    scanResult: {
      status:
        | FileScanStatus.CLEAN
        | FileScanStatus.INFECTED
        | FileScanStatus.QUARANTINED;
      details: string;
    };
    ipAddress?: string;
  }): Promise<PortalConfirmUploadResponse> {
    const { portalAccess, file, scanResult } = params;

    if (scanResult.status === FileScanStatus.INFECTED) {
      await this.safeDeleteObject(file.storageKey);
      await this.fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.INFECTED,
          detectedMimeType: params.detectedMimeType,
          scanDetails: scanResult.details,
        },
      );
      await this.auditService.record({
        organizationId: portalAccess.organizationId,
        actorType: AuditActorType.PORTAL_CLIENT,
        action: 'PORTAL_FILE_INFECTED',
        resourceType: 'uploaded_file',
        resourceId: file.id,
        metadata: {
          requestId: portalAccess.requestId,
          requestItemId: file.requestItemId,
        },
        ipAddress: params.ipAddress ?? null,
      });
      throw new BadRequestException(
        'Uploaded file failed malware screening and was rejected',
      );
    }

    if (scanResult.status === FileScanStatus.QUARANTINED) {
      await this.fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.QUARANTINED,
          detectedMimeType: params.detectedMimeType,
          scanDetails: scanResult.details,
          uploadedAt: new Date(),
        },
      );
      await this.auditService.record({
        organizationId: portalAccess.organizationId,
        actorType: AuditActorType.PORTAL_CLIENT,
        action: 'PORTAL_FILE_QUARANTINED',
        resourceType: 'uploaded_file',
        resourceId: file.id,
        metadata: {
          requestId: portalAccess.requestId,
          requestItemId: file.requestItemId,
          details: scanResult.details,
        },
        ipAddress: params.ipAddress ?? null,
      });

      const quarantinedFile = await this.fileRepo.findOneOrFail({
        where: { id: file.id, organizationId: portalAccess.organizationId },
      });
      const currentItem = await this.itemRepo.findOneOrFail({
        where: {
          id: file.requestItemId,
          organizationId: portalAccess.organizationId,
        },
      });
      return {
        file: this.mapPortalFile(quarantinedFile),
        itemStatus: currentItem.status,
        requestStatus: portalAccess.request.status,
      };
    }

    // CLEAN: commit file record, update item -> UPLOADED, update request SENT/OVERDUE -> IN_PROGRESS
    const now = new Date();
    const outcome = await this.dataSource.transaction(async (manager) => {
      const fileRepo = manager.getRepository(UploadedFileEntity);
      const itemRepo = manager.getRepository(RequestItemEntity);
      const reqRepo = manager.getRepository(DocumentRequestEntity);

      await fileRepo.update(
        { id: file.id, organizationId: portalAccess.organizationId },
        {
          scanStatus: FileScanStatus.CLEAN,
          detectedMimeType: params.detectedMimeType,
          scanDetails: scanResult.details,
          sizeBytes: String(params.actualSizeBytes),
          uploadedAt: now,
        },
      );

      const item = await itemRepo.findOneOrFail({
        where: {
          id: file.requestItemId,
          requestId: portalAccess.requestId,
          organizationId: portalAccess.organizationId,
        },
      });

      let nextItemStatus = item.status;
      if (
        item.status === RequestItemStatus.PENDING ||
        item.status === RequestItemStatus.REJECTED
      ) {
        nextItemStatus = RequestItemStatus.UPLOADED;
        await itemRepo.update(
          { id: item.id, organizationId: portalAccess.organizationId },
          { status: nextItemStatus },
        );
      }

      const currentReq = await reqRepo.findOneOrFail({
        where: {
          id: portalAccess.requestId,
          organizationId: portalAccess.organizationId,
        },
      });

      let nextRequestStatus = currentReq.status;
      if (
        currentReq.status === RequestStatus.SENT ||
        currentReq.status === RequestStatus.OVERDUE
      ) {
        nextRequestStatus = RequestStatus.IN_PROGRESS;
        await reqRepo.update(
          { id: currentReq.id, organizationId: portalAccess.organizationId },
          { status: nextRequestStatus },
        );
      }

      await this.filesService.incrementOrganizationStorage(
        portalAccess.organizationId,
        params.actualSizeBytes,
        manager,
      );

      await this.auditService.record(
        {
          organizationId: portalAccess.organizationId,
          actorType: AuditActorType.PORTAL_CLIENT,
          action: 'PORTAL_FILE_UPLOADED',
          resourceType: 'uploaded_file',
          resourceId: file.id,
          metadata: {
            requestId: portalAccess.requestId,
            requestItemId: file.requestItemId,
            sizeBytes: params.actualSizeBytes,
          },
          ipAddress: params.ipAddress ?? null,
        },
        manager,
      );

      const savedFile = await fileRepo.findOneOrFail({
        where: { id: file.id, organizationId: portalAccess.organizationId },
      });

      return {
        file: this.mapPortalFile(savedFile),
        itemStatus: nextItemStatus,
        requestStatus: nextRequestStatus,
      };
    });

    return outcome;
  }

  private async resolveActivePortalAccess(
    rawToken: string,
  ): Promise<PortalAccessEntity> {
    const trimmed = rawToken?.trim() ?? '';
    if (trimmed.length < 16 || trimmed.length > 256) {
      throw new NotFoundException('Invalid or unknown portal link');
    }

    const tokenHash = hashToken(trimmed);
    const portalAccess = await this.portalAccessRepo.findOne({
      where: { tokenHash },
      relations: {
        organization: true,
        request: { client: true },
      },
    });

    if (!portalAccess || !safeTimingCompare(portalAccess.tokenHash, tokenHash)) {
      throw new NotFoundException('Invalid or unknown portal link');
    }

    if (portalAccess.revokedAt) {
      throw new ForbiddenException(
        'This portal link has been revoked. Please contact your accounting firm for a new link.',
      );
    }

    if (portalAccess.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException(
        'This portal link has expired. Please contact your accounting firm for a new link.',
      );
    }

    if (
      !portalAccess.request ||
      portalAccess.request.deletedAt ||
      !portalAccess.request.client ||
      portalAccess.request.client.deletedAt ||
      portalAccess.request.status === RequestStatus.DRAFT ||
      portalAccess.request.status === RequestStatus.CANCELLED
    ) {
      throw new ForbiddenException(
        'This document request is no longer active. Please contact your accounting firm.',
      );
    }

    return portalAccess;
  }

  private assertRequestAcceptingUploads(request: DocumentRequestEntity): void {
    if (
      request.status === RequestStatus.COMPLETED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new ForbiddenException(
        `This document request is ${request.status.toLowerCase()} and is no longer accepting uploads`,
      );
    }
  }

  private buildStorageKey(params: {
    organizationId: string;
    clientId: string;
    requestId: string;
    itemId: string;
    sanitizedFilename: string;
  }): string {
    return `org/${params.organizationId}/clients/${params.clientId}/requests/${params.requestId}/${params.itemId}/${crypto.randomUUID()}-${params.sanitizedFilename}`;
  }

  private async safeDeleteObject(storageKey: string): Promise<void> {
    try {
      await this.s3Storage.deleteObject(storageKey);
    } catch {
      // Best effort cleanup for rejected/invalid objects
    }
  }

  private mapPortalFile(file: UploadedFileEntity): PortalUploadedFileDto {
    return {
      id: file.id,
      requestItemId: file.requestItemId,
      originalFilename: file.originalFilename,
      mimeType: file.detectedMimeType || file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      scanStatus: file.scanStatus,
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
    };
  }
}
