import { describe, expect, it } from 'vitest';
import { fallbackCatalog } from '../src/data/fallback-catalog';

describe('fallback semantic catalog', () => {
  it('keeps the validated equipment IDs available offline', () => {
    expect(fallbackCatalog.inventory.armament?.['007A8730']?.name).toBe("Bloodhound's Fang");
    expect(fallbackCatalog.inventory.armor?.['10072BF0']?.name).toBe("Radahn's Redmane Helm");
    expect(fallbackCatalog.inventory.armor?.['100D479C']?.name).toBe('Land of Reeds Greaves');
    expect(fallbackCatalog.inventory.talisman?.['20000424']?.name).toBe('Starscourge Heirloom');
    expect(fallbackCatalog.inventory.talisman?.['2000100E']?.name).toBe('Crucible Knot Talisman');
  });
});
