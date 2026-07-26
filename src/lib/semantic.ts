import type {
  CatalogInventoryCategory,
  CatalogItem,
  GaItem,
  ParsedSlot,
  ProgressEntry,
  ResolvedEquipment,
  ResolvedEquipmentItem,
  ResolvedInventoryItem,
  ResolvedItemType,
  SemanticCatalog,
  SemanticProgress,
  SemanticSlot,
} from '../types';
import { analyzeBuild, getStartingClassName } from './build-advisor';

const HANDLE_CLASS = {
  weapon: 0x80000000,
  armor: 0x90000000,
  talisman: 0xa0000000,
  good: 0xb0000000,
  ashOfWar: 0xc0000000,
} as const;

const GAME_ID_OFFSET = {
  armor: 0x10000000,
  talisman: 0x20000000,
  good: 0x40000000,
  ashOfWar: 0x80000000,
} as const;

const EMPTY_ITEM: ResolvedEquipmentItem = {
  handle: 0,
  rawItemId: 0,
  baseItemId: 0,
  name: 'Vacío',
  type: 'unknown',
  upgradeLevel: 0,
};

export function toHexId(value: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function itemLookupOrder(type: ResolvedItemType): CatalogInventoryCategory[] {
  switch (type) {
    case 'weapon':
      return ['armament'];
    case 'armor':
      return ['armor'];
    case 'talisman':
      return ['talisman'];
    case 'ashOfWar':
      return ['ashesOfWar'];
    case 'good':
      return ['crystal_tears', 'spiritAshes', 'magic', 'goods', 'tools', 'gestures'];
    default:
      return ['armament', 'armor', 'talisman', 'ashesOfWar', 'magic', 'spiritAshes', 'tools', 'crystal_tears', 'gestures', 'goods'];
  }
}

function findCatalogItem(
  catalog: SemanticCatalog,
  type: ResolvedItemType,
  candidates: number[],
): { item: CatalogItem; category: CatalogInventoryCategory; hexId: string } | null {
  const keys = candidates.map(toHexId);
  for (const category of itemLookupOrder(type)) {
    const map = catalog.inventory[category];
    if (!map) continue;
    for (const hexId of keys) {
      const item = map[hexId];
      if (item) return { item, category, hexId };
    }
  }
  return null;
}

interface HandleResolution {
  handle: number;
  rawItemId: number;
  baseItemId: number;
  hexId: string;
  name: string;
  type: ResolvedItemType;
  category: CatalogInventoryCategory;
  classification?: string;
  semanticSummary?: string;
  semanticDescription?: string[];
  hint?: string;
  rarity?: string;
  maxHeld?: number;
  maxStored?: number;
  upgradeLevel: number;
  ashOfWar?: { id: number; name: string };
  confidence: 'high' | 'medium' | 'raw-id-only';
}

function resolveAshOfWar(
  gemHandle: number,
  gaByHandle: Map<number, GaItem>,
  catalog: SemanticCatalog,
): { id: number; name: string } | undefined {
  if (!gemHandle) return undefined;
  const ga = gaByHandle.get(gemHandle);
  if (!ga) return { id: 0, name: `ID de ceniza ${toHexId(gemHandle)}` };
  const raw = ga.itemId >>> 0;
  const direct = (raw ^ GAME_ID_OFFSET.ashOfWar) >>> 0;
  const found = findCatalogItem(catalog, 'ashOfWar', [raw, (GAME_ID_OFFSET.ashOfWar | direct) >>> 0, direct]);
  return { id: direct, name: found?.item.name ?? `Ceniza 0x${toHexId(raw)}` };
}

function resolveHandle(
  handle: number,
  gaByHandle: Map<number, GaItem>,
  catalog: SemanticCatalog,
): HandleResolution {
  const unsignedHandle = handle >>> 0;
  if (unsignedHandle === 0 || unsignedHandle === 0xffff_ffff) {
    return {
      handle: unsignedHandle,
      rawItemId: 0,
      baseItemId: 0,
      hexId: '00000000',
      name: 'Vacío',
      type: 'unknown',
      category: 'unknown',
      upgradeLevel: 0,
      confidence: 'high',
    };
  }

  const handleClass = (unsignedHandle & 0xf0000000) >>> 0;
  const ga = gaByHandle.get(unsignedHandle);
  let type: ResolvedItemType = 'unknown';
  let rawItemId = unsignedHandle;
  let baseItemId = unsignedHandle;
  let upgradeLevel = 0;
  let candidates: number[] = [unsignedHandle];

  if (handleClass === HANDLE_CLASS.weapon) {
    type = 'weapon';
    rawItemId = ga?.itemId ?? 0;
    if (rawItemId === 110000) {
      return {
        handle: unsignedHandle,
        rawItemId,
        baseItemId: rawItemId,
        hexId: toHexId(rawItemId),
        name: 'Mano desnuda',
        type,
        category: 'armament',
        upgradeLevel: 0,
        confidence: 'high',
      };
    }
    upgradeLevel = rawItemId % 100;
    baseItemId = rawItemId - upgradeLevel;
    candidates = [baseItemId, rawItemId];
  } else if (handleClass === HANDLE_CLASS.armor) {
    type = 'armor';
    rawItemId = ga?.itemId ?? 0;
    baseItemId = (rawItemId ^ GAME_ID_OFFSET.armor) >>> 0;
    candidates = [rawItemId, (GAME_ID_OFFSET.armor | baseItemId) >>> 0, baseItemId];
  } else if (handleClass === HANDLE_CLASS.talisman) {
    type = 'talisman';
    baseItemId = (unsignedHandle ^ HANDLE_CLASS.talisman) >>> 0;
    rawItemId = (GAME_ID_OFFSET.talisman | baseItemId) >>> 0;
    candidates = [rawItemId, baseItemId, unsignedHandle];
  } else if (handleClass === HANDLE_CLASS.good) {
    type = 'good';
    baseItemId = (unsignedHandle ^ HANDLE_CLASS.good) >>> 0;
    rawItemId = (GAME_ID_OFFSET.good | baseItemId) >>> 0;
    candidates = [rawItemId, baseItemId, unsignedHandle];
  } else if (handleClass === HANDLE_CLASS.ashOfWar) {
    type = 'ashOfWar';
    rawItemId = ga?.itemId ?? unsignedHandle;
    baseItemId = (rawItemId ^ GAME_ID_OFFSET.ashOfWar) >>> 0;
    candidates = [rawItemId, (GAME_ID_OFFSET.ashOfWar | baseItemId) >>> 0, baseItemId];
  } else if (handleClass === GAME_ID_OFFSET.good) {
    type = 'good';
    rawItemId = unsignedHandle;
    baseItemId = (unsignedHandle ^ GAME_ID_OFFSET.good) >>> 0;
    candidates = [rawItemId, baseItemId];
  } else if (handleClass === GAME_ID_OFFSET.talisman) {
    type = 'talisman';
    rawItemId = unsignedHandle;
    baseItemId = (unsignedHandle ^ GAME_ID_OFFSET.talisman) >>> 0;
    candidates = [rawItemId, baseItemId];
  } else if (handleClass === GAME_ID_OFFSET.armor) {
    type = 'armor';
    rawItemId = unsignedHandle;
    baseItemId = (unsignedHandle ^ GAME_ID_OFFSET.armor) >>> 0;
    candidates = [rawItemId, baseItemId];
  } else if (handleClass === 0) {
    type = 'weapon';
    rawItemId = unsignedHandle;
    upgradeLevel = rawItemId % 100;
    baseItemId = rawItemId - upgradeLevel;
    candidates = [baseItemId, rawItemId];
  }

  const found = findCatalogItem(catalog, type, candidates);
  const labelId = candidates[0] ?? rawItemId;
  const ashOfWar = type === 'weapon' && ga ? resolveAshOfWar(ga.gemGaitemHandle, gaByHandle, catalog) : undefined;
  return {
    handle: unsignedHandle,
    rawItemId,
    baseItemId,
    hexId: found?.hexId ?? toHexId(labelId),
    name: found?.item.name ?? `ID 0x${toHexId(labelId)}`,
    type,
    category: found?.category ?? (type === 'good' ? 'goods' : type === 'unknown' ? 'unknown' : type === 'ashOfWar' ? 'ashesOfWar' : type === 'weapon' ? 'armament' : type),
    classification: found?.item.class ?? found?.item.category ?? found?.item.subcategory,
    semanticSummary: found?.item.summary,
    semanticDescription: found?.item.description,
    hint: found?.item.hint,
    rarity: found?.item.rarity,
    maxHeld: found?.item.maxHeld,
    maxStored: found?.item.maxStored,
    upgradeLevel,
    ashOfWar,
    confidence: found ? 'high' : type === 'unknown' ? 'raw-id-only' : 'medium',
  };
}

function toEquipmentItem(resolved: HandleResolution): ResolvedEquipmentItem {
  return {
    handle: resolved.handle,
    rawItemId: resolved.rawItemId,
    baseItemId: resolved.baseItemId,
    name: resolved.name,
    type: resolved.type,
    upgradeLevel: resolved.upgradeLevel,
    ashOfWar: resolved.ashOfWar,
    semanticSummary: resolved.semanticSummary,
    semanticDescription: resolved.semanticDescription,
    hint: resolved.hint,
    rarity: resolved.rarity,
  };
}

function resolveSpell(id: number, catalog: SemanticCatalog): { id: number; name: string; hexId: string } {
  if (id === 0 || id === 0xffff_ffff) return { id, name: 'Vacío', hexId: toHexId(id) };
  const gameId = (GAME_ID_OFFSET.good | id) >>> 0;
  const found = findCatalogItem(catalog, 'good', [gameId, id]);
  return { id, name: found?.item.name ?? `Hechizo 0x${toHexId(gameId)}`, hexId: toHexId(gameId) };
}

function resolveEquipment(slot: ParsedSlot, catalog: SemanticCatalog): ResolvedEquipment {
  const gaByHandle = new Map(slot.gaItems.map((item) => [item.gaitemHandle >>> 0, item]));
  const resolve = (handle: number): ResolvedEquipmentItem => toEquipmentItem(resolveHandle(handle, gaByHandle, catalog));
  return {
    rightHand: slot.equipment.rightHandArmaments.map(resolve),
    leftHand: slot.equipment.leftHandArmaments.map(resolve),
    armor: {
      head: resolve(slot.equipment.head),
      chest: resolve(slot.equipment.chest),
      arms: resolve(slot.equipment.arms),
      legs: resolve(slot.equipment.legs),
    },
    talismans: slot.equipment.talismans.map(resolve),
    quickSlots: slot.quickAndPouch.quickSlots.map(resolve),
    pouch: slot.quickAndPouch.pouch.map(resolve),
    physickTears: slot.physickTearHandles.map(resolve),
    spells: slot.equippedSpells.map((id) => resolveSpell(id, catalog)),
  };
}

function resolveInventory(
  slot: ParsedSlot,
  catalog: SemanticCatalog,
): ResolvedInventoryItem[] {
  const gaByHandle = new Map(slot.gaItems.map((item) => [item.gaitemHandle >>> 0, item]));
  const equippedHandles = new Set<number>([
    ...slot.equipment.rightHandArmaments,
    ...slot.equipment.leftHandArmaments,
    slot.equipment.head,
    slot.equipment.chest,
    slot.equipment.arms,
    slot.equipment.legs,
    ...slot.equipment.talismans,
    ...slot.quickAndPouch.quickSlots,
    ...slot.quickAndPouch.pouch,
  ].map((value) => value >>> 0));

  const sourceEntries = [
    ...slot.heldInventory.commonItems,
    ...slot.heldInventory.keyItems,
    ...slot.chestInventory.commonItems,
    ...slot.chestInventory.keyItems,
  ];

  return sourceEntries.map((entry) => {
    const resolved = resolveHandle(entry.gaItemHandle, gaByHandle, catalog);
    return {
      ...resolved,
      quantity: entry.quantity,
      storage: entry.storage,
      keyItem: entry.keyItem,
      inventoryIndex: entry.inventoryIndex,
      equipped: equippedHandles.has(entry.gaItemHandle >>> 0),
    };
  }).sort((a, b) => {
    if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name, 'es', { numeric: true });
  });
}

