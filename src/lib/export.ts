import type {
  ExportPrivacyOptions,
  ParsedSave,
  ParsedSlot,
  ResolvedEquipmentItem,
  ResolvedInventoryItem,
  SemanticCatalog,
  SemanticSlot,
} from '../types';
import { formatDuration, formatNumber, safeFilename } from './format';
import type { AppLanguage } from './i18n';
import { DEFAULT_LANGUAGE, localize } from './i18n';
import { missingProgressEntries, toHexId } from './semantic';

export type SpoilerMode = 'safe' | 'zones' | 'precise' | 'completion';

export interface ExportContext {
  save: ParsedSave;
  slot: SemanticSlot;
  catalog: SemanticCatalog;
  privacy: ExportPrivacyOptions;
  spoilerMode: SpoilerMode;
  language?: AppLanguage;
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunkSize)));
  }
  return btoa(binary);
}

const INTERNAL_LABEL_PATTERN = /^(?:ID(?: de ceniza)?|Ash ID|Hechizo|Spell|Ceniza|Ash|Entidad de gracia|Site of Grace entity|Clase desconocida|Unknown class|Mapa m\d|Map m\d)\b|\b0x[0-9a-f]{4,}\b/i;

function unresolvedItemLabel(
  type: ResolvedEquipmentItem['type'] | ResolvedInventoryItem['type'],
  language: AppLanguage,
): string {
  switch (type) {
    case 'weapon': return localize(language, 'Unresolved weapon or catalyst', 'Arma o catalizador sin resolver');
    case 'armor': return localize(language, 'Unresolved armor piece', 'Pieza de armadura sin resolver');
    case 'talisman': return localize(language, 'Unresolved talisman', 'Talismán sin resolver');
    case 'ashOfWar': return localize(language, 'Unresolved Ash of War', 'Ceniza de guerra sin resolver');
    case 'good': return localize(language, 'Unresolved item or spell', 'Objeto o magia sin resolver');
    default: return localize(language, 'Unresolved item', 'Objeto sin resolver');
  }
}

function exportLabel(label: string, includeIds: boolean, fallback: string): string {
  return !includeIds && INTERNAL_LABEL_PATTERN.test(label) ? fallback : label;
}

function exportEvidence(label: string, includeIds: boolean, language: AppLanguage): string {
  return !includeIds && INTERNAL_LABEL_PATTERN.test(label)
    ? localize(
        language,
        'Evidence based on an internal identifier that was not exported.',
        'Evidencia basada en un identificador interno no exportado.',
      )
    : label;
}

function equipmentItem(item: ResolvedEquipmentItem, includeIds: boolean, language: AppLanguage): Record<string, unknown> {
  return withoutUndefined({
    name: exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language)),
    type: item.type,
    upgradeLevel: item.upgradeLevel,
    ashOfWar: item.ashOfWar
      ? exportLabel(
          item.ashOfWar.name,
          includeIds,
          localize(language, 'Unresolved Ash of War', 'Ceniza de guerra sin resolver'),
        )
      : undefined,
    semanticSummary: item.semanticSummary,
    semanticDescription: item.semanticDescription,
    ...(includeIds
      ? {
          handle: `0x${toHexId(item.handle)}`,
          rawItemId: `0x${toHexId(item.rawItemId)}`,
          baseItemId: `0x${toHexId(item.baseItemId)}`,
          ashOfWarId: item.ashOfWar ? `0x${toHexId(item.ashOfWar.id)}` : undefined,
        }
      : {}),
  });
}

