import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './outbox-worker.js';

describe('retryDelayMs', () => {
  it('uses bounded exponential backoff', () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(5)).toBe(16_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });

  it('rejects invalid attempts', () => {
    expect(() => retryDelayMs(0)).toThrow(/positive integer/);
  });
});
