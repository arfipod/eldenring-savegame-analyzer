import { describe, expect, it } from 'vitest';
import { buildForensicExport, buildMarkdownReport, buildSemanticExport } from '../src/lib/export';
import type { ParsedSave, SemanticCatalog, SemanticSlot } from '../src/types';

const catalog: SemanticCatalog = {
  inventory: {}, bosses: {}, graces: {}, cookbooks: {}, bellBearings: {}, whetblades: {},
  eventFlagBst: {}, graceEntities: {}, loadedSources: ['test'], warnings: [],
};

const raw = {
  slotIndex: 0,
  version: 252,
  steamId: '76561198000000001',
  player: { matchmakingWeaponLevel: 15 },
  gaItems: [],
  heldInventory: { commonDistinctCount: 0, commonItems: [], keyDistinctCount: 0, keyItems: [] },
  chestInventory: { commonDistinctCount: 0, commonItems: [], keyDistinctCount: 0, keyItems: [] },
  equipment: {},
  activeWeaponSlots: {},
  equippedSpells: [],
  quickAndPouch: { quickSlots: [], pouch: [] },
  equippedGestures: [],
  unlockedGestures: [],
  acquiredProjectiles: [],
  physickTearHandles: [0, 0],
  specialEffects: [],
  unlockedRegionIds: [1, 2],
  lastRestedGraceEntityId: 100,
  spawnPointEntityId: 200,
  playerPosition: { coords: [12.5, -3, 99], mapId: [0, 0, 0, 10], angle: [0, 0, 0, 1] },
  bloodstain: { coords: [10, 20, 30], mapId: [0, 0, 0, 10], runes: 42 },
  horse: { coords: [5, 6, 7], mapId: [0, 0, 0, 10], hp: 500, state: 1 },
  eventFlags: new Uint8Array([1, 2, 3]),
  opaqueSections: [{ name: 'test', offset: 1234, length: 20 }],
  integrity: { storedMd5Hex: '0123456789abcdef0123456789abcdef', computedMd5Hex: '0123456789abcdef0123456789abcdef', valid: true },
} as unknown as SemanticSlot['raw'];

const slot = {
  slotIndex: 0,
  identity: { name: 'Test', level: 10, playtimeSeconds: 3600, classCode: 0, className: 'Vagabond', genderCode: 0 },
  overview: {
    deaths: 3, currentRunes: 10, lifetimeRunes: 1000, bloodstainRunes: 42,
    crimsonFlasks: 4, ceruleanFlasks: 1, totalFlasks: 5, talismanSlots: 1,
    lastRestedGrace: 'Known Grace', mapLabel: 'Known Area', worldTime: '12:00:00', dlcOwned: false,
  },
  attributes: { vigor: 15, mind: 10, endurance: 11, strength: 14, dexterity: 13, intelligence: 9, faith: 9, arcane: 7 },
  vitals: {
    hp: { current: 500, max: 500, baseMax: 500 },
    fp: { current: 70, max: 70, baseMax: 70 },
    stamina: { current: 90, max: 90, baseMax: 90 },
  },
  build: { archetype: 'Fuerza / Destreza', summary: 'Test', primaryStats: ['strength'], levelEfficiency: 80, advice: [] },
  equipment: {
    rightHand: [], leftHand: [], armor: {} as never, talismans: [], quickSlots: [], pouch: [], physickTears: [], spells: [],
  },
  inventory: [],
  progress: {
    defeatedBosses: [], discoveredGraces: [], acquiredCookbooks: [], acquiredBellBearings: [], acquiredWhetblades: [],
    totals: { bossesKnown: 0, bossesDefeated: 0, gracesKnown: 0, gracesDiscovered: 0 },
  },
  raw,
} as SemanticSlot;

const save = {
  schemaVersion: '1.0.0', parserVersion: 'test',
  file: { name: 'ER0000.sl2', size: 28_000_000, lastModified: 0, magic: 'BND4', compatible: true },
  globalSteamId: '76561198000000000', profiles: [], slots: [raw], warnings: [],
} as ParsedSave;

