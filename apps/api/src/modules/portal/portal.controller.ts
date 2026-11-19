import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public, SkipCsrf } from '../../common/decorators/auth.decorators';
import {
  ConfirmPortalUploadDto,
  CreatePortalPresignDto,
  FallbackPortalUploadDto,
} from './portal.dto';
import { FallbackUploadedFileInput, PortalService } from './portal.service';

@ApiTags('Client Portal')
@Public()
@SkipCsrf()
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  async getPortalView(@Param('token') token: string) {
    return this.portalService.getPortalView(token);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/upload-url')
  async createUploadUrl(
    @Param('token') token: string,
    @Body() dto: CreatePortalPresignDto,
  ) {
    return this.portalService.createPresignedUpload(token, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/confirm-upload')
  async confirmUpload(
    @Param('token') token: string,
    @Body() dto: ConfirmPortalUploadDto,
    @Req() req: Request,
  ) {
    return this.portalService.confirmUpload(token, dto, req.ip);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  async uploadFallback(
    @Param('token') token: string,
    @Body() dto: FallbackPortalUploadDto,
    // @UploadedFile() file: Express.Multer.File | undefined,
    @UploadedFile() file: FallbackUploadedFileInput | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('File attachment is required');
    }
    const payload: FallbackUploadedFileInput = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };
    return this.portalService.uploadViaApiFallback(
      token,
      dto.requestItemId,
      payload,
      req.ip,
    );
  }
}
