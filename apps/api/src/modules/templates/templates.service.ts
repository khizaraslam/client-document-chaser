import {
  DEFAULT_ACCEPTED_MIME_TYPES,
  TemplateCategory,
  TemplateDetail,
  TemplateItemDto,
  TemplateSummary,
} from '@cdc/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { TemplateItemEntity } from '../../database/entities/template-item.entity';
import { TemplateEntity } from '../../database/entities/template.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import {
  CreateTemplateDto,
  ListTemplatesQueryDto,
  TemplateItemDtoInput,
  UpdateTemplateDto,
  UpdateTemplateItemDto,
} from './templates.dto';

const STARTER_PACK_TEMPLATES: Array<{
  name: string;
  description: string;
  category: TemplateCategory;
  items: Array<{ title: string; description: string; isRequired: boolean }>;
}> = [
  {
    name: 'Monthly Bookkeeping Close',
    description:
      'Standard monthly bank, card, and ledger reconciliation package for US & UK SMEs.',
    category: TemplateCategory.BOOKKEEPING,
    items: [
      {
        title: 'Primary business bank statement (PDF & CSV)',
        description:
          'Full month statement covering the 1st through final day of the period.',
        isRequired: true,
      },
      {
        title: 'Corporate credit card statements',
        description:
          'Monthly statement for each active company credit or charge card.',
        isRequired: true,
      },
      {
        title: 'Unmatched purchase receipts & supplier invoices',
        description:
          'Receipts for expenses over $75 / £50 or non-recurring vendor bills.',
        isRequired: false,
      },
    ],
  },
  {
    name: 'UK Quarterly VAT Return (MTD)',
    description:
      'Quarterly HMRC Making Tax Digital supporting sales, purchase, and import records.',
    category: TemplateCategory.VAT_SALES_TAX,
    items: [
      {
        title: 'Sales invoices & credit notes summary',
        description: 'Exported VAT sales ledger or sequential invoice PDF bundle.',
        isRequired: true,
      },
      {
        title: 'Supplier VAT invoices',
        description: 'Invoices supporting input VAT claims for the quarter.',
        isRequired: true,
      },
      {
        title: 'Import C79 / Postponed VAT statements',
        description: 'HMRC CDS / PVA monthly certificates if applicable.',
        isRequired: false,
      },
    ],
  },
  {
    name: 'US Annual Tax Return Package',
    description:
      'Year-end tax preparation documents for LLCs, S-Corps, and C-Corps.',
    category: TemplateCategory.TAX_RETURN,
    items: [
      {
        title: 'Year-end bank & loan statements (Dec 31)',
        description: 'December closing statements showing ending balances.',
        isRequired: true,
      },
      {
        title: '1099-NEC / 1099-K / W-2 annual summaries',
        description: 'Contractor and payroll tax forms issued or received.',
        isRequired: true,
      },
      {
        title: 'Fixed asset purchases & vehicle mileage log',
        description: 'Invoices for equipment purchases over $2,500.',
        isRequired: false,
      },
    ],
  },
  {
    name: 'New Client Onboarding & KYC',
    description:
      'Initial compliance, incorporation, and accounting access verification checklist.',
    category: TemplateCategory.ONBOARDING,
    items: [
      {
        title: 'Certificate of Incorporation / Articles of Organization',
        description: 'Official formation filing from Secretary of State or Companies House.',
        isRequired: true,
      },
      {
        title: 'EIN Confirmation (CP 575) or UTR / VAT Registration',
        description: 'Federal or HMRC tax registration notice.',
        isRequired: true,
      },
      {
        title: 'Director / Beneficial Owner Photo ID',
        description: 'Passport or driving licence for AML/KYC verification.',
        isRequired: true,
      },
    ],
  },
];

