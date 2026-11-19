import { MembershipStatus } from '@cdc/contracts';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { RefreshSessionEntity } from '../../database/entities/refresh-session.entity';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { RequestWithAuth } from '../types/auth-context.type';

export interface AccessJwtPayload {
  sub: string;
  orgId: string;
  membershipId: string;
  familyId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepo: Repository<MembershipEntity>,
    @InjectRepository(RefreshSessionEntity)
    private readonly refreshSessionRepo: Repository<RefreshSessionEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: AccessJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessJwtPayload>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    if (payload.familyId) {
      const activeSession = await this.refreshSessionRepo.findOne({
        where: {
          familyId: payload.familyId,
          userId: payload.sub,
          organizationId: payload.orgId,
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      });
      if (!activeSession) {
        throw new UnauthorizedException('Session has been revoked or expired');
      }
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        id: payload.membershipId,
        userId: payload.sub,
        organizationId: payload.orgId,
        status: MembershipStatus.ACTIVE,
        organization: { deletedAt: IsNull() },
      },
      relations: {
        user: true,
        organization: true,
      },
    });

    if (!membership || !membership.user || !membership.organization) {
      throw new UnauthorizedException('Active firm membership not found');
    }

    request.auth = {
      userId: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      role: membership.role,
      sessionFamilyId: payload.familyId,
    };

    return true;
  }

  private extractToken(request: RequestWithAuth): string | null {
    const cookieToken = request.cookies?.['cdc_access'];
    if (cookieToken && cookieToken.length > 0) {
      return cookieToken;
    }

    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    return null;
  }
}
