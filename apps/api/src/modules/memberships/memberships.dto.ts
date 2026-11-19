import { UserRole } from '@cdc/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'bookkeeper@vanceaccounting.co.uk' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.STAFF] })
  @IsIn([UserRole.ADMIN, UserRole.STAFF], {
    message: 'Invited role must be ADMIN or STAFF',
  })
  role: UserRole.ADMIN | UserRole.STAFF;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
