import { UserRole } from '@cdc/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequireRoles } from '../../common/decorators/auth.decorators';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedContext,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 50;
    return this.auditService.listForOrganization(
      auth.organizationId,
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
    );
  }
}