function inventoryItem(item: ResolvedInventoryItem, includeIds: boolean, language: AppLanguage): Record<string, unknown> {
  return withoutUndefined({
    name: exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language)),
    quantity: item.quantity,
    type: item.type,
    category: item.category,
    classification: item.classification,
    semanticSummary: item.semanticSummary,
    semanticDescription: item.semanticDescription,
    hint: item.hint,
    rarity: item.rarity,
    limits: item.maxHeld !== undefined || item.maxStored !== undefined
      ? { maxHeld: item.maxHeld, maxStored: item.maxStored }
      : undefined,
    upgradeLevel: item.upgradeLevel,
    storage: item.storage,
    keyItem: item.keyItem,
    equipped: item.equipped,
    ashOfWar: item.ashOfWar
      ? exportLabel(
          item.ashOfWar.name,
          includeIds,
          localize(language, 'Unresolved Ash of War', 'Ceniza de guerra sin resolver'),
        )
      : undefined,
    semanticConfidence: item.confidence,
    ...(includeIds
      ? {
          handle: `0x${toHexId(item.handle)}`,
          rawItemId: `0x${toHexId(item.rawItemId)}`,
          baseItemId: `0x${toHexId(item.baseItemId)}`,
          catalogId: `0x${item.hexId}`,
          inventoryIndex: item.inventoryIndex,
        }
      : {}),
  });
}

function progressEntry(
  entry: { name: string; flagId: number; category?: string; subcategory?: string },
  includeIds: boolean,
  language: AppLanguage,
): Record<string, unknown> {
  return withoutUndefined({
    name: exportLabel(entry.name, includeIds, localize(language, 'Unresolved milestone', 'Hito sin resolver')),
    category: entry.category,
    subcategory: entry.subcategory,
    ...(includeIds ? { eventFlagId: entry.flagId } : {}),
  });
}

function buildPendingProgress(context: ExportContext): Record<string, unknown> | undefined {
  const language = context.language ?? DEFAULT_LANGUAGE;
  if (context.spoilerMode !== 'completion' && context.spoilerMode !== 'precise') return undefined;
  const parsed = context.slot.raw;
  const groups = {
    bosses: missingProgressEntries(context.catalog.bosses, parsed, context.catalog),
    graces: missingProgressEntries(context.catalog.graces, parsed, context.catalog),
    cookbooks: missingProgressEntries(context.catalog.cookbooks, parsed, context.catalog),
    bellBearings: missingProgressEntries(context.catalog.bellBearings, parsed, context.catalog),
    whetblades: missingProgressEntries(context.catalog.whetblades, parsed, context.catalog),
  };
  if (context.spoilerMode === 'precise') {
    return {
      namesRedacted: true,
      counts: Object.fromEntries(Object.entries(groups).map(([key, entries]) => [key, entries.length])),
    };
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, entries]) => [
      key,
      entries.map((entry) => progressEntry(entry, context.privacy.includeRawInternalIds, language)),
    ]),
  );
}

function inventorySummary(items: ResolvedInventoryItem[]): Record<string, unknown> {
  const byType = Object.fromEntries(
    [...new Set(items.map((item) => item.type))].map((type) => [
      type,
      items.filter((item) => item.type === type).length,
    ]),
  );
  const byStorage = {
    held: items.filter((item) => item.storage === 'held').length,
    chest: items.filter((item) => item.storage === 'chest').length,
  };
  return {
    distinctResolvedEntries: items.length,
    equippedEntries: items.filter((item) => item.equipped).length,
    keyItemEntries: items.filter((item) => item.keyItem).length,
    unresolvedEntries: items.filter((item) => item.confidence === 'raw-id-only').length,
    byType,
    byStorage,
  };
}

