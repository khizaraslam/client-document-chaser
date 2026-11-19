import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@cdc/contracts';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const ROLES_KEY = 'requiredRoles';
export const RequireRoles = (...roles: UserRole[]) =>
  SetMetadata(ROLES_KEY, roles);