export function isEventFlagSet(
  eventFlags: Uint8Array,
  eventId: number,
  bstMap: Record<string, number>,
): boolean | null {
  const blockId = Math.floor(eventId / 1000);
  const bstValue = Number(bstMap[String(blockId)]);
  if (!Number.isFinite(bstValue)) return null;
  const byteOffset = bstValue * 125 + Math.floor((eventId % 1000) / 8);
  if (byteOffset < 0 || byteOffset >= eventFlags.length) return null;
  const bitIndex = 7 - (eventId % 8);
  return (((eventFlags[byteOffset] ?? 0) & (1 << bitIndex)) !== 0);
}

function activeProgressEntries(
  source: Record<string, CatalogItem>,
  eventFlags: Uint8Array,
  bstMap: Record<string, number>,
): ProgressEntry[] {
  const result: ProgressEntry[] = [];
  for (const [flagIdText, item] of Object.entries(source)) {
    const flagId = Number(flagIdText);
    if (!Number.isSafeInteger(flagId)) continue;
    if (isEventFlagSet(eventFlags, flagId, bstMap) === true) result.push({ ...item, flagId });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

function resolveProgress(slot: ParsedSlot, catalog: SemanticCatalog): SemanticProgress {
  const defeatedBosses = activeProgressEntries(catalog.bosses, slot.eventFlags, catalog.eventFlagBst);
  const discoveredGraces = activeProgressEntries(catalog.graces, slot.eventFlags, catalog.eventFlagBst);
  const acquiredCookbooks = activeProgressEntries(catalog.cookbooks, slot.eventFlags, catalog.eventFlagBst);
  const acquiredBellBearings = activeProgressEntries(catalog.bellBearings, slot.eventFlags, catalog.eventFlagBst);
  const acquiredWhetblades = activeProgressEntries(catalog.whetblades, slot.eventFlags, catalog.eventFlagBst);
  return {
    defeatedBosses,
    discoveredGraces,
    acquiredCookbooks,
    acquiredBellBearings,
    acquiredWhetblades,
    totals: {
      bossesKnown: Object.keys(catalog.bosses).length,
      bossesDefeated: defeatedBosses.length,
      gracesKnown: Object.keys(catalog.graces).length,
      gracesDiscovered: discoveredGraces.length,
    },
  };
}

function mapLabel(slot: ParsedSlot, lastGrace: string): string {
  if (!lastGrace.startsWith('Entidad de gracia')) {
    const separator = lastGrace.includes(' — ') ? ' — ' : ' - ';
    return lastGrace.split(separator)[0] ?? lastGrace;
  }
  const [a, b, c, d] = slot.playerPosition.mapId;
  return `Mapa m${String(d).padStart(2, '0')}_${String(c).padStart(2, '0')}_${String(b).padStart(2, '0')}_${String(a).padStart(2, '0')}`;
}

export function createSemanticSlot(slot: ParsedSlot, catalog: SemanticCatalog): SemanticSlot {
  const equipment = resolveEquipment(slot, catalog);
  const inventory = resolveInventory(slot, catalog);
  const progress = resolveProgress(slot, catalog);
  const lastRestedGrace = catalog.graceEntities[String(slot.lastRestedGraceEntityId)]
    ?? `Entidad de gracia ${slot.lastRestedGraceEntityId}`;
  const totalTalismanSlots = Math.min(4, Math.max(1, 1 + slot.player.additionalTalismanSlotCount));

  return {
    slotIndex: slot.slotIndex,
    identity: {
      name: slot.player.characterName || slot.profileName,
      level: slot.player.level,
      playtimeSeconds: slot.secondsPlayed,
      classCode: slot.player.archetypeCode,
      className: getStartingClassName(slot.player.archetypeCode),
      genderCode: slot.player.genderCode,
    },
    overview: {
      deaths: slot.deaths,
      currentRunes: slot.player.runes,
      lifetimeRunes: slot.player.runesMemory,
      bloodstainRunes: Math.max(0, slot.bloodstain.runes),
      crimsonFlasks: slot.player.maxCrimsonFlaskCount,
      ceruleanFlasks: slot.player.maxCeruleanFlaskCount,
      totalFlasks: slot.player.maxCrimsonFlaskCount + slot.player.maxCeruleanFlaskCount,
      talismanSlots: totalTalismanSlots,
      lastRestedGrace,
      mapLabel: mapLabel(slot, lastRestedGrace),
      worldTime: [slot.worldTime.hour, slot.worldTime.minute, slot.worldTime.second]
        .map((value) => String(value).padStart(2, '0'))
        .join(':'),
      dlcOwned: slot.dlc.shadowOfTheErdtree,
    },
    attributes: slot.player.attributes,
    vitals: { hp: slot.player.hp, fp: slot.player.fp, stamina: slot.player.stamina },
    build: analyzeBuild(slot, equipment),
    equipment,
    inventory,
    progress,
    raw: slot,
  };
}

export function createSemanticSlots(slots: ParsedSlot[], catalog: SemanticCatalog): SemanticSlot[] {
  return slots.map((slot) => createSemanticSlot(slot, catalog));
}

export function missingProgressEntries(
  source: Record<string, CatalogItem>,
  slot: ParsedSlot,
  catalog: SemanticCatalog,
): ProgressEntry[] {
  const result: ProgressEntry[] = [];
  for (const [flagIdText, item] of Object.entries(source)) {
    const flagId = Number(flagIdText);
    if (Number.isSafeInteger(flagId) && isEventFlagSet(slot.eventFlags, flagId, catalog.eventFlagBst) === false) {
      result.push({ ...item, flagId });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export function emptyEquipment(): ResolvedEquipmentItem {
  return { ...EMPTY_ITEM };
}
