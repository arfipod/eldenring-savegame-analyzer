import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Clock3,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSearch,
  FlaskConical,
  Gauge,
  HardDrive,
  HeartPulse,
  Info,
  Layers3,
  LockKeyhole,
  MapPin,
  PackageSearch,
  RefreshCw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
  TableProperties,
  UploadCloud,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, Dispatch, DragEvent, ReactNode, SetStateAction } from 'react';
import { getFallbackCatalog, loadSemanticCatalog } from './lib/catalog';
import { runeCostForNextLevel, runesBetweenLevels } from './lib/build-advisor';
import {
  buildForensicExport,
  buildMarkdownReport,
  buildSemanticExport,
  downloadText,
  exportFilename,
  jsonText,
  type ExportContext,
  type SpoilerMode,
} from './lib/export';
import {
  formatBytes,
  formatClock,
  formatDuration,
  formatNumber,
  formatOffset,
  formatRate,
} from './lib/format';
import { createSemanticSlots, missingProgressEntries } from './lib/semantic';
import type {
  AttributeKey,
  ExportPrivacyOptions,
  ParsedSave,
  ProgressEntry,
  ResolvedEquipmentItem,
  ResolvedInventoryItem,
  SemanticCatalog,
  SemanticSlot,
  WorkerParseRequest,
  WorkerParseResponse,
} from './types';

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  vigor: 'Vigor',
  mind: 'Mente',
  endurance: 'Aguante',
  strength: 'Fuerza',
  dexterity: 'Destreza',
  intelligence: 'Inteligencia',
  faith: 'Fe',
  arcane: 'Arcano',
};

const TYPE_LABELS: Record<ResolvedInventoryItem['type'] | 'all', string> = {
  all: 'Todos los tipos',
  weapon: 'Armas y catalizadores',
  armor: 'Armadura',
  talisman: 'Talismán',
  good: 'Objetos, magia y cenizas',
  ashOfWar: 'Cenizas de guerra',
  unknown: 'Sin resolver',
};

const SPOILER_OPTIONS: Array<{
  value: SpoilerMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: 'safe',
    label: 'Sin spoilers',
    description: 'Solo muestra lo que el save acredita como obtenido, descubierto o derrotado.',
    icon: ShieldCheck,
  },
  {
    value: 'zones',
    label: 'Solo zonas',
    description: 'Mantiene ocultos objetivos futuros; prioriza nombres de áreas ya registradas.',
    icon: MapPin,
  },
  {
    value: 'precise',
    label: 'Preciso sin nombres',
    description: 'Añade recuentos pendientes, pero no revela qué contenido falta.',
    icon: EyeOff,
  },
  {
    value: 'completion',
    label: 'Completista',
    description: 'Expone nombres de contenido no detectado. Puede revelar mucho del juego.',
    icon: Eye,
  },
];

type TabId = 'summary' | 'build' | 'equipment' | 'inventory' | 'progress' | 'export' | 'raw';

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'summary', label: 'Resumen', icon: BarChart3 },
  { id: 'build', label: 'Build', icon: Brain },
  { id: 'equipment', label: 'Equipo', icon: Swords },
  { id: 'inventory', label: 'Inventario', icon: PackageSearch },
  { id: 'progress', label: 'Progreso', icon: MapPin },
  { id: 'export', label: 'IA y exportación', icon: Bot },
  { id: 'raw', label: 'Datos técnicos', icon: TableProperties },
];

interface ToastState {
  kind: 'success' | 'error';
  message: string;
}

function joinClass(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.sl2') || lower.endsWith('.co2');
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error('No se pudo copiar al portapapeles.'));
}

function Panel({
  children,
  className,
  as: Element = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return <Element className={joinClass('panel', className)}>{children}</Element>;
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading__text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <div className="section-heading__title-row">
          {Icon && <Icon aria-hidden="true" size={20} />}
          <h2>{title}</h2>
        </div>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  );
}

function StatusPill({
  children,
  tone = 'neutral',
  icon: Icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'gold';
  icon?: LucideIcon;
}) {
  return (
    <span className={joinClass('status-pill', `status-pill--${tone}`)}>
      {Icon && <Icon aria-hidden="true" size={14} />}
      {children}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'gold' | 'good' | 'warning';
}) {
  return (
    <article className={joinClass('metric-card', `metric-card--${tone}`)}>
      <span className="metric-card__icon"><Icon aria-hidden="true" size={20} /></span>
      <div>
        <span className="metric-card__label">{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}

function EquipmentLine({ item, label }: { item: ResolvedEquipmentItem; label?: string }) {
  const empty = item.handle === 0 || item.name === 'Vacío';
  return (
    <div className={joinClass('equipment-line', empty && 'equipment-line--empty')}>
      <div>
        {label && <span className="equipment-line__label">{label}</span>}
        <strong>{item.name}{item.upgradeLevel > 0 ? ` +${item.upgradeLevel}` : ''}</strong>
        {item.ashOfWar && item.ashOfWar.name !== 'None' && (
          <small>Ceniza: {item.ashOfWar.name}</small>
        )}
      </div>
      <StatusPill tone={empty ? 'neutral' : 'gold'}>{empty ? 'Vacío' : item.type}</StatusPill>
    </div>
  );
}

function ProgressList({
  title,
  items,
  emptyText,
  limit = 80,
}: {
  title: string;
  items: ProgressEntry[];
  emptyText: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <Panel className="progress-list">
      <div className="progress-list__header">
        <h3>{title}</h3>
        <StatusPill tone="gold">{formatNumber(items.length)}</StatusPill>
      </div>
      {items.length === 0 ? (
        <p className="empty-copy">{emptyText}</p>
      ) : (
        <div className="chip-cloud">
          {visible.map((item) => (
            <span className="name-chip" key={`${title}-${item.flagId}`}>{item.name}</span>
          ))}
        </div>
      )}
      {items.length > limit && (
        <button className="text-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Mostrar menos' : `Mostrar ${formatNumber(items.length - limit)} más`}
          <ChevronDown aria-hidden="true" size={16} className={expanded ? 'rotate-180' : undefined} />
        </button>
      )}
    </Panel>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  description,
  warning,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  warning?: boolean;
}) {
  return (
    <label className={joinClass('toggle-row', warning && 'toggle-row--warning')}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} />
      <span className="toggle-switch" aria-hidden="true" />
    </label>
  );
}

function AppHeader({ catalog, catalogStatus }: { catalog: SemanticCatalog; catalogStatus: string }) {
  const catalogReady = catalog.loadedSources.length > 1;
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="brand-mark" aria-hidden="true"><Sparkles size={25} /></span>
        <div>
          <span className="eyebrow">Elden Ring · PC</span>
          <h1>Elden Ring Savegame Analyzer</h1>
        </div>
      </div>
      <div className="app-header__badges">
        <StatusPill icon={LockKeyhole} tone="good">Procesado local</StatusPill>
        <StatusPill icon={ShieldCheck} tone="good">Solo lectura</StatusPill>
        <StatusPill icon={catalogReady ? CheckCircle2 : RefreshCw} tone={catalogReady ? 'gold' : 'neutral'}>
          {catalogReady ? `${catalog.loadedSources.length} fuentes semánticas` : catalogStatus}
        </StatusPill>
      </div>
    </header>
  );
}

