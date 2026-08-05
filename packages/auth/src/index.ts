import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

const ACCESS_ISSUER = 'tadpods';
const ACCESS_AUDIENCE = 'tadpods-web';
const ACCESS_TOKEN_SECONDS = 15 * 60;
const encoder = new TextEncoder();

export type AccessTokenInput = {
  userId: string;
  sessionId: string;
  permissions: readonly string[];
};

export type VerifiedAccessToken = {
  userId: string;
  sessionId: string;
  permissions: string[];
  expiresAt: Date;
};

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 200) throw new Error('Password must contain between 12 and 200 characters');
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function issueAccessToken(input: AccessTokenInput, secret: string, now = new Date()): Promise<string> {
  assertSecret(secret);
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: input.sessionId, permissions: [...new Set(input.permissions)].sort() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer(ACCESS_ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_SECONDS)
    .sign(encoder.encode(secret));
}

export async function verifyAccessToken(token: string, secret: string, now = new Date()): Promise<VerifiedAccessToken> {
  assertSecret(secret);
  const result = await jwtVerify(token, encoder.encode(secret), {
    issuer: ACCESS_ISSUER,
    audience: ACCESS_AUDIENCE,
    algorithms: ['HS256'],
    currentDate: now
  });
  const payload = result.payload as JWTPayload & { sid?: unknown; permissions?: unknown };
  if (!payload.sub || typeof payload.sid !== 'string' || !Array.isArray(payload.permissions) || !payload.permissions.every((permission) => typeof permission === 'string') || typeof payload.exp !== 'number') {
    throw new Error('Access token payload is invalid');
  }
  return {
    userId: payload.sub,
    sessionId: payload.sid,
    permissions: payload.permissions,
    expiresAt: new Date(payload.exp * 1000)
  };
}

export function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  if (!token) throw new Error('Refresh token is required');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.includes('*') || granted.includes(required);
}

export function requirePermission(granted: readonly string[], required: string): void {
  if (!hasPermission(granted, required)) throw new Error(`Permission denied: ${required}`);
}

function assertSecret(secret: string): void {
  if (secret.length < 32) throw new Error('Authentication secret must contain at least 32 characters');
}
