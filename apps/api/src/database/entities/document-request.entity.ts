import { RequestStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from './client.entity';
import { OrganizationEntity } from './organization.entity';
import { RecurrenceEntity } from './recurrence.entity';
import { RequestItemEntity } from './request-item.entity';
import { TemplateEntity } from './template.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'document_requests' })
@Index('idx_document_requests_org_status_due', [
  'organizationId',
  'status',
  'dueAt',
])
@Index('idx_document_requests_org_client', ['organizationId', 'clientId'])
@Index(
  'uq_document_requests_recurrence_period',
  ['recurrenceId', 'periodKey'],
  { unique: true },
)
export class DocumentRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'recurrence_id', type: 'uuid', nullable: true })
  recurrenceId: string | null;

  @Column({ name: 'period_key', type: 'varchar', length: 32, nullable: true })
  periodKey: string | null;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    default: RequestStatus.DRAFT,
  })
  status: RequestStatus;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => ClientEntity, (client) => client.documentRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @ManyToOne(() => TemplateEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: TemplateEntity | null;

  @ManyToOne(() => RecurrenceEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recurrence_id' })
  recurrence: RecurrenceEntity | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: UserEntity | null;

  @OneToMany(() => RequestItemEntity, (item) => item.request)
  items: RequestItemEntity[];
}
