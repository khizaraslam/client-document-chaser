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
  CreateTemplateDto,
  ListTemplatesQueryDto,
  TemplateItemDtoInput,
  UpdateTemplateDto,
  UpdateTemplateItemDto,
} from './templates.dto';
import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedContext,
    @Query() query: ListTemplatesQueryDto,
  ) {
    return this.templatesService.listTemplates(auth, query);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post('starter-pack')
  async seedStarterPack(
    @CurrentAuth() auth: AuthenticatedContext,
    @Req() req: Request,
  ) {
    return this.templatesService.seedStarterPack(auth, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: CreateTemplateDto,
    @Req() req: Request,
  ) {
    return this.templatesService.createTemplate(auth, dto, req.ip);
  }

  @Get(':templateId')
  async getOne(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ) {
    return this.templatesService.getTemplate(auth, templateId);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':templateId/clone')
  async clone(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Req() req: Request,
  ) {
    return this.templatesService.cloneTemplate(auth, templateId, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(':templateId')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: Request,
  ) {
    return this.templatesService.updateTemplate(auth, templateId, dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':templateId')
  async remove(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Req() req: Request,
  ) {
    await this.templatesService.deleteTemplate(auth, templateId, req.ip);
    return { deleted: true };
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':templateId/items')
  async addItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() dto: TemplateItemDtoInput,
    @Req() req: Request,
  ) {
    return this.templatesService.addItem(auth, templateId, dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(':templateId/items/:itemId')
  async updateItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateTemplateItemDto,
    @Req() req: Request,
  ) {
    return this.templatesService.updateItem(
      auth,
      templateId,
      itemId,
      dto,
      req.ip,
    );
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':templateId/items/:itemId')
  async deleteItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: Request,
  ) {
    await this.templatesService.deleteItem(auth, templateId, itemId, req.ip);
    return { deleted: true };
  }
}
