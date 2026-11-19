import { OrganizationCountry } from '@cdc/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: OrganizationCountry })
  @IsOptional()
  @IsEnum(OrganizationCountry)
  country?: OrganizationCountry;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  timezone?: string;
}
