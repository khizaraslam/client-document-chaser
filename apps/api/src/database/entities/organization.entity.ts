import { OrganizationCountry } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MembershipEntity } from './membership.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';

@Entity({ name: 'organizations' })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Index('uq_organizations_slug', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  @Column({
    type: 'enum',
    enum: OrganizationCountry,
    default: OrganizationCountry.US,
  })
  country: OrganizationCountry;

  @Column({ type: 'varchar', length: 100, default: 'America/New_York' })
  timezone: string;

  @Column({
    name: 'brand_logo_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  brandLogoKey: string | null;

  @Column({
    name: 'brand_accent_color',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  brandAccentColor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => MembershipEntity, (membership) => membership.organization)
  memberships: MembershipEntity[];

  @OneToOne(
    () => OrganizationSubscriptionEntity,
    (subscription) => subscription.organization,
  )
  subscription: OrganizationSubscriptionEntity;
}
