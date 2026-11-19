import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_CSRF_KEY } from '../decorators/auth.decorators';
import { RequestWithAuth } from '../types/auth-context.type';
import { safeTimingCompare } from '../utils/crypto.util';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const hasSessionCookie =
      Boolean(request.cookies?.['cdc_access']) ||
      Boolean(request.cookies?.['cdc_refresh']);

    if (!hasSessionCookie) {
      return true;
    }

    const csrfCookie = request.cookies?.['cdc_csrf'];
    const rawHeader = request.headers['x-csrf-token'];
    const csrfHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!csrfCookie || !csrfHeader || !safeTimingCompare(csrfCookie, csrfHeader)) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }
}
