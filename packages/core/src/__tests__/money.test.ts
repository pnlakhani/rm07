import { describe, expect, it } from 'vitest';
import { formatPaise, paiseToRupees, rupeesToPaise, money } from '../money.js';
import { PLANS } from '../constants/plans.js';

describe('money helpers', () => {
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(999)).toBe(99900n);
    expect(rupeesToPaise(499.99)).toBe(49999n);
    expect(rupeesToPaise(0.1)).toBe(10n);
  });

  it('round-trips paise to rupees', () => {
    expect(paiseToRupees(99900n)).toBe(999);
  });

  it('formats paise in Indian locale', () => {
    expect(formatPaise(99900n)).toBe('₹999.00');
    expect(formatPaise(2999_00n)).toBe('₹2,999.00');
    expect(formatPaise(-5050n)).toBe('-₹50.50');
  });

  it('constructs a Money value', () => {
    expect(money(99900n)).toEqual({ paise: 99900n, currency: 'INR' });
  });
});

describe('locked pricing (Hard rule #1)', () => {
  it('keeps Pro at ₹999/month', () => {
    expect(PLANS.pro.pricing.monthlyPaise).toBe(99900n);
  });
  it('keeps Basic at ₹499 and Elite at ₹2,999', () => {
    expect(PLANS.basic.pricing.monthlyPaise).toBe(49900n);
    expect(PLANS.elite.pricing.monthlyPaise).toBe(299900n);
  });
  it('gates AI Mode off on Free', () => {
    expect(PLANS.free.entitlements.aiModeHoldings).toBe(false);
  });
});
