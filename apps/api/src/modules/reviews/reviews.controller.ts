import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AuthenticatedContext } from '../../common/types/auth-context.type';
import { MarkItemUnderReviewDto, ReviewDecisionDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Document Reviews')
@Controller('requests')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':requestId/reviews')
  async listForRequest(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.reviewsService.listReviewsForRequest(auth, requestId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/items/:itemId/under-review')
  async markUnderReview(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: MarkItemUnderReviewDto,
    @Req() req: Request,
  ) {
    return this.reviewsService.markItemUnderReview(
      auth,
      requestId,
      itemId,
      dto,
      req.ip,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post(':requestId/items/:itemId/review')
  async reviewItem(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ReviewDecisionDto,
    @Req() req: Request,
  ) {
    return this.reviewsService.reviewItem(
      auth,
      requestId,
      itemId,
      dto,
      req.ip,
    );
  }
}
