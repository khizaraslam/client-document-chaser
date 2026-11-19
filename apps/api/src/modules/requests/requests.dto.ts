import { RequestStatus } from '@cdc/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class ListRequestsQueryDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class RequestItemDtoInput {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  acceptedMimeTypes?: string[];
}

export class UpdateRequestItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  acceptedMimeTypes?: string[];
}

export class CreateDocumentRequestDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  templateId?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RequestItemDtoInput)
  items?: RequestItemDtoInput[];
}

export class UpdateDocumentRequestDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class CancelDocumentRequestDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReopenDocumentRequestDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  issuePortalLink?: boolean;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

export class IssuePortalLinkDto {
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
