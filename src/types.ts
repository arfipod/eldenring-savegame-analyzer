export type ByteTuple4 = [number, number, number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export type AttributeKey =
  | 'vigor'
  | 'mind'
  | 'endurance'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'faith'
  | 'arcane';

export interface PlayerAttributes extends Record<AttributeKey, number> {}

export interface VitalBlock {
  current: number;
  max: number;
  baseMax: number;
}

export interface BuildupBlock {
  poison: number;
  rot: number;
  bleed: number;
  death: number;
  frost: number;
  sleep: number;
  madness: number;
}

export interface PlayerGameData {
  characterName: string;
  level: number;
  runes: number;
  runesMemory: number;
  attributes: PlayerAttributes;
  hp: VitalBlock;
  fp: VitalBlock;
  stamina: VitalBlock;
  buildup: BuildupBlock;
  genderCode: number;
  archetypeCode: number;
  voiceType: number;
  startingGiftCode: number;
  additionalTalismanSlotCount: number;
  summonSpiritLevel: number;
  matchmakingWeaponLevel: number;
  furlcallingFingerRemedyActive: boolean;
  whiteCipherRingActive: boolean;
  blueCipherRingActive: boolean;
  greatRuneActive: boolean;
  maxCrimsonFlaskCount: number;
  maxCeruleanFlaskCount: number;
}

export interface GaItem {
  gaitemHandle: number;
  itemId: number;
  gemGaitemHandle: number;
}

export interface InventoryEntry {
  gaItemHandle: number;
  quantity: number;
  inventoryIndex: number;
  storage: 'held' | 'chest';
  keyItem: boolean;
}

export interface InventoryBlock {
  commonDistinctCount: number;
  commonItems: InventoryEntry[];
  keyDistinctCount: number;
  keyItems: InventoryEntry[];
}

export interface ChrAsm {
  leftHandArmaments: [number, number, number];
  rightHandArmaments: [number, number, number];
  arrows: [number, number];
  bolts: [number, number];
  head: number;
  chest: number;
  arms: number;
  legs: number;
  talismans: [number, number, number, number];
}

export interface ActiveWeaponSlots {
  armStyle: number;
  leftHand: number;
  rightHand: number;
  leftArrow: number;
  rightArrow: number;
  leftBolt: number;
  rightBolt: number;
}

export interface QuickAndPouchItems {
  quickSlots: number[];
  pouch: number[];
}

export interface SpecialEffect {
  id: number;
  remainingSeconds: number;
}

export interface OpaqueSection {
  name: string;
  offset: number;
  length: number;
  previewHex?: string;
}

export interface SlotIntegrity {
  storedMd5Hex: string;
  computedMd5Hex: string;
  valid: boolean;
}

export interface ParsedSlot {
  slotIndex: number;
  version: number;
  profileName: string;
  profileLevel: number;
  secondsPlayed: number;
  steamId: string;
  mapId: ByteTuple4;
  player: PlayerGameData;
  gaItems: GaItem[];
  heldInventory: InventoryBlock;
  chestInventory: InventoryBlock;
  equipment: ChrAsm;
  activeWeaponSlots: ActiveWeaponSlots;
  equippedSpells: number[];
  quickAndPouch: QuickAndPouchItems;
  equippedGestures: number[];
  unlockedGestures: number[];
  acquiredProjectiles: number[];
  physickTearHandles: [number, number];
  specialEffects: SpecialEffect[];
  unlockedRegionIds: number[];
  horse: {
    coords: Vec3;
    mapId: ByteTuple4;
    hp: number;
    state: number;
  };
  bloodstain: {
    coords: Vec3;
    mapId: ByteTuple4;
    runes: number;
  };
  deaths: number;
  lastRestedGraceEntityId: number;
  playerPosition: {
    coords: Vec3;
    mapId: ByteTuple4;
    angle: Vec4;
  };
  spawnPointEntityId: number;
  worldTime: { hour: number; minute: number; second: number };
  worldWeather: { areaId: number; type: number; timer: number };
  baseVersion: { value: number; isLatestVersion: number };
  dlc: {
    shadowOfTheErdtree: boolean;
    preorderTheRing: boolean;
    preorderRingOfMiquella: boolean;
  };
  eventFlags: Uint8Array;
  integrity: SlotIntegrity;
  opaqueSections: OpaqueSection[];
  parseEndOffset: number;
}

export interface ProfileSummary {
  slotIndex: number;
  active: boolean;
  name: string;
  level: number;
  secondsPlayed: number;
}

export interface ParsedSave {
  schemaVersion: '1.0.0';
  parserVersion: string;
  file: {
    name: string;
    size: number;
    lastModified: number;
    magic: string;
    compatible: boolean;
  };
  globalSteamId: string;
  profiles: ProfileSummary[];
  slots: ParsedSlot[];
  warnings: string[];
}

export type CatalogInventoryCategory =
  | 'armament'
  | 'armor'
  | 'talisman'
  | 'ashesOfWar'
  | 'magic'
  | 'spiritAshes'
  | 'tools'
  | 'gestures'
  | 'crystal_tears'
  | 'goods'
  | 'unknown';

export interface CatalogItem {
  name: string;
  class?: string;
  category?: string;
  subcategory?: string;
  summary?: string;
  description?: string[];
  hint?: string;
  rarity?: string;
  maxHeld?: number;
  maxStored?: number;
  source?: 'base' | 'dlc' | 'fallback';
}

export type CatalogItemMap = Record<string, CatalogItem>;

export interface ProgressEntry extends CatalogItem {
  flagId: number;
}

export interface SemanticCatalog {
  inventory: Partial<Record<CatalogInventoryCategory, CatalogItemMap>>;
  bosses: Record<string, CatalogItem>;
  graces: Record<string, CatalogItem>;
  cookbooks: Record<string, CatalogItem>;
  bellBearings: Record<string, CatalogItem>;
  whetblades: Record<string, CatalogItem>;
  eventFlagBst: Record<string, number>;
  graceEntities: Record<string, string>;
  loadedSources: string[];
  warnings: string[];
}

export type ResolvedItemType =
  | 'weapon'
  | 'armor'
  | 'talisman'
  | 'good'
  | 'ashOfWar'
  | 'unknown';

export interface ResolvedInventoryItem {
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
  quantity: number;
  upgradeLevel: number;
  storage: 'held' | 'chest';
  keyItem: boolean;
  inventoryIndex: number;
  equipped: boolean;
  ashOfWar?: { id: number; name: string };
  confidence: 'high' | 'medium' | 'raw-id-only';
}

export interface ResolvedEquipmentItem {
  handle: number;
  rawItemId: number;
  baseItemId: number;
  name: string;
  type: ResolvedItemType;
  upgradeLevel: number;
  ashOfWar?: { id: number; name: string };
  semanticSummary?: string;
  semanticDescription?: string[];
  hint?: string;
  rarity?: string;
}

export interface ResolvedEquipment {
  rightHand: ResolvedEquipmentItem[];
  leftHand: ResolvedEquipmentItem[];
  armor: {
    head: ResolvedEquipmentItem;
    chest: ResolvedEquipmentItem;
    arms: ResolvedEquipmentItem;
    legs: ResolvedEquipmentItem;
  };
  talismans: ResolvedEquipmentItem[];
  quickSlots: ResolvedEquipmentItem[];
  pouch: ResolvedEquipmentItem[];
  physickTears: ResolvedEquipmentItem[];
  spells: Array<{ id: number; name: string; hexId: string }>;
}

export interface AdviceItem {
  id: string;
  severity: 'good' | 'info' | 'warning';
  title: string;
  detail: string;
  evidence: string[];
}

export interface BuildAnalysis {
  archetype: string;
  summary: string;
  primaryStats: AttributeKey[];
  levelEfficiency: number;
  advice: AdviceItem[];
}

export interface SemanticProgress {
  defeatedBosses: ProgressEntry[];
  discoveredGraces: ProgressEntry[];
  acquiredCookbooks: ProgressEntry[];
  acquiredBellBearings: ProgressEntry[];
  acquiredWhetblades: ProgressEntry[];
  totals: {
    bossesKnown: number;
    bossesDefeated: number;
    gracesKnown: number;
    gracesDiscovered: number;
  };
}

export interface SemanticSlot {
  slotIndex: number;
  identity: {
    name: string;
    level: number;
    playtimeSeconds: number;
    classCode: number;
    className: string;
    genderCode: number;
  };
  overview: {
    deaths: number;
    currentRunes: number;
    lifetimeRunes: number;
    bloodstainRunes: number;
    crimsonFlasks: number;
    ceruleanFlasks: number;
    totalFlasks: number;
    talismanSlots: number;
    lastRestedGrace: string;
    mapLabel: string;
    worldTime: string;
    dlcOwned: boolean;
  };
  attributes: PlayerAttributes;
  vitals: {
    hp: VitalBlock;
    fp: VitalBlock;
    stamina: VitalBlock;
  };
  build: BuildAnalysis;
  equipment: ResolvedEquipment;
  inventory: ResolvedInventoryItem[];
  progress: SemanticProgress;
  raw: ParsedSlot;
}

export interface WorkerParseRequest {
  type: 'parse';
  fileName: string;
  fileSize: number;
  lastModified: number;
  buffer: ArrayBuffer;
}

export type WorkerParseResponse =
  | { type: 'progress'; stage: string; fraction: number }
  | { type: 'success'; save: ParsedSave }
  | { type: 'error'; message: string; offset?: number; stack?: string };

export interface ExportPrivacyOptions {
  includeSteamIds: boolean;
  includeCoordinates: boolean;
  includeRawEventFlags: boolean;
  includeRawInternalIds: boolean;
}
