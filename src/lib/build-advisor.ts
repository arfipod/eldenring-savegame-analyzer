import { STARTING_CLASSES } from '../data/fallback-catalog';
import type { AppLanguage } from './i18n';
import { DEFAULT_LANGUAGE, localeFor, localize } from './i18n';
import type {
  AdviceItem,
  AttributeKey,
  BuildAnalysis,
  ParsedSlot,
  ResolvedEquipment,
} from '../types';

interface StartingClassData {
  level: number;
  stats: Record<AttributeKey, number>;
}

const STARTING_CLASS_DATA: Record<number, StartingClassData> = {
  0: { level: 9, stats: { vigor: 15, mind: 10, endurance: 11, strength: 14, dexterity: 13, intelligence: 9, faith: 9, arcane: 7 } },
  1: { level: 8, stats: { vigor: 11, mind: 12, endurance: 11, strength: 10, dexterity: 16, intelligence: 10, faith: 8, arcane: 9 } },
  2: { level: 7, stats: { vigor: 14, mind: 9, endurance: 12, strength: 16, dexterity: 9, intelligence: 7, faith: 8, arcane: 11 } },
  3: { level: 5, stats: { vigor: 10, mind: 11, endurance: 10, strength: 9, dexterity: 13, intelligence: 9, faith: 8, arcane: 14 } },
  4: { level: 6, stats: { vigor: 9, mind: 15, endurance: 9, strength: 8, dexterity: 12, intelligence: 16, faith: 7, arcane: 9 } },
  5: { level: 7, stats: { vigor: 10, mind: 14, endurance: 8, strength: 11, dexterity: 10, intelligence: 7, faith: 16, arcane: 10 } },
  6: { level: 9, stats: { vigor: 12, mind: 11, endurance: 13, strength: 12, dexterity: 15, intelligence: 9, faith: 8, arcane: 8 } },
  7: { level: 9, stats: { vigor: 11, mind: 12, endurance: 11, strength: 11, dexterity: 14, intelligence: 14, faith: 6, arcane: 9 } },
  8: { level: 10, stats: { vigor: 10, mind: 13, endurance: 10, strength: 12, dexterity: 12, intelligence: 9, faith: 14, arcane: 9 } },
  9: { level: 1, stats: { vigor: 10, mind: 10, endurance: 10, strength: 10, dexterity: 10, intelligence: 10, faith: 10, arcane: 10 } },
};

