import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { database } from '@tadpods/database';
import { brandSettingsSchema, emailSchema, loginRequestSchema, passwordSchema } from '@tadpods/contracts';
import { CurrentUser, Public, RequirePermission, type AuthenticatedUser } from './platform.decorators.js';
import { PlatformService, type RequestContext } from './platform.service.js';

const userInputSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  roleKeys: z.array(z.string().min(1)).max(20)
});
const rolesInputSchema = z.object({ roleKeys: z.array(z.string().min(1)).max(20) });
const permissionsInputSchema = z.object({ permissionKeys: z.array(z.string().min(1)).max(100) });

function contextFrom(request: FastifyRequest, userId?: string): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
    ...(userId ? { userId } : {})
  };
}

function cookieOptions(secure: boolean, path = '/') {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path };
}

@Controller()
export class HealthController {
  /** Liveness: the process is up and can answer HTTP requests. Never checks dependencies. */
  @Get('health')
  @Public()
  health() {
    return { status: 'ok', service: 'TADPODS API', timestamp: new Date().toISOString() };
  }

  /** Readiness: the process can actually serve traffic — specifically, the database is reachable. */
  @Get('ready')
  @Public()
  async ready() {
    try {
      await database.$queryRaw`SELECT 1`;
      return { status: 'ready', service: 'TADPODS API', timestamp: new Date().toISOString() };
    } catch (error) {
      throw new ServiceUnavailableException({ status: 'not-ready', reason: error instanceof Error ? error.message : 'Database is unreachable' });
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly platform: PlatformService) {}

  @Post('login')
  @Public()
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const input = loginRequestSchema.parse(body);
    const result = await this.platform.login(input.email, input.password, contextFrom(request));
    this.setSessionCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const token = request.cookies?.tadpods_refresh;
    if (!token) {
      return response.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Refresh session is missing',
        requestId: request.id
      });
    }
    const result = await this.platform.refresh(token, contextFrom(request));
    this.setSessionCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('logout')
  @Public()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    await this.platform.logout(request.cookies?.tadpods_refresh, contextFrom(request));
    response.clearCookie('tadpods_access', { path: '/' });
    response.clearCookie('tadpods_refresh', { path: '/auth' });
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  private setSessionCookies(response: FastifyReply, accessToken: string, refreshToken: string): void {
    const secure = process.env.NODE_ENV === 'production';
    response.setCookie('tadpods_access', accessToken, {
      ...cookieOptions(secure),
      maxAge: 15 * 60
    });
    response.setCookie('tadpods_refresh', refreshToken, {
      ...cookieOptions(secure, '/auth'),
      maxAge: 30 * 24 * 60 * 60
    });
  }
}

@Controller('brand')
export class BrandController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @Public()
  get() {
    return this.platform.getBrand();
  }

  @Patch()
  @RequirePermission('admin.brand')
  update(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platform.updateBrand(
      brandSettingsSchema.parse(body),
      contextFrom(request, user.id)
    );
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  get() {
    return this.platform.dashboard();
  }
}

@Controller('users')
@RequirePermission('admin.users')
export class UsersController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.platform.listUsers(search);
  }

  @Post()
  create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platform.createUser(
      userInputSchema.parse(body),
      contextFrom(request, user.id)
    );
  }

  @Patch(':id/roles')
  setRoles(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platform
      .setUserRoles(id, rolesInputSchema.parse(body).roleKeys, contextFrom(request, user.id))
      .then(() => ({ success: true }));
  }
}

@Controller('roles')
@RequirePermission('admin.roles')
export class RolesController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listRoles();
  }

  @Patch(':id/permissions')
  setPermissions(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platform
      .setRolePermissions(
        id,
        permissionsInputSchema.parse(body).permissionKeys,
        contextFrom(request, user.id)
      )
      .then(() => ({ success: true }));
  }
}

@Controller('audit')
@RequirePermission('audit.read')
export class AuditController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.platform.listAudit(search);
  }
}

@Controller('document-sequences')
@RequirePermission('admin.roles')
export class SequenceController {
  constructor(private readonly platform: PlatformService) {}

  @Post(':key/next')
  next(
    @Param('key') key: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.platform.nextSequence(
      key,
      idempotencyKey,
      contextFrom(request, user.id)
    );
  }
}
