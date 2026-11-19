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
  CreateClientContactDto,
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientContactDto,
  UpdateClientDto,
} from './clients.dto';
import { ClientsService } from './clients.service';

@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedContext,
    @Query() query: ListClientsQueryDto,
  ) {
    return this.clientsService.listClients(auth, query);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: CreateClientDto,
    @Req() req: Request,
  ) {
    return this.clientsService.createClient(auth, dto, req.ip);
  }

  @Get(':clientId')
  async getOne(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.clientsService.getClient(auth, clientId);
  }

  @Get(':clientId/files')
  async listFiles(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.clientsService.listClientFiles(auth, clientId);
  }

  @Get(':clientId/activity')
  async listActivity(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.clientsService.listClientActivity(auth, clientId);
  }

  @Patch(':clientId')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body() dto: UpdateClientDto,
    @Req() req: Request,
  ) {
    return this.clientsService.updateClient(auth, clientId, dto, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':clientId/archive')
  async archive(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Req() req: Request,
  ) {
    return this.clientsService.archiveClient(auth, clientId, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':clientId/restore')
  async restore(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Req() req: Request,
  ) {
    return this.clientsService.restoreClient(auth, clientId, req.ip);
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':clientId')
  async remove(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Req() req: Request,
  ) {
    await this.clientsService.deleteClient(auth, clientId, req.ip);
    return { deleted: true };
  }

  @Get(':clientId/contacts')
  async listContacts(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.clientsService.listContacts(auth, clientId);
  }

  @Post(':clientId/contacts')
  async createContact(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body() dto: CreateClientContactDto,
    @Req() req: Request,
  ) {
    return this.clientsService.createContact(auth, clientId, dto, req.ip);
  }

  @Patch(':clientId/contacts/:contactId')
  async updateContact(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Body() dto: UpdateClientContactDto,
    @Req() req: Request,
  ) {
    return this.clientsService.updateContact(
      auth,
      clientId,
      contactId,
      dto,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':clientId/contacts/:contactId/deactivate')
  async deactivateContact(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Req() req: Request,
  ) {
    return this.clientsService.deactivateContact(
      auth,
      clientId,
      contactId,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':clientId/contacts/:contactId/reactivate')
  async reactivateContact(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Req() req: Request,
  ) {
    return this.clientsService.reactivateContact(
      auth,
      clientId,
      contactId,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':clientId/contacts/:contactId')
  async deleteContact(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Req() req: Request,
  ) {
    await this.clientsService.deleteContact(auth, clientId, contactId, req.ip);
    return { deleted: true };
  }
}
