export class Money {
  readonly minorUnits: bigint;
  readonly currency: string;

  private constructor(minorUnits: bigint, currency: string) {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter ISO code');
    this.minorUnits = minorUnits;
    this.currency = currency;
  }

  static from(value: string | bigint, currency = 'NZD'): Money {
    if (typeof value === 'bigint') return new Money(value, currency);
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) throw new Error('Money must contain no more than two decimal places');
    const sign = match[1] === '-' ? -1n : 1n;
    const whole = BigInt(match[2] ?? '0');
    const fraction = BigInt((match[3] ?? '').padEnd(2, '0'));
    return new Money(sign * (whole * 100n + fraction), currency);
  }

  add(other: Money): Money {
    this.assertCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  allocate(parts: number): Money[] {
    if (!Number.isSafeInteger(parts) || parts < 1) throw new Error('Allocation parts must be a positive integer');
    const divisor = BigInt(parts);
    const base = this.minorUnits / divisor;
    let remainder = this.minorUnits % divisor;
    return Array.from({ length: parts }, () => {
      const adjustment = remainder > 0n ? 1n : remainder < 0n ? -1n : 0n;
      remainder -= adjustment;
      return new Money(base + adjustment, this.currency);
    });
  }

  isNegative(): boolean { return this.minorUnits < 0n; }
  isZero(): boolean { return this.minorUnits === 0n; }

  toDecimalString(): string {
    const negative = this.minorUnits < 0n;
    const absolute = negative ? -this.minorUnits : this.minorUnits;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  toString(): string { return `${this.toDecimalString()} ${this.currency}`; }

  private assertCurrency(other: Money): void {
    if (this.currency !== other.currency) throw new Error(`Currency mismatch: ${this.currency} and ${other.currency}`);
  }
}
