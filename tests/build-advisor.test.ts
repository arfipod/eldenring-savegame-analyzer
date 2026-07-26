import { describe, expect, it } from 'vitest';
import { runeCostForNextLevel, runesBetweenLevels } from '../src/lib/build-advisor';

describe('rune level curve', () => {
  it('returns known costs for representative levels', () => {
    expect(runeCostForNextLevel(1)).toBe(673);
    expect(runeCostForNextLevel(50)).toBe(15_102);
    expect(runeCostForNextLevel(84)).toBe(42_472);
    expect(runeCostForNextLevel(100)).toBe(61_591);
  });

  it('sums a target range and rejects downward ranges', () => {
    expect(runesBetweenLevels(84, 94)).toBe(474_750);
    expect(runesBetweenLevels(84, 84)).toBe(0);
    expect(runesBetweenLevels(84, 50)).toBe(0);
  });
});
