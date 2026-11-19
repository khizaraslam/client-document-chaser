import { MembershipStatus, UserRole } from '@cdc/contracts';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CsrfGuard } from '../src/common/guards/csrf.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

function createMockContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RBAC, JWT & CSRF Guards', () => {
  it('RolesGuard enforces OWNER/ADMIN/STAFF restrictions', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.OWNER, UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(
        createMockContext({ auth: { role: UserRole.OWNER } }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        createMockContext({ auth: { role: UserRole.ADMIN } }),
      ),
    ).toBe(true);

    expect(() =>
      guard.canActivate(
        createMockContext({ auth: { role: UserRole.STAFF } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('CsrfGuard blocks mutating cookie-authenticated requests without matching header', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new CsrfGuard(reflector);

    // Safe GET requests pass
    expect(
      guard.canActivate(
        createMockContext({
          method: 'GET',
          cookies: { cdc_access: 'jwt-token', cdc_csrf: 'csrf-123' },
          headers: {},
        }),
      ),
    ).toBe(true);

    // POST with session cookie and missing CSRF header is blocked
    expect(() =>
      guard.canActivate(
        createMockContext({
          method: 'POST',
          cookies: { cdc_access: 'jwt-token', cdc_csrf: 'csrf-123' },
          headers: {},
        }),
      ),
    ).toThrow(ForbiddenException);

    // POST with matching CSRF header passes
    expect(
      guard.canActivate(
        createMockContext({
          method: 'POST',
          cookies: { cdc_access: 'jwt-token', cdc_csrf: 'csrf-123' },
          headers: { 'x-csrf-token': 'csrf-123' },
        }),
      ),
    ).toBe(true);
  });

  it('JwtAuthGuard rejects revoked session families immediately and ignores client-supplied organizationId', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        orgId: 'org-real',
        membershipId: 'mem-1',
        familyId: 'fam-1',
      }),
    } as unknown as JwtService;
    const configService = {
      get: jest.fn().mockReturnValue('secret'),
    } as unknown as ConfigService;

    const refreshSessionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const membershipRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-real',
        role: UserRole.ADMIN,
        status: MembershipStatus.ACTIVE,
        user: { id: 'user-1', email: 'a@firm.com', fullName: 'Ada' },
        organization: { id: 'org-real' },
      }),
    };

    const guard = new JwtAuthGuard(
      reflector,
      jwtService,
      configService,
      membershipRepo as never,
      refreshSessionRepo as never,
    );

    const reqWithRevokedSession: Record<string, unknown> = {
      cookies: { cdc_access: 'valid-jwt' },
      headers: { 'x-organization-id': 'org-attacker' },
    };

    await expect(
      guard.canActivate(createMockContext(reqWithRevokedSession)),
    ).rejects.toThrow(UnauthorizedException);

    // Now simulate active refresh session; auth context must resolve to org-real
    refreshSessionRepo.findOne.mockResolvedValue({ id: 'sess-1' });
    const reqActive: Record<string, unknown> = {
      cookies: { cdc_access: 'valid-jwt' },
      headers: { 'x-organization-id': 'org-attacker' },
      body: { organizationId: 'org-attacker' },
    };

    const allowed = await guard.canActivate(createMockContext(reqActive));
    expect(allowed).toBe(true);
    expect((reqActive.auth as { organizationId: string }).organizationId).toBe(
      'org-real',
    );
  });
});
