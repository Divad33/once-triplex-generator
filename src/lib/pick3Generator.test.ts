import { describe, it, expect } from 'vitest';
import { GENERATION_COUNT, genNumbers, mod10, normalizeSeed, stepPattern } from './pick3Generator';

describe('mod10', () => {
  it('keeps non-negative numbers within 0-9', () => {
    expect(mod10(0)).toBe(0);
    expect(mod10(7)).toBe(7);
    expect(mod10(10)).toBe(0);
    expect(mod10(13)).toBe(3);
    expect(mod10(99)).toBe(9);
  });

  it('normalizes negative numbers to 0-9', () => {
    expect(mod10(-1)).toBe(9);
    expect(mod10(-7)).toBe(3);
    expect(mod10(-10)).toBe(0);
  });
});

describe('normalizeSeed', () => {
  it('removes all non-digit characters', () => {
    expect(normalizeSeed('1a2b3c')).toBe('123');
    expect(normalizeSeed('  4 5 6  ')).toBe('456');
    expect(normalizeSeed('123-456')).toBe('123');
  });

  it('truncates to the first 3 digits', () => {
    expect(normalizeSeed('123456789')).toBe('123');
  });

  it('handles empty and falsy input', () => {
    expect(normalizeSeed('')).toBe('');
    expect(normalizeSeed('---')).toBe('');
  });
});

describe('stepPattern', () => {
  it('cycles through the EXCEL 4/5/9 matrix correctly', () => {
    expect(stepPattern(0)).toEqual([4, 4, 4]);
    expect(stepPattern(1)).toEqual([4, 4, 5]);
    expect(stepPattern(2)).toEqual([4, 4, 9]);
    expect(stepPattern(3)).toEqual([4, 5, 4]);
    expect(stepPattern(4)).toEqual([4, 5, 5]);
    expect(stepPattern(8)).toEqual([4, 9, 9]);
    expect(stepPattern(9)).toEqual([5, 4, 4]);
    expect(stepPattern(13)).toEqual([5, 5, 5]);
    expect(stepPattern(18)).toEqual([9, 4, 4]);
    expect(stepPattern(26)).toEqual([9, 9, 9]);
  });

  it('produces 27 unique step patterns across i=0..26', () => {
    const patterns = new Set<string>();
    for (let i = 0; i < GENERATION_COUNT; i++) {
      patterns.add(stepPattern(i).join(','));
    }
    expect(patterns.size).toBe(27);
  });
});

describe('genNumbers', () => {
  it(`produces exactly ${GENERATION_COUNT} numbers`, () => {
    expect(genNumbers('000')).toHaveLength(GENERATION_COUNT);
    expect(genNumbers('123')).toHaveLength(GENERATION_COUNT);
    expect(genNumbers('999')).toHaveLength(GENERATION_COUNT);
  });

  it('always emits 3-digit strings', () => {
    for (const seed of ['000', '123', '555', '789', '999']) {
      for (const n of genNumbers(seed)) {
        expect(n).toMatch(/^\d{3}$/);
      }
    }
  });

  it('is deterministic: same seed yields the same sequence', () => {
    const a = genNumbers('123');
    const b = genNumbers('123');
    expect(a).toEqual(b);
  });

  it('first output equals the seed + first stepPattern (mod10) per position', () => {
    const seed = '123';
    const out = genNumbers(seed);
    const [pa, pb, pc] = stepPattern(0);
    const expected = `${mod10(1 + pa)}${mod10(2 + pb)}${mod10(3 + pc)}`;
    expect(out[0]).toBe(expected);
  });

  it('matches the known sequence for seed "000"', () => {
    const out = genNumbers('000');
    expect(out[0]).toBe('444');
    expect(out[1]).toBe('889');
    expect(out[2]).toBe('228');
    // After 27 iterations, each position has accumulated 162 (9*4 + 9*5 + 9*9), mod10 = 2.
    expect(out[26]).toBe('222');
  });

  it('different seeds produce different sequences', () => {
    const a = genNumbers('000');
    const b = genNumbers('111');
    expect(a).not.toEqual(b);
  });
});
