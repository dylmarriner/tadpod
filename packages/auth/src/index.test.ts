import { describe, expect, it } from 'vitest';
import {
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  hasPermission,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword
} from './index.js';

const secret = 'a-very-long-tadpods-test-secret-value';

describe('passwords', () => {
  it('hashes and verifies an Argon2id password', async () => {
    const hash = await hashPassword('Correct-Horse-123!');
    await expect(verifyPassword(hash, 'Correct-Horse-123!')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'Incorrect-Horse-123!')).resolves.toBe(false);
  });
});

describe('access tokens', () => {
  it('issues a fifteen-minute TADPODS token', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const token = await issueAccessToken({ userId: 'user-1', sessionId: 'session-1', permissions: ['sales.read'] }, secret, now);
    await expect(verifyAccessToken(token, secret, new Date('2026-08-05T00:14:59.000Z'))).resolves.toMatchObject({
      userId: 'user-1',
      sessionId: 'session-1',
      permissions: ['sales.read']
    });
    await expect(verifyAccessToken(token, secret, new Date('2026-08-05T00:15:01.000Z'))).rejects.toThrow();
  });
});

describe('refresh tokens and permissions', () => {
  it('creates non-recoverable refresh-token hashes', () => {
    const token = createRefreshToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashRefreshToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defaults to deny and honours administrator wildcard access', () => {
    expect(hasPermission([], 'admin.users')).toBe(false);
    expect(hasPermission(['sales.read'], 'sales.read')).toBe(true);
    expect(hasPermission(['*'], 'admin.users')).toBe(true);
  });
});
