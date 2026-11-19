import { RecurrenceFrequency, RecurrenceStatus } from '@cdc/contracts';
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
import { ClientEntity } from './client.entity';
import { OrganizationEntity } from './organization.entity';
import { TemplateEntity } from './template.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'recurrences' })
@Index('idx_recurrences_org_status_next_run', [
  'organizationId',
  'status',
  'nextRunAt',
])
@Index('idx_recurrences_org_client', ['organizationId', 'clientId'])
export class RecurrenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'title_template', type: 'varchar', length: 180 })
  titleTemplate: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({
    type: 'enum',
    enum: RecurrenceFrequency,
    default: RecurrenceFrequency.MONTHLY,
  })
  frequency: RecurrenceFrequency;

  @Column({ name: 'day_of_month', type: 'int', default: 1 })
  dayOfMonth: number;

  @Column({ name: 'due_days_after_issue', type: 'int', default: 14 })
  dueDaysAfterIssue: number;

  @Column({ type: 'varchar', length: 100, default: 'America/New_York' })
  timezone: string;

  @Column({
    type: 'enum',
    enum: RecurrenceStatus,
    default: RecurrenceStatus.ACTIVE,
  })
  status: RecurrenceStatus;

  @Column({ name: 'next_run_at', type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @Column({
    name: 'last_period_key',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  lastPeriodKey: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => ClientEntity, (client) => client.recurrences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @ManyToOne(() => TemplateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template: TemplateEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: UserEntity | null;
}
