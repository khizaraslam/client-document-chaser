import {
  ClientEntityType,
  ClientStatus,
  OrganizationCountry,
} from '@cdc/contracts';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const emptyStringToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class ListClientsQueryDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class CreateClientContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(80)
  roleTitle?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateClientContactDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(80)
  roleTitle?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(180)
  companyName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  referenceCode?: string;

  @IsEnum(ClientEntityType)
  entityType: ClientEntityType;

  @IsEnum(OrganizationCountry)
  country: OrganizationCountry;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateClientContactDto)
  primaryContact?: CreateClientContactDto;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(180)
  companyName?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(60)
  referenceCode?: string | null;

  @IsOptional()
  @IsEnum(ClientEntityType)
  entityType?: ClientEntityType;

  @IsOptional()
  @IsEnum(OrganizationCountry)
  country?: OrganizationCountry;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