export function buildSemanticExport(context: ExportContext): Record<string, unknown> {
  const { save, slot, privacy, spoilerMode } = context;
  const language = context.language ?? DEFAULT_LANGUAGE;
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const raw = slot.raw;
  const includeIds = privacy.includeRawInternalIds;
  const pending = buildPendingProgress(context);

  return withoutUndefined({
    schema: 'eldenring-savegame-analyzer.semantic.v1',
    generatedAt: new Date().toISOString(),
    intendedUse: l(
      'Structured data for human review or AI-assisted analysis.',
      'Datos estructurados para revisión humana o análisis asistido por IA.',
    ),
    methodology: {
      saveFormat: 'Elden Ring PC BND4 (.sl2/.co2)',
      access: l('Read-only; processed in the browser.', 'Solo lectura; procesado en el navegador.'),
      achievementsNotice:
        l(
          'Milestones are inferred from inventory and save flags. They are not necessarily equivalent to the official Steam achievement history.',
          'Los hitos se infieren desde inventario y banderas del save. No equivalen necesariamente al historial oficial de logros de Steam.',
        ),
      spoilerPolicy: spoilerMode,
      semanticCatalogSources: context.catalog.loadedSources,
      semanticWarnings: context.catalog.warnings,
    },
    privacy: {
      steamIdsIncluded: privacy.includeSteamIds,
      preciseCoordinatesIncluded: privacy.includeCoordinates,
      rawEventFlagsIncluded: privacy.includeRawEventFlags,
      rawInternalIdsIncluded: privacy.includeRawInternalIds,
    },
    source: {
      fileName: save.file.name,
      fileSizeBytes: save.file.size,
      fileLastModified: save.file.lastModified ? new Date(save.file.lastModified).toISOString() : null,
      parserVersion: save.parserVersion,
      saveSchemaVersion: save.schemaVersion,
      slotIndex: raw.slotIndex + 1,
      slotFormatVersion: raw.version,
      integrity: {
        valid: raw.integrity.valid,
        ...(includeIds
          ? { storedMd5Hex: raw.integrity.storedMd5Hex, computedMd5Hex: raw.integrity.computedMd5Hex }
          : {}),
      },
      ...(privacy.includeSteamIds
        ? { globalSteamId: save.globalSteamId, characterSteamId: raw.steamId }
        : {}),
    },
    character: {
      name: slot.identity.name,
      level: slot.identity.level,
      startingClass: exportLabel(
        slot.identity.className,
        includeIds,
        l('Unresolved starting class', 'Clase inicial sin resolver'),
      ),
      classCode: includeIds ? slot.identity.classCode : undefined,
      bodyTypeCode: includeIds ? slot.identity.genderCode : undefined,
      playtimeSeconds: slot.identity.playtimeSeconds,
      playtimeHuman: formatDuration(slot.identity.playtimeSeconds),
    },
    overview: {
      deaths: slot.overview.deaths,
      deathsPerHour:
        slot.identity.playtimeSeconds > 0
          ? Number(((slot.overview.deaths / slot.identity.playtimeSeconds) * 3_600).toFixed(3))
          : null,
      currentRunes: slot.overview.currentRunes,
      lifetimeRunes: slot.overview.lifetimeRunes,
      bloodstainRunes: slot.overview.bloodstainRunes,
      flasks: {
        crimson: slot.overview.crimsonFlasks,
        cerulean: slot.overview.ceruleanFlasks,
        total: slot.overview.totalFlasks,
      },
      talismanSlots: slot.overview.talismanSlots,
      lastRestedGrace: exportLabel(slot.overview.lastRestedGrace, includeIds, l('Unresolved Site of Grace', 'Gracia sin resolver')),
      mapLabel: exportLabel(slot.overview.mapLabel, includeIds, l('Unresolved map', 'Mapa sin resolver')),
      worldTime: slot.overview.worldTime,
      shadowOfTheErdtreeFlag: slot.overview.dlcOwned,
      matchmakingWeaponLevel: raw.player.matchmakingWeaponLevel,
      unlockedRegionCount: raw.unlockedRegionIds.length,
      ...(privacy.includeCoordinates
        ? {
            playerPosition: {
              coordinates: raw.playerPosition.coords,
              mapId: raw.playerPosition.mapId,
              facingQuaternion: raw.playerPosition.angle,
            },
            bloodstainPosition: {
              coordinates: raw.bloodstain.coords,
              mapId: raw.bloodstain.mapId,
            },
          }
        : {}),
    },
    attributes: slot.attributes,
    vitals: slot.vitals,
    buildAnalysis: {
      archetype: slot.build.archetype,
      summary: slot.build.summary,
      primaryStats: slot.build.primaryStats,
      focusScore: slot.build.levelEfficiency,
      observations: slot.build.advice.map((item) => ({
        ...item,
        evidence: item.evidence.map((entry) => exportEvidence(entry, includeIds, language)),
      })),
    },
    equipment: {
      rightHand: slot.equipment.rightHand.map((item) => equipmentItem(item, includeIds, language)),
      leftHand: slot.equipment.leftHand.map((item) => equipmentItem(item, includeIds, language)),
      armor: Object.fromEntries(
        Object.entries(slot.equipment.armor).map(([key, item]) => [key, equipmentItem(item, includeIds, language)]),
      ),
      talismans: slot.equipment.talismans.map((item) => equipmentItem(item, includeIds, language)),
      quickSlots: slot.equipment.quickSlots.map((item) => equipmentItem(item, includeIds, language)),
      pouch: slot.equipment.pouch.map((item) => equipmentItem(item, includeIds, language)),
      wondrousPhysickTears: slot.equipment.physickTears.map((item) => equipmentItem(item, includeIds, language)),
      spells: slot.equipment.spells
        .filter((spell) => spell.id !== 0 && spell.id !== 0xffff_ffff)
        .map((spell) => ({
          name: exportLabel(spell.name, includeIds, l('Unresolved spell', 'Hechizo sin resolver')),
          ...(includeIds ? { id: spell.id, gameId: `0x${spell.hexId}` } : {}),
        })),
    },
    inventory: {
      summary: inventorySummary(slot.inventory),
      items: slot.inventory.map((item) => inventoryItem(item, includeIds, language)),
    },
    progress: withoutUndefined({
      interpretation: l(
        'Only milestones already present in the save are listed unless completionist mode is enabled.',
        'Solo se enumeran hitos ya presentes en el save salvo que el modo completista esté activado.',
      ),
      defeatedBosses: slot.progress.defeatedBosses.map((entry) => progressEntry(entry, includeIds, language)),
      discoveredGraces: slot.progress.discoveredGraces.map((entry) => progressEntry(entry, includeIds, language)),
      acquiredCookbooks: slot.progress.acquiredCookbooks.map((entry) => progressEntry(entry, includeIds, language)),
      acquiredBellBearings: slot.progress.acquiredBellBearings.map((entry) => progressEntry(entry, includeIds, language)),
      acquiredWhetblades: slot.progress.acquiredWhetblades.map((entry) => progressEntry(entry, includeIds, language)),
      knownCatalogTotals: slot.progress.totals,
      pendingContent: pending,
    }),
    parserCoverage: {
      decodedGroups: [
        l('identity and profiles', 'identidad y perfiles'),
        l('attributes, level, and resources', 'atributos, nivel y recursos'),
        l('equipment, spells, inventory, and storage', 'equipo, hechizos, inventario y almacén'),
        l('flasks, Flask of Wondrous Physick, and active effects', 'frascos, Físico Maravilloso y efectos activos'),
        l('deaths, bloodstain, regions, and position', 'muertes, mancha de sangre, regiones y posición'),
        l('known progress flags', 'banderas de progreso conocidas'),
        l('world state, mount, DLC, and MD5 integrity', 'estado del mundo, montura, DLC e integridad MD5'),
      ],
      opaqueSectionIndex: raw.opaqueSections.map((section) => ({
        name: section.name,
        lengthBytes: section.length,
        ...(includeIds ? { offset: section.offset } : {}),
      })),
      caveat:
        l(
          'The save contains internal blobs and fields that still lack reliable public semantics. They are indexed as opaque instead of being assigned an invented meaning.',
          'El save contiene blobs internos y campos todavía sin semántica pública fiable. Se indexan como opacos en vez de inventar un significado.',
        ),
    },
    rawEventFlags: privacy.includeRawEventFlags
      ? {
          encoding: 'base64',
          byteLength: raw.eventFlags.byteLength,
          data: encodeBase64(raw.eventFlags),
        }
      : undefined,
  });
}

