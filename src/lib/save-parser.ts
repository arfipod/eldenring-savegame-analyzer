import type {
  ActiveWeaponSlots,
  ChrAsm,
  GaItem,
  InventoryBlock,
  InventoryEntry,
  OpaqueSection,
  ParsedSave,
  ParsedSlot,
  ProfileSummary,
  QuickAndPouchItems,
  SpecialEffect,
  Vec3,
  Vec4,
} from '../types';
import { BinaryReader, bytesToHex, SaveParseError } from './binary-reader';
import { md5Hex } from './md5';

export const PARSER_VERSION = '1.0.0';

const PC_MAGIC = [0x42, 0x4e, 0x44, 0x34] as const; // BND4
const HEADER_SIZE = 0x2fc;
const SLOT_SIZE = 0x280010;
const SLOT_CHECKSUM_SIZE = 0x10;
const SLOT_DATA_SIZE = 0x280000;
const SLOTS_START = PC_MAGIC.length + HEADER_SIZE; // 0x300
const SLOT_COUNT = 10;
const USER_DATA_10_START = SLOTS_START + SLOT_SIZE * SLOT_COUNT; // 0x19003A0

const EVENT_FLAGS_LENGTH = 0x1bf99f;
const PLAYER_GAME_DATA_LENGTH = 0x1b0;
const EQUIP_SLOTS_LENGTH = 0x58;
const EQUIPPED_ARMAMENTS_AND_ITEMS_LENGTH = 0x9c;
const FACE_DATA_LENGTH = 0x12f;
const TROPHY_EQUIP_LENGTH = 0x34;
const GAITEM_GAME_DATA_LENGTH = 8 + 7000 * 16;
const NET_MAN_LENGTH = 0x20004;
const PS5_ACTIVITY_LENGTH = 0x20;
const DLC_BLOCK_LENGTH = 0x32;
const PROFILE_LENGTH = 0x24c;
const PROFILE_LEVEL_OFFSET = 0x22;
const PROFILE_SECONDS_PLAYED_OFFSET = 0x26;

const PGD = {
  hp: 0x08,
  maxHp: 0x0c,
  baseMaxHp: 0x10,
  fp: 0x14,
  maxFp: 0x18,
  baseMaxFp: 0x1c,
  stamina: 0x24,
  maxStamina: 0x28,
  baseMaxStamina: 0x2c,
  vigor: 0x34,
  mind: 0x38,
  endurance: 0x3c,
  strength: 0x40,
  dexterity: 0x44,
  intelligence: 0x48,
  faith: 0x4c,
  arcane: 0x50,
  level: 0x60,
  runes: 0x64,
  runesMemory: 0x68,
  poison: 0x70,
  rot: 0x74,
  bleed: 0x78,
  death: 0x7c,
  frost: 0x80,
  sleep: 0x84,
  madness: 0x88,
  characterName: 0x94,
  gender: 0xb6,
  archetype: 0xb7,
  voiceType: 0xba,
  gift: 0xbb,
  additionalTalismanSlotCount: 0xbe,
  summonSpiritLevel: 0xbf,
  furlcallingFingerRemedyActive: 0xd8,
  matchmakingWeaponLevel: 0xda,
  whiteCipherRingActive: 0xdb,
  blueCipherRingActive: 0xdc,
  greatRuneActive: 0xf7,
  maxCrimsonFlaskCount: 0xf9,
  maxCeruleanFlaskCount: 0xfa,
} as const;

export interface ParseFileMetadata {
  name: string;
  size: number;
  lastModified: number;
}

export type ParseProgress = (stage: string, fraction: number) => void;

interface UserData10Result {
  globalSteamId: string;
  profiles: ProfileSummary[];
}

function guardCount(value: number, maximum: number, label: string, offset: number): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new SaveParseError(`${label} fuera de rango: ${value}`, offset);
  }
  return value;
}