function UploadScreen({
  busy,
  progress,
  stage,
  dragging,
  error,
  onFile,
  onDragState,
}: {
  busy: boolean;
  progress: number;
  stage: string;
  dragging: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onDragState: (value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const choose = () => inputRef.current?.click();
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    onDragState(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <main className="landing">
      <section className="landing__intro">
        <span className="eyebrow">Tu partida, explicada sin tocarla</span>
        <h2>Convierte un <span>.sl2</span> en un informe útil, privado y entendible.</h2>
        <p>
          Decodifica ranuras, nivel, muertes, atributos, build, equipo, inventario, progreso,
          frascos, Físico Maravilloso y campos técnicos. Después expórtalo como JSON listo para una IA.
        </p>
        <div className="landing__trust">
          <span><ShieldCheck size={17} /> El archivo no sale del navegador</span>
          <span><HardDrive size={17} /> No se guarda ni se reescribe</span>
          <span><EyeOff size={17} /> Modo sin spoilers por defecto</span>
        </div>
      </section>

      <Panel className="upload-panel">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".sl2,.co2,application/octet-stream"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = '';
          }}
        />
        <button
          className={joinClass('drop-zone', dragging && 'drop-zone--dragging', busy && 'drop-zone--busy')}
          type="button"
          onClick={choose}
          onDragEnter={(event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); onDragState(true); }}
          onDragOver={(event: DragEvent<HTMLButtonElement>) => event.preventDefault()}
          onDragLeave={(event: DragEvent<HTMLButtonElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragState(false);
          }}
          onDrop={handleDrop}
          disabled={busy}
        >
          <span className="drop-zone__icon">
            {busy ? <RefreshCw className="spin" size={34} /> : <UploadCloud size={38} />}
          </span>
          <strong>{busy ? stage : 'Arrastra ER0000.sl2 aquí'}</strong>
          <span>{busy ? `${Math.round(progress * 100)} %` : 'o pulsa para elegir el archivo de tu Steam Deck o PC'}</span>
          {busy && (
            <span className="progress-track" aria-label={`Progreso ${Math.round(progress * 100)} %`}>
              <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
            </span>
          )}
        </button>
        {error && (
          <div className="inline-alert inline-alert--danger" role="alert">
            <AlertTriangle aria-hidden="true" size={19} />
            <div><strong>No se pudo analizar el archivo</strong><p>{error}</p></div>
          </div>
        )}
        <div className="upload-panel__notes">
          <span><FileSearch size={16} /> Compatible con partidas PC BND4 <code>.sl2</code> y <code>.co2</code>.</span>
          <span><Info size={16} /> “Decodificar” no significa que el save esté cifrado: se interpreta su formato binario.</span>
        </div>
      </Panel>

      <section className="feature-grid" aria-label="Funciones">
        <article><UserRound size={22} /><strong>Perfil y build</strong><p>Nivel, atributos, clase inicial, enfoque y recomendaciones respaldadas por datos.</p></article>
        <article><PackageSearch size={22} /><strong>Objetos con nombre</strong><p>Inventario, baúl, equipo, mejoras, hechizos, talismanes y cenizas.</p></article>
        <article><MapPin size={22} /><strong>Progreso controlado</strong><p>Hitos y lugares ya registrados, con cuatro niveles explícitos de spoilers.</p></article>
        <article><FileJson size={22} /><strong>Exportación para IA</strong><p>JSON semántico, informe Markdown y volcado forense con privacidad configurable.</p></article>
      </section>
    </main>
  );
}

function SpoilerSelector({ value, onChange }: { value: SpoilerMode; onChange: (value: SpoilerMode) => void }) {
  return (
    <div className="spoiler-selector" role="radiogroup" aria-label="Nivel de spoilers">
      {SPOILER_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            className={joinClass('spoiler-option', value === option.value && 'spoiler-option--active')}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <Icon aria-hidden="true" size={18} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </button>
        );
      })}
    </div>
  );
}

