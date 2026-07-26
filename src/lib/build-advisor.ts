import { STARTING_CLASSES } from '../data/fallback-catalog';
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
const LABELS: Record<AttributeKey, string> = {
  vigor: 'Vigor',
  mind: 'Mente',
  endurance: 'Aguante',
  strength: 'Fuerza',
  dexterity: 'Destreza',
  intelligence: 'Inteligencia',
  faith: 'Fe',
  arcane: 'Arcano',
};

function inferArchetype(slot: ParsedSlot, equipment: ResolvedEquipment): {
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
  const weaponText = mainWeaponNames.length > 0 ? ` con ${mainWeaponNames.slice(0, 2).join(' / ')}` : '';

  let label: string;
  let primaryStats: AttributeKey[];
  if (first.value - second.value <= 10 && second.value >= 18) {
    primaryStats = [first.key, second.key];
    label = `${LABELS[first.key]} / ${LABELS[second.key]}`;
  } else {
    primaryStats = [first.key];
    label = LABELS[first.key];
  }

  const faithSupport = stats.faith >= 12 && !primaryStats.includes('faith');
  const intelligenceSupport = stats.intelligence >= 12 && !primaryStats.includes('intelligence');
  const arcaneSupport = stats.arcane >= 12 && !primaryStats.includes('arcane');
  const support = faithSupport ? ' con Fe de apoyo' : intelligenceSupport ? ' con Inteligencia de apoyo' : arcaneSupport ? ' con Arcano de apoyo' : '';

  return {
    label: `${label}${support}`,
    primaryStats,
    summary: `Build centrada en ${label.toLowerCase()}${support}${weaponText}.`,
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

export function analyzeBuild(slot: ParsedSlot, equipment: ResolvedEquipment): BuildAnalysis {
  const inferred = inferArchetype(slot, equipment);
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
      title: 'Supervivencia bien cubierta',
      detail: `Vigor ${stats.vigor} es una base sólida para nivel ${level}; no parece el cuello de botella principal de la build.`,
      evidence: [`Vigor ${stats.vigor}`, `PV máximos ${slot.player.hp.max}`],
    });
  } else if (level >= 70 && stats.vigor < 35) {
    advice.push({
      id: 'vigor-low',
      severity: 'warning',
      title: 'Vigor bajo para el tramo actual',
      detail: 'Priorizar algunos puntos de Vigor suele aportar más margen de error que repartirlos entre varios atributos ofensivos.',
      evidence: [`Nivel ${level}`, `Vigor ${stats.vigor}`],
    });
  } else {
    advice.push({
      id: 'vigor-neutral',
      severity: 'info',
      title: 'Vigor en desarrollo',
      detail: 'Mantén Vigor acompasado con el nivel antes de abrir otra rama ofensiva.',
      evidence: [`Nivel ${level}`, `Vigor ${stats.vigor}`],
    });
  }

  if (activeSpells.length > 0 && slot.player.maxCeruleanFlaskCount <= 1 && stats.mind <= 12) {
    advice.push({
      id: 'fp-tight',
      severity: 'info',
      title: 'FP ajustado para usar magia o habilidades con frecuencia',
      detail: 'La combinación de Mente baja y un solo frasco cerúleo es eficiente para un cuerpo a cuerpo con apoyo puntual, pero limita cadenas largas de habilidades o encantamientos.',
      evidence: [`Mente ${stats.mind}`, `${slot.player.fp.max} FP`, `${slot.player.maxCeruleanFlaskCount} frasco cerúleo`, `${activeSpells.length} hechizos equipados`],
    });
  }

  if (slot.bloodstain.runes > 0) {
    advice.push({
      id: 'bloodstain',
      severity: 'warning',
      title: 'Hay runas pendientes en la mancha de sangre',
      detail: 'El save conserva una mancha de sangre con runas. El analizador no modifica nada; solo conviene recordarlo antes de asumir otro riesgo.',
      evidence: [`${slot.bloodstain.runes.toLocaleString('es-ES')} runas en la mancha`],
    });
  }

  if (activeTalismans.length < totalTalismanSlots) {
    advice.push({
      id: 'empty-talisman-slot',
      severity: 'warning',
      title: 'Hay una ranura de talismán libre',
      detail: 'Equipar cualquier talismán útil aporta una mejora gratuita sin gastar niveles.',
      evidence: [`${activeTalismans.length}/${totalTalismanSlots} ranuras ocupadas`],
    });
  } else {
    advice.push({
      id: 'talisman-slots-used',
      severity: 'good',
      title: 'Ranuras de talismán aprovechadas',
      detail: `Las ${totalTalismanSlots} ranuras disponibles están ocupadas.`,
      evidence: [`${activeTalismans.length}/${totalTalismanSlots} ranuras ocupadas`],
    });
  }

  const tearsEquipped = equipment.physickTears.filter((item) => item.handle !== 0).length;
  if (tearsEquipped < 2) {
    advice.push({
      id: 'physick-incomplete',
      severity: 'warning',
      title: 'El Físico Maravilloso está incompleto',
      detail: 'Puede llevar dos lágrimas. Completar la mezcla es una mejora sin coste de atributos.',
      evidence: [`${tearsEquipped}/2 lágrimas equipadas`],
    });
  } else {
    advice.push({
      id: 'physick-complete',
      severity: 'good',
      title: 'Físico Maravilloso completo',
      detail: 'Hay dos lágrimas equipadas; revisa que apoyen el plan de la build y no solo que ocupen el hueco.',
      evidence: [`${tearsEquipped}/2 lágrimas equipadas`],
    });
  }

  if (mainUpgrade === 0 && level >= 40 && activeWeapons.length > 0) {
    advice.push({
      id: 'weapon-upgrade-unknown',
      severity: 'warning',
      title: 'El arma principal parece sin mejorar',
      detail: 'Mejorar el arma suele aportar más daño inmediato que varios niveles ofensivos. Comprueba que el arma realmente equipada sea la que quieres usar.',
      evidence: activeWeapons.slice(0, 3).map((item) => item.name),
    });
  } else if (mainUpgrade > 0) {
    advice.push({
      id: 'weapon-upgrade',
      severity: 'good',
      title: 'El arma equipada está mejorada',
      detail: `La mejora más alta detectada entre las armas equipadas es +${mainUpgrade}.`,
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
      title: 'La clase inicial o el nivel no cuadran con la tabla base',
      detail: 'Puede deberse a una variante del formato, equipo que modifica atributos o datos alterados. El análisis evita llamar “desperdiciado” a ningún punto en ese caso.',
      evidence: [`Clase ${STARTING_CLASSES[slot.player.archetypeCode] ?? `código ${slot.player.archetypeCode}`}`, `Nivel esperado ${allocation.expectedLevel}`, `Nivel guardado ${level}`],
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

export function getStartingClassName(code: number): string {
  return STARTING_CLASSES[code] ?? `Clase desconocida (${code})`;
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