export function parseEldenRingSave(
  buffer: ArrayBuffer,
  metadata: ParseFileMetadata,
  onProgress: ParseProgress = () => undefined,
): ParsedSave {
  const reader = new BinaryReader(buffer);
  const warnings: string[] = [];

  onProgress('Validando contenedor BND4', 0.03);
  if (reader.length < USER_DATA_10_START + 0x100) {
    throw new SaveParseError('El archivo es demasiado pequeño para ser una partida PC de Elden Ring');
  }

  for (let index = 0; index < PC_MAGIC.length; index += 1) {
    if (reader.byteAt(index) !== PC_MAGIC[index]) {
      throw new SaveParseError(
        'No se ha encontrado la firma BND4. Solo se admiten partidas PC .sl2/.co2 compatibles.',
        index,
      );
    }
  }

  onProgress('Leyendo perfiles y ranuras activas', 0.08);
  const userData10 = readUserData10(reader);
  const activeProfiles = userData10.profiles.filter((profile) => profile.active);
  if (activeProfiles.length === 0) {
    warnings.push('La tabla global no marca ninguna ranura como activa.');
  }

  const slots: ParsedSlot[] = [];
  for (let activeIndex = 0; activeIndex < activeProfiles.length; activeIndex += 1) {
    const profile = activeProfiles[activeIndex];
    if (!profile) continue;
    const fractionBase = 0.1 + (activeIndex / Math.max(activeProfiles.length, 1)) * 0.85;
    onProgress(`Analizando ranura ${profile.slotIndex + 1}: ${profile.name || 'sin nombre'}`, fractionBase);
    slots.push(readSlot(reader, profile, onProgress, fractionBase, activeProfiles.length));
  }

  onProgress('Terminando informe', 0.98);
  if (slots.some((slot) => !slot.integrity.valid)) {
    warnings.push('Al menos una ranura activa no coincide con su checksum MD5 almacenado.');
  }
  if (slots.some((slot) => slot.version > 300)) {
    warnings.push('La versión interna de la partida es más reciente que las versiones validadas por este parser.');
  }

  return {
    schemaVersion: '1.0.0',
    parserVersion: PARSER_VERSION,
    file: {
      name: metadata.name,
      size: metadata.size,
      lastModified: metadata.lastModified,
      magic: 'BND4',
      compatible: true,
    },
    globalSteamId: userData10.globalSteamId,
    profiles: userData10.profiles,
    slots,
    warnings,
  };
}

function readUserData10(reader: BinaryReader): UserData10Result {
  reader.seek(USER_DATA_10_START + SLOT_CHECKSUM_SIZE);
  reader.skip(4); // version
  const globalSteamId = reader.u64String();
  reader.skip(0x140); // settings

  // MenuSystemSaveLoad: u16 + u16 + size u32 + data[size]
  reader.skip(4);
  const menuSizeOffset = reader.pos();
  const menuSize = guardCount(reader.u32(), 0x100000, 'Tamaño de menú global', menuSizeOffset);
  reader.skip(menuSize);

  const active = Array.from({ length: SLOT_COUNT }, () => reader.u8() !== 0);
  const profiles: ProfileSummary[] = [];

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    const start = reader.pos();
    profiles.push({
      slotIndex,
      active: active[slotIndex] ?? false,
      name: reader.utf16LeAt(start, 0x20),
      level: reader.u32At(start + PROFILE_LEVEL_OFFSET),
      secondsPlayed: reader.u32At(start + PROFILE_SECONDS_PLAYED_OFFSET),
    });
    reader.seek(start + PROFILE_LENGTH);
  }

  return { globalSteamId, profiles };
}

