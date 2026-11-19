import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Public, SkipCsrf } from '../../common/decorators/auth.decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class ResendWebhookController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Post('resend')
  async handleResendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string | undefined,
    @Headers('svix-timestamp') svixTimestamp: string | undefined,
    @Headers('svix-signature') svixSignature: string | undefined,
    @Body()
    body: {
      type?: string;
      data?: { email_id?: string; bounce?: { message?: string } };
    },
  ) {
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body ?? {});

    return this.notificationsService.handleResendWebhook({
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature,
      payload: body ?? {},
    });
  }
}
