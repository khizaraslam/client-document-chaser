import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePortalPresignDto {
  @IsUUID()
  requestItemId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(104_857_600)
  sizeBytes!: number;
}

export class ConfirmPortalUploadDto {
  @IsUUID()
  fileId!: string;
}

export class FallbackPortalUploadDto {
  @IsUUID()
  requestItemId!: string;
}
