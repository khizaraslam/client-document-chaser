import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MembershipEntity } from './membership.entity';
import { RefreshSessionEntity } from './refresh-session.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({
    name: 'email_verify_token_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  emailVerifyTokenHash: string | null;

  @Column({
    name: 'email_verify_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerifyExpiresAt: Date | null;

  @Column({
    name: 'password_reset_token_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  passwordResetTokenHash: string | null;

  @Column({
    name: 'password_reset_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  passwordResetExpiresAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => MembershipEntity, (membership) => membership.user)
  memberships: MembershipEntity[];

  @OneToMany(() => RefreshSessionEntity, (session) => session.user)
  refreshSessions: RefreshSessionEntity[];
}
