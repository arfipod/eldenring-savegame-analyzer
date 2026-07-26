import { describe, expect, it } from 'vitest';
import { md5Hex } from '../src/lib/md5';

describe('md5Hex', () => {
  it('matches the standard empty-string vector', () => {
    expect(md5Hex(new Uint8Array())).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('matches the standard abc vector', () => {
    expect(md5Hex(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});
