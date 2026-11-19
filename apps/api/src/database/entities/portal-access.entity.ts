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
import { DocumentRequestEntity } from './document-request.entity';
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'portal_accesses' })
@Index('uq_portal_accesses_token_hash', ['tokenHash'], { unique: true })
@Index('idx_portal_accesses_org_request', ['organizationId', 'requestId'])
export class PortalAccessEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_accessed_at', type: 'timestamptz', nullable: true })
  lastAccessedAt: Date | null;

  @Column({ name: 'access_count', type: 'int', default: 0 })
  accessCount: number;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => DocumentRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: DocumentRequestEntity;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: UserEntity | null;
}
