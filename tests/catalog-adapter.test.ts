import { describe, expect, it } from 'vitest';
import { mapErdbCatalog } from '../src/lib/catalog';

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
