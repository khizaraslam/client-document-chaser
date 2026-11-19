import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { UpdateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  async getCurrent(organizationId: string) {
    const org = await this.orgRepo.findOne({
      where: { id: organizationId, deletedAt: IsNull() },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const subscription =
      await this.plansService.getSubscriptionSummary(organizationId);

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        country: org.country,
        timezone: org.timezone,
        createdAt: org.createdAt.toISOString(),
      },
      subscription,
    };
  }

  async updateCurrent(
    auth: AuthenticatedContext,
    dto: UpdateOrganizationDto,
    ipAddress?: string,
  ) {
    const org = await this.orgRepo.findOne({
      where: { id: auth.organizationId, deletedAt: IsNull() },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const subscription = await this.plansService.getSubscriptionSummary(
      auth.organizationId,
    );
    if (subscription.isReadOnly) {
      throw new ForbiddenException(
        'Firm trial has expired and is currently read-only',
      );
    }

    if (dto.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException(`Invalid IANA timezone: ${dto.timezone}`);
      }
    }

    const updates: Partial<OrganizationEntity> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.country !== undefined) updates.country = dto.country;
    if (dto.timezone !== undefined) updates.timezone = dto.timezone.trim();

    if (Object.keys(updates).length > 0) {
      await this.orgRepo.update({ id: auth.organizationId }, updates);
      await this.auditService.record({
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'ORGANIZATION_UPDATED',
        resourceType: 'organization',
        resourceId: auth.organizationId,
        metadata: updates,
        ipAddress: ipAddress ?? null,
      });
    }

    return this.getCurrent(auth.organizationId);
  }
}
