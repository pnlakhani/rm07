import { describe, expect, it } from 'vitest';
import { cn } from '../cn.js';

describe('cn', () => {
  it('merges and de-duplicates tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-white', false && 'hidden', 'font-medium')).toBe('text-white font-medium');
  });
});
