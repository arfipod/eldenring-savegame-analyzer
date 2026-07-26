import { fallbackCatalog } from '../data/fallback-catalog';
import type { CatalogItem, CatalogItemMap, SemanticCatalog } from '../types';
import type { AppLanguage } from './i18n';
import { DEFAULT_LANGUAGE, localize } from './i18n';

const CHECKLIST_COMMIT = 'be4060d21f4d88bb437bedf76c2a1b06a62590ac';
const CHECKLIST_ROOT = `https://raw.githubusercontent.com/CyberGiant7/Elden-Ring-Automatic-Checklist/${CHECKLIST_COMMIT}/assets/json`;
const SOULSGYM_COMMIT = '860c74365a5b0227b0c59ad16847181036838a6a';
const ERDB_COMMIT = '7b6f6e395a72708f96672e1448d0ef8a2ab2344f';
const ERDB_ROOT = `https://raw.githubusercontent.com/Elden-Ring-LLM/Elden-Ring-LLM/${ERDB_COMMIT}/erdb/json`;
const GRACE_ENTITIES_URL = `https://raw.githubusercontent.com/amacati/SoulsGym/${SOULSGYM_COMMIT}/soulsgym/core/data/eldenring/bonfires.yaml`;
const CACHE_NAME = 'eldenring-semantic-catalog-v2';
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;

interface RawInventoryCatalog {
  armament?: CatalogItemMap;
  armor?: CatalogItemMap;
  talisman?: CatalogItemMap;
  ashesOfWar?: CatalogItemMap;
  magic?: CatalogItemMap;
  spiritAshes?: CatalogItemMap;
}


interface ErdbItemRecord {
  full_hex_id?: string;
  name?: string;
  summary?: string;
  description?: string[];
  category?: string;
  rarity?: string;
  hint?: string;
  max_held?: number;
  max_stored?: number;
}

type ErdbCatalog = Record<string, ErdbItemRecord>;

export function mapErdbCatalog(raw: ErdbCatalog | null): CatalogItemMap {
  const result: CatalogItemMap = {};
  for (const record of Object.values(raw ?? {})) {
    const hex = record.full_hex_id?.replace(/^0x/i, '').toUpperCase();
    if (!hex || !/^[0-9A-F]{8}$/.test(hex) || !record.name) continue;
    result[hex] = {
      name: record.name,
      category: record.category,
      summary: record.summary,
      description: record.description,
      hint: record.hint,
      rarity: record.rarity,
      maxHeld: record.max_held,
      maxStored: record.max_stored,
      source: 'base',
    };
  }
  return result;
}

interface RawProgressCatalog {
  bosses?: CatalogItemMap;
  graces?: CatalogItemMap;
  cookbooks?: CatalogItemMap;
  bell_bearings?: CatalogItemMap;
  whetblades?: CatalogItemMap;
  tools?: CatalogItemMap;
  gestures?: CatalogItemMap;
  crystal_tears?: CatalogItemMap;
}

const cloneMap = (map: CatalogItemMap | undefined, source: 'base' | 'dlc'): CatalogItemMap =>
  Object.fromEntries(
    Object.entries(map ?? {}).map(([key, item]) => [key.toUpperCase(), { ...item, source }]),
  );

function mergeMaps(...maps: Array<CatalogItemMap | undefined>): CatalogItemMap {
  return Object.assign({}, ...maps.filter(Boolean));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await cachedFetchWithSignal(url, controller.signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decodeCatalogText(await readResponseBytes(response));
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CATALOG_BYTES) {
    throw new Error(`Catalog exceeds the ${MAX_CATALOG_BYTES}-byte limit`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_CATALOG_BYTES) throw new Error(`Catalog exceeds the ${MAX_CATALOG_BYTES}-byte limit`);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_CATALOG_BYTES) {
      await reader.cancel();
      throw new Error(`Catalog exceeds the ${MAX_CATALOG_BYTES}-byte limit`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function decodeCatalogText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    if ((bytes.length - 2) % 2 !== 0) throw new Error('Invalid UTF-16LE catalog byte length');
    return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    if ((bytes.length - 2) % 2 !== 0) throw new Error('Invalid UTF-16BE catalog byte length');
    return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
  }
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start));
}

async function cachedFetchWithSignal(url: string, signal: AbortSignal): Promise<Response> {
  if (typeof caches === 'undefined') return fetch(url, { signal, cache: 'force-cache' });
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url, { signal, cache: 'force-cache' });
  if (response.ok) await cache.put(url, response.clone());
  return response;
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