function serializableSlot(slot: ParsedSlot, privacy: ExportPrivacyOptions): Record<string, unknown> {
  const includeIds = privacy.includeRawInternalIds;
  const positionData = privacy.includeCoordinates
    ? {
        saveMapId: slot.mapId,
        playerPosition: slot.playerPosition,
        bloodstain: slot.bloodstain,
        horse: slot.horse,
      }
    : {
        saveMapId: { mapRedacted: true },
        playerPosition: { coordinatesRedacted: true, mapRedacted: true, orientationRedacted: true },
        bloodstain: { runes: slot.bloodstain.runes, coordinatesRedacted: true, mapRedacted: true },
        horse: { hp: slot.horse.hp, state: slot.horse.state, coordinatesRedacted: true, mapRedacted: true },
      };

  const internalData = includeIds
    ? {
        gaItems: slot.gaItems,
        heldInventory: slot.heldInventory,
        chestInventory: slot.chestInventory,
        equipment: slot.equipment,
        activeWeaponSlots: slot.activeWeaponSlots,
        equippedSpells: slot.equippedSpells,
        quickAndPouch: slot.quickAndPouch,
        equippedGestures: slot.equippedGestures,
        unlockedGestures: slot.unlockedGestures,
        acquiredProjectiles: slot.acquiredProjectiles,
        physickTearHandles: slot.physickTearHandles,
        specialEffects: slot.specialEffects,
        unlockedRegionIds: slot.unlockedRegionIds,
        lastRestedGraceEntityId: slot.lastRestedGraceEntityId,
        spawnPointEntityId: slot.spawnPointEntityId,
        worldWeather: slot.worldWeather,
        baseVersion: slot.baseVersion,
        opaqueSections: slot.opaqueSections,
        parseEndOffset: slot.parseEndOffset,
      }
    : {
        gaItems: { count: slot.gaItems.length, entriesRedacted: true },
        heldInventory: {
          commonDistinctCount: slot.heldInventory.commonDistinctCount,
          keyDistinctCount: slot.heldInventory.keyDistinctCount,
          entriesRedacted: true,
        },
        chestInventory: {
          commonDistinctCount: slot.chestInventory.commonDistinctCount,
          keyDistinctCount: slot.chestInventory.keyDistinctCount,
          entriesRedacted: true,
        },
        equipment: { handlesRedacted: true },
        eventDerivedArrays: {
          equippedSpellsCount: slot.equippedSpells.filter((id) => id !== 0 && id !== 0xffff_ffff).length,
          quickSlotCount: slot.quickAndPouch.quickSlots.filter((handle) => handle !== 0 && handle !== 0xffff_ffff).length,
          pouchSlotCount: slot.quickAndPouch.pouch.filter((handle) => handle !== 0 && handle !== 0xffff_ffff).length,
          equippedGestureCount: slot.equippedGestures.filter((id) => id !== 0 && id !== 0xffff_ffff).length,
          unlockedGestureCount: slot.unlockedGestures.filter((id) => id !== 0 && id !== 0xffff_ffff).length,
          projectileCount: slot.acquiredProjectiles.length,
          specialEffectCount: slot.specialEffects.length,
          unlockedRegionCount: slot.unlockedRegionIds.length,
          idsRedacted: true,
        },
        opaqueSections: slot.opaqueSections.map((section) => ({ name: section.name, length: section.length })),
      };

  return withoutUndefined({
    slotIndex: slot.slotIndex,
    slotFormatVersion: slot.version,
    profileName: slot.profileName,
    profileLevel: slot.profileLevel,
    secondsPlayed: slot.secondsPlayed,
    ...(privacy.includeSteamIds ? { steamId: slot.steamId } : {}),
    player: {
      characterName: slot.player.characterName,
      level: slot.player.level,
      runes: slot.player.runes,
      runesMemory: slot.player.runesMemory,
      attributes: slot.player.attributes,
      hp: slot.player.hp,
      fp: slot.player.fp,
      stamina: slot.player.stamina,
      buildup: slot.player.buildup,
      additionalTalismanSlotCount: slot.player.additionalTalismanSlotCount,
      summonSpiritLevel: slot.player.summonSpiritLevel,
      matchmakingWeaponLevel: slot.player.matchmakingWeaponLevel,
      furlcallingFingerRemedyActive: slot.player.furlcallingFingerRemedyActive,
      whiteCipherRingActive: slot.player.whiteCipherRingActive,
      blueCipherRingActive: slot.player.blueCipherRingActive,
      greatRuneActive: slot.player.greatRuneActive,
      maxCrimsonFlaskCount: slot.player.maxCrimsonFlaskCount,
      maxCeruleanFlaskCount: slot.player.maxCeruleanFlaskCount,
      ...(includeIds
        ? {
            genderCode: slot.player.genderCode,
            archetypeCode: slot.player.archetypeCode,
            voiceType: slot.player.voiceType,
            startingGiftCode: slot.player.startingGiftCode,
          }
        : {}),
    },
    deaths: slot.deaths,
    worldTime: slot.worldTime,
    dlc: slot.dlc,
    integrity: {
      valid: slot.integrity.valid,
      ...(includeIds
        ? { storedMd5Hex: slot.integrity.storedMd5Hex, computedMd5Hex: slot.integrity.computedMd5Hex }
        : {}),
    },
    ...positionData,
    ...internalData,
    eventFlags: privacy.includeRawEventFlags
      ? { encoding: 'base64', byteLength: slot.eventFlags.length, data: encodeBase64(slot.eventFlags) }
      : { byteLength: slot.eventFlags.length, dataRedacted: true },
  });
}