describe('semantic export privacy', () => {
  it('redacts Steam ids, coordinates and raw flags by default', () => {
    const value = buildSemanticExport({
      save, slot, catalog, spoilerMode: 'safe',
      privacy: { includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false },
    });
    const text = JSON.stringify(value);
    expect(text).not.toContain('76561198000000000');
    expect(text).not.toContain('76561198000000001');
    expect(text).not.toContain('12.5');
    expect(text).not.toContain('AQID');
    expect(text).not.toContain('0123456789abcdef0123456789abcdef');
  });


  it('keeps the forensic export redacted unless sensitive fields are enabled', () => {
    const value = buildForensicExport({
      save, slot, catalog, spoilerMode: 'safe',
      privacy: { includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false },
    });
    const text = JSON.stringify(value);
    expect(text).not.toContain('76561198000000000');
    expect(text).not.toContain('76561198000000001');
    expect(text).not.toContain('12.5');
    expect(text).not.toContain('AQID');
    expect(text).not.toContain('0123456789abcdef0123456789abcdef');
    expect(text).toContain('coordinatesRedacted');
    expect(text).toContain('entriesRedacted');
  });



  it('redacts hexadecimal IDs embedded in unresolved semantic labels', () => {
    const unresolvedSlot = {
      ...slot,
      inventory: [{
        handle: 0xb0000001,
        rawItemId: 0x4eadbeef,
        baseItemId: 0x0eadbeef,
        hexId: 'DEADBEEF',
        name: 'ID 0xDEADBEEF',
        type: 'good',
        category: 'unknown',
        quantity: 1,
        upgradeLevel: 0,
        storage: 'held',
        keyItem: false,
        inventoryIndex: 0,
        equipped: false,
        confidence: 'raw-id-only',
      }],
    } as SemanticSlot;
    const privateContext = {
      save, slot: unresolvedSlot, catalog, spoilerMode: 'safe', language: 'es',
      privacy: { includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false },
    } as const;
    const privateJson = JSON.stringify(buildSemanticExport(privateContext));
    const privateMarkdown = buildMarkdownReport(privateContext);
    expect(privateJson).not.toContain('DEADBEEF');
    expect(privateMarkdown).not.toContain('DEADBEEF');
    expect(privateJson).toContain('Objeto o magia sin resolver');

    const optedInJson = JSON.stringify(buildSemanticExport({
      ...privateContext,
      privacy: { ...privateContext.privacy, includeRawInternalIds: true },
    }));
    expect(optedInJson).toContain('DEADBEEF');
  });

  it('enforces spoiler policy in JSON and Markdown exports', () => {
    const spoilerCatalog: SemanticCatalog = {
      ...catalog,
      bosses: { '1000': { name: 'Nombre de jefe futuro' } },
      eventFlagBst: { '1': 0 },
    };
    const base = {
      save, slot, catalog: spoilerCatalog, language: 'es',
      privacy: { includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false },
    } as const;

    const safeJson = JSON.stringify(buildSemanticExport({ ...base, spoilerMode: 'safe' }));
    const preciseJson = JSON.stringify(buildSemanticExport({ ...base, spoilerMode: 'precise' }));
    const completionJson = JSON.stringify(buildSemanticExport({ ...base, spoilerMode: 'completion' }));
    expect(safeJson).not.toContain('Nombre de jefe futuro');
    expect(preciseJson).not.toContain('Nombre de jefe futuro');
    expect(preciseJson).toContain('"bosses":1');
    expect(completionJson).toContain('Nombre de jefe futuro');

    const safeMarkdown = buildMarkdownReport({ ...base, spoilerMode: 'safe' });
    const preciseMarkdown = buildMarkdownReport({ ...base, spoilerMode: 'precise' });
    const completionMarkdown = buildMarkdownReport({ ...base, spoilerMode: 'completion' });
    expect(safeMarkdown).not.toContain('Nombre de jefe futuro');
    expect(preciseMarkdown).not.toContain('Nombre de jefe futuro');
    expect(preciseMarkdown).toContain('recuentos sin nombres');
    expect(completionMarkdown).toContain('Nombre de jefe futuro');
  });

  it('includes explicitly opted-in sensitive fields', () => {
    const value = buildSemanticExport({
      save, slot, catalog, spoilerMode: 'safe',
      privacy: { includeSteamIds: true, includeCoordinates: true, includeRawEventFlags: true, includeRawInternalIds: true },
    });
    const text = JSON.stringify(value);
    expect(text).toContain('76561198000000000');
    expect(text).toContain('12.5');
    expect(text).toContain('AQID');
    expect(text).toContain('0123456789abcdef0123456789abcdef');
  });

  it('localizes semantic and Markdown export prose', () => {
    const privacy = {
      includeSteamIds: false,
      includeCoordinates: false,
      includeRawEventFlags: false,
      includeRawInternalIds: false,
    };
    const englishContext = { save, slot, catalog, spoilerMode: 'safe', language: 'en', privacy } as const;
    const spanishContext = { ...englishContext, language: 'es' } as const;

    expect(JSON.stringify(buildSemanticExport(englishContext))).toContain('Structured data for human review');
    expect(buildMarkdownReport(englishContext)).toContain('# Elden Ring save report');
    expect(JSON.stringify(buildSemanticExport(spanishContext))).toContain('Datos estructurados para revisión humana');
    expect(buildMarkdownReport(spanishContext)).toContain('# Informe de partida de Elden Ring');
  });
});
