import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { FilesService } from './files.service';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get(':fileId/download-url')
  async getDownloadUrl(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() req: Request,
  ) {
    return this.filesService.getSignedDownloadUrl(auth, fileId, req.ip);
  }
}
