import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('adds using integer minor units', () => {
    expect(Money.from('0.10').add(Money.from('0.20')).toString()).toBe('0.30 NZD');
  });

  it('rejects excess precision', () => {
    expect(() => Money.from('1.001')).toThrow(/two decimal/);
  });

  it('rejects mixed currencies', () => {
    expect(() => Money.from('1.00', 'NZD').add(Money.from('1.00', 'AUD'))).toThrow(/Currency mismatch/);
  });

  it('allocates cents without losing value', () => {
    const parts = Money.from('10.00').allocate(3);
    expect(parts.map(String)).toEqual(['3.34 NZD', '3.33 NZD', '3.33 NZD']);
  });
});