function SummaryTab({ slot }: { slot: SemanticSlot }) {
  const mainWeapons = [...slot.equipment.rightHand, ...slot.equipment.leftHand]
    .filter((item) => item.handle !== 0 && item.name !== 'Mano desnuda');
  const topAdvice = slot.build.advice.slice(0, 4);
  const maxAttribute = Math.max(60, ...(Object.values(slot.attributes) as number[]));

  return (
    <div className="tab-stack">
      <section className="metrics-grid">
        <MetricCard icon={Clock3} label="Tiempo de juego" value={formatDuration(slot.identity.playtimeSeconds)} detail={formatClock(slot.identity.playtimeSeconds)} tone="gold" />
        <MetricCard icon={Skull} label="Muertes" value={formatNumber(slot.overview.deaths)} detail={formatRate(slot.overview.deaths, slot.identity.playtimeSeconds)} tone="warning" />
        <MetricCard icon={Sparkles} label="Runas actuales" value={formatNumber(slot.overview.currentRunes)} detail={`${formatNumber(slot.overview.lifetimeRunes)} acumuladas`} />
        <MetricCard icon={MapPin} label="Última gracia" value={slot.overview.lastRestedGrace} detail={slot.overview.mapLabel} />
        <MetricCard icon={FlaskConical} label="Frascos" value={`${slot.overview.crimsonFlasks} + ${slot.overview.ceruleanFlasks}`} detail={`${slot.overview.totalFlasks} cargas detectadas`} tone="good" />
        <MetricCard icon={Layers3} label="Ranuras de talismán" value={String(slot.overview.talismanSlots)} detail={`${slot.equipment.talismans.filter((item) => item.handle !== 0).length} ocupadas`} />
        <MetricCard icon={HeartPulse} label="PV máximos" value={formatNumber(slot.vitals.hp.max)} detail={`${formatNumber(slot.vitals.stamina.max)} de aguante`} />
        <MetricCard icon={Swords} label="Arma principal" value={mainWeapons[0]?.name ?? 'No resuelta'} detail={mainWeapons[0]?.upgradeLevel ? `Mejora +${mainWeapons[0].upgradeLevel}` : 'Revisa la pestaña Equipo'} tone="gold" />
      </section>

      {slot.overview.bloodstainRunes > 0 && (
        <div className="inline-alert inline-alert--warning">
          <AlertTriangle aria-hidden="true" size={20} />
          <div>
            <strong>Hay {formatNumber(slot.overview.bloodstainRunes)} runas en una mancha de sangre</strong>
            <p>Es un hecho leído del save. El analizador no conoce si ya estás camino de recuperarlas.</p>
          </div>
        </div>
      )}

      <div className="two-column">
        <Panel>
          <SectionHeading icon={Gauge} eyebrow="Distribución" title="Atributos" description={`Nivel ${slot.identity.level} · ${slot.identity.className}`} />
          <div className="attribute-bars">
            {(Object.entries(slot.attributes) as Array<[AttributeKey, number]>).map(([key, value]) => (
              <div className={joinClass('attribute-bar', slot.build.primaryStats.includes(key) && 'attribute-bar--primary')} key={key}>
                <div><span>{ATTRIBUTE_LABELS[key]}</span><strong>{value}</strong></div>
                <span className="attribute-bar__track"><span style={{ width: `${Math.min(100, (value / maxAttribute) * 100)}%` }} /></span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeading icon={Brain} eyebrow="Lectura automática" title={slot.build.archetype} description={slot.build.summary} />
          <div className="focus-score">
            <div className="focus-score__dial" style={{ '--score': `${slot.build.levelEfficiency * 3.6}deg` } as CSSProperties}>
              <strong>{slot.build.levelEfficiency}</strong><span>/100</span>
            </div>
            <div><strong>Concentración de puntos ofensivos</strong><p>No es una nota de “buena o mala” build: mide cuánto se concentra la inversión frente a dispersarse.</p></div>
          </div>
          <div className="advice-mini-list">
            {topAdvice.map((item) => (
              <article key={item.id} className={`advice-mini advice-mini--${item.severity}`}>
                {item.severity === 'good' ? <CheckCircle2 size={17} /> : item.severity === 'warning' ? <AlertTriangle size={17} /> : <Info size={17} />}
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading icon={Database} eyebrow="Transparencia" title="Qué se ha podido leer" description="El parser distingue datos interpretados de blobs internos sin significado público fiable." />
        <div className="coverage-grid">
          <div><strong>{formatNumber(slot.inventory.length)}</strong><span>entradas de inventario resueltas</span></div>
          <div><strong>{formatNumber(slot.raw.gaItems.length)}</strong><span>registros GAItem activos</span></div>
          <div><strong>{formatNumber(slot.raw.unlockedRegionIds.length)}</strong><span>regiones internas desbloqueadas</span></div>
          <div><strong>{formatNumber(slot.raw.opaqueSections.length)}</strong><span>secciones opacas indexadas</span></div>
        </div>
      </Panel>
    </div>
  );
}

function BuildTab({ slot }: { slot: SemanticSlot }) {
  const [targetLevel, setTargetLevel] = useState(slot.identity.level + 10);
  useEffect(() => setTargetLevel(slot.identity.level + 10), [slot.identity.level]);
  const needed = runesBetweenLevels(slot.identity.level, targetLevel);
  const next = runeCostForNextLevel(slot.identity.level);
  const activeWeapons = [...slot.equipment.rightHand, ...slot.equipment.leftHand]
    .filter((item) => item.handle !== 0 && item.name !== 'Mano desnuda');

  return (
    <div className="tab-stack">
      <div className="two-column two-column--wide-left">
        <Panel>
          <SectionHeading icon={Brain} eyebrow="Diagnóstico" title={slot.build.archetype} description={slot.build.summary} />
          <div className="advice-grid">
            {slot.build.advice.map((item) => (
              <article className={joinClass('advice-card', `advice-card--${item.severity}`)} key={item.id}>
                <div className="advice-card__top">
                  {item.severity === 'good' ? <CheckCircle2 size={20} /> : item.severity === 'warning' ? <AlertTriangle size={20} /> : <Info size={20} />}
                  <strong>{item.title}</strong>
                </div>
                <p>{item.detail}</p>
                <div className="evidence-list">{item.evidence.map((entry) => <span key={entry}>{entry}</span>)}</div>
              </article>
            ))}
          </div>
        </Panel>

        <div className="side-stack">
          <Panel>
            <SectionHeading icon={Sparkles} eyebrow="Planificador" title="Coste de niveles" description="Cálculo con la curva de runas del juego." />
            <label className="number-field">
              <span>Nivel objetivo</span>
              <input
                type="number"
                min={slot.identity.level}
                max={713}
                value={targetLevel}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTargetLevel(Math.max(slot.identity.level, Math.min(713, Number(event.target.value) || slot.identity.level)))}
              />
            </label>
            <div className="planner-result"><strong>{formatNumber(needed)}</strong><span>runas para llegar a nivel {targetLevel}</span></div>
            <p className="muted-copy">Siguiente nivel: {formatNumber(next)} runas. Actualmente llevas {formatNumber(slot.overview.currentRunes)}.</p>
          </Panel>

          <Panel>
            <SectionHeading icon={Swords} eyebrow="Escalado práctico" title="Armas activas" />
            <div className="equipment-stack">
              {activeWeapons.length > 0 ? activeWeapons.map((item, index) => <EquipmentLine item={item} label={`Arma ${index + 1}`} key={`${item.handle}-${index}`} />) : <p className="empty-copy">No se ha resuelto ningún arma activa.</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <SectionHeading icon={Activity} eyebrow="Ficha" title="Atributos y recursos" description="Valores almacenados en PlayerGameData." />
        <div className="stat-table">
          {(Object.entries(slot.attributes) as Array<[AttributeKey, number]>).map(([key, value]) => (
            <div key={key} className={slot.build.primaryStats.includes(key) ? 'stat-table__primary' : undefined}>
              <span>{ATTRIBUTE_LABELS[key]}</span><strong>{value}</strong>
            </div>
          ))}
          <div><span>PV</span><strong>{slot.vitals.hp.current}/{slot.vitals.hp.max}</strong></div>
          <div><span>PC</span><strong>{slot.vitals.fp.current}/{slot.vitals.fp.max}</strong></div>
          <div><span>Aguante actual</span><strong>{slot.vitals.stamina.current}/{slot.vitals.stamina.max}</strong></div>
          <div><span>Nivel de arma para matchmaking</span><strong>{slot.raw.player.matchmakingWeaponLevel}</strong></div>
        </div>
      </Panel>
    </div>
  );
}

function EquipmentTab({ slot }: { slot: SemanticSlot }) {
  return (
    <div className="tab-stack">
      <div className="equipment-layout">
        <Panel>
          <SectionHeading icon={Swords} eyebrow="Armamento" title="Manos y ranuras" />
          <div className="equipment-columns">
            <div><h3>Mano derecha</h3>{slot.equipment.rightHand.map((item, index) => <EquipmentLine item={item} label={`Ranura ${index + 1}`} key={`r-${index}`} />)}</div>
            <div><h3>Mano izquierda</h3>{slot.equipment.leftHand.map((item, index) => <EquipmentLine item={item} label={`Ranura ${index + 1}`} key={`l-${index}`} />)}</div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading icon={ShieldCheck} eyebrow="Protección" title="Armadura" />
          <div className="equipment-stack">
            <EquipmentLine item={slot.equipment.armor.head} label="Cabeza" />
            <EquipmentLine item={slot.equipment.armor.chest} label="Torso" />
            <EquipmentLine item={slot.equipment.armor.arms} label="Brazos" />
            <EquipmentLine item={slot.equipment.armor.legs} label="Piernas" />
          </div>
        </Panel>
      </div>

      <div className="three-column">
        <Panel>
          <SectionHeading icon={Layers3} eyebrow={`${slot.equipment.talismans.filter((item) => item.handle !== 0).length}/${slot.overview.talismanSlots} ocupadas`} title="Talismanes" />
          <div className="equipment-stack">{slot.equipment.talismans.slice(0, slot.overview.talismanSlots).map((item, index) => <EquipmentLine item={item} label={`Ranura ${index + 1}`} key={`t-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={FlaskConical} eyebrow="Mezcla actual" title="Físico Maravilloso" description="El frasco admite dos lágrimas; aquí se muestran los handles ya resueltos." />
          <div className="equipment-stack">{slot.equipment.physickTears.map((item, index) => <EquipmentLine item={item} label={`Lágrima ${index + 1}`} key={`p-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={Zap} eyebrow="Memorizados" title="Hechizos" />
          <div className="simple-list">
            {slot.equipment.spells.filter((spell) => spell.id !== 0 && spell.id !== 0xffff_ffff).map((spell) => <div key={spell.id}><strong>{spell.name}</strong><span>0x{spell.hexId}</span></div>)}
            {slot.equipment.spells.every((spell) => spell.id === 0 || spell.id === 0xffff_ffff) && <p className="empty-copy">No hay hechizos equipados.</p>}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel>
          <SectionHeading icon={Archive} eyebrow="Acceso rápido" title="Objetos rápidos" />
          <div className="quick-grid">{slot.equipment.quickSlots.map((item, index) => <EquipmentLine item={item} label={`${index + 1}`} key={`q-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={PackageSearch} eyebrow="Bolsa" title="Objetos de la bolsa" />
          <div className="quick-grid">{slot.equipment.pouch.map((item, index) => <EquipmentLine item={item} label={`${index + 1}`} key={`po-${index}`} />)}</div>
        </Panel>
      </div>
    </div>
  );
}

function InventoryTab({ slot }: { slot: SemanticSlot }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ResolvedInventoryItem['type'] | 'all'>('all');
  const [storage, setStorage] = useState<'all' | 'held' | 'chest'>('all');
  const [keyOnly, setKeyOnly] = useState(false);
  const [equippedOnly, setEquippedOnly] = useState(false);
  const normalized = query.trim().toLocaleLowerCase('es');
  const filtered = useMemo(() => slot.inventory.filter((item) => {
    if (normalized && !`${item.name} ${item.classification ?? ''} ${item.hexId}`.toLocaleLowerCase('es').includes(normalized)) return false;
    if (type !== 'all' && item.type !== type) return false;
    if (storage !== 'all' && item.storage !== storage) return false;
    if (keyOnly && !item.keyItem) return false;
    if (equippedOnly && !item.equipped) return false;
    return true;
  }), [slot.inventory, normalized, type, storage, keyOnly, equippedOnly]);

  const resetFilters = () => {
    setQuery(''); setType('all'); setStorage('all'); setKeyOnly(false); setEquippedOnly(false);
  };

  return (
    <div className="tab-stack">
      <Panel>
        <SectionHeading
          icon={PackageSearch}
          eyebrow={`${formatNumber(filtered.length)} de ${formatNumber(slot.inventory.length)}`}
          title="Inventario y baúl"
          description="Los nombres proceden del catálogo semántico; cada fila conserva un nivel de confianza para no fingir certezas."
          action={<button className="secondary-button" type="button" onClick={resetFilters}><RefreshCw size={16} /> Limpiar filtros</button>}
        />
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Buscar objeto, clase o ID…" /></label>
          <label className="select-field"><span>Tipo</span><select value={type} onChange={(event: ChangeEvent<HTMLSelectElement>) => setType(event.target.value as typeof type)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="select-field"><span>Ubicación</span><select value={storage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStorage(event.target.value as typeof storage)}><option value="all">Todo</option><option value="held">Inventario</option><option value="chest">Baúl</option></select></label>
          <label className="check-chip"><input type="checkbox" checked={keyOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setKeyOnly(event.target.checked)} /><span>Solo clave</span></label>
          <label className="check-chip"><input type="checkbox" checked={equippedOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setEquippedOnly(event.target.checked)} /><span>Solo equipado</span></label>
        </div>
      </Panel>

      <Panel className="inventory-panel">
        {filtered.length === 0 ? (
          <div className="empty-state"><PackageSearch size={34} /><strong>No hay coincidencias</strong><p>Prueba otros filtros o limpia la búsqueda.</p></div>
        ) : (
          <div className="inventory-table" role="table" aria-label="Inventario">
            <div className="inventory-row inventory-row--head" role="row">
              <span>Objeto</span><span>Cantidad</span><span>Tipo</span><span>Ubicación</span><span>Estado</span>
            </div>
            {filtered.map((item) => (
              <div className="inventory-row" role="row" key={`${item.storage}-${item.inventoryIndex}-${item.handle}`}>
                <div className="inventory-name">
                  <strong>{item.name}{item.upgradeLevel > 0 && !item.name.match(/\+\d+$/) ? ` +${item.upgradeLevel}` : ''}</strong>
                  <small>{item.classification ?? `ID semántico 0x${item.hexId}`}</small>
                  {item.semanticSummary && <em>{item.semanticSummary}</em>}
                </div>
                <strong>×{formatNumber(item.quantity)}</strong>
                <span>{TYPE_LABELS[item.type]}</span>
                <span>{item.storage === 'held' ? 'Inventario' : 'Baúl'}{item.keyItem ? ' · clave' : ''}</span>
                <div className="row-pills">
                  {item.equipped && <StatusPill tone="gold">Equipado</StatusPill>}
                  <StatusPill tone={item.confidence === 'high' ? 'good' : item.confidence === 'medium' ? 'warning' : 'danger'}>{item.confidence === 'high' ? 'Resuelto' : item.confidence === 'medium' ? 'Probable' : 'ID raw'}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ProgressTab({
  slot,
  catalog,
  spoilerMode,
  onSpoilerMode,
}: {
  slot: SemanticSlot;
  catalog: SemanticCatalog;
  spoilerMode: SpoilerMode;
  onSpoilerMode: (value: SpoilerMode) => void;
}) {
  const missing = useMemo(() => {
    if (spoilerMode !== 'completion' && spoilerMode !== 'precise') return null;
    return {
      bosses: missingProgressEntries(catalog.bosses, slot.raw, catalog),
      graces: missingProgressEntries(catalog.graces, slot.raw, catalog),
      cookbooks: missingProgressEntries(catalog.cookbooks, slot.raw, catalog),
      bellBearings: missingProgressEntries(catalog.bellBearings, slot.raw, catalog),
      whetblades: missingProgressEntries(catalog.whetblades, slot.raw, catalog),
    };
  }, [catalog, slot.raw, spoilerMode]);

  const catalogLimited = Object.keys(catalog.eventFlagBst).length === 0;
  return (
    <div className="tab-stack">
      <Panel>
        <SectionHeading icon={EyeOff} eyebrow="Control explícito" title="Nivel de spoilers" description="El modo se aplica a esta vista y a la exportación para IA." />
        <SpoilerSelector value={spoilerMode} onChange={onSpoilerMode} />
      </Panel>

      <div className="inline-alert inline-alert--info">
        <Info aria-hidden="true" size={20} />
        <div><strong>“Logros” significa hitos inferidos</strong><p>Las banderas del save permiten detectar muchos jefes, gracias y objetos de progreso, pero no constituyen el historial oficial de logros de Steam.</p></div>
      </div>
      {catalogLimited && (
        <div className="inline-alert inline-alert--warning">
          <AlertTriangle size={20} />
          <div><strong>Catálogo completo no disponible todavía</strong><p>La lectura base sigue siendo válida, pero los recuentos de progreso pueden estar incompletos hasta que se carguen los datos semánticos.</p></div>
        </div>
      )}

      <section className="progress-metrics">
        <MetricCard icon={Skull} label="Jefes/hitos detectados" value={formatNumber(slot.progress.defeatedBosses.length)} detail={slot.progress.totals.bossesKnown ? `sobre ${formatNumber(slot.progress.totals.bossesKnown)} banderas catalogadas` : 'catálogo mínimo'} tone="gold" />
        <MetricCard icon={MapPin} label="Gracias descubiertas" value={formatNumber(slot.progress.discoveredGraces.length)} detail={slot.progress.totals.gracesKnown ? `sobre ${formatNumber(slot.progress.totals.gracesKnown)} catalogadas` : 'catálogo mínimo'} />
        <MetricCard icon={BookOpen} label="Recetarios" value={formatNumber(slot.progress.acquiredCookbooks.length)} detail="adquiridos según banderas" />
        <MetricCard icon={Settings2} label="Hojas de afilar" value={formatNumber(slot.progress.acquiredWhetblades.length)} detail="adquiridas según banderas" />
      </section>

      <ProgressList title="Jefes e hitos ya derrotados" items={slot.progress.defeatedBosses} emptyText="No hay hitos resueltos con el catálogo actualmente cargado." />
      <ProgressList title="Lugares de gracia ya descubiertos" items={slot.progress.discoveredGraces} emptyText="No hay gracias resueltas con el catálogo actualmente cargado." />
      <div className="two-column">
        <ProgressList title="Libros de recetas adquiridos" items={slot.progress.acquiredCookbooks} emptyText="Ninguno detectado." limit={35} />
        <ProgressList title="Rodamientos de campana adquiridos" items={slot.progress.acquiredBellBearings} emptyText="Ninguno detectado." limit={35} />
      </div>
      <ProgressList title="Hojas de afilar adquiridas" items={slot.progress.acquiredWhetblades} emptyText="Ninguna detectada." limit={35} />

      {spoilerMode === 'precise' && missing && (
        <Panel className="spoiler-counts">
          <SectionHeading icon={EyeOff} eyebrow="Sin nombres" title="Contenido no detectado" description="Solo se muestran cantidades para no revelar identidades ni ubicaciones." />
          <div className="coverage-grid">
            <div><strong>{formatNumber(missing.bosses.length)}</strong><span>jefes/hitos no detectados</span></div>
            <div><strong>{formatNumber(missing.graces.length)}</strong><span>gracias no detectadas</span></div>
            <div><strong>{formatNumber(missing.cookbooks.length)}</strong><span>recetarios no detectados</span></div>
            <div><strong>{formatNumber(missing.whetblades.length)}</strong><span>hojas no detectadas</span></div>
          </div>
        </Panel>
      )}

      {spoilerMode === 'completion' && missing && (
        <div className="completion-zone">
          <div className="inline-alert inline-alert--danger">
            <Eye size={20} />
            <div><strong>Modo completista activo</strong><p>Las listas siguientes revelan nombres de contenido que el save no marca como completado.</p></div>
          </div>
          <ProgressList title="Jefes/hitos no detectados" items={missing.bosses} emptyText="No queda ninguno dentro del catálogo cargado." />
          <ProgressList title="Gracias no detectadas" items={missing.graces} emptyText="No queda ninguna dentro del catálogo cargado." />
          <div className="two-column">
            <ProgressList title="Recetarios no detectados" items={missing.cookbooks} emptyText="No queda ninguno." limit={35} />
            <ProgressList title="Rodamientos no detectados" items={missing.bellBearings} emptyText="No queda ninguno." limit={35} />
          </div>
          <ProgressList title="Hojas de afilar no detectadas" items={missing.whetblades} emptyText="No queda ninguna." limit={35} />
        </div>
      )}
    </div>
  );
}

function ExportTab({
  context,
  privacy,
  setPrivacy,
  showToast,
}: {
  context: ExportContext;
  privacy: ExportPrivacyOptions;
  setPrivacy: Dispatch<SetStateAction<ExportPrivacyOptions>>;
  showToast: (toast: ToastState) => void;
}) {
  const semantic = useMemo(() => buildSemanticExport(context), [context]);
  const preview = useMemo(() => jsonText(semantic), [semantic]);

  const doDownload = (kind: 'semantic' | 'forensic' | 'markdown') => {
    try {
      if (kind === 'semantic') {
        downloadText(preview, exportFilename(context.slot, 'semantic-ai', 'json'));
      } else if (kind === 'forensic') {
        downloadText(jsonText(buildForensicExport(context)), exportFilename(context.slot, 'forensic', 'json'));
      } else {
        downloadText(buildMarkdownReport(context), exportFilename(context.slot, 'ai-report', 'md'), 'text/markdown');
      }
      showToast({ kind: 'success', message: 'Archivo generado en tu navegador.' });
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const copyPrompt = async () => {
    const prompt = `Analiza mi partida de Elden Ring usando el JSON adjunto. No reveles contenido futuro que no aparezca ya como descubierto, obtenido o derrotado. Separa hechos, inferencias y recomendaciones; prioriza optimizar mi build y señalar cosas útiles que ya puedo hacer sin editar el save.\n\n${preview}`;
    try {
      await copyText(prompt);
      showToast({ kind: 'success', message: 'Prompt y JSON copiados al portapapeles.' });
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const update = (key: keyof ExportPrivacyOptions, value: boolean) => setPrivacy((current) => ({ ...current, [key]: value }));

  return (
    <div className="tab-stack">
      <div className="two-column two-column--wide-left">
        <Panel>
          <SectionHeading icon={Bot} eyebrow="Modelo de lenguaje" title="JSON semántico listo para IA" description="Conserva el significado útil, elimina bytes opacos y aplica las opciones de privacidad de la derecha." />
          <div className="export-actions">
            <button className="primary-button" type="button" onClick={() => doDownload('semantic')}><Download size={18} /> Descargar JSON semántico</button>
            <button className="secondary-button" type="button" onClick={copyPrompt}><Clipboard size={18} /> Copiar prompt + JSON</button>
            <button className="secondary-button" type="button" onClick={() => doDownload('markdown')}><ScrollText size={18} /> Informe Markdown</button>
            <button className="ghost-button" type="button" onClick={() => doDownload('forensic')}><Database size={18} /> JSON forense</button>
          </div>
          <div className="code-preview">
            <div className="code-preview__top"><span><FileJson size={16} /> Vista previa</span><small>{formatBytes(new Blob([preview]).size)}</small></div>
            <pre>{preview.slice(0, 18_000)}{preview.length > 18_000 ? '\n… vista previa truncada; la descarga contiene todo.' : ''}</pre>
          </div>
        </Panel>

        <div className="side-stack">
          <Panel>
            <SectionHeading icon={LockKeyhole} eyebrow="Privacidad" title="Qué permites exportar" description="Steam IDs, ubicación exacta y datos forenses están desactivados por defecto." />
            <div className="toggle-stack">
              <Toggle checked={privacy.includeSteamIds} onChange={(value) => update('includeSteamIds', value)} title="Identificadores de Steam" description="Incluye el Steam ID global y el del personaje." warning />
              <Toggle checked={privacy.includeCoordinates} onChange={(value) => update('includeCoordinates', value)} title="Coordenadas precisas" description="Incluye posición, mapa, orientación, montura y mancha." warning />
              <Toggle checked={privacy.includeRawInternalIds} onChange={(value) => update('includeRawInternalIds', value)} title="IDs internos" description="Handles, IDs de objetos, offsets y banderas individuales." />
              <Toggle checked={privacy.includeRawEventFlags} onChange={(value) => update('includeRawEventFlags', value)} title="Bitfield completo de eventos" description={`Añade ${formatBytes(context.slot.raw.eventFlags.byteLength)} en Base64; el JSON crecerá mucho.`} warning />
            </div>
          </Panel>
          <Panel>
            <SectionHeading icon={ShieldCheck} eyebrow="Reglas aplicadas" title="Exportación segura" />
            <ul className="check-list">
              <li><CheckCircle2 size={16} /> No incluye rutas locales del ordenador.</li>
              <li><CheckCircle2 size={16} /> No contiene el archivo binario original.</li>
              <li><CheckCircle2 size={16} /> Distingue hitos inferidos de logros oficiales.</li>
              <li><CheckCircle2 size={16} /> Conserva el nivel de spoilers seleccionado.</li>
              <li><Info size={16} /> Sí incluye el nombre visible del personaje y el nombre base del archivo.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RawTab({ save, slot }: { save: ParsedSave; slot: SemanticSlot }) {
  return (
    <div className="tab-stack">
      <div className="three-column">
        <MetricCard icon={ShieldCheck} label="Integridad de ranura" value={slot.raw.integrity.valid ? 'MD5 válido' : 'No coincide'} detail={`${slot.raw.integrity.computedMd5Hex.slice(0, 12)}…`} tone={slot.raw.integrity.valid ? 'good' : 'warning'} />
        <MetricCard icon={Database} label="Versión interna" value={String(slot.raw.version)} detail={`Base ${slot.raw.baseVersion.value}`} />
        <MetricCard icon={FileSearch} label="Fin del parseo" value={formatOffset(slot.raw.parseEndOffset)} detail={`${formatNumber(slot.raw.opaqueSections.length)} secciones opacas`} />
      </div>

      {save.warnings.length > 0 && (
        <Panel>
          <SectionHeading icon={AlertTriangle} eyebrow="Parser" title="Avisos" />
          <ul className="warning-list">{save.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </Panel>
      )}

      <Panel>
        <SectionHeading icon={UserRound} eyebrow="UserData10" title="Tabla de perfiles" description="Las ranuras vacías también se conservan en el índice global." />
        <div className="profile-table">
          <div className="profile-row profile-row--head"><span>Ranura</span><span>Estado</span><span>Nombre</span><span>Nivel</span><span>Tiempo</span></div>
          {save.profiles.map((profile) => (
            <div className="profile-row" key={profile.slotIndex}>
              <strong>{profile.slotIndex + 1}</strong>
              <span><StatusPill tone={profile.active ? 'good' : 'neutral'}>{profile.active ? 'Activa' : 'Vacía'}</StatusPill></span>
              <span>{profile.name || '—'}</span><span>{profile.active ? profile.level : '—'}</span><span>{profile.active ? formatDuration(profile.secondsPlayed) : '—'}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading icon={Layers3} eyebrow="Cobertura honesta" title="Índice de secciones opacas" description="Se conocen el desplazamiento y tamaño, pero no se les atribuye una semántica no verificada." />
        <div className="opaque-table">
          <div className="opaque-row opaque-row--head"><span>Sección</span><span>Offset absoluto</span><span>Tamaño</span><span>Vista previa</span></div>
          {slot.raw.opaqueSections.map((section, index) => (
            <div className="opaque-row" key={`${section.name}-${index}`}>
              <code>{section.name}</code><code>{formatOffset(section.offset)}</code><span>{formatBytes(section.length)}</span><code>{section.previewHex ? `${section.previewHex.slice(0, 24)}…` : '—'}</code>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading icon={Database} eyebrow="Bloques grandes" title="Datos preservados" />
        <div className="coverage-grid">
          <div><strong>{formatBytes(slot.raw.eventFlags.byteLength)}</strong><span>banderas de evento</span></div>
          <div><strong>{formatNumber(slot.raw.gaItems.length)}</strong><span>GAItems no vacíos</span></div>
          <div><strong>{formatNumber(slot.raw.heldInventory.commonItems.length + slot.raw.heldInventory.keyItems.length)}</strong><span>entradas portadas</span></div>
          <div><strong>{formatNumber(slot.raw.chestInventory.commonItems.length + slot.raw.chestInventory.keyItems.length)}</strong><span>entradas del baúl</span></div>
        </div>
      </Panel>
    </div>
  );
}

function Dashboard({
  save,
  slots,
  selectedSlotId,
  onSelectSlot,
  onReset,
  catalog,
  spoilerMode,
  onSpoilerMode,
  privacy,
  setPrivacy,
  toast,
  showToast,
}: {
  save: ParsedSave;
  slots: SemanticSlot[];
  selectedSlotId: number;
  onSelectSlot: (slotIndex: number) => void;
  onReset: () => void;
  catalog: SemanticCatalog;
  spoilerMode: SpoilerMode;
  onSpoilerMode: (value: SpoilerMode) => void;
  privacy: ExportPrivacyOptions;
  setPrivacy: Dispatch<SetStateAction<ExportPrivacyOptions>>;
  toast: ToastState | null;
  showToast: (toast: ToastState) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const slot = slots.find((item) => item.slotIndex === selectedSlotId) ?? slots[0];
  if (!slot) return null;
  const context: ExportContext = { save, slot, catalog, privacy, spoilerMode };

  return (
    <main className="dashboard">
      <section className="character-hero">
        <div className="character-hero__identity">
          <span className="character-rune" aria-hidden="true">{slot.identity.level}</span>
          <div>
            <div className="hero-kicker"><span>Ranura {slot.slotIndex + 1}</span><span>·</span><span>{slot.identity.className}</span></div>
            <h2>{slot.identity.name}</h2>
            <p>{slot.build.summary}</p>
            <div className="hero-pills">
              <StatusPill tone="gold" icon={Gauge}>Nivel {slot.identity.level}</StatusPill>
              <StatusPill tone={slot.raw.integrity.valid ? 'good' : 'danger'} icon={slot.raw.integrity.valid ? ShieldCheck : AlertTriangle}>{slot.raw.integrity.valid ? 'Checksum correcto' : 'Checksum no válido'}</StatusPill>
              <StatusPill icon={EyeOff}>{SPOILER_OPTIONS.find((option) => option.value === spoilerMode)?.label}</StatusPill>
            </div>
          </div>
        </div>
        <div className="character-hero__controls">
          {slots.length > 1 && (
            <label className="slot-select"><span>Personaje</span><select value={selectedSlotId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectSlot(Number(event.target.value))}>{slots.map((item) => <option value={item.slotIndex} key={item.slotIndex}>{item.identity.name} · nivel {item.identity.level}</option>)}</select></label>
          )}
          <button className="secondary-button" type="button" onClick={onReset}><UploadCloud size={17} /> Analizar otro save</button>
        </div>
      </section>

      <nav className="tab-nav" aria-label="Secciones del análisis">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return <button type="button" key={tab.id} className={activeTab === tab.id ? 'tab-nav__active' : undefined} onClick={() => setActiveTab(tab.id)}><Icon size={17} />{tab.label}</button>;
        })}
      </nav>

      <div className="tab-content">
        {activeTab === 'summary' && <SummaryTab slot={slot} />}
        {activeTab === 'build' && <BuildTab slot={slot} />}
        {activeTab === 'equipment' && <EquipmentTab slot={slot} />}
        {activeTab === 'inventory' && <InventoryTab slot={slot} />}
        {activeTab === 'progress' && <ProgressTab slot={slot} catalog={catalog} spoilerMode={spoilerMode} onSpoilerMode={onSpoilerMode} />}
        {activeTab === 'export' && <ExportTab context={context} privacy={privacy} setPrivacy={setPrivacy} showToast={showToast} />}
        {activeTab === 'raw' && <RawTab save={save} slot={slot} />}
      </div>

      {toast && (
        <div className={joinClass('toast', toast.kind === 'error' && 'toast--error')} role="status">
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {toast.message}
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<SemanticCatalog>(() => getFallbackCatalog());
  const [catalogStatus, setCatalogStatus] = useState('Catálogo mínimo');
  const [save, setSave] = useState<ParsedSave | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Preparando…');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [spoilerMode, setSpoilerMode] = useState<SpoilerMode>('safe');
  const [privacy, setPrivacy] = useState<ExportPrivacyOptions>({
    includeSteamIds: false,
    includeCoordinates: false,
    includeRawEventFlags: false,
    includeRawInternalIds: false,
  });
  const [toast, setToast] = useState<ToastState | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSemanticCatalog((message) => alive && setCatalogStatus(message)).then((loaded) => {
      if (!alive) return;
      setCatalog(loaded);
      setCatalogStatus(loaded.loadedSources.length > 1 ? 'Catálogo listo' : 'Catálogo mínimo');
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  const semanticSlots = useMemo(() => save ? createSemanticSlots(save.slots, catalog) : [], [save, catalog]);

  useEffect(() => {
    if (semanticSlots.length > 0 && !semanticSlots.some((slot) => slot.slotIndex === selectedSlotId)) {
      setSelectedSlotId(semanticSlots[0]?.slotIndex ?? 0);
    }
  }, [semanticSlots, selectedSlotId]);

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3_500);
  }, []);

  const parseFile = useCallback(async (file: File) => {
    setError(null);
    if (!isAcceptedFile(file)) {
      setError('Selecciona un archivo de partida PC con extensión .sl2 o .co2.');
      return;
    }
    if (file.size < 25_000_000) {
      setError(`El archivo solo ocupa ${formatBytes(file.size)}; una partida PC completa debería rondar 28 MiB.`);
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      setError(`El archivo ocupa ${formatBytes(file.size)} y supera el límite de seguridad de 64 MiB.`);
      return;
    }

    setBusy(true);
    setProgress(0.01);
    setStage('Leyendo el archivo local…');
    workerRef.current?.terminate();

    try {
      const buffer = await file.arrayBuffer();
      const worker = new Worker(new URL('./worker/save.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
        const response = event.data;
        if (response.type === 'progress') {
          setStage(response.stage);
          setProgress(response.fraction);
          return;
        }
        worker.terminate();
        workerRef.current = null;
        setBusy(false);
        if (response.type === 'error') {
          setError(`${response.message}${response.offset !== undefined ? ` (offset ${formatOffset(response.offset)})` : ''}`);
          return;
        }
        setSave(response.save);
        setSelectedSlotId(response.save.slots[0]?.slotIndex ?? 0);
        setProgress(1);
        setStage('Análisis terminado');
        setSpoilerMode('safe');
        setPrivacy({ includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false });
      };
      worker.onerror = (event) => {
        worker.terminate(); workerRef.current = null; setBusy(false);
        setError(event.message || 'El worker de análisis ha fallado.');
      };
      const request: WorkerParseRequest = {
        type: 'parse', fileName: file.name, fileSize: file.size, lastModified: file.lastModified, buffer,
      };
      worker.postMessage(request, [buffer]);
    } catch (caught) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setBusy(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  const reset = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSave(null); setError(null); setBusy(false); setProgress(0); setStage('Preparando…'); setToast(null);
  };

  return (
    <div className="app-shell">
      <AppHeader catalog={catalog} catalogStatus={catalogStatus} />
      {!save ? (
        <UploadScreen busy={busy} progress={progress} stage={stage} dragging={dragging} error={error} onFile={parseFile} onDragState={setDragging} />
      ) : (
        <Dashboard
          save={save}
          slots={semanticSlots}
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
          onReset={reset}
          catalog={catalog}
          spoilerMode={spoilerMode}
          onSpoilerMode={setSpoilerMode}
          privacy={privacy}
          setPrivacy={setPrivacy}
          toast={toast}
          showToast={showToast}
        />
      )}
      <footer className="app-footer">
        <span>Elden Ring Savegame Analyzer · proyecto comunitario no afiliado a FromSoftware, Bandai Namco ni Valve.</span>
        <span>Parser de solo lectura · Los nombres semánticos tienen atribución en <code>THIRD_PARTY_NOTICES.md</code>.</span>
      </footer>
    </div>
  );
}
