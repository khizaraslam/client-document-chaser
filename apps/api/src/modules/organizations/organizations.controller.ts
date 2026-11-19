import { UserRole } from '@cdc/contracts';
import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../../common/decorators/auth.decorators';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { UpdateOrganizationDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  async getCurrent(@CurrentAuth() auth: AuthenticatedContext) {
    return this.organizationsService.getCurrent(auth.organizationId);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Patch('current')
  async updateCurrent(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: UpdateOrganizationDto,
    @Req() req: Request,
  ) {
    return this.organizationsService.updateCurrent(auth, dto, req.ip);
  }
}
