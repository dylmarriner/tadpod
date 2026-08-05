import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './index.js';

describe('loadEnvironment', () => {
  it('applies TADPODS development defaults', () => {
    expect(loadEnvironment({ NODE_ENV: 'test' })).toMatchObject({
      appName: 'TADPODS',
      defaultCurrency: 'NZD',
      negativeStockEnabled: false
    });
  });

  it('parses explicit boolean values', () => {
    expect(loadEnvironment({ NODE_ENV: 'test', NEGATIVE_STOCK_ENABLED: 'true' }).negativeStockEnabled).toBe(true);
  });

  it('rejects a short production authentication secret', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production', AUTH_SECRET: 'short' })).toThrow(/32 characters/);
  });
});
