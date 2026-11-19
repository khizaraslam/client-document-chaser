import { UserRole } from '@cdc/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Public,
  RequireRoles,
  SkipCsrf,
} from '../../common/decorators/auth.decorators';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { AcceptInviteDto } from '../auth/auth.dto';
import { InviteMemberDto, UpdateMemberRoleDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('Memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  async getRoster(@CurrentAuth() auth: AuthenticatedContext) {
    return this.membershipsService.getTeamRoster(auth.organizationId);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post('invitations')
  async inviteMember(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: InviteMemberDto,
    @Req() req: Request,
  ) {
    return this.membershipsService.inviteMember(auth, dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Delete('invitations/:invitationId')
  async revokeInvitation(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Req() req: Request,
  ) {
    await this.membershipsService.revokeInvitation(auth, invitationId, req.ip);
    return { revoked: true };
  }

  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Post('invitations/accept')
  async acceptInvitation(@Body() dto: AcceptInviteDto, @Req() req: Request) {
    return this.membershipsService.acceptInvitation(dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER)
  @Patch(':membershipId/role')
  async updateRole(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: Request,
  ) {
    return this.membershipsService.updateMemberRole(
      auth,
      membershipId,
      dto,
      req.ip,
    );
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':membershipId')
  async removeMember(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Req() req: Request,
  ) {
    await this.membershipsService.removeMember(auth, membershipId, req.ip);
    return { removed: true };
  }
}
