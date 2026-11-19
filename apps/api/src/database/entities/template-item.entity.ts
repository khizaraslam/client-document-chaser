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
import { TemplateEntity } from './template.entity';

@Entity({ name: 'template_items' })
@Index('idx_template_items_org_template', [
  'organizationId',
  'templateId',
  'sortOrder',
])
export class TemplateItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'accepted_mime_types', type: 'jsonb' })
  acceptedMimeTypes: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @ManyToOne(() => TemplateEntity, (template) => template.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: TemplateEntity;
}
