import { OutboxStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'outbox_events' })
@Index('idx_outbox_status_next_attempt', ['status', 'nextAttemptAt'])
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 80 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Index('uq_outbox_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 190 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: OutboxStatus,
    default: OutboxStatus.PENDING,
  })
  status: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'NOW()' })
  nextAttemptAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