const DAMAGE_STATS: AttributeKey[] = ['strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
const LABELS: Record<AppLanguage, Record<AttributeKey, string>> = {
  en: {
    vigor: 'Vigor',
    mind: 'Mind',
    endurance: 'Endurance',
    strength: 'Strength',
    dexterity: 'Dexterity',
    intelligence: 'Intelligence',
    faith: 'Faith',
    arcane: 'Arcane',
  },
  es: {
    vigor: 'Vigor',
    mind: 'Mente',
    endurance: 'Aguante',
    strength: 'Fuerza',
    dexterity: 'Destreza',
    intelligence: 'Inteligencia',
    faith: 'Fe',
    arcane: 'Arcano',
  },
};

function inferArchetype(slot: ParsedSlot, equipment: ResolvedEquipment, language: AppLanguage): {
  label: string;
  primaryStats: AttributeKey[];
  summary: string;
} {
  const stats = slot.player.attributes;
  const ordered = DAMAGE_STATS.map((key) => ({ key, value: stats[key] })).sort((a, b) => b.value - a.value);
  const first = ordered[0] ?? { key: 'strength' as AttributeKey, value: 0 };
  const second = ordered[1] ?? first;
  const mainWeaponNames = [...equipment.rightHand, ...equipment.leftHand]
    .filter((item) => item.handle !== 0)
    .map((item) => item.name)
    .filter((name) => !name.startsWith('ID '));
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const labels = LABELS[language];
  const weaponText = mainWeaponNames.length > 0
    ? l(` with ${mainWeaponNames.slice(0, 2).join(' / ')}`, ` con ${mainWeaponNames.slice(0, 2).join(' / ')}`)
    : '';

  let label: string;
  let primaryStats: AttributeKey[];
  if (first.value - second.value <= 10 && second.value >= 18) {
    primaryStats = [first.key, second.key];
    label = `${labels[first.key]} / ${labels[second.key]}`;
  } else {
    primaryStats = [first.key];
    label = labels[first.key];
  }

  const faithSupport = stats.faith >= 12 && !primaryStats.includes('faith');
  const intelligenceSupport = stats.intelligence >= 12 && !primaryStats.includes('intelligence');
  const arcaneSupport = stats.arcane >= 12 && !primaryStats.includes('arcane');
  const support = faithSupport
    ? l(' with supporting Faith', ' con Fe de apoyo')
    : intelligenceSupport
      ? l(' with supporting Intelligence', ' con Inteligencia de apoyo')
      : arcaneSupport
        ? l(' with supporting Arcane', ' con Arcano de apoyo')
        : '';

  return {
    label: `${label}${support}`,
    primaryStats,
    summary: l(
      `Build focused on ${label.toLocaleLowerCase('en')}${support}${weaponText}.`,
      `Build centrada en ${label.toLocaleLowerCase('es')}${support}${weaponText}.`,
    ),
  };
}

function pointAllocation(slot: ParsedSlot): {
  invested: Record<AttributeKey, number>;
  expectedLevel: number;
  consistent: boolean;
} {
  const starting = STARTING_CLASS_DATA[slot.player.archetypeCode] ?? STARTING_CLASS_DATA[9];
  if (!starting) {
    return {
      invested: Object.fromEntries(Object.keys(slot.player.attributes).map((key) => [key, 0])) as Record<AttributeKey, number>,
      expectedLevel: slot.player.level,
      consistent: false,
    };
  }
  const invested = Object.fromEntries(
    (Object.keys(slot.player.attributes) as AttributeKey[]).map((key) => [
      key,
      Math.max(0, slot.player.attributes[key] - starting.stats[key]),
    ]),
  ) as Record<AttributeKey, number>;
  const expectedLevel = starting.level + Object.values(invested).reduce((sum, value) => sum + value, 0);
  return { invested, expectedLevel, consistent: expectedLevel === slot.player.level };
}

export function analyzeBuild(
  slot: ParsedSlot,
  equipment: ResolvedEquipment,
  language: AppLanguage = DEFAULT_LANGUAGE,
): BuildAnalysis {
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  const inferred = inferArchetype(slot, equipment, language);
  const allocation = pointAllocation(slot);
  const advice: AdviceItem[] = [];
  const stats = slot.player.attributes;
  const level = slot.player.level;
  const activeSpells = equipment.spells.filter((spell) => spell.id !== 0 && spell.id !== 0xffff_ffff);
  const activeTalismans = equipment.talismans.filter((item) => item.handle !== 0);
  const totalTalismanSlots = Math.min(4, Math.max(1, 1 + slot.player.additionalTalismanSlotCount));
  const activeWeapons = [...equipment.rightHand, ...equipment.leftHand].filter((item) => item.handle !== 0);
  const mainUpgrade = Math.max(0, ...activeWeapons.map((item) => item.upgradeLevel));

  if (stats.vigor >= 40) {
    advice.push({
      id: 'vigor-good',
      severity: 'good',
      title: l('Survivability is well covered', 'Supervivencia bien cubierta'),
      detail: l(
        `Vigor ${stats.vigor} is a solid base for level ${level}; it does not appear to be the build's main bottleneck.`,
        `Vigor ${stats.vigor} es una base sólida para nivel ${level}; no parece el cuello de botella principal de la build.`,
      ),
      evidence: [`Vigor ${stats.vigor}`, l(`Max HP ${slot.player.hp.max}`, `PV máximos ${slot.player.hp.max}`)],
    });
  } else if (level >= 70 && stats.vigor < 35) {
    advice.push({
      id: 'vigor-low',
      severity: 'warning',
      title: l('Low Vigor for the current level range', 'Vigor bajo para el tramo actual'),
      detail: l(
        'Prioritizing a few Vigor points usually provides more room for error than spreading them across several offensive attributes.',
        'Priorizar algunos puntos de Vigor suele aportar más margen de error que repartirlos entre varios atributos ofensivos.',
      ),
      evidence: [l(`Level ${level}`, `Nivel ${level}`), `Vigor ${stats.vigor}`],
    });
  } else {
    advice.push({
      id: 'vigor-neutral',
      severity: 'info',
      title: l('Vigor is still developing', 'Vigor en desarrollo'),
      detail: l(
        'Keep Vigor in step with your level before opening another offensive branch.',
        'Mantén Vigor acompasado con el nivel antes de abrir otra rama ofensiva.',
      ),
      evidence: [l(`Level ${level}`, `Nivel ${level}`), `Vigor ${stats.vigor}`],
    });
  }

  if (activeSpells.length > 0 && slot.player.maxCeruleanFlaskCount <= 1 && stats.mind <= 12) {
    advice.push({
      id: 'fp-tight',
      severity: 'info',
      title: l('Limited FP for frequent magic or skill use', 'FP ajustado para usar magia o habilidades con frecuencia'),
      detail: l(
        'Low Mind and a single Cerulean Flask are efficient for melee with occasional support, but limit long chains of skills or incantations.',
        'La combinación de Mente baja y un solo frasco cerúleo es eficiente para un cuerpo a cuerpo con apoyo puntual, pero limita cadenas largas de habilidades o encantamientos.',
      ),
      evidence: [
        l(`Mind ${stats.mind}`, `Mente ${stats.mind}`),
        `${slot.player.fp.max} FP`,
        l(`${slot.player.maxCeruleanFlaskCount} Cerulean Flask`, `${slot.player.maxCeruleanFlaskCount} frasco cerúleo`),
        l(`${activeSpells.length} equipped spells`, `${activeSpells.length} hechizos equipados`),
      ],
    });
  }

  if (slot.bloodstain.runes > 0) {
    advice.push({
      id: 'bloodstain',
      severity: 'warning',
      title: l('Runes are waiting in the bloodstain', 'Hay runas pendientes en la mancha de sangre'),
      detail: l(
        'The save contains a bloodstain with runes. The analyzer changes nothing; keep it in mind before taking another risk.',
        'El save conserva una mancha de sangre con runas. El analizador no modifica nada; solo conviene recordarlo antes de asumir otro riesgo.',
      ),
      evidence: [l(
        `${slot.bloodstain.runes.toLocaleString(localeFor(language))} runes in the bloodstain`,
        `${slot.bloodstain.runes.toLocaleString(localeFor(language))} runas en la mancha`,
      )],
    });
  }

  if (activeTalismans.length < totalTalismanSlots) {
    advice.push({
      id: 'empty-talisman-slot',
      severity: 'warning',
      title: l('A talisman slot is empty', 'Hay una ranura de talismán libre'),
      detail: l(
        'Equipping any useful talisman provides a free improvement without spending levels.',
        'Equipar cualquier talismán útil aporta una mejora gratuita sin gastar niveles.',
      ),
      evidence: [l(
        `${activeTalismans.length}/${totalTalismanSlots} slots occupied`,
        `${activeTalismans.length}/${totalTalismanSlots} ranuras ocupadas`,
      )],
    });
  } else {
    advice.push({
      id: 'talisman-slots-used',
      severity: 'good',
      title: l('Talisman slots are in use', 'Ranuras de talismán aprovechadas'),
      detail: l(
        `All ${totalTalismanSlots} available slots are occupied.`,
        `Las ${totalTalismanSlots} ranuras disponibles están ocupadas.`,
      ),
      evidence: [l(
        `${activeTalismans.length}/${totalTalismanSlots} slots occupied`,
        `${activeTalismans.length}/${totalTalismanSlots} ranuras ocupadas`,
      )],
    });
  }

  const tearsEquipped = equipment.physickTears.filter((item) => item.handle !== 0).length;
  if (tearsEquipped < 2) {
    advice.push({
      id: 'physick-incomplete',
      severity: 'warning',
      title: l('The Flask of Wondrous Physick is incomplete', 'El Físico Maravilloso está incompleto'),
      detail: l(
        'It can hold two tears. Completing the mixture is an improvement with no attribute cost.',
        'Puede llevar dos lágrimas. Completar la mezcla es una mejora sin coste de atributos.',
      ),
      evidence: [l(`${tearsEquipped}/2 tears equipped`, `${tearsEquipped}/2 lágrimas equipadas`)],
    });
  } else {
    advice.push({
      id: 'physick-complete',
      severity: 'good',
      title: l('Flask of Wondrous Physick complete', 'Físico Maravilloso completo'),
      detail: l(
        'Two tears are equipped; check that they support the build plan rather than merely filling the slots.',
        'Hay dos lágrimas equipadas; revisa que apoyen el plan de la build y no solo que ocupen el hueco.',
      ),
      evidence: [l(`${tearsEquipped}/2 tears equipped`, `${tearsEquipped}/2 lágrimas equipadas`)],
    });
  }

  if (mainUpgrade === 0 && level >= 40 && activeWeapons.length > 0) {
    advice.push({
      id: 'weapon-upgrade-unknown',
      severity: 'warning',
      title: l('The main weapon appears unupgraded', 'El arma principal parece sin mejorar'),
      detail: l(
        'Upgrading a weapon usually adds more immediate damage than several offensive levels. Check that the equipped weapon is the one you intend to use.',
        'Mejorar el arma suele aportar más daño inmediato que varios niveles ofensivos. Comprueba que el arma realmente equipada sea la que quieres usar.',
      ),
      evidence: activeWeapons.slice(0, 3).map((item) => item.name),
    });
  } else if (mainUpgrade > 0) {
    advice.push({
      id: 'weapon-upgrade',
      severity: 'good',
      title: l('The equipped weapon is upgraded', 'El arma equipada está mejorada'),
      detail: l(
        `The highest upgrade detected among equipped weapons is +${mainUpgrade}.`,
        `La mejora más alta detectada entre las armas equipadas es +${mainUpgrade}.`,
      ),
      evidence: activeWeapons.filter((item) => item.upgradeLevel === mainUpgrade).map((item) => `${item.name} +${item.upgradeLevel}`),
    });
  }

  const damageInvestments = DAMAGE_STATS.map((key) => ({ key, points: allocation.invested[key] })).sort((a, b) => b.points - a.points);
  const focusedPoints = damageInvestments.slice(0, 2).reduce((sum, item) => sum + item.points, 0);
  const allDamagePoints = damageInvestments.reduce((sum, item) => sum + item.points, 0);
  const focusRatio = allDamagePoints === 0 ? 1 : focusedPoints / allDamagePoints;
  const levelEfficiency = Math.round(Math.max(0, Math.min(100, 55 + focusRatio * 45)));

  if (!allocation.consistent) {
    advice.push({
      id: 'allocation-inconsistent',
      severity: 'info',
      title: l(
        'The starting class or level does not match the base table',
        'La clase inicial o el nivel no cuadran con la tabla base',
      ),
      detail: l(
        'This may be caused by a format variant, attribute-modifying equipment, or altered data. In that case, the analysis avoids calling any point “wasted.”',
        'Puede deberse a una variante del formato, equipo que modifica atributos o datos alterados. El análisis evita llamar “desperdiciado” a ningún punto en ese caso.',
      ),
      evidence: [
        l(
          `Class ${STARTING_CLASSES[slot.player.archetypeCode] ?? `code ${slot.player.archetypeCode}`}`,
          `Clase ${STARTING_CLASSES[slot.player.archetypeCode] ?? `código ${slot.player.archetypeCode}`}`,
        ),
        l(`Expected level ${allocation.expectedLevel}`, `Nivel esperado ${allocation.expectedLevel}`),
        l(`Stored level ${level}`, `Nivel guardado ${level}`),
      ],
    });
  }

  return {
    archetype: inferred.label,
    summary: inferred.summary,
    primaryStats: inferred.primaryStats,
    levelEfficiency,
    advice,
  };
}

export function getStartingClassName(code: number, language: AppLanguage = DEFAULT_LANGUAGE): string {
  return STARTING_CLASSES[code] ?? localize(language, `Unknown class (${code})`, `Clase desconocida (${code})`);
}

/** Exact community-reversed FromSoftware rune curve for L → L+1. */
export function runeCostForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor((Math.max(0, (safeLevel - 11) * 0.02) + 0.1) * (safeLevel + 81) ** 2 + 1);
}

export function runesBetweenLevels(currentLevel: number, targetLevel: number): number {
  const start = Math.max(1, Math.floor(currentLevel));
  const end = Math.max(1, Math.floor(targetLevel));
  if (end <= start) return 0;
  let total = 0;
  for (let level = start; level < end; level += 1) total += runeCostForNextLevel(level);
  return total;
}
