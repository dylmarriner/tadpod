import { describe, expect, it } from 'vitest';
import { Quantity } from './quantity.js';

describe('Quantity', () => {
  it('parses whole numbers at the default scale', () => {
    expect(Quantity.from('10').toDecimalString()).toBe('10.0000');
  });

  it('parses fractional units', () => {
    expect(Quantity.from('2.5').toDecimalString()).toBe('2.5000');
    expect(Quantity.from('0.125').toDecimalString()).toBe('0.1250');
  });

  it('rejects excess precision for the given scale', () => {
    expect(() => Quantity.from('1.00001')).toThrow(/decimal place/);
  });

  it('rejects malformed input', () => {
    expect(() => Quantity.from('abc')).toThrow(/decimal place/);
    expect(() => Quantity.from('1.2.3')).toThrow(/decimal place/);
  });

  it('adds using integer scaled units', () => {
    expect(Quantity.from('0.1').add(Quantity.from('0.2')).toDecimalString()).toBe('0.3000');
  });

  it('subtracts and supports negative results', () => {
    const result = Quantity.from('1').subtract(Quantity.from('2.5'));
    expect(result.toDecimalString()).toBe('-1.5000');
    expect(result.isNegative()).toBe(true);
  });

  it('negates a quantity', () => {
    expect(Quantity.from('3.25').negate().toDecimalString()).toBe('-3.2500');
  });

  it('treats zero as neither negative nor positive', () => {
    const zero = Quantity.from('0');
    expect(zero.isZero()).toBe(true);
    expect(zero.isNegative()).toBe(false);
    expect(zero.isPositive()).toBe(false);
  });

  it('parses signed zero as plain zero', () => {
    expect(Quantity.from('-0').isZero()).toBe(true);
    expect(Quantity.from('-0').isNegative()).toBe(false);
  });

  it('compares quantities deterministically', () => {
    expect(Quantity.from('1.5').compare(Quantity.from('1.5'))).toBe(0);
    expect(Quantity.from('1.4').compare(Quantity.from('1.5'))).toBe(-1);
    expect(Quantity.from('1.6').compare(Quantity.from('1.5'))).toBe(1);
    expect(Quantity.from('1.4').lessThan(Quantity.from('1.5'))).toBe(true);
    expect(Quantity.from('1.6').greaterThan(Quantity.from('1.5'))).toBe(true);
  });

  it('checks equality independent of trailing zero formatting', () => {
    expect(Quantity.from('1.5').equals(Quantity.from('1.5000'))).toBe(true);
  });

  it('aligns differing explicit scales for arithmetic and comparison', () => {
    const twoDp = Quantity.from('1.50', 2);
    const fourDp = Quantity.from('1.5000', 4);
    expect(twoDp.equals(fourDp)).toBe(true);
    expect(twoDp.add(fourDp).toDecimalString()).toBe('3.0000');
  });

  it('rejects reducing scale when precision would be lost', () => {
    const precise = Quantity.fromScaledUnits(12345n, 4); // 1.2345
    expect(() => precise.withScale(2)).toThrow(/losing precision/);
  });

  it('allows reducing scale when no precision is lost', () => {
    const wholeAtFourDp = Quantity.fromScaledUnits(15000n, 4); // 1.5000
    expect(wholeAtFourDp.withScale(1).toDecimalString()).toBe('1.5');
  });

  it('supports whole-unit-only quantities at scale zero', () => {
    const wholeOnly = Quantity.from('5', 0);
    expect(wholeOnly.toDecimalString()).toBe('5');
    expect(() => Quantity.from('5.5', 0)).toThrow(/decimal place/);
  });

  it('rejects an out-of-range scale', () => {
    expect(() => Quantity.from('1', -1)).toThrow(/scale must be an integer/);
    expect(() => Quantity.from('1', 9)).toThrow(/scale must be an integer/);
  });

  it('round-trips via fromScaledUnits', () => {
    expect(Quantity.fromScaledUnits(15000n, 4).toDecimalString()).toBe('1.5000');
  });
});