function parseGraceEntities(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const match = line.match(/^(.*):\s*(\d+)\s*$/);
    if (!match) continue;
    const [, label, id] = match;
    if (label && id) result[id] = label.trim();
  }
  return result;
}

function withFallback(remote: SemanticCatalog): SemanticCatalog {
  const fallbackInventory = fallbackCatalog.inventory;
  return {
    ...remote,
    inventory: {
      armament: mergeMaps(fallbackInventory.armament, remote.inventory.armament),
      armor: mergeMaps(fallbackInventory.armor, remote.inventory.armor),
      talisman: mergeMaps(fallbackInventory.talisman, remote.inventory.talisman),
      ashesOfWar: mergeMaps(fallbackInventory.ashesOfWar, remote.inventory.ashesOfWar),
      magic: mergeMaps(fallbackInventory.magic, remote.inventory.magic),
      spiritAshes: mergeMaps(fallbackInventory.spiritAshes, remote.inventory.spiritAshes),
      tools: mergeMaps(fallbackInventory.tools, remote.inventory.tools),
      gestures: mergeMaps(fallbackInventory.gestures, remote.inventory.gestures),
      crystal_tears: mergeMaps(fallbackInventory.crystal_tears, remote.inventory.crystal_tears),
      goods: mergeMaps(fallbackInventory.goods, remote.inventory.goods),
    },
    bosses: mergeMaps(fallbackCatalog.bosses, remote.bosses),
    graces: mergeMaps(fallbackCatalog.graces, remote.graces),
    cookbooks: mergeMaps(fallbackCatalog.cookbooks, remote.cookbooks),
    bellBearings: mergeMaps(fallbackCatalog.bellBearings, remote.bellBearings),
    whetblades: mergeMaps(fallbackCatalog.whetblades, remote.whetblades),
    eventFlagBst: { ...fallbackCatalog.eventFlagBst, ...remote.eventFlagBst },
    graceEntities: { ...fallbackCatalog.graceEntities, ...remote.graceEntities },
  };
}

