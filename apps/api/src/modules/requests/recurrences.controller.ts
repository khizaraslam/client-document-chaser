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
  CreateRecurrenceDto,
  ListRecurrencesQueryDto,
  UpdateRecurrenceDto,
} from './recurrences.dto';
import { RecurrencesService } from './recurrences.service';

@ApiTags('Recurring Schedules')
@Controller('recurrences')
export class RecurrencesController {
  constructor(private readonly recurrencesService: RecurrencesService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthenticatedContext,
    @Query() query: ListRecurrencesQueryDto,
  ) {
    return this.recurrencesService.listRecurrences(auth, query);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body() dto: CreateRecurrenceDto,
    @Req() req: Request,
  ) {
    return this.recurrencesService.createRecurrence(auth, dto, req.ip);
  }

  @Patch(':recurrenceId')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('recurrenceId', new ParseUUIDPipe()) recurrenceId: string,
    @Body() dto: UpdateRecurrenceDto,
    @Req() req: Request,
  ) {
    return this.recurrencesService.updateRecurrence(
      auth,
      recurrenceId,
      dto,
      req.ip,
    );
  }

  @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':recurrenceId')
  async remove(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('recurrenceId', new ParseUUIDPipe()) recurrenceId: string,
    @Req() req: Request,
  ) {
    await this.recurrencesService.deleteRecurrence(auth, recurrenceId, req.ip);
    return { deleted: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post(':recurrenceId/trigger')
  async trigger(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('recurrenceId', new ParseUUIDPipe()) recurrenceId: string,
    @Req() req: Request,
  ) {
    return this.recurrencesService.triggerRecurrence(
      auth,
      recurrenceId,
      req.ip,
    );
  }
}
