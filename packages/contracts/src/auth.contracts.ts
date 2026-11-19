import { z } from 'zod';
import { OrganizationCountry, PlanCode, SubscriptionStatus, UserRole } from './enums';

const strongPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number');

export const RegisterFirmSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Enter a valid work email').max(255),
  password: strongPasswordSchema,
  firmName: z.string().trim().min(2, 'Firm name is required').max(150),
  country: z.nativeEnum(OrganizationCountry),
  timezone: z.string().trim().min(3, 'Valid IANA timezone is required').max(100),
});

export const LoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const VerifyEmailSchema = z.object({
  token: z.string().trim().min(16, 'Verification token is invalid'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(16, 'Reset token is invalid'),
  newPassword: strongPasswordSchema,
});

const optionalTrimmedString = (min: number, max: number, msg: string) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().trim().min(min, msg).max(max).optional(),
  );

const optionalStrongPassword = z.preprocess(
  (val) => (typeof val === 'string' && val === '' ? undefined : val),
  strongPasswordSchema.optional(),
);

export const AcceptInviteSchema = z.object({
  token: z.string().trim().min(16, 'Invitation token is invalid'),
  fullName: optionalTrimmedString(2, 120, 'Full name must be at least 2 characters'),
  password: optionalStrongPassword,
});

export const COUNTRY_TIMEZONES: Record<OrganizationCountry, readonly string[]> = {
  [OrganizationCountry.US]: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
  ],
  [OrganizationCountry.UK]: ['Europe/London'],
};

export type RegisterFirmInput = z.infer<typeof RegisterFirmSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;

export interface AuthSubscriptionSummary {
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  trialStartsAt: string;
  trialEndsAt: string;
  isReadOnly: boolean;
  maxActiveClients: number;
  maxTeamSeats: number;
  maxStorageBytes: number;
  maxEmailsPerMonth: number;
  activeClientsCount: number;
  storageBytesUsed: number;
  emailsSentThisPeriod: number;
}

export interface AuthOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  country: OrganizationCountry;
  timezone: string;
}

export interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
  };
  membership: {
    id: string;
    role: UserRole;
  };
  organization: AuthOrganizationSummary;
  subscription: AuthSubscriptionSummary;
}

export interface SessionInfoItem {
  id: string;
  familyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
