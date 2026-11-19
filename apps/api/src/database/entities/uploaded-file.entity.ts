import { FileScanStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from './client.entity';
import { DocumentRequestEntity } from './document-request.entity';
import { OrganizationEntity } from './organization.entity';
import { PortalAccessEntity } from './portal-access.entity';
import { RequestItemEntity } from './request-item.entity';

@Entity({ name: 'uploaded_files' })
@Index('uq_uploaded_files_storage_key', ['storageKey'], { unique: true })
@Index('idx_uploaded_files_org_request', ['organizationId', 'requestId'])
@Index('idx_uploaded_files_org_item', ['organizationId', 'requestItemId'])
export class UploadedFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'request_item_id', type: 'uuid' })
  requestItemId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'portal_access_id', type: 'uuid', nullable: true })
  portalAccessId: string | null;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'sanitized_filename', type: 'varchar', length: 255 })
  sanitizedFilename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120 })
  mimeType: string;

  @Column({
    name: 'detected_mime_type',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  detectedMimeType: string | null;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'storage_bucket', type: 'varchar', length: 120 })
  storageBucket: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  @Column({
    name: 'scan_status',
    type: 'enum',
    enum: FileScanStatus,
    default: FileScanStatus.PENDING_UPLOAD,
  })
  scanStatus: FileScanStatus;

  @Column({ name: 'scan_details', type: 'text', nullable: true })
  scanDetails: string | null;

  @Column({ name: 'uploaded_at', type: 'timestamptz', nullable: true })
  uploadedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => DocumentRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: DocumentRequestEntity;

  @ManyToOne(() => RequestItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_item_id' })
  requestItem: RequestItemEntity;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @ManyToOne(() => PortalAccessEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'portal_access_id' })
  portalAccess: PortalAccessEntity | null;
}
