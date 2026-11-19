import {
  ClientStatus,
  DEFAULT_ACCEPTED_MIME_TYPES,
  DocumentRequestDetail,
  RecurrenceFrequency,
  RecurrenceStatus,
  RecurrenceSummary,
  RequestItemStatus,
  RequestStatus,
  UserRole,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { RequestItemEntity } from '../../database/entities/request-item.entity';
import { TemplateItemEntity } from '../../database/entities/template-item.entity';
import { TemplateEntity } from '../../database/entities/template.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import {
  CreateRecurrenceDto,
  ListRecurrencesQueryDto,
  UpdateRecurrenceDto,
} from './recurrences.dto';
import { RequestsService } from './requests.service';

@Injectable()
export class RecurrencesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(RecurrenceEntity)
    private readonly recurrenceRepo: Repository<RecurrenceEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectRepository(TemplateItemEntity)
    private readonly templateItemRepo: Repository<TemplateItemEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(DocumentRequestEntity)
    private readonly requestRepo: Repository<DocumentRequestEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
    private readonly requestsService: RequestsService,
  ) {}

  async listRecurrences(
    auth: AuthenticatedContext,
    query: ListRecurrencesQueryDto,
  ): Promise<RecurrenceSummary[]> {
    const qb = this.recurrenceRepo
      .createQueryBuilder('rec')
      .innerJoinAndSelect('rec.client', 'c')
      .innerJoinAndSelect('rec.template', 't')
      .where('rec.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('c.deleted_at IS NULL');

    if (auth.role === UserRole.STAFF) {
      qb.andWhere('c.assigned_user_id = :staffUserId', {
        staffUserId: auth.userId,
      });
    }

    if (query.clientId) {
      qb.andWhere('rec.client_id = :clientId', { clientId: query.clientId });
    }

    if (query.status) {
      qb.andWhere('rec.status = :status', { status: query.status });
    }

    qb.orderBy('rec.next_run_at', 'ASC');
    const rows = await qb.getMany();
    return rows.map((row) => this.mapSummary(row));
  }

  async createRecurrence(
    auth: AuthenticatedContext,
    dto: CreateRecurrenceDto,
    ipAddress?: string,
  ): Promise<RecurrenceSummary> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const client = await this.clientRepo.findOne({
      where: {
        id: dto.clientId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (
      auth.role === UserRole.STAFF &&
      client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to schedule requests for this unassigned client',
      );
    }
    if (client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot create a recurring schedule for an archived client',
      );
    }

    const template = await this.templateRepo.findOne({
      where: {
        id: dto.templateId,
        organizationId: auth.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const templateItemsCount = await this.templateItemRepo.count({
      where: { organizationId: auth.organizationId, templateId: template.id },
    });
    if (templateItemsCount === 0) {
      throw new BadRequestException(
        'Selected template must contain at least one checklist item',
      );
    }

    const org = await this.orgRepo.findOneOrFail({
      where: { id: auth.organizationId },
    });
    const timezone = dto.timezone?.trim() || org.timezone;
    this.assertValidTimezone(timezone);

    const nextRunAt = this.computeInitialNextRun(
      dto.frequency,
      dto.dayOfMonth,
      timezone,
      new Date(),
    );

    const saved = await this.recurrenceRepo.save(
      this.recurrenceRepo.create({
        organizationId: auth.organizationId,
        clientId: client.id,
        templateId: template.id,
        titleTemplate: dto.titleTemplate.trim(),
        instructions: dto.instructions?.trim() || null,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        dueDaysAfterIssue: dto.dueDaysAfterIssue ?? 14,
        timezone,
        status: RecurrenceStatus.ACTIVE,
        nextRunAt,
        createdByUserId: auth.userId,
      }),
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'RECURRENCE_CREATED',
      resourceType: 'recurrence',
      resourceId: saved.id,
      metadata: {
        clientId: client.id,
        templateId: template.id,
        frequency: saved.frequency,
        dayOfMonth: saved.dayOfMonth,
      },
      ipAddress: ipAddress ?? null,
    });

    const loaded = await this.findAuthorizedRecurrence(auth, saved.id);
    return this.mapSummary(loaded);
  }

  async updateRecurrence(
    auth: AuthenticatedContext,
    recurrenceId: string,
    dto: UpdateRecurrenceDto,
    ipAddress?: string,
  ): Promise<RecurrenceSummary> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const recurrence = await this.findAuthorizedRecurrence(auth, recurrenceId);

    const nextFrequency = dto.frequency ?? recurrence.frequency;
    const nextDay = dto.dayOfMonth ?? recurrence.dayOfMonth;
    const nextTimezone = dto.timezone?.trim() ?? recurrence.timezone;
    if (dto.timezone !== undefined) {
      this.assertValidTimezone(nextTimezone);
    }

    const updates: Partial<RecurrenceEntity> = {};
    if (dto.titleTemplate !== undefined) {
      updates.titleTemplate = dto.titleTemplate.trim();
    }
    if (dto.instructions !== undefined) {
      updates.instructions = dto.instructions?.trim() || null;
    }
    if (dto.frequency !== undefined) updates.frequency = dto.frequency;
    if (dto.dayOfMonth !== undefined) updates.dayOfMonth = dto.dayOfMonth;
    if (dto.dueDaysAfterIssue !== undefined) {
      updates.dueDaysAfterIssue = dto.dueDaysAfterIssue;
    }
    if (dto.timezone !== undefined) updates.timezone = nextTimezone;
    if (dto.status !== undefined) updates.status = dto.status;

    if (
      dto.frequency !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.timezone !== undefined
    ) {
      updates.nextRunAt = this.computeInitialNextRun(
        nextFrequency,
        nextDay,
        nextTimezone,
        new Date(),
      );
    }

    if (Object.keys(updates).length > 0) {
      await this.recurrenceRepo.update(
        { id: recurrence.id, organizationId: auth.organizationId },
        updates,
      );
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'RECURRENCE_UPDATED',
        resourceType: 'recurrence',
        resourceId: recurrence.id,
        metadata: updates,
        ipAddress: ipAddress ?? null,
      });
    }

    const refreshed = await this.findAuthorizedRecurrence(auth, recurrence.id);
    return this.mapSummary(refreshed);
  }

  async deleteRecurrence(
    auth: AuthenticatedContext,
    recurrenceId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const recurrence = await this.findAuthorizedRecurrence(auth, recurrenceId);

    await this.recurrenceRepo.delete({
      id: recurrence.id,
      organizationId: auth.organizationId,
    });

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'RECURRENCE_DELETED',
      resourceType: 'recurrence',
      resourceId: recurrence.id,
      metadata: { titleTemplate: recurrence.titleTemplate },
      ipAddress: ipAddress ?? null,
    });
  }

  async triggerRecurrence(
    auth: AuthenticatedContext,
    recurrenceId: string,
    ipAddress?: string,
  ): Promise<DocumentRequestDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const recurrence = await this.findAuthorizedRecurrence(auth, recurrenceId);
    const requestId = await this.generateRequestFromRecurrence(
      recurrence,
      auth.userId,
      ipAddress,
    );
    return this.requestsService.getRequest(auth, requestId);
  }

  async processDueRecurrences(now = new Date()): Promise<number> {
    const due = await this.recurrenceRepo.find({
      where: {
        status: RecurrenceStatus.ACTIVE,
        nextRunAt: LessThanOrEqual(now),
      },
      relations: { client: true, template: true },
    });

    let generated = 0;
    for (const recurrence of due) {
      if (!recurrence.client || recurrence.client.deletedAt) continue;
      if (recurrence.client.status !== ClientStatus.ACTIVE) continue;

      const subscription = await this.plansService.getSubscriptionSummary(
        recurrence.organizationId,
      );
      if (subscription.isReadOnly) continue;

      try {
        await this.generateRequestFromRecurrence(recurrence, null);
        generated++;
      } catch (err) {
        if (!(err instanceof ConflictException)) {
          throw err;
        }
      }
    }
    return generated;
  }

  private async generateRequestFromRecurrence(
    recurrence: RecurrenceEntity,
    actorUserId: string | null,
    ipAddress?: string,
  ): Promise<string> {
    if (recurrence.client.status !== ClientStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot generate a request for an archived client',
      );
    }

    const template = await this.templateRepo.findOne({
      where: {
        id: recurrence.templateId,
        organizationId: recurrence.organizationId,
        deletedAt: IsNull(),
      },
    });
    if (!template) {
      throw new NotFoundException('Associated template no longer exists');
    }

    const templateItems = await this.templateItemRepo.find({
      where: {
        organizationId: recurrence.organizationId,
        templateId: template.id,
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    if (templateItems.length === 0) {
      throw new BadRequestException(
        'Associated template has no checklist items',
      );
    }

    const runAnchor =
      recurrence.nextRunAt.getTime() <= Date.now()
        ? recurrence.nextRunAt
        : new Date();
    const periodKey = this.formatPeriodKey(
      runAnchor,
      recurrence.frequency,
      recurrence.timezone,
    );

    const existingForPeriod = await this.requestRepo.findOne({
      where: {
        organizationId: recurrence.organizationId,
        recurrenceId: recurrence.id,
        periodKey,
      },
    });
    if (existingForPeriod) {
      throw new ConflictException(
        `A document request for period ${periodKey} has already been generated from this schedule`,
      );
    }

    const resolvedTitle = this.resolveTitleTemplate(
      recurrence.titleTemplate,
      periodKey,
      recurrence.client.name,
    );
    const dueAt = new Date(
      Date.now() + recurrence.dueDaysAfterIssue * 86_400_000,
    );
    const nextRunAt = this.advanceNextRun(
      runAnchor,
      recurrence.frequency,
      recurrence.dayOfMonth,
      recurrence.timezone,
    );

    return this.dataSource.transaction(async (manager) => {
      const reqRepo = manager.getRepository(DocumentRequestEntity);
      const itemRepo = manager.getRepository(RequestItemEntity);

      const savedReq = await reqRepo.save(
        reqRepo.create({
          organizationId: recurrence.organizationId,
          clientId: recurrence.clientId,
          templateId: template.id,
          recurrenceId: recurrence.id,
          periodKey,
          title: resolvedTitle.slice(0, 180),
          instructions: recurrence.instructions,
          status: RequestStatus.DRAFT,
          dueAt,
          createdByUserId: actorUserId,
        }),
      );

      for (const ti of templateItems) {
        await itemRepo.save(
          itemRepo.create({
            organizationId: recurrence.organizationId,
            requestId: savedReq.id,
            title: ti.title,
            description: ti.description,
            isRequired: ti.isRequired,
            status: RequestItemStatus.PENDING,
            sortOrder: ti.sortOrder,
            acceptedMimeTypes:
              ti.acceptedMimeTypes.length > 0
                ? [...ti.acceptedMimeTypes]
                : [...DEFAULT_ACCEPTED_MIME_TYPES],
          }),
        );
      }

      await manager.getRepository(RecurrenceEntity).update(
        { id: recurrence.id, organizationId: recurrence.organizationId },
        {
          lastRunAt: new Date(),
          lastPeriodKey: periodKey,
          nextRunAt,
        },
      );

      await this.auditService.record(
        {
          organizationId: recurrence.organizationId,
          actorUserId,
          action: 'RECURRENCE_REQUEST_GENERATED',
          resourceType: 'document_request',
          resourceId: savedReq.id,
          metadata: {
            recurrenceId: recurrence.id,
            periodKey,
            nextRunAt: nextRunAt.toISOString(),
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedReq.id;
    });
  }

  private async findAuthorizedRecurrence(
    auth: AuthenticatedContext,
    recurrenceId: string,
  ): Promise<RecurrenceEntity> {
    const recurrence = await this.recurrenceRepo.findOne({
      where: { id: recurrenceId, organizationId: auth.organizationId },
      relations: { client: true, template: true },
    });
    if (!recurrence || !recurrence.client || recurrence.client.deletedAt) {
      throw new NotFoundException('Recurring schedule not found');
    }

    if (
      auth.role === UserRole.STAFF &&
      recurrence.client.assignedUserId !== auth.userId
    ) {
      throw new ForbiddenException(
        'You do not have access to recurring schedules for this unassigned client',
      );
    }

    return recurrence;
  }

  private async assertWorkspaceWritable(organizationId: string) {
    const subscription =
      await this.plansService.getSubscriptionSummary(organizationId);
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }
    return subscription;
  }

  private assertValidTimezone(timezone: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
    }
  }

  private getDatePartsInTimezone(
    date: Date,
    timezone: string,
  ): { year: number; month: number; day: number } {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const [y, m, d] = formatted.split('-').map(Number);
    return { year: y!, month: m!, day: d! };
  }

  private formatPeriodKey(
    date: Date,
    frequency: RecurrenceFrequency,
    timezone: string,
  ): string {
    const { year, month } = this.getDatePartsInTimezone(date, timezone);
    if (frequency === RecurrenceFrequency.MONTHLY) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
    if (frequency === RecurrenceFrequency.QUARTERLY) {
      const quarter = Math.floor((month - 1) / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    return `${year}`;
  }

  private computeInitialNextRun(
    frequency: RecurrenceFrequency,
    dayOfMonth: number,
    timezone: string,
    fromDate: Date,
  ): Date {
    const { year, month, day } = this.getDatePartsInTimezone(
      fromDate,
      timezone,
    );
    if (day <= dayOfMonth) {
      return new Date(Date.UTC(year, month - 1, dayOfMonth, 9, 0, 0));
    }
    return this.advanceNextRun(fromDate, frequency, dayOfMonth, timezone);
  }

  private advanceNextRun(
    fromDate: Date,
    frequency: RecurrenceFrequency,
    dayOfMonth: number,
    timezone: string,
  ): Date {
    const { year, month } = this.getDatePartsInTimezone(fromDate, timezone);
    const monthsToAdd =
      frequency === RecurrenceFrequency.MONTHLY
        ? 1
        : frequency === RecurrenceFrequency.QUARTERLY
          ? 3
          : 12;
    return new Date(Date.UTC(year, month - 1 + monthsToAdd, dayOfMonth, 9, 0, 0));
  }

  private resolveTitleTemplate(
    template: string,
    periodKey: string,
    clientName: string,
  ): string {
    let resolved = template
      .replace(/\{\{\s*period\s*\}\}/gi, periodKey)
      .replace(/\{\{\s*client\s*\}\}/gi, clientName);
    if (!resolved.includes(periodKey)) {
      resolved = `${resolved} (${periodKey})`;
    }
    return resolved;
  }

  private mapSummary(rec: RecurrenceEntity): RecurrenceSummary {
    return {
      id: rec.id,
      clientId: rec.clientId,
      clientName: rec.client?.name ?? 'Client',
      templateId: rec.templateId,
      templateName: rec.template?.name ?? 'Template',
      titleTemplate: rec.titleTemplate,
      instructions: rec.instructions,
      frequency: rec.frequency,
      dayOfMonth: rec.dayOfMonth,
      dueDaysAfterIssue: rec.dueDaysAfterIssue,
      timezone: rec.timezone,
      status: rec.status,
      nextRunAt: rec.nextRunAt.toISOString(),
      lastRunAt: rec.lastRunAt ? rec.lastRunAt.toISOString() : null,
      lastPeriodKey: rec.lastPeriodKey,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
    };
  }
}
