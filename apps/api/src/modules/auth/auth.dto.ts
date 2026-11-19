import { OrganizationCountry } from '@cdc/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterFirmDto {
  @ApiProperty({ example: 'Claire Vance' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'claire@vanceaccounting.co.uk' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password: string;

  @ApiProperty({ example: 'Vance & Co Chartered Accountants' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  firmName: string;

  @ApiProperty({ enum: OrganizationCountry, example: OrganizationCountry.UK })
  @IsEnum(OrganizationCountry)
  country: OrganizationCountry;

  @ApiProperty({ example: 'Europe/London' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  newPassword: string;
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password?: string;
}
