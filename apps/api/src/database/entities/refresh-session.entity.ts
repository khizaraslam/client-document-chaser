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

@Entity({ name: 'refresh_sessions' })
@Index('idx_refresh_sessions_user_org', ['userId', 'organizationId'])
@Index('idx_refresh_sessions_family', ['familyId'])
export class RefreshSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Index('uq_refresh_sessions_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash: string;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.refreshSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;
}