export function buildForensicExport(context: ExportContext): Record<string, unknown> {
  const language = context.language ?? DEFAULT_LANGUAGE;
  const semantic = buildSemanticExport({
    ...context,
    privacy: { ...context.privacy, includeRawEventFlags: false },
  });
  return {
    schema: 'eldenring-savegame-analyzer.forensic.v1',
    generatedAt: new Date().toISOString(),
    warning: localize(
      language,
      'Read-only technical export. It must not be used to rewrite a save file.',
      'Exportación técnica de solo lectura. No debe usarse para reescribir una partida.',
    ),
    semantic,
    parsedSave: withoutUndefined({
      schemaVersion: context.save.schemaVersion,
      parserVersion: context.save.parserVersion,
      file: context.save.file,
      profiles: context.save.profiles,
      warnings: context.save.warnings,
      ...(context.privacy.includeSteamIds ? { globalSteamId: context.save.globalSteamId } : {}),
      slots: context.save.slots.map((slot) => serializableSlot(slot, context.privacy)),
    }),
  };
}

function listNames(items: Array<{ name: string }>, language: AppLanguage, maximum = 20): string {
  if (items.length === 0) return localize(language, 'None detected.', 'Ninguno detectado.');
  const names = items.slice(0, maximum).map((item) => item.name);
  const remaining = items.length - names.length;
  return `${names.join(', ')}${remaining > 0
    ? localize(language, `, and ${remaining} more`, `, y ${remaining} más`)
    : ''}.`;
}

