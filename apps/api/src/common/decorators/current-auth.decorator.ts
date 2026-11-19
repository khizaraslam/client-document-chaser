import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedContext, RequestWithAuth } from '../types/auth-context.type';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
    if (!request.auth) {
      throw new Error('Authenticated context missing on protected route');
    }
    return request.auth;
  },
);
