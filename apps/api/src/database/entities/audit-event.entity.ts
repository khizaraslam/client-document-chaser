import { AuditActorType } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'audit_events' })
@Index('idx_audit_events_org_created', ['organizationId', 'createdAt'])
@Index('idx_audit_events_org_action', ['organizationId', 'action'])
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: AuditActorType,
    default: AuditActorType.USER,
  })
  actorType: AuditActorType;

  @Column({ type: 'varchar', length: 120 })
  action: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 80 })
  resourceType: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 120, nullable: true })
  resourceId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: UserEntity | null;
}