function readSlot(
  reader: BinaryReader,
  profile: ProfileSummary,
  onProgress: ParseProgress,
  fractionBase: number,
  activeSlotCount: number,
): ParsedSlot {
  const slotBlockStart = SLOTS_START + SLOT_SIZE * profile.slotIndex;
  const dataStart = slotBlockStart + SLOT_CHECKSUM_SIZE;
  const storedDigest = reader.subarrayAt(slotBlockStart, SLOT_CHECKSUM_SIZE);
  const slotData = reader.subarrayAt(dataStart, SLOT_DATA_SIZE);

  onProgress(`Verificando integridad de ${profile.name || `ranura ${profile.slotIndex + 1}`}`, fractionBase + 0.01);
  const storedMd5Hex = bytesToHex(storedDigest);
  const computedMd5Hex = md5Hex(slotData);

  reader.seek(dataStart);
  const opaqueSections: OpaqueSection[] = [];
  const recordOpaque = (name: string, length: number, preview = false): void => {
    const offset = reader.pos();
    reader.ensure(length);
    opaqueSections.push({
      name,
      offset,
      length,
      previewHex: preview ? bytesToHex(reader.subarrayAt(offset, Math.min(length, 32))) : undefined,
    });
    reader.skip(length);
  };

  const version = reader.u32();
  const mapId = reader.byteTuple4();
  recordOpaque('slot.unknown_header_0x8', 8, true);
  recordOpaque('slot.unknown_header_0x10', 0x10, true);

  const gaitemCount = version <= 81 ? 0x13fe : 0x1400;
  const gaItems: GaItem[] = [];
  for (let index = 0; index < gaitemCount; index += 1) {
    const item = readGaItem(reader);
    if (item) gaItems.push(item);
  }

  onProgress('Leyendo nivel, atributos y recursos', fractionBase + 0.09 / Math.max(activeSlotCount, 1));
  const pgdStart = reader.pos();
  const player = {
    characterName: reader.utf16LeAt(pgdStart + PGD.characterName, 32),
    level: reader.u32At(pgdStart + PGD.level),
    runes: reader.u32At(pgdStart + PGD.runes),
    runesMemory: reader.u32At(pgdStart + PGD.runesMemory),
    attributes: {
      vigor: reader.u32At(pgdStart + PGD.vigor),
      mind: reader.u32At(pgdStart + PGD.mind),
      endurance: reader.u32At(pgdStart + PGD.endurance),
      strength: reader.u32At(pgdStart + PGD.strength),
      dexterity: reader.u32At(pgdStart + PGD.dexterity),
      intelligence: reader.u32At(pgdStart + PGD.intelligence),
      faith: reader.u32At(pgdStart + PGD.faith),
      arcane: reader.u32At(pgdStart + PGD.arcane),
    },
    hp: {
      current: reader.u32At(pgdStart + PGD.hp),
      max: reader.u32At(pgdStart + PGD.maxHp),
      baseMax: reader.u32At(pgdStart + PGD.baseMaxHp),
    },
    fp: {
      current: reader.u32At(pgdStart + PGD.fp),
      max: reader.u32At(pgdStart + PGD.maxFp),
      baseMax: reader.u32At(pgdStart + PGD.baseMaxFp),
    },
    stamina: {
      current: reader.u32At(pgdStart + PGD.stamina),
      max: reader.u32At(pgdStart + PGD.maxStamina),
      baseMax: reader.u32At(pgdStart + PGD.baseMaxStamina),
    },
    buildup: {
      poison: reader.u32At(pgdStart + PGD.poison),
      rot: reader.u32At(pgdStart + PGD.rot),
      bleed: reader.u32At(pgdStart + PGD.bleed),
      death: reader.u32At(pgdStart + PGD.death),
      frost: reader.u32At(pgdStart + PGD.frost),
      sleep: reader.u32At(pgdStart + PGD.sleep),
      madness: reader.u32At(pgdStart + PGD.madness),
    },
    genderCode: reader.byteAt(pgdStart + PGD.gender),
    archetypeCode: reader.byteAt(pgdStart + PGD.archetype),
    voiceType: reader.byteAt(pgdStart + PGD.voiceType),
    startingGiftCode: reader.byteAt(pgdStart + PGD.gift),
    additionalTalismanSlotCount: reader.byteAt(pgdStart + PGD.additionalTalismanSlotCount),
    summonSpiritLevel: reader.byteAt(pgdStart + PGD.summonSpiritLevel),
    matchmakingWeaponLevel: reader.byteAt(pgdStart + PGD.matchmakingWeaponLevel),
    furlcallingFingerRemedyActive: reader.byteAt(pgdStart + PGD.furlcallingFingerRemedyActive) !== 0,
    whiteCipherRingActive: reader.byteAt(pgdStart + PGD.whiteCipherRingActive) !== 0,
    blueCipherRingActive: reader.byteAt(pgdStart + PGD.blueCipherRingActive) !== 0,
    greatRuneActive: reader.byteAt(pgdStart + PGD.greatRuneActive) !== 0,
    maxCrimsonFlaskCount: reader.byteAt(pgdStart + PGD.maxCrimsonFlaskCount),
    maxCeruleanFlaskCount: reader.byteAt(pgdStart + PGD.maxCeruleanFlaskCount),
  };
  reader.seek(pgdStart + PLAYER_GAME_DATA_LENGTH);

  const specialEffects: SpecialEffect[] = [];
  for (let index = 0; index < 13; index += 1) {
    const id = reader.i32();
    const remainingSeconds = reader.f32();
    reader.skip(8);
    if (id !== 0 && id !== -1) specialEffects.push({ id, remainingSeconds });
  }

  recordOpaque('equipment.equip_indices', EQUIP_SLOTS_LENGTH);
  const activeWeaponSlots: ActiveWeaponSlots = {
    armStyle: reader.u32(),
    leftHand: reader.u32(),
    rightHand: reader.u32(),
    leftArrow: reader.u32(),
    rightArrow: reader.u32(),
    leftBolt: reader.u32(),
    rightBolt: reader.u32(),
  };
  recordOpaque('equipment.item_id_mirror', EQUIP_SLOTS_LENGTH);
  const equipment = readChrAsm(reader);

  onProgress('Leyendo inventario y equipo', fractionBase + 0.16 / Math.max(activeSlotCount, 1));
  const heldInventory = readInventory(reader, 0xa80, 0x180, 'held');

  const equippedSpells: number[] = [];
  for (let index = 0; index < 14; index += 1) {
    equippedSpells.push(reader.u32());
    reader.skip(4);
  }
  reader.skip(4); // active spell slot

  const quickAndPouch = readQuickAndPouch(reader);
  const equippedGestures = Array.from({ length: 6 }, () => reader.u32());

  const projectileCountOffset = reader.pos();
  const projectileCount = guardCount(reader.u32(), 100_000, 'Cantidad de proyectiles', projectileCountOffset);
  const acquiredProjectiles: number[] = [];
  for (let index = 0; index < projectileCount; index += 1) {
    acquiredProjectiles.push(reader.u32());
    reader.skip(4);
  }

  recordOpaque('equipment.redundant_armaments_and_items', EQUIPPED_ARMAMENTS_AND_ITEMS_LENGTH);
  const physickTearHandles: [number, number] = [reader.u32(), reader.u32()];
  reader.skip(4);
  recordOpaque('character.face_data', FACE_DATA_LENGTH, true);

  const chestInventory = readInventory(reader, 0x780, 0x80, 'chest');
  const unlockedGestures = Array.from({ length: 64 }, () => reader.u32());

  const regionCountOffset = reader.pos();
  const regionCount = guardCount(reader.u32(), 100_000, 'Cantidad de regiones', regionCountOffset);
  const unlockedRegionIds = Array.from({ length: regionCount }, () => reader.u32());

  const horseCoords: Vec3 = [reader.f32(), reader.f32(), reader.f32()];
  const horseMapId = reader.byteTuple4();
  recordOpaque('world.horse_angle', 16);
  const horseHp = reader.i32();
  const horseState = reader.u32();

  reader.skip(1);
  const bloodstainCoords: Vec3 = [reader.f32(), reader.f32(), reader.f32()];
  recordOpaque('world.bloodstain_angle', 16);
  recordOpaque('world.bloodstain_unknown_0x14', 20);
  reader.skip(4);
  const bloodstainRunes = reader.i32();
  const bloodstainMapId = reader.byteTuple4();
  reader.skip(8);

  reader.skip(8);
  reader.skip(4);
  const menuProfileSizeOffset = reader.pos();
  const menuProfileSize = guardCount(reader.u32(), 0x100000, 'Tamaño del menú de perfil', menuProfileSizeOffset);
  recordOpaque('profile.menu_save_load', menuProfileSize, true);

  recordOpaque('trophy.equip_data', TROPHY_EQUIP_LENGTH);
  recordOpaque('inventory.gaitem_game_data', GAITEM_GAME_DATA_LENGTH);

  reader.skip(4);
  const tutorialSizeOffset = reader.pos();
  const tutorialSize = guardCount(reader.u32(), 0x100000, 'Tamaño de tutoriales', tutorialSizeOffset);
  const tutorialCount = reader.u32();
  if (tutorialCount !== 0) {
    if (tutorialSize < 4) throw new SaveParseError('Bloque de tutoriales inconsistente', tutorialSizeOffset);
    recordOpaque('tutorial.data', tutorialSize - 4, true);
  }

  reader.skip(3);
  const deaths = reader.u32();
  reader.skip(4);
  reader.skip(1);
  reader.skip(4);
  const lastRestedGraceEntityId = reader.u32();
  reader.skip(1);
  reader.skip(4);
  reader.skip(4);

  onProgress('Decodificando progreso y banderas de evento', fractionBase + 0.28 / Math.max(activeSlotCount, 1));
  const eventFlagsOffset = reader.pos();
  const eventFlags = reader.bytesCopy(EVENT_FLAGS_LENGTH);
  opaqueSections.push({ name: 'progress.event_flags', offset: eventFlagsOffset, length: EVENT_FLAGS_LENGTH });
  reader.skip(1);

  const skipLengthPrefixed = (name: string): void => {
    const sizeOffset = reader.pos();
    const size = reader.i32();
    guardCount(size, SLOT_DATA_SIZE, `Tamaño de ${name}`, sizeOffset);
    recordOpaque(name, size, true);
  };
  skipLengthPrefixed('world.field_area');
  skipLengthPrefixed('world.world_area');
  skipLengthPrefixed('world.geometry_primary');
  skipLengthPrefixed('world.geometry_secondary');
  skipLengthPrefixed('world.render_manager');

  const playerCoords: Vec3 = [reader.f32(), reader.f32(), reader.f32()];
  const playerMapId = reader.byteTuple4();
  const playerAngle: Vec4 = [reader.f32(), reader.f32(), reader.f32(), reader.f32()];
  reader.skip(1);
  recordOpaque('world.unknown_coordinates', 12);
  recordOpaque('world.unknown_angle', 16);

  reader.skip(2);
  const spawnPointEntityId = reader.u32();
  reader.skip(4);
  if (version >= 65) reader.skip(4);
  if (version >= 66) reader.skip(1);
  recordOpaque('network.manager', NET_MAN_LENGTH);

  const worldWeather = {
    areaId: reader.u16(),
    type: reader.u16(),
    timer: reader.u32(),
  };
  reader.skip(4);

  const worldTime = {
    hour: reader.u32(),
    minute: reader.u32(),
    second: reader.u32(),
  };

  reader.skip(4);
  const baseVersion = {
    value: reader.u32(),
    isLatestVersion: reader.u32(),
  };
  reader.skip(4);
  const steamId = reader.u64String();

  recordOpaque('platform.ps5_activity', PS5_ACTIVITY_LENGTH);
  const dlcStart = reader.pos();
  const dlc = {
    preorderTheRing: reader.u8() !== 0,
    shadowOfTheErdtree: reader.u8() !== 0,
    preorderRingOfMiquella: reader.u8() !== 0,
  };
  const remainingDlcBytes = DLC_BLOCK_LENGTH - (reader.pos() - dlcStart);
  if (remainingDlcBytes > 0) recordOpaque('dlc.unknown', remainingDlcBytes, true);

  const parseEndOffset = reader.pos();
  if (parseEndOffset > dataStart + SLOT_DATA_SIZE) {
    throw new SaveParseError('El parser ha sobrepasado el final de la ranura', parseEndOffset);
  }

  return {
    slotIndex: profile.slotIndex,
    version,
    profileName: profile.name,
    profileLevel: profile.level,
    secondsPlayed: profile.secondsPlayed,
    steamId,
    mapId,
    player,
    gaItems,
    heldInventory,
    chestInventory,
    equipment,
    activeWeaponSlots,
    equippedSpells,
    quickAndPouch,
    equippedGestures,
    unlockedGestures,
    acquiredProjectiles,
    physickTearHandles,
    specialEffects,
    unlockedRegionIds,
    horse: { coords: horseCoords, mapId: horseMapId, hp: horseHp, state: horseState },
    bloodstain: { coords: bloodstainCoords, mapId: bloodstainMapId, runes: bloodstainRunes },
    deaths,
    lastRestedGraceEntityId,
    playerPosition: { coords: playerCoords, mapId: playerMapId, angle: playerAngle },
    spawnPointEntityId,
    worldTime,
    worldWeather,
    baseVersion,
    dlc,
    eventFlags,
    integrity: {
      storedMd5Hex,
      computedMd5Hex,
      valid: storedMd5Hex === computedMd5Hex,
    },
    opaqueSections,
    parseEndOffset,
  };
}

