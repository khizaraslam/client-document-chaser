import { SubscriptionStatus } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { PlanEntity } from './plan.entity';

@Entity({ name: 'organization_subscriptions' })
export class OrganizationSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_org_subscriptions_org', { unique: true })
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIALING,
  })
  status: SubscriptionStatus;

  @Column({ name: 'trial_starts_at', type: 'timestamptz' })
  trialStartsAt: Date;

  @Column({ name: 'trial_ends_at', type: 'timestamptz' })
  trialEndsAt: Date;

  @Column({ name: 'active_clients_count', type: 'int', default: 0 })
  activeClientsCount: number;

  @Column({ name: 'storage_bytes_used', type: 'bigint', default: '0' })
  storageBytesUsed: string;

  @Column({ name: 'emails_sent_this_period', type: 'int', default: 0 })
  emailsSentThisPeriod: number;

  @Column({ name: 'period_reset_at', type: 'timestamptz' })
  periodResetAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => OrganizationEntity, (org) => org.subscription, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => PlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;
}
