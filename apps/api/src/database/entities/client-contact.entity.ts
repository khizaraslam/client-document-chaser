import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from './client.entity';
import { OrganizationEntity } from './organization.entity';

@Entity({ name: 'client_contacts' })
@Index('idx_client_contacts_org_client', ['organizationId', 'clientId'])
@Index('idx_client_contacts_org_email', ['organizationId', 'email'])
export class ClientContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'role_title', type: 'varchar', length: 80, nullable: true })
  roleTitle: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => ClientEntity, (client) => client.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;
}
