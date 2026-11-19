import { UserRole } from '@cdc/contracts';
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

@Entity({ name: 'invitations' })
@Index('idx_invitations_org_email', ['organizationId', 'email'])
export class InvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Index('uq_invitations_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedByUser: UserEntity;
}
