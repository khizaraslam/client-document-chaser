import {
  ClientEntityType,
  ClientStatus,
  OrganizationCountry,
} from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientContactEntity } from './client-contact.entity';
import { DocumentRequestEntity } from './document-request.entity';
import { OrganizationEntity } from './organization.entity';
import { RecurrenceEntity } from './recurrence.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'clients' })
@Index('idx_clients_org_status', ['organizationId', 'status'])
@Index('idx_clients_org_assigned', ['organizationId', 'assignedUserId'])
export class ClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  companyName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({
    name: 'reference_code',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  referenceCode: string | null;

  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: ClientEntityType,
    default: ClientEntityType.LLC,
  })
  entityType: ClientEntityType;

  @Column({
    type: 'enum',
    enum: OrganizationCountry,
    default: OrganizationCountry.US,
  })
  country: OrganizationCountry;

  @Column({
    type: 'enum',
    enum: ClientStatus,
    default: ClientStatus.ACTIVE,
  })
  status: ClientStatus;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser: UserEntity | null;

  @OneToMany(() => ClientContactEntity, (contact) => contact.client)
  contacts: ClientContactEntity[];

  @OneToMany(() => DocumentRequestEntity, (request) => request.client)
  documentRequests: DocumentRequestEntity[];

  @OneToMany(() => RecurrenceEntity, (recurrence) => recurrence.client)
  recurrences: RecurrenceEntity[];
}
