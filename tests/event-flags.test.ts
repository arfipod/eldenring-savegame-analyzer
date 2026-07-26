import { describe, expect, it } from 'vitest';
import { isEventFlagSet } from '../src/lib/semantic';

describe('event flag lookup', () => {
  it('uses the game BST block mapping and MSB-first bit order', () => {
    const bytes = new Uint8Array(300);
    // event 123045 -> BST block 2 -> 2*125 + floor(45/8) = byte 255,
    // and bit 7-(45%8) = bit 2.
    bytes[255] = 1 << 2;
    const map = { '123': 2 };
    expect(isEventFlagSet(bytes, 123_045, map)).toBe(true);
    expect(isEventFlagSet(bytes, 123_044, map)).toBe(false);
  });

  it('returns null for unknown or out-of-range blocks', () => {
    expect(isEventFlagSet(new Uint8Array(8), 999_001, {})).toBeNull();
    expect(isEventFlagSet(new Uint8Array(8), 123_045, { '123': 2 })).toBeNull();
  });
});