function markdownPendingProgress(context: ExportContext): string {
  if (context.spoilerMode !== 'precise' && context.spoilerMode !== 'completion') return '';
  const language = context.language ?? DEFAULT_LANGUAGE;
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const groups = [
    [l('Bosses/milestones', 'Jefes/hitos'), missingProgressEntries(context.catalog.bosses, context.slot.raw, context.catalog)],
    [l('Sites of Grace', 'Lugares de gracia'), missingProgressEntries(context.catalog.graces, context.slot.raw, context.catalog)],
    [l('Cookbooks', 'Libros de recetas'), missingProgressEntries(context.catalog.cookbooks, context.slot.raw, context.catalog)],
    [l('Bell bearings', 'Rodamientos de campana'), missingProgressEntries(context.catalog.bellBearings, context.slot.raw, context.catalog)],
    [l('Whetblades', 'Hojas de afilar'), missingProgressEntries(context.catalog.whetblades, context.slot.raw, context.catalog)],
  ] as const;

  if (context.spoilerMode === 'precise') {
    return `
## ${l('Undetected content — unnamed counts', 'Contenido no detectado — recuentos sin nombres')}

${groups
      .map(([label, entries]) => `- ${label}: **${formatNumber(entries.length, language)}**.`)
      .join('\n')}
`;
  }

  return `
## ${l('Undetected content — completionist mode', 'Contenido no detectado — modo completista')}

> ${l('This section may reveal the names of future content.', 'Esta sección puede revelar nombres de contenido futuro.')}

${groups
    .map(([label, entries]) => `- ${label}: ${listNames(entries, language, 150)}`)
    .join('\n')}
`;
}

