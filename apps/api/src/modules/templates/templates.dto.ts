import { TemplateCategory } from '@cdc/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class TemplateItemDtoInput {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
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

export class UpdateTemplateItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
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

export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDtoInput)
  items: TemplateItemDtoInput[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;
}
