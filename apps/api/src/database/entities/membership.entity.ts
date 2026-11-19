import { MembershipStatus, UserRole } from '@cdc/contracts';
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
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'memberships' })
@Index('uq_memberships_org_user', ['organizationId', 'userId'], {
  unique: true,
})
@Index('idx_memberships_org_role', ['organizationId', 'role'])
export class MembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity, (org) => org.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity, (user) => user.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
