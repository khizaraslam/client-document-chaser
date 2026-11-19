import { AuditActorType, AuditEventItem } from '@cdc/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEventEntity } from '../../database/entities/audit-event.entity';

export interface RecordAuditParams {
  organizationId: string;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly auditRepo: Repository<AuditEventEntity>,
  ) {}

  async record(
    params: RecordAuditParams,
    manager?: EntityManager,
  ): Promise<AuditEventEntity> {
    const repo = manager
      ? manager.getRepository(AuditEventEntity)
      : this.auditRepo;

    const event = repo.create({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      actorType: params.actorType ?? AuditActorType.USER,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? {},
      ipAddress: params.ipAddress ?? null,
    });

    return repo.save(event);
  }

  async listForOrganization(
    organizationId: string,
    limit = 50,
  ): Promise<AuditEventItem[]> {
    const rows = await this.auditRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return rows.map((row) => ({
      id: row.id,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