@Injectable()
export class TemplatesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectRepository(TemplateItemEntity)
    private readonly itemRepo: Repository<TemplateItemEntity>,
    @InjectRepository(RecurrenceEntity)
    private readonly recurrenceRepo: Repository<RecurrenceEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  async listTemplates(
    auth: AuthenticatedContext,
    query: ListTemplatesQueryDto,
  ): Promise<TemplateSummary[]> {
    const qb = this.templateRepo
      .createQueryBuilder('t')
      .where('t.organization_id = :orgId', { orgId: auth.organizationId })
      .andWhere('t.deleted_at IS NULL');

    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.name) LIKE :term OR LOWER(COALESCE(t.description, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('t.created_at', 'DESC');
    const templates = await qb.getMany();
    if (templates.length === 0) return [];

    const items = await this.itemRepo.find({
      where: {
        organizationId: auth.organizationId,
        templateId: In(templates.map((t) => t.id)),
      },
    });

    const countMap = new Map<string, number>();
    for (const item of items) {
      countMap.set(item.templateId, (countMap.get(item.templateId) ?? 0) + 1);
    }

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      isSystem: t.isSystem,
      itemsCount: countMap.get(t.id) ?? 0,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async getTemplate(
    auth: AuthenticatedContext,
    templateId: string,
  ): Promise<TemplateDetail> {
    const template = await this.findTemplateForOrg(
      auth.organizationId,
      templateId,
    );
    const items = await this.itemRepo.find({
      where: {
        organizationId: auth.organizationId,
        templateId: template.id,
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      isSystem: template.isSystem,
      itemsCount: items.length,
      items: items.map((item) => this.mapItem(item)),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  async createTemplate(
    auth: AuthenticatedContext,
    dto: CreateTemplateDto,
    ipAddress?: string,
  ): Promise<TemplateDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const templateId = await this.dataSource.transaction(async (manager) => {
      const tplRepo = manager.getRepository(TemplateEntity);
      const itemRepo = manager.getRepository(TemplateItemEntity);

      const saved = await tplRepo.save(
        tplRepo.create({
          organizationId: auth.organizationId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          category: dto.category,
          isSystem: false,
          createdByUserId: auth.userId,
        }),
      );

      for (let i = 0; i < dto.items.length; i++) {
        const input = dto.items[i]!;
        await itemRepo.save(
          itemRepo.create({
            organizationId: auth.organizationId,
            templateId: saved.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            isRequired: input.isRequired ?? true,
            sortOrder: input.sortOrder ?? i,
            acceptedMimeTypes:
              input.acceptedMimeTypes && input.acceptedMimeTypes.length > 0
                ? input.acceptedMimeTypes
                : [...DEFAULT_ACCEPTED_MIME_TYPES],
          }),
        );
      }

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'TEMPLATE_CREATED',
          resourceType: 'template',
          resourceId: saved.id,
          metadata: { name: saved.name, itemsCount: dto.items.length },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return saved.id;
    });

    return this.getTemplate(auth, templateId);
  }

  async seedStarterPack(
    auth: AuthenticatedContext,
    ipAddress?: string,
  ): Promise<{ createdCount: number; templates: TemplateSummary[] }> {
    await this.assertWorkspaceWritable(auth.organizationId);

    const existing = await this.templateRepo.find({
      where: { organizationId: auth.organizationId, deletedAt: IsNull() },
    });
    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));

    let createdCount = 0;
    await this.dataSource.transaction(async (manager) => {
      const tplRepo = manager.getRepository(TemplateEntity);
      const itemRepo = manager.getRepository(TemplateItemEntity);

      for (const pack of STARTER_PACK_TEMPLATES) {
        if (existingNames.has(pack.name.toLowerCase())) continue;

        const saved = await tplRepo.save(
          tplRepo.create({
            organizationId: auth.organizationId,
            name: pack.name,
            description: pack.description,
            category: pack.category,
            isSystem: true,
            createdByUserId: auth.userId,
          }),
        );

        for (let idx = 0; idx < pack.items.length; idx++) {
          const item = pack.items[idx]!;
          await itemRepo.save(
            itemRepo.create({
              organizationId: auth.organizationId,
              templateId: saved.id,
              title: item.title,
              description: item.description,
              isRequired: item.isRequired,
              sortOrder: idx,
              acceptedMimeTypes: [...DEFAULT_ACCEPTED_MIME_TYPES],
            }),
          );
        }
        createdCount++;
      }

      if (createdCount > 0) {
        await this.auditService.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'TEMPLATE_STARTER_PACK_LOADED',
            resourceType: 'template',
            metadata: { createdCount },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );
      }
    });

    const templates = await this.listTemplates(auth, {});
    return { createdCount, templates };
  }

  async cloneTemplate(
    auth: AuthenticatedContext,
    templateId: string,
    ipAddress?: string,
  ): Promise<TemplateDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const source = await this.getTemplate(auth, templateId);

    const clonedId = await this.dataSource.transaction(async (manager) => {
      const tplRepo = manager.getRepository(TemplateEntity);
      const itemRepo = manager.getRepository(TemplateItemEntity);

      const saved = await tplRepo.save(
        tplRepo.create({
          organizationId: auth.organizationId,
          name: `${source.name} (Copy)`.slice(0, 150),
          description: source.description,
          category: source.category,
          isSystem: false,
          createdByUserId: auth.userId,
        }),
      );

      for (const item of source.items) {
        await itemRepo.save(
          itemRepo.create({
            organizationId: auth.organizationId,
            templateId: saved.id,
            title: item.title,
            description: item.description,
            isRequired: item.isRequired,
            sortOrder: item.sortOrder,
            acceptedMimeTypes: [...item.acceptedMimeTypes],
          }),
        );
      }

      await this.auditService.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'TEMPLATE_CLONED',
          resourceType: 'template',
          resourceId: saved.id,
          metadata: { sourceTemplateId: source.id },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return saved.id;
    });

    return this.getTemplate(auth, clonedId);
  }

  async updateTemplate(
    auth: AuthenticatedContext,
    templateId: string,
    dto: UpdateTemplateDto,
    ipAddress?: string,
  ): Promise<TemplateDetail> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const template = await this.findTemplateForOrg(
      auth.organizationId,
      templateId,
    );

    const updates: Partial<TemplateEntity> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.description !== undefined) {
      updates.description = dto.description?.trim() || null;
    }
    if (dto.category !== undefined) updates.category = dto.category;

    if (Object.keys(updates).length > 0) {
      await this.templateRepo.update(
        { id: template.id, organizationId: auth.organizationId },
        updates,
      );
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'TEMPLATE_UPDATED',
        resourceType: 'template',
        resourceId: template.id,
        metadata: updates,
        ipAddress: ipAddress ?? null,
      });
    }

    return this.getTemplate(auth, template.id);
  }

  async deleteTemplate(
    auth: AuthenticatedContext,
    templateId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const template = await this.findTemplateForOrg(
      auth.organizationId,
      templateId,
    );

    const recurrenceRefCount = await this.recurrenceRepo.count({
      where: { organizationId: auth.organizationId, templateId: template.id },
    });
    if (recurrenceRefCount > 0) {
      throw new ConflictException(
        'Cannot delete template while recurring request schedules reference it',
      );
    }

    await this.templateRepo.softDelete({
      id: template.id,
      organizationId: auth.organizationId,
    });

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'TEMPLATE_DELETED',
      resourceType: 'template',
      resourceId: template.id,
      metadata: { name: template.name },
      ipAddress: ipAddress ?? null,
    });
  }

  async addItem(
    auth: AuthenticatedContext,
    templateId: string,
    dto: TemplateItemDtoInput,
    ipAddress?: string,
  ): Promise<TemplateItemDto> {
    await this.assertWorkspaceWritable(auth.organizationId);
    const template = await this.findTemplateForOrg(
      auth.organizationId,
      templateId,
    );

    const existingCount = await this.itemRepo.count({
      where: { organizationId: auth.organizationId, templateId: template.id },
    });

    const saved = await this.itemRepo.save(
      this.itemRepo.create({
        organizationId: auth.organizationId,
        templateId: template.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        isRequired: dto.isRequired ?? true,
        sortOrder: dto.sortOrder ?? existingCount,
        acceptedMimeTypes:
          dto.acceptedMimeTypes && dto.acceptedMimeTypes.length > 0
            ? dto.acceptedMimeTypes
            : [...DEFAULT_ACCEPTED_MIME_TYPES],
      }),
    );

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'TEMPLATE_ITEM_ADDED',
      resourceType: 'template_item',
      resourceId: saved.id,
      metadata: { templateId: template.id, title: saved.title },
      ipAddress: ipAddress ?? null,
    });

    return this.mapItem(saved);
  }

  async updateItem(
    auth: AuthenticatedContext,
    templateId: string,
    itemId: string,
    dto: UpdateTemplateItemDto,
    ipAddress?: string,
  ): Promise<TemplateItemDto> {
    await this.assertWorkspaceWritable(auth.organizationId);
    await this.findTemplateForOrg(auth.organizationId, templateId);

    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        templateId,
        organizationId: auth.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Template item not found');
    }

    const updates: Partial<TemplateItemEntity> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.description !== undefined) {
      updates.description = dto.description?.trim() || null;
    }
    if (dto.isRequired !== undefined) updates.isRequired = dto.isRequired;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;
    if (dto.acceptedMimeTypes !== undefined) {
      updates.acceptedMimeTypes = dto.acceptedMimeTypes;
    }

    if (Object.keys(updates).length > 0) {
      await this.itemRepo.update(
        { id: item.id, organizationId: auth.organizationId },
        updates,
      );
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'TEMPLATE_ITEM_UPDATED',
        resourceType: 'template_item',
        resourceId: item.id,
        metadata: { templateId },
        ipAddress: ipAddress ?? null,
      });
    }

    const updated = await this.itemRepo.findOneOrFail({
      where: { id: item.id, organizationId: auth.organizationId },
    });
    return this.mapItem(updated);
  }

  async deleteItem(
    auth: AuthenticatedContext,
    templateId: string,
    itemId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.assertWorkspaceWritable(auth.organizationId);
    await this.findTemplateForOrg(auth.organizationId, templateId);

    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        templateId,
        organizationId: auth.organizationId,
      },
    });
    if (!item) {
      throw new NotFoundException('Template item not found');
    }

    const totalItems = await this.itemRepo.count({
      where: { templateId, organizationId: auth.organizationId },
    });
    if (totalItems <= 1) {
      throw new BadRequestException(
        'A template must retain at least one checklist item',
      );
    }

    await this.itemRepo.delete({
      id: item.id,
      organizationId: auth.organizationId,
    });

    await this.auditService.record({
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      action: 'TEMPLATE_ITEM_DELETED',
      resourceType: 'template_item',
      resourceId: item.id,
      metadata: { templateId, title: item.title },
      ipAddress: ipAddress ?? null,
    });
  }

  async findTemplateForOrg(
    organizationId: string,
    templateId: string,
  ): Promise<TemplateEntity> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, organizationId, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
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

  private mapItem(item: TemplateItemEntity): TemplateItemDto {
    return {
      id: item.id,
      templateId: item.templateId,
      title: item.title,
      description: item.description,
      isRequired: item.isRequired,
      sortOrder: item.sortOrder,
      acceptedMimeTypes: item.acceptedMimeTypes,
    };
  }
}
