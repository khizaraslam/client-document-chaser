import { RecurrenceFrequency, RecurrenceStatus } from '@cdc/contracts';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListRecurrencesQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(RecurrenceStatus)
  status?: RecurrenceStatus;
}

export class CreateRecurrenceDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  templateId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  titleTemplate: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsEnum(RecurrenceFrequency)
  frequency: RecurrenceFrequency;

  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dueDaysAfterIssue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

export class UpdateRecurrenceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  titleTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  frequency?: RecurrenceFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dueDaysAfterIssue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsEnum(RecurrenceStatus)
  status?: RecurrenceStatus;
}
