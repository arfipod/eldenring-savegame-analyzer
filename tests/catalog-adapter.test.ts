import { describe, expect, it } from 'vitest';
import { decodeCatalogText, mapErdbCatalog } from '../src/lib/catalog';

describe('ERDB catalog adapter', () => {
  it('normalizes enriched item data by uppercase game ID', () => {
    const mapped = mapErdbCatalog({
      sample: {
        full_hex_id: '4000271a',
        name: 'Golden Seed',
        summary: "Increases Sacred Flask's number of uses",
        description: ['A golden seed.'],
        category: 'Flask',
        rarity: 'Rare',
        max_held: 99,
        max_stored: 600,
      },
    });

    expect(mapped['4000271A']?.name).toBe('Golden Seed');
    expect(mapped['4000271A']?.category).toBe('Flask');
    expect(mapped['4000271A']?.maxHeld).toBe(99);
    expect(mapped['4000271A']?.maxStored).toBe(600);
  });
});

describe('catalog text decoding', () => {
  it('decodes UTF-8 and UTF-16LE catalog JSON', () => {
    const json = '{"graces":{"71002":{"name":"Castleward Tunnel"}}}';
    const utf8 = new TextEncoder().encode(json);
    const utf16Body = new Uint8Array(json.length * 2);
    for (let index = 0; index < json.length; index += 1) {
      const code = json.charCodeAt(index);
      utf16Body[index * 2] = code & 0xff;
      utf16Body[index * 2 + 1] = code >>> 8;
    }
    const utf16 = new Uint8Array(utf16Body.length + 2);
    utf16.set([0xff, 0xfe]);
    utf16.set(utf16Body, 2);

    expect(JSON.parse(decodeCatalogText(utf8))).toEqual(JSON.parse(json));
    expect(JSON.parse(decodeCatalogText(utf16))).toEqual(JSON.parse(json));
  });

  it('rejects truncated UTF-16 catalog data', () => {
    expect(() => decodeCatalogText(new Uint8Array([0xff, 0xfe, 0x7b]))).toThrow(/UTF-16LE/);
  });
});
