import { describe, expect, it } from 'vitest';
import { formatDocumentNumber } from './index.js';

describe('formatDocumentNumber', () => {
  it('formats a padded TADPODS sequence', () => {
    expect(formatDocumentNumber('SO-', 42n, 6)).toBe('SO-000042');
  });

  it('rejects invalid sequence data', () => {
    expect(() => formatDocumentNumber('', 1n, 6)).toThrow(/prefix/);
    expect(() => formatDocumentNumber('SO-', 0n, 6)).toThrow(/positive/);
  });
});
