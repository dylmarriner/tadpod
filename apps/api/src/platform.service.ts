import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createRefreshToken, hashPassword, hashRefreshToken, issueAccessToken, verifyPassword } from '@tadpods/auth';
import type { AppEnvironment } from '@tadpods/config';
import type { BrandSettingsInput, SessionUser } from '@tadpods/contracts';
import { database, formatDocumentNumber, Prisma, withTransaction, type UserStatus } from '@tadpods/database';
import { APP_ENVIRONMENT } from './platform.tokens.js';

export type RequestContext = {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
};

export type LoginResult = {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  refreshSessionId: string;
};

type UserWithPermissions = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true;
              };
            };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class PlatformService {
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment) {}

  async login(email: string, password: string, context: RequestContext): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.findUserWithPermissions(normalizedEmail);
    if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const refreshToken = createRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const refreshSession = await withTransaction(async (transaction) => {
      const active = await transaction.user.updateMany({
        where: { id: user.id, status: 'ACTIVE' },
        data: { lastLoginAt: new Date() }
      });
      if (active.count !== 1) throw new UnauthorizedException('Account is not active');

      const session = await transaction.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ...this.sessionMetadata(context)
        }
      });
      await transaction.auditLog.create({
        data: this.auditData('auth.login', 'User', user.id, { sessionId: session.id }, { ...context, userId: user.id })
      });
      return session;
    });

    const sessionUser = this.toSessionUser(user);
    const accessToken = await issueAccessToken(
      { userId: user.id, sessionId: refreshSession.id, permissions: sessionUser.permissions },
      this.environment.authSecret
    );
    return { user: sessionUser, accessToken, refreshToken, refreshSessionId: refreshSession.id };
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<LoginResult> {
    const oldHash = hashRefreshToken(refreshToken);
    const replacementToken = createRefreshToken();
    const replacementHash = hashRefreshToken(replacementToken);

    const result = await withTransaction(async (transaction) => {
      const session = await transaction.refreshSession.findUnique({
        where: { tokenHash: oldHash },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: { permission: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Refresh session is invalid or expired');
      }

      const revoked = await transaction.refreshSession.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), lastUsedAt: new Date() }
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Refresh session has already been used');

      const replacement = await transaction.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: replacementHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ...this.sessionMetadata(context)
        }
      });
      await transaction.auditLog.create({
        data: this.auditData(
          'auth.refresh',
          'RefreshSession',
          replacement.id,
          { replacedSessionId: session.id },
          { ...context, userId: session.userId }
        )
      });
      return { user: session.user, replacement };
    });

    const sessionUser = this.toSessionUser(result.user);
    const accessToken = await issueAccessToken(
      { userId: result.user.id, sessionId: result.replacement.id, permissions: sessionUser.permissions },
      this.environment.authSecret
    );
    return {
      user: sessionUser,
      accessToken,
      refreshToken: replacementToken,
      refreshSessionId: result.replacement.id
    };
  }

  async logout(refreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashRefreshToken(refreshToken);
    await withTransaction(async (transaction) => {
      const session = await transaction.refreshSession.findUnique({ where: { tokenHash } });
      if (!session) return;
      await transaction.refreshSession.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() }
      });
      await transaction.auditLog.create({
        data: this.auditData('auth.logout', 'RefreshSession', session.id, {}, { ...context, userId: session.userId })
      });
    });
  }

  getBrand() {
    return database.brandSettings.findUniqueOrThrow({ where: { singletonKey: 'default' } });
  }

  async updateBrand(input: BrandSettingsInput, context: RequestContext) {
    return withTransaction(async (transaction) => {
      const updated = await transaction.brandSettings.update({
        where: { singletonKey: 'default' },
        data: { ...input, ...(context.userId ? { updatedById: context.userId } : {}) }
      });
      await transaction.auditLog.create({
        data: this.auditData('brand.update', 'BrandSettings', 'default', { displayName: updated.displayName }, context)
      });
      return updated;
    });
  }

  async dashboard(): Promise<Record<string, number>> {
    const [users, activeSessions, pendingEvents, failedEvents, auditEvents] = await Promise.all([
      database.user.count(),
      database.refreshSession.count({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() } } }),
      database.outboxEvent.count({ where: { status: 'PENDING' } }),
      database.outboxEvent.count({ where: { status: 'FAILED' } }),
      database.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    ]);
    return { users, activeSessions, pendingEvents, failedEvents, auditEventsLast24Hours: auditEvents };
  }

  listUsers(search?: string): Promise<Array<{
    id: string;
    email: string;
    displayName: string;
    status: UserStatus;
    roles: string[];
    createdAt: Date;
  }>> {
    return database.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search.toLowerCase(), mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } }
            ]
          }
        : undefined,
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
      include: { roles: { include: { role: true } } }
    }).then((users) => users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: user.roles.map(({ role }) => role.key),
      createdAt: user.createdAt
    })));
  }

  async createUser(input: { email: string; displayName: string; password: string; roleKeys: string[] }, context: RequestContext) {
    const email = input.email.trim().toLowerCase();
    const existing = await database.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const uniqueRoleKeys = [...new Set(input.roleKeys)];
    const roles = await database.role.findMany({ where: { key: { in: uniqueRoleKeys } } });
    if (roles.length !== uniqueRoleKeys.length) throw new BadRequestException('One or more roles do not exist');
    const passwordHash = await hashPassword(input.password);

    return withTransaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email,
          displayName: input.displayName.trim(),
          passwordHash,
          roles: { create: roles.map((role) => ({ roleId: role.id })) }
        },
        select: { id: true, email: true, displayName: true, status: true, createdAt: true }
      });
      await transaction.auditLog.create({
        data: this.auditData('user.create', 'User', user.id, { email: user.email, roles: uniqueRoleKeys }, context)
      });
      return user;
    });
  }

  async setUserRoles(userId: string, roleKeys: string[], context: RequestContext): Promise<void> {
    const user = await database.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });
    if (!user) throw new NotFoundException('User not found');

    const uniqueKeys = [...new Set(roleKeys)];
    const roles = await database.role.findMany({ where: { key: { in: uniqueKeys } } });
    if (roles.length !== uniqueKeys.length) throw new BadRequestException('One or more roles do not exist');

    const removingAdministrator = user.roles.some(({ role }) => role.key === 'administrator') && !uniqueKeys.includes('administrator');
    if (removingAdministrator) {
      const activeAdministrators = await database.user.count({
        where: { status: 'ACTIVE', roles: { some: { role: { key: 'administrator' } } } }
      });
      if (activeAdministrators <= 1) {
        throw new BadRequestException('The final active administrator cannot lose administrator access');
      }
    }

    await withTransaction(async (transaction) => {
      await transaction.userRole.deleteMany({ where: { userId } });
      await transaction.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
        skipDuplicates: true
      });
      await transaction.user.update({ where: { id: userId }, data: { version: { increment: 1 } } });
      await transaction.auditLog.create({
        data: this.auditData('user.roles.update', 'User', userId, { roles: uniqueKeys }, context)
      });
    });
  }

  listRoles() {
    return database.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } }
      }
    }).then((roles) => roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      system: role.system,
      userCount: role._count.users,
      permissions: role.permissions.map(({ permission }) => permission.key).sort()
    })));
  }

  async setRolePermissions(roleId: string, permissionKeys: string[], context: RequestContext): Promise<void> {
    const role = await database.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.key === 'administrator' && !permissionKeys.includes('*')) {
      throw new BadRequestException('Administrator must retain full system access');
    }

    const uniqueKeys = [...new Set(permissionKeys)];
    const permissions = await database.permission.findMany({ where: { key: { in: uniqueKeys } } });
    if (permissions.length !== uniqueKeys.length) throw new BadRequestException('One or more permissions do not exist');

    await withTransaction(async (transaction) => {
      await transaction.rolePermission.deleteMany({ where: { roleId } });
      await transaction.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
        skipDuplicates: true
      });
      await transaction.auditLog.create({
        data: this.auditData('role.permissions.update', 'Role', roleId, { permissions: uniqueKeys }, context)
      });
    });
  }

  listAudit(search?: string) {
    return database.auditLog.findMany({
      where: search
        ? {
            OR: [
              { action: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } }
            ]
          }
        : undefined,
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } }
    });
  }

  async nextSequence(key: string, idempotencyKey: string | undefined, context: RequestContext): Promise<{ number: string }> {
    const scope = `document-sequence:${key}`;
    return withTransaction(async (transaction) => {
      if (idempotencyKey) {
        const existing = await transaction.idempotencyKey.findUnique({
          where: { scope_key: { scope, key: idempotencyKey } }
        });
        const body = existing?.responseBody;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const number = (body as Record<string, unknown>).number;
          if (typeof number === 'string') return { number };
        }
      }

      const rows = await transaction.$queryRaw<Array<{ prefix: string; value: bigint; padding: number }>>`
        UPDATE "DocumentSequence"
        SET "nextValue" = "nextValue" + 1, "updatedAt" = NOW()
        WHERE "key" = ${key}
        RETURNING "prefix", "nextValue" - 1 AS "value", "padding"
      `;
      const row = rows[0];
      if (!row) throw new NotFoundException('Document sequence not found');

      const response = { number: formatDocumentNumber(row.prefix, row.value, row.padding) };
      if (idempotencyKey) {
        await transaction.idempotencyKey.create({
          data: {
            scope,
            key: idempotencyKey,
            requestHash: createHash('sha256').update(`${scope}:${idempotencyKey}`).digest('hex'),
            responseStatus: 201,
            responseBody: response,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });
      }
      await transaction.auditLog.create({
        data: this.auditData('document-sequence.next', 'DocumentSequence', key, response, context)
      });
      return response;
    });
  }

  private findUserWithPermissions(email: string): Promise<UserWithPermissions | null> {
    return database.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });
  }

  private toSessionUser(user: UserWithPermissions): SessionUser {
    const permissions = [...new Set(
      user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key))
    )].sort();
    return { id: user.id, email: user.email, displayName: user.displayName, permissions };
  }

  private sessionMetadata(context: RequestContext): { userAgent?: string; ipAddress?: string } {
    return {
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {})
    };
  }

  private auditData(
    action: string,
    entityType: string,
    entityId: string | undefined,
    metadata: Prisma.InputJsonObject,
    context: RequestContext
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      action,
      entityType,
      metadata,
      requestId: context.requestId,
      ...(entityId ? { entityId } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userId ? { userId: context.userId } : {})
    };
  }
}
