import { UserRole } from '@cdc/contracts';

export interface AuthenticatedContext {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  membershipId: string;
  role: UserRole;
  sessionFamilyId?: string;
}

export interface RequestWithAuth {
  auth?: AuthenticatedContext;
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  ip?: string;
  url: string;
}