export async function loadSemanticCatalog(
  onStatus: (message: string) => void = () => undefined,
  language: AppLanguage = DEFAULT_LANGUAGE,
): Promise<SemanticCatalog> {
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const warnings: string[] = [];
  const loadedSources: string[] = [];

  const attempt = async <T>(label: string, url: string): Promise<T | null> => {
    try {
      onStatus(l(`Loading ${label}…`, `Cargando ${label}…`));
      const value = await fetchJson<T>(url);
      loadedSources.push(label);
      return value;
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const [
    base,
    dlc,
    bosses,
    graces,
    cookbooks,
    bellBearings,
    whetblades,
    tools,
    gestures,
    tears,
    erdbTools,
    erdbCrafting,
    erdbBolstering,
  ] = await Promise.all([
    attempt<RawInventoryCatalog>(l('MIT base catalog', 'catálogo base MIT'), `${CHECKLIST_ROOT}/all_items.json`),
    attempt<RawInventoryCatalog & RawProgressCatalog>(l('MIT DLC catalog', 'catálogo DLC MIT'), `${CHECKLIST_ROOT}/dlc_items.json`),
    attempt<RawProgressCatalog>(l('bosses', 'jefes'), `${CHECKLIST_ROOT}/bosses.json`),
    attempt<RawProgressCatalog>(l('Sites of Grace', 'lugares de gracia'), `${CHECKLIST_ROOT}/graces.json`),
    attempt<RawProgressCatalog>(l('cookbooks', 'libros de recetas'), `${CHECKLIST_ROOT}/cookbooks.json`),
    attempt<RawProgressCatalog>(l('bell bearings', 'rodamientos de campana'), `${CHECKLIST_ROOT}/bell_bearings.json`),
    attempt<RawProgressCatalog>(l('whetblades', 'hojas de afilar'), `${CHECKLIST_ROOT}/whetblades.json`),
    attempt<RawProgressCatalog>(l('tools', 'herramientas'), `${CHECKLIST_ROOT}/tools.json`),
    attempt<RawProgressCatalog>(l('gestures', 'gestos'), `${CHECKLIST_ROOT}/gestures.json`),
    attempt<RawProgressCatalog>(l('crystal tears', 'lágrimas de cristal'), `${CHECKLIST_ROOT}/crystal_tears.json`),
    attempt<ErdbCatalog>(l('ERDB: tools and consumables', 'ERDB: herramientas y consumibles'), `${ERDB_ROOT}/tools.json`),
    attempt<ErdbCatalog>(l('ERDB: crafting materials', 'ERDB: materiales de fabricación'), `${ERDB_ROOT}/crafting-materials.json`),
    attempt<ErdbCatalog>(l('ERDB: upgrade materials', 'ERDB: materiales de mejora'), `${ERDB_ROOT}/bolstering-materials.json`),
  ]);

  let eventFlagBst: Record<string, number> = {};
  try {
    onStatus(l('Loading event flag index…', 'Cargando índice de banderas de evento…'));
    eventFlagBst = await fetchJson<Record<string, number>>(`${CHECKLIST_ROOT}/eventflag_bst.json`);
    loadedSources.push(l('event flag index', 'índice de banderas de evento'));
  } catch (error) {
    warnings.push(`${l('Event flag index', 'Índice de banderas')}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let graceEntities: Record<string, string> = {};
  try {
    onStatus(l('Loading Site of Grace names…', 'Cargando nombres de puntos de gracia…'));
    graceEntities = parseGraceEntities(await fetchText(GRACE_ENTITIES_URL));
    loadedSources.push(l('Site of Grace entities (SoulsGym, MIT)', 'entidades de gracia (SoulsGym, MIT)'));
  } catch (error) {
    warnings.push(`${l('Site of Grace entities', 'Entidades de gracia')}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const baseInventory = base ?? {};
  const dlcInventory = dlc ?? {};
  const remote: SemanticCatalog = {
    inventory: {
      armament: mergeMaps(cloneMap(baseInventory.armament, 'base'), cloneMap(dlcInventory.armament, 'dlc')),
      armor: mergeMaps(cloneMap(baseInventory.armor, 'base'), cloneMap(dlcInventory.armor, 'dlc')),
      talisman: mergeMaps(cloneMap(baseInventory.talisman, 'base'), cloneMap(dlcInventory.talisman, 'dlc')),
      ashesOfWar: mergeMaps(
        cloneMap(baseInventory.ashesOfWar, 'base'),
        cloneMap(dlcInventory.ashesOfWar, 'dlc'),
      ),
      magic: mergeMaps(cloneMap(baseInventory.magic, 'base'), cloneMap(dlcInventory.magic, 'dlc')),
      spiritAshes: mergeMaps(
        cloneMap(baseInventory.spiritAshes, 'base'),
        cloneMap(dlcInventory.spiritAshes, 'dlc'),
      ),
      tools: mergeMaps(cloneMap(tools?.tools, 'base'), cloneMap(dlc?.tools, 'dlc')),
      gestures: mergeMaps(cloneMap(gestures?.gestures, 'base'), cloneMap(dlc?.gestures, 'dlc')),
      crystal_tears: mergeMaps(
        cloneMap(tears?.crystal_tears, 'base'),
        cloneMap(dlc?.crystal_tears, 'dlc'),
      ),
      goods: mergeMaps(mapErdbCatalog(erdbTools), mapErdbCatalog(erdbCrafting), mapErdbCatalog(erdbBolstering)),
    },
    bosses: mergeMaps(cloneMap(bosses?.bosses, 'base'), cloneMap(dlc?.bosses, 'dlc')),
    graces: mergeMaps(cloneMap(graces?.graces, 'base'), cloneMap(dlc?.graces, 'dlc')),
    cookbooks: mergeMaps(cloneMap(cookbooks?.cookbooks, 'base'), cloneMap(dlc?.cookbooks, 'dlc')),
    bellBearings: mergeMaps(
      cloneMap(bellBearings?.bell_bearings, 'base'),
      cloneMap(dlc?.bell_bearings, 'dlc'),
    ),
    whetblades: mergeMaps(cloneMap(whetblades?.whetblades, 'base'), cloneMap(dlc?.whetblades, 'dlc')),
    eventFlagBst,
    graceEntities,
    loadedSources,
    warnings,
  };

  const result = withFallback(remote);
  if (loadedSources.length === 0) {
    result.warnings.push(l(
      'The remote catalog could not be loaded; the minimal built-in catalog is being used.',
      'No se pudo cargar el catálogo remoto; se usa el catálogo mínimo integrado.',
    ));
  }
  return result;
}

export function getFallbackCatalog(language: AppLanguage = DEFAULT_LANGUAGE): SemanticCatalog {
  const catalog = structuredClone(fallbackCatalog);
  catalog.loadedSources = [localize(language, 'built-in fallback', 'fallback integrado')];
  return catalog;
}

export async function clearCatalogCache(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
}

export function catalogSourceInfo(): { checklistCommit: string; soulsGymCommit: string; erdbCommit: string } {
  return { checklistCommit: CHECKLIST_COMMIT, soulsGymCommit: SOULSGYM_COMMIT, erdbCommit: ERDB_COMMIT };
}
