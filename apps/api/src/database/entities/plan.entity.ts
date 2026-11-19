import { PlanCode } from '@cdc/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'plans' })
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_plans_code', { unique: true })
  @Column({ type: 'enum', enum: PlanCode })
  code: PlanCode;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'monthly_price_cents', type: 'int' })
  monthlyPriceCents: number;

  @Column({ name: 'max_active_clients', type: 'int' })
  maxActiveClients: number;

  @Column({ name: 'max_team_seats', type: 'int' })
  maxTeamSeats: number;

  @Column({ name: 'max_storage_bytes', type: 'bigint' })
  maxStorageBytes: string;

  @Column({ name: 'max_emails_per_month', type: 'int' })
  maxEmailsPerMonth: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
