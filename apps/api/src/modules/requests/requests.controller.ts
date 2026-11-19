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
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../../common/decorators/auth.decorators';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import {
  CancelDocumentRequestDto,
  CreateDocumentRequestDto,
  IssuePortalLinkDto,
  ListRequestsQueryDto,
  ReopenDocumentRequestDto,
  RequestItemDtoInput,
  UpdateDocumentRequestDto,
  UpdateRequestItemDto,
} from './requests.dto';
import { RequestsService } from './requests.service';

@ApiTags('Document Requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedContext,
    @Query() query: ListRequestsQueryDto,
  ) {
    return this.requestsService.listRequests(auth, query);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: CreateDocumentRequestDto,
    @Req() req: Request,
  ) {
    return this.requestsService.createRequest(auth, dto, req.ip);
  }

  @Get(':requestId')
  async getOne(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requestsService.getRequest(auth, requestId);
  }

  @Get(':requestId/activity')
  async listActivity(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.requestsService.listRequestActivity(auth, requestId);
  }

  @Patch(':requestId')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: UpdateDocumentRequestDto,
    @Req() req: Request,
  ) {
    return this.requestsService.updateRequest(auth, requestId, dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':requestId')
  async remove(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() req: Request,
  ) {
    await this.requestsService.deleteRequest(auth, requestId, req.ip);
    return { deleted: true };
  }

  @Post(':requestId/items')
  async addItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: RequestItemDtoInput,
    @Req() req: Request,
  ) {
    return this.requestsService.addItem(auth, requestId, dto, req.ip);
  }

  @Patch(':requestId/items/:itemId')
  async updateItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateRequestItemDto,
    @Req() req: Request,
  ) {
    return this.requestsService.updateItem(
      auth,
      requestId,
      itemId,
      dto,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':requestId/items/:itemId')
  async deleteItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: Request,
  ) {
    await this.requestsService.deleteItem(auth, requestId, itemId, req.ip);
    return { deleted: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/send')
  async send(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() req: Request,
  ) {
    return this.requestsService.sendRequest(auth, requestId, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/resend-email')
  async resendEmail(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() req: Request,
  ) {
    return this.requestsService.resendRequestEmail(auth, requestId, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/portal-link')
  async issuePortalLink(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: IssuePortalLinkDto,
    @Req() req: Request,
  ) {
    return this.requestsService.issueFreshPortalLink(
      auth,
      requestId,
      dto,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/revoke-portal')
  async revokePortal(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() req: Request,
  ) {
    return this.requestsService.revokePortalAccess(auth, requestId, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/cancel')
  async cancel(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: CancelDocumentRequestDto,
    @Req() req: Request,
  ) {
    return this.requestsService.cancelRequest(auth, requestId, dto, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/reopen')
  async reopen(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReopenDocumentRequestDto,
    @Req() req: Request,
  ) {
    return this.requestsService.reopenRequest(auth, requestId, dto, req.ip);
  }
}
