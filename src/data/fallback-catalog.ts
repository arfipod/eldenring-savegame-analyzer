import type { SemanticCatalog } from '../types';

/**
 * Tiny built-in safety net. The full semantic catalog is loaded from pinned,
 * MIT-licensed data files. These entries keep the UI useful when offline.
 */
export const fallbackCatalog: SemanticCatalog = {
  inventory: {
    armament: {
      '007A8730': { name: "Bloodhound's Fang", class: 'Curved Greatsword', source: 'fallback' },
      '003D0900': { name: 'Greatsword', class: 'Colossal Sword', source: 'fallback' },
      '016E8420': { name: 'Steel-Wire Torch', class: 'Torch', source: 'fallback' },
      '01CBE660': { name: 'Ice Crest Shield', class: 'Shield', source: 'fallback' },
      '020768C0': { name: 'Clawmark Seal', class: 'Sacred Seal', source: 'fallback' },
    },
    armor: {
      '10072BF0': { name: "Radahn's Redmane Helm", class: 'Head', source: 'fallback' },
      '100D46D4': { name: 'Land of Reeds Armor', class: 'Chest', source: 'fallback' },
      '10030E08': { name: 'Banished Knight Gauntlets', class: 'Arms', source: 'fallback' },
      '100D479C': { name: 'Land of Reeds Greaves', class: 'Legs', source: 'fallback' },
    },
    talisman: {
      '200003E8': { name: 'Crimson Amber Medallion', source: 'fallback' },
      '20000406': { name: 'Arsenal Charm', source: 'fallback' },
      '20000424': { name: 'Starscourge Heirloom', source: 'fallback' },
      '2000100E': { name: 'Crucible Knot Talisman', source: 'fallback' },
    },
    magic: {
      '40001915': { name: 'Heal', category: 'Incantation', source: 'fallback' },
      '4000193C': { name: 'Magic Fortification', category: 'Incantation', source: 'fallback' },
      '40001C8E': { name: 'The Flame of Frenzy', category: 'Incantation', source: 'fallback' },
      '400017A2': { name: 'Flame, Grant Me Strength', category: 'Incantation', source: 'fallback' },
    },
    crystal_tears: {
      '40002AFA': { name: 'Crimson Crystal Tear', source: 'fallback' },
      '40002B0E': { name: 'Dexterity-knot Crystal Tear', source: 'fallback' },
    },
  },
  bosses: {
    '10000800': { name: 'Godrick the Grafted', source: 'fallback' },
    '10000850': { name: 'Margit, the Fell Omen', source: 'fallback' },
    '14000800': { name: 'Rennala, Queen of the Full Moon', source: 'fallback' },
    '14000850': { name: 'Red Wolf of Radagon', source: 'fallback' },
  },
  graces: {},
  cookbooks: {},
  bellBearings: {},
  whetblades: {},
  eventFlagBst: {},
  graceEntities: {
    '11002959': 'Leyndell, Royal Capital — Divine Bridge',
    '14002950': 'Academy of Raya Lucaria — Raya Lucaria Grand Library',
    '14002951': 'Academy of Raya Lucaria — Debate Parlor',
  },
  loadedSources: ['fallback integrado'],
  warnings: [],
};

export const STARTING_CLASSES: Record<number, string> = {
  0: 'Vagabond',
  1: 'Warrior',
  2: 'Hero',
  3: 'Bandit',
  4: 'Astrologer',
  5: 'Prophet',
  6: 'Samurai',
  7: 'Prisoner',
  8: 'Confessor',
  9: 'Wretch',
};
