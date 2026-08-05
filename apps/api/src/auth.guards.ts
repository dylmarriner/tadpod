import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyAccessToken, hasPermission } from '@tadpods/auth';
import type { AppEnvironment } from '@tadpods/config';
import { database } from '@tadpods/database';
import type { AuthenticatedRequest } from './platform.decorators.js';
import { APP_ENVIRONMENT, IS_PUBLIC_ROUTE, REQUIRED_PERMISSION } from './platform.tokens.js';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const token = request.cookies?.tadpods_access ?? bearer;
    if (!token) throw new UnauthorizedException('Sign in to continue');
    try {
      const verified = await verifyAccessToken(token, this.environment.authSecret);
      const session = await database.refreshSession.findUnique({ where: { id: verified.sessionId }, select: { status: true, expiresAt: true } });
      if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date()) throw new UnauthorizedException('Session has expired');
      const user = await database.user.findUnique({ where: { id: verified.userId }, select: { email: true, displayName: true, status: true } });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
      request.user = { id: verified.userId, sessionId: verified.sessionId, email: user.email, displayName: user.displayName, permissions: verified.permissions };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Session is invalid or expired');
    }
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !hasPermission(request.user.permissions, required)) throw new ForbiddenException(`Permission required: ${required}`);
    return true;
  }
}
