import { ReviewDecision } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocumentRequestEntity } from './document-request.entity';
import { OrganizationEntity } from './organization.entity';
import { RequestItemEntity } from './request-item.entity';
import { UploadedFileEntity } from './uploaded-file.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'document_reviews' })
@Index('idx_document_reviews_org_request', ['organizationId', 'requestId'])
@Index('idx_document_reviews_item_created', ['requestItemId', 'createdAt'])
export class DocumentReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'request_item_id', type: 'uuid' })
  requestItemId: string;

  @Column({ name: 'uploaded_file_id', type: 'uuid', nullable: true })
  uploadedFileId: string | null;

  @Column({ name: 'reviewer_user_id', type: 'uuid', nullable: true })
  reviewerUserId: string | null;

  @Column({
    type: 'enum',
    enum: ReviewDecision,
  })
  decision: ReviewDecision;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => DocumentRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: DocumentRequestEntity;

  @ManyToOne(() => RequestItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_item_id' })
  requestItem: RequestItemEntity;

  @ManyToOne(() => UploadedFileEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_file_id' })
  uploadedFile: UploadedFileEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewerUser: UserEntity | null;
}
