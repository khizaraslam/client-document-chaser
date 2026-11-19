import { z } from 'zod';
import {
  AuditActorType,
  MembershipStatus,
  OrganizationCountry,
  PlanCode,
  UserRole,
} from './enums';

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Firm name must be at least 2 characters').max(150).optional(),
  country: z.nativeEnum(OrganizationCountry).optional(),
  timezone: z.string().trim().min(3).max(100).optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
  role: z.enum([UserRole.ADMIN, UserRole.STAFF]),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

export interface MembershipRosterItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: MembershipStatus;
  emailVerified: boolean;
  createdAt: string;
}

export interface InvitationItem {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
  invitedByEmail: string;
}

export interface TeamRosterResponse {
  members: MembershipRosterItem[];
  pendingInvitations: InvitationItem[];
}

export interface PlanSummary {
  id: string;
  code: PlanCode;
  name: string;
  monthlyPriceCents: number;
  maxActiveClients: number;
  maxTeamSeats: number;
  maxStorageBytes: number;
  maxEmailsPerMonth: number;
}

export interface AuditEventItem {
  id: string;
  actorType: AuditActorType;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}
