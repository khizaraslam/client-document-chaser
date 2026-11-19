import { RequestItemStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentRequestEntity } from './document-request.entity';
import { OrganizationEntity } from './organization.entity';

@Entity({ name: 'request_items' })
@Index('idx_request_items_org_request', [
  'organizationId',
  'requestId',
  'sortOrder',
])
export class RequestItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @Column({
    type: 'enum',
    enum: RequestItemStatus,
    default: RequestItemStatus.PENDING,
  })
  status: RequestItemStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'accepted_mime_types', type: 'jsonb' })
  acceptedMimeTypes: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => DocumentRequestEntity, (request) => request.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: DocumentRequestEntity;
}