export function buildMarkdownReport(context: ExportContext): string {
  const { slot } = context;
  const language = context.language ?? DEFAULT_LANGUAGE;
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const includeIds = context.privacy.includeRawInternalIds;
  const mainWeapons = [...slot.equipment.rightHand, ...slot.equipment.leftHand]
    .filter((item) => item.handle !== 0 && item.name !== 'Mano desnuda' && item.name !== 'Bare hands')
    .map((item) => ({ name: exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language)) }));
  const activeTalismans = slot.equipment.talismans
    .filter((item) => item.handle !== 0)
    .map((item) => ({ name: exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language)) }));
  const activeSpells = slot.equipment.spells
    .filter((spell) => spell.id !== 0 && spell.id !== 0xffff_ffff)
    .map((spell) => ({ name: exportLabel(spell.name, includeIds, l('Unresolved spell', 'Hechizo sin resolver')) }));
  const physickTears = slot.equipment.physickTears
    .filter((item) => item.handle !== 0)
    .map((item) => ({ name: exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language)) }));
  const advice = slot.build.advice
    .map((item) => `- **${item.title}:** ${item.detail} _${l('Evidence', 'Evidencia')}: ${item.evidence.map((entry) => exportEvidence(entry, includeIds, language)).join('; ')}._`)
    .join('\n');
  const attributeLabels: Record<string, string> = {
    vigor: 'vigor',
    mind: l('mind', 'mente'),
    endurance: l('endurance', 'aguante'),
    strength: l('strength', 'fuerza'),
    dexterity: l('dexterity', 'destreza'),
    intelligence: l('intelligence', 'inteligencia'),
    faith: l('faith', 'fe'),
    arcane: l('arcane', 'arcano'),
  };
  const attributes = Object.entries(slot.attributes)
    .map(([key, value]) => `${attributeLabels[key] ?? key} ${value}`)
    .join(', ');
  const pendingProgress = markdownPendingProgress(context);

  return `# ${l('Elden Ring save report', 'Informe de partida de Elden Ring')} — ${slot.identity.name}\n\n` +
    `> ${l(
      'Generated locally by Elden Ring Savegame Analyzer. This is not a save editor. Milestones are inferred from the save and do not replace the official Steam achievement history.',
      'Generado localmente por Elden Ring Savegame Analyzer. No es un editor de partidas. Los hitos se infieren desde el save y no sustituyen al historial oficial de Steam.',
    )}\n\n` +
    `## ${l('Instructions for the model', 'Instrucciones para el modelo')}\n\n` +
    `${l(
      'Analyze this save with practical, verifiable recommendations. Do not reveal future content that is not already marked as discovered or defeated. Distinguish extracted facts, inferences, and recommendations. Do not suggest editing the save or using mods.',
      'Analiza esta partida con recomendaciones prácticas y verificables. No reveles contenido futuro que no aparezca ya como descubierto o derrotado. Distingue hechos extraídos, inferencias y recomendaciones. No propongas editar el save ni usar mods.',
    )}\n\n` +
    `## ${l('Summary', 'Resumen')}\n\n` +
    `- ${l('Character', 'Personaje')}: **${slot.identity.name}**, ${l('level', 'nivel')} **${slot.identity.level}**, ${l('starting class', 'clase inicial')} **${exportLabel(slot.identity.className, includeIds, l('unresolved', 'sin resolver'))}**.\n` +
    `- ${l('Play time', 'Tiempo')}: **${formatDuration(slot.identity.playtimeSeconds)}**. ${l('Deaths', 'Muertes')}: **${formatNumber(slot.overview.deaths, language)}**.\n` +
    `- ${l('Current runes', 'Runas actuales')}: **${formatNumber(slot.overview.currentRunes, language)}**; ${l('lifetime', 'acumuladas')}: **${formatNumber(slot.overview.lifetimeRunes, language)}**; ${l('in bloodstain', 'en mancha')}: **${formatNumber(slot.overview.bloodstainRunes, language)}**.\n` +
    `- ${l('Last Site of Grace', 'Última gracia')}: **${exportLabel(slot.overview.lastRestedGrace, includeIds, l('unresolved', 'sin resolver'))}**.\n` +
    `- ${l('Flasks', 'Frascos')}: **${slot.overview.crimsonFlasks} ${l('Crimson', 'carmesí')} + ${slot.overview.ceruleanFlasks} ${l('Cerulean', 'cerúleo')}**. ${l('Talisman slots', 'Ranuras de talismán')}: **${slot.overview.talismanSlots}**.\n\n` +
    `## ${l('Attributes and build', 'Atributos y build')}\n\n` +
    `${l('Attributes', 'Atributos')}: ${attributes}.\n\n` +
    `${l('Interpretation', 'Interpretación')}: **${slot.build.archetype}**. ${slot.build.summary}\n\n` +
    `${advice || l('- No automatic observations.', '- Sin observaciones automáticas.')}\n\n` +
    `## ${l('Equipment', 'Equipo')}\n\n` +
    `- ${l('Weapons', 'Armas')}: ${listNames(mainWeapons, language)}\n` +
    `- ${l('Talismans', 'Talismanes')}: ${listNames(activeTalismans, language)}\n` +
    `- ${l('Spells', 'Hechizos')}: ${listNames(activeSpells, language)}\n` +
    `- ${l('Physick tears', 'Lágrimas del Físico')}: ${listNames(physickTears, language)}\n\n` +
    `## ${l('Inventory', 'Inventario')}\n\n` +
    `${l(
      `Resolved **${slot.inventory.length} entries**; ${slot.inventory.filter((item) => item.keyItem).length} are key items and ${slot.inventory.filter((item) => item.storage === 'chest').length} are in the chest.`,
      `Se han resuelto **${slot.inventory.length} entradas**; ${slot.inventory.filter((item) => item.keyItem).length} son objetos clave y ${slot.inventory.filter((item) => item.storage === 'chest').length} están en el baúl.`,
    )}\n\n` +
    `${slot.inventory.map((item) => `- ${exportLabel(item.name, includeIds, unresolvedItemLabel(item.type, language))}${item.upgradeLevel ? ` +${item.upgradeLevel}` : ''} ×${item.quantity} — ${item.storage === 'held' ? l('inventory', 'inventario') : l('chest', 'baúl')}${item.keyItem ? l(', key item', ', clave') : ''}${item.equipped ? l(', equipped', ', equipado') : ''}`).join('\n')}\n\n` +
    `## ${l('Detected progress', 'Progreso ya detectado')}\n\n` +
    `- ${l('Defeated bosses/milestones', 'Jefes/hitos derrotados')}: ${listNames(slot.progress.defeatedBosses, language, 100)}\n` +
    `- ${l('Discovered Sites of Grace', 'Lugares de gracia descubiertos')}: ${listNames(slot.progress.discoveredGraces, language, 100)}\n` +
    `- ${l('Cookbooks', 'Libros de recetas')}: ${listNames(slot.progress.acquiredCookbooks, language, 100)}\n` +
    `- ${l('Bell bearings', 'Rodamientos de campana')}: ${listNames(slot.progress.acquiredBellBearings, language, 100)}\n` +
    `- ${l('Whetblades', 'Hojas de afilar')}: ${listNames(slot.progress.acquiredWhetblades, language, 100)}\n` +
    pendingProgress;
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function downloadText(content: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(slot: SemanticSlot, suffix: string, extension: string): string {
  return `${safeFilename(slot.identity.name)}-lvl-${slot.identity.level}-${suffix}.${extension}`;
}