function readGaItem(reader: BinaryReader): GaItem | null {
  const gaitemHandle = reader.u32();
  const itemId = reader.u32();
  if (gaitemHandle === 0) return null;

  const handleClass = (gaitemHandle & 0xf0000000) >>> 0;
  const weaponClass = handleClass === 0x80000000;
  if (handleClass !== 0xc0000000) reader.skip(8);

  let gemGaitemHandle = 0;
  if (weaponClass) {
    gemGaitemHandle = reader.u32();
    reader.skip(1);
  }

  return { gaitemHandle, itemId, gemGaitemHandle };
}

function readInventory(
  reader: BinaryReader,
  commonCapacity: number,
  keyCapacity: number,
  storage: 'held' | 'chest',
): InventoryBlock {
  const commonCountOffset = reader.pos();
  const commonDistinctCount = guardCount(
    reader.u32(),
    commonCapacity,
    'Elementos comunes del inventario',
    commonCountOffset,
  );
  const commonItems = readInventoryItems(reader, commonCapacity, commonDistinctCount, storage, false);

  const keyCountOffset = reader.pos();
  const keyDistinctCount = guardCount(reader.u32(), keyCapacity, 'Objetos clave del inventario', keyCountOffset);
  const keyItems = readInventoryItems(reader, keyCapacity, keyDistinctCount, storage, true);
  reader.skip(8);

  return { commonDistinctCount, commonItems, keyDistinctCount, keyItems };
}

