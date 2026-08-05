const DEFAULT_SCALE = 4;
const MAX_SCALE = 8;

/**
 * Decimal-safe quantity primitive, mirroring the bigint-backed approach used by `Money`.
 * A `Quantity` stores its value as an integer count of `scaledUnits` at an explicit `scale`
 * (the number of decimal places represented), so fractional units (e.g. 2.5 kg, 0.125 L)
 * never round-trip through binary floating point.
 */
export class Quantity {
  readonly scaledUnits: bigint;
  readonly scale: number;

  private constructor(scaledUnits: bigint, scale: number) {
    if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
      throw new Error(`Quantity scale must be an integer between 0 and ${MAX_SCALE}`);
    }
    this.scaledUnits = scaledUnits;
    this.scale = scale;
  }

  static zero(scale: number = DEFAULT_SCALE): Quantity {
    return new Quantity(0n, scale);
  }

  static fromScaledUnits(scaledUnits: bigint, scale: number = DEFAULT_SCALE): Quantity {
    return new Quantity(scaledUnits, scale);
  }

  static from(value: string, scale: number = DEFAULT_SCALE): Quantity {
    if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
      throw new Error(`Quantity scale must be an integer between 0 and ${MAX_SCALE}`);
    }
    const fractionPattern = scale > 0 ? `(?:\\.(\\d{1,${scale}}))?` : '';
    const pattern = new RegExp(`^(-?)(\\d+)${fractionPattern}$`);
    const match = pattern.exec(value.trim());
    if (!match) throw new Error(`Quantity must contain no more than ${scale} decimal place(s)`);
    const sign = match[1] === '-' ? -1n : 1n;
    const whole = BigInt(match[2] ?? '0');
    const fractionDigits = (match[3] ?? '').padEnd(scale, '0');
    const fraction = fractionDigits.length > 0 ? BigInt(fractionDigits) : 0n;
    const multiplier = 10n ** BigInt(scale);
    const scaledUnits = sign * (whole * multiplier + fraction);
    if (scaledUnits === 0n) return new Quantity(0n, scale);
    return new Quantity(scaledUnits, scale);
  }

  /** Re-express this quantity's scaled units at a different scale, rejecting lossy reductions. */
  private alignedUnits(targetScale: number): bigint {
    if (targetScale === this.scale) return this.scaledUnits;
    if (targetScale > this.scale) {
      return this.scaledUnits * 10n ** BigInt(targetScale - this.scale);
    }
    const divisor = 10n ** BigInt(this.scale - targetScale);
    if (this.scaledUnits % divisor !== 0n) {
      throw new Error('Cannot reduce quantity scale without losing precision');
    }
    return this.scaledUnits / divisor;
  }

  private commonScale(other: Quantity): number {
    return Math.max(this.scale, other.scale);
  }

  add(other: Quantity): Quantity {
    const scale = this.commonScale(other);
    return new Quantity(this.alignedUnits(scale) + other.alignedUnits(scale), scale);
  }

  subtract(other: Quantity): Quantity {
    const scale = this.commonScale(other);
    return new Quantity(this.alignedUnits(scale) - other.alignedUnits(scale), scale);
  }

  negate(): Quantity {
    return new Quantity(-this.scaledUnits, this.scale);
  }

  /** Re-express this quantity at a different explicit scale, rejecting reductions that would lose precision. */
  withScale(targetScale: number): Quantity {
    if (!Number.isInteger(targetScale) || targetScale < 0 || targetScale > MAX_SCALE) {
      throw new Error(`Quantity scale must be an integer between 0 and ${MAX_SCALE}`);
    }
    return new Quantity(this.alignedUnits(targetScale), targetScale);
  }

  /** Deterministic three-way comparison: -1 if this < other, 0 if equal, 1 if this > other. */
  compare(other: Quantity): -1 | 0 | 1 {
    const scale = this.commonScale(other);
    const a = this.alignedUnits(scale);
    const b = other.alignedUnits(scale);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  equals(other: Quantity): boolean {
    return this.compare(other) === 0;
  }

  lessThan(other: Quantity): boolean {
    return this.compare(other) < 0;
  }

  greaterThan(other: Quantity): boolean {
    return this.compare(other) > 0;
  }

  isNegative(): boolean {
    return this.scaledUnits < 0n;
  }

  isZero(): boolean {
    return this.scaledUnits === 0n;
  }

  isPositive(): boolean {
    return this.scaledUnits > 0n;
  }

  toDecimalString(): string {
    const negative = this.scaledUnits < 0n;
    const absolute = negative ? -this.scaledUnits : this.scaledUnits;
    const multiplier = 10n ** BigInt(this.scale);
    const whole = absolute / multiplier;
    if (this.scale === 0) return `${negative ? '-' : ''}${whole}`;
    const fraction = (absolute % multiplier).toString().padStart(this.scale, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  toString(): string {
    return this.toDecimalString();
  }
}
