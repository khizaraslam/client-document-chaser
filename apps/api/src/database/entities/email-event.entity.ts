import { EmailStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'email_events' })
@Index('idx_email_events_org_created', ['organizationId', 'createdAt'])
export class EmailEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'outbox_event_id', type: 'uuid', nullable: true })
  outboxEventId: string | null;

  @Index('idx_email_events_provider_msg_id')
  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ name: 'template_name', type: 'varchar', length: 120 })
  templateName: string;

  @Column({
    type: 'enum',
    enum: EmailStatus,
    default: EmailStatus.QUEUED,
  })
  status: EmailStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'provider_payload', type: 'jsonb', nullable: true })
  providerPayload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