function readInventoryItems(
  reader: BinaryReader,
  capacity: number,
  count: number,
  storage: 'held' | 'chest',
  keyItem: boolean,
): InventoryEntry[] {
  const items: InventoryEntry[] = [];
  for (let index = 0; index < capacity; index += 1) {
    const gaItemHandle = reader.u32();
    const quantity = reader.u32();
    const inventoryIndex = reader.u32();
    if (index < count && gaItemHandle !== 0 && gaItemHandle !== 0xffff_ffff) {
      items.push({ gaItemHandle, quantity, inventoryIndex, storage, keyItem });
    }
  }
  return items;
}

function readChrAsm(reader: BinaryReader): ChrAsm {
  const lh1 = reader.u32();
  const rh1 = reader.u32();
  const lh2 = reader.u32();
  const rh2 = reader.u32();
  const lh3 = reader.u32();
  const rh3 = reader.u32();
  const arrows1 = reader.u32();
  const bolts1 = reader.u32();
  const arrows2 = reader.u32();
  const bolts2 = reader.u32();
  reader.skip(8);
  const head = reader.u32();
  const chest = reader.u32();
  const arms = reader.u32();
  const legs = reader.u32();
  reader.skip(4);
  const talisman1 = reader.u32();
  const talisman2 = reader.u32();
  const talisman3 = reader.u32();
  const talisman4 = reader.u32();
  reader.skip(4);
  return {
    leftHandArmaments: [lh1, lh2, lh3],
    rightHandArmaments: [rh1, rh2, rh3],
    arrows: [arrows1, arrows2],
    bolts: [bolts1, bolts2],
    head,
    chest,
    arms,
    legs,
    talismans: [talisman1, talisman2, talisman3, talisman4],
  };
}

function readQuickAndPouch(reader: BinaryReader): QuickAndPouchItems {
  const quickSlots: number[] = [];
  for (let index = 0; index < 10; index += 1) {
    quickSlots.push(reader.u32());
    reader.skip(4);
  }
  reader.skip(4);
  const pouch: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    pouch.push(reader.u32());
    reader.skip(4);
  }
  reader.skip(8);
  return { quickSlots, pouch };
}
