import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_ROUTE, REQUIRED_PERMISSION } from './platform.tokens.js';

export type AuthenticatedUser = {
  id: string;
  sessionId: string;
  email: string;
  displayName: string;
  permissions: string[];
};

export type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };

export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) throw new Error('Authenticated user is unavailable');
  return request.user;
});
