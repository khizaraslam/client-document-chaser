import { ReviewDecision } from '@cdc/contracts';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class ReviewDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  uploadedFileId?: string | null;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class MarkItemUnderReviewDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
