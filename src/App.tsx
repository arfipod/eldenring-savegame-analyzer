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
  Gamepad2,
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, Dispatch, DragEvent, FormEvent, ReactNode, SetStateAction } from 'react';
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
import type { AppLanguage } from './lib/i18n';
import { DEFAULT_LANGUAGE, isAppLanguage, localize } from './lib/i18n';
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

const ATTRIBUTE_LABELS: Record<AppLanguage, Record<AttributeKey, string>> = {
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

const TYPE_LABELS: Record<AppLanguage, Record<ResolvedInventoryItem['type'] | 'all', string>> = {
  en: {
    all: 'All types',
    weapon: 'Weapons and catalysts',
    armor: 'Armor',
    talisman: 'Talismans',
    good: 'Items, spells, and ashes',
    ashOfWar: 'Ashes of War',
    unknown: 'Unresolved',
  },
  es: {
    all: 'Todos los tipos',
    weapon: 'Armas y catalizadores',
    armor: 'Armadura',
    talisman: 'Talismán',
    good: 'Objetos, magia y cenizas',
    ashOfWar: 'Cenizas de guerra',
    unknown: 'Sin resolver',
  },
};

type SpoilerOption = {
  value: SpoilerMode;
  label: string;
  description: string;
  icon: LucideIcon;
};

function spoilerOptions(language: AppLanguage): SpoilerOption[] {
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  return [
  {
    value: 'safe',
    label: l('Spoiler-safe', 'Sin spoilers'),
    description: l(
      'Shows only what the save confirms as obtained, discovered, or defeated.',
      'Solo muestra lo que el save acredita como obtenido, descubierto o derrotado.',
    ),
    icon: ShieldCheck,
  },
  {
    value: 'zones',
    label: l('Zones only', 'Solo zonas'),
    description: l(
      'Keeps future objectives hidden and prioritizes names of already recorded areas.',
      'Mantiene ocultos objetivos futuros; prioriza nombres de áreas ya registradas.',
    ),
    icon: MapPin,
  },
  {
    value: 'precise',
    label: l('Precise, no names', 'Preciso sin nombres'),
    description: l(
      'Adds pending counts without revealing which content is missing.',
      'Añade recuentos pendientes, pero no revela qué contenido falta.',
    ),
    icon: EyeOff,
  },
  {
    value: 'completion',
    label: l('Completionist', 'Completista'),
    description: l(
      'Shows names of undetected content and may reveal much of the game.',
      'Expone nombres de contenido no detectado. Puede revelar mucho del juego.',
    ),
    icon: Eye,
  },
  ];
}

type TabId = 'summary' | 'build' | 'equipment' | 'inventory' | 'progress' | 'export' | 'raw';

function tabs(language: AppLanguage): Array<{ id: TabId; label: string; icon: LucideIcon }> {
  const l = (english: string, spanish: string) => localize(language, english, spanish);
  return [
  { id: 'summary', label: l('Summary', 'Resumen'), icon: BarChart3 },
  { id: 'build', label: 'Build', icon: Brain },
  { id: 'equipment', label: l('Equipment', 'Equipo'), icon: Swords },
  { id: 'inventory', label: l('Inventory', 'Inventario'), icon: PackageSearch },
  { id: 'progress', label: l('Progress', 'Progreso'), icon: MapPin },
  { id: 'export', label: l('AI and export', 'IA y exportación'), icon: Bot },
  { id: 'raw', label: l('Technical data', 'Datos técnicos'), icon: TableProperties },
  ];
}

interface LanguageContextValue {
  language: AppLanguage;
  l: (english: string, spanish: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  l: (english) => english,
});

function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

interface ToastState {
  kind: 'success' | 'error';
  message: string;
}

interface SteamDeckConnection {
  host: string;
  username: string;
  password: string;
}

function joinClass(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.sl2') || lower.endsWith('.co2');
}

function copyText(text: string, language: AppLanguage): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied
    ? Promise.resolve()
    : Promise.reject(new Error(localize(language, 'Could not copy to the clipboard.', 'No se pudo copiar al portapapeles.')));
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
  const { language, l } = useLanguage();
  const empty = item.handle === 0 || item.name === 'Vacío' || item.name === 'Empty';
  return (
    <div className={joinClass('equipment-line', empty && 'equipment-line--empty')}>
      <div>
        {label && <span className="equipment-line__label">{label}</span>}
        <strong>{item.name}{item.upgradeLevel > 0 ? ` +${item.upgradeLevel}` : ''}</strong>
        {item.ashOfWar && item.ashOfWar.name !== 'None' && (
          <small>{l('Ash', 'Ceniza')}: {item.ashOfWar.name}</small>
        )}
      </div>
      <StatusPill tone={empty ? 'neutral' : 'gold'}>{empty ? l('Empty', 'Vacío') : TYPE_LABELS[language][item.type]}</StatusPill>
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
  const { language, l } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <Panel className="progress-list">
      <div className="progress-list__header">
        <h3>{title}</h3>
        <StatusPill tone="gold">{formatNumber(items.length, language)}</StatusPill>
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
          {expanded
            ? l('Show less', 'Mostrar menos')
            : l(
                `Show ${formatNumber(items.length - limit, language)} more`,
                `Mostrar ${formatNumber(items.length - limit, language)} más`,
              )}
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

function AppHeader({
  catalog,
  catalogStatus,
  language,
  onLanguage,
}: {
  catalog: SemanticCatalog;
  catalogStatus: string;
  language: AppLanguage;
  onLanguage: (language: AppLanguage) => void;
}) {
  const { l } = useLanguage();
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
        <div className="language-switch" role="group" aria-label={l('Language', 'Idioma')}>
          <button type="button" className={language === 'en' ? 'language-switch__active' : undefined} onClick={() => onLanguage('en')} aria-pressed={language === 'en'}>EN</button>
          <button type="button" className={language === 'es' ? 'language-switch__active' : undefined} onClick={() => onLanguage('es')} aria-pressed={language === 'es'}>ES</button>
        </div>
        <StatusPill icon={LockKeyhole} tone="good">{l('Local processing', 'Procesado local')}</StatusPill>
        <StatusPill icon={ShieldCheck} tone="good">{l('Read only', 'Solo lectura')}</StatusPill>
        <StatusPill icon={catalogReady ? CheckCircle2 : RefreshCw} tone={catalogReady ? 'gold' : 'neutral'}>
          {catalogReady
            ? l(`${catalog.loadedSources.length} semantic sources`, `${catalog.loadedSources.length} fuentes semánticas`)
            : catalogStatus}
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
  onSteamDeck,
  onDragState,
}: {
  busy: boolean;
  progress: number;
  stage: string;
  dragging: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSteamDeck: (connection: SteamDeckConnection) => Promise<void>;
  onDragState: (value: boolean) => void;
}) {
  const { l } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'file' | 'steam-deck'>('file');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('deck');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const choose = () => inputRef.current?.click();
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    onDragState(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  const connectToSteamDeck = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await onSteamDeck({ host, username, password });
    } finally {
      setPassword('');
      setShowPassword(false);
    }
  };

  return (
    <main className="landing">
      <section className="landing__intro">
        <span className="eyebrow">{l('Your save, explained without touching it', 'Tu partida, explicada sin tocarla')}</span>
        <h2>{l('Turn an ', 'Convierte un ')}<span>.sl2</span>{l(' into a useful, private, understandable report.', ' en un informe útil, privado y entendible.')}</h2>
        <p>
          {l(
            'Decode slots, level, deaths, attributes, build, equipment, inventory, progress, flasks, Flask of Wondrous Physick, and technical fields. Then export it as AI-ready JSON.',
            'Decodifica ranuras, nivel, muertes, atributos, build, equipo, inventario, progreso, frascos, Físico Maravilloso y campos técnicos. Después expórtalo como JSON listo para una IA.',
          )}
        </p>
        <div className="landing__trust">
          <span><ShieldCheck size={17} /> {l('The save is processed in this browser', 'La partida se procesa en este navegador')}</span>
          <span><HardDrive size={17} /> {l('It is never saved or rewritten', 'No se guarda ni se reescribe')}</span>
          <span><EyeOff size={17} /> {l('Spoiler-safe by default', 'Modo sin spoilers por defecto')}</span>
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
        <div className="source-tabs" role="tablist" aria-label={l('Save source', 'Origen de la partida')}>
          <button type="button" role="tab" aria-selected={source === 'file'} className={source === 'file' ? 'source-tabs__active' : undefined} onClick={() => setSource('file')} disabled={busy}>
            <HardDrive size={17} /> {l('This device', 'Este dispositivo')}
          </button>
          <button type="button" role="tab" aria-selected={source === 'steam-deck'} className={source === 'steam-deck' ? 'source-tabs__active' : undefined} onClick={() => setSource('steam-deck')} disabled={busy}>
            <Gamepad2 size={17} /> Steam Deck
          </button>
        </div>

        {source === 'file' ? (
          <button
            className={joinClass('drop-zone', dragging && 'drop-zone--dragging', busy && 'drop-zone--busy')}
            type="button"
            role="tabpanel"
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
            <strong>{busy ? stage : l('Drop ER0000.sl2 here', 'Arrastra ER0000.sl2 aquí')}</strong>
            <span>{busy ? `${Math.round(progress * 100)} %` : l('or click to choose the file from your Steam Deck or PC', 'o pulsa para elegir el archivo de tu Steam Deck o PC')}</span>
            {busy && (
              <span className="progress-track" aria-label={l(`Progress ${Math.round(progress * 100)}%`, `Progreso ${Math.round(progress * 100)} %`)}>
                <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
              </span>
            )}
          </button>
        ) : (
          <form className="deck-form" role="tabpanel" onSubmit={connectToSteamDeck}>
            <div className="deck-form__heading">
              <span className="drop-zone__icon">
                {busy ? <RefreshCw className="spin" size={34} /> : <Gamepad2 size={38} />}
              </span>
              <div>
                <strong>{busy ? stage : l('Connect to your Steam Deck', 'Conecta con tu Steam Deck')}</strong>
                <span>{busy ? `${Math.round(progress * 100)} %` : l('SSH must be enabled on the console.', 'SSH debe estar activado en la consola.')}</span>
              </div>
            </div>
            {busy && (
              <span className="progress-track" aria-label={l(`Progress ${Math.round(progress * 100)}%`, `Progreso ${Math.round(progress * 100)} %`)}>
                <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
              </span>
            )}
            <div className="deck-form__fields">
              <label>
                <span>{l('Private IP address', 'Dirección IP privada')}</span>
                <input type="text" inputMode="decimal" autoComplete="off" placeholder="192.168.1.50" value={host} onChange={(event) => setHost(event.target.value)} disabled={busy} required />
              </label>
              <label>
                <span>{l('Linux user', 'Usuario Linux')}</span>
                <input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} required />
              </label>
              <div className="deck-field">
                <label htmlFor="steam-deck-password">{l('Password', 'Contraseña')}</label>
                <span className="password-field">
                  <input id="steam-deck-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} disabled={busy} title={showPassword ? l('Hide password', 'Ocultar contraseña') : l('Show password', 'Mostrar contraseña')} aria-label={showPassword ? l('Hide password', 'Ocultar contraseña') : l('Show password', 'Mostrar contraseña')}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </div>
            </div>
            <button className="primary-button deck-form__submit" type="submit" disabled={busy}>
              {busy ? <RefreshCw className="spin" size={18} /> : <Download size={18} />}
              {l('Find and analyze save', 'Buscar y analizar partida')}
            </button>
            <p className="deck-form__privacy"><LockKeyhole size={15} /> {l('Available only in the locally run app. Credentials stay in memory and are discarded after the attempt.', 'Disponible solo al ejecutar la app localmente. Las credenciales permanecen en memoria y se descartan tras el intento.')}</p>
          </form>
        )}
        {error && (
          <div className="inline-alert inline-alert--danger" role="alert">
            <AlertTriangle aria-hidden="true" size={19} />
            <div><strong>{l('The file could not be analyzed', 'No se pudo analizar el archivo')}</strong><p>{error}</p></div>
          </div>
        )}
        <div className="upload-panel__notes">
          <span><FileSearch size={16} /> {l('Compatible with BND4 PC saves', 'Compatible con partidas PC BND4')} <code>.sl2</code> {l('and', 'y')} <code>.co2</code>.</span>
          <span><Info size={16} /> {l('“Decode” does not mean the save is encrypted: the app interprets its binary format.', '“Decodificar” no significa que el save esté cifrado: se interpreta su formato binario.')}</span>
        </div>
      </Panel>

      <section className="feature-grid" aria-label={l('Features', 'Funciones')}>
        <article><UserRound size={22} /><strong>{l('Profile and build', 'Perfil y build')}</strong><p>{l('Level, attributes, starting class, focus, and data-backed recommendations.', 'Nivel, atributos, clase inicial, enfoque y recomendaciones respaldadas por datos.')}</p></article>
        <article><PackageSearch size={22} /><strong>{l('Named items', 'Objetos con nombre')}</strong><p>{l('Inventory, chest, equipment, upgrades, spells, talismans, and ashes.', 'Inventario, baúl, equipo, mejoras, hechizos, talismanes y cenizas.')}</p></article>
        <article><MapPin size={22} /><strong>{l('Controlled progress', 'Progreso controlado')}</strong><p>{l('Recorded milestones and places, with four explicit spoiler levels.', 'Hitos y lugares ya registrados, con cuatro niveles explícitos de spoilers.')}</p></article>
        <article><FileJson size={22} /><strong>{l('AI export', 'Exportación para IA')}</strong><p>{l('Semantic JSON, Markdown report, and forensic dump with configurable privacy.', 'JSON semántico, informe Markdown y volcado forense con privacidad configurable.')}</p></article>
      </section>
    </main>
  );
}

function SpoilerSelector({ value, onChange }: { value: SpoilerMode; onChange: (value: SpoilerMode) => void }) {
  const { language, l } = useLanguage();
  return (
    <div className="spoiler-selector" role="radiogroup" aria-label={l('Spoiler level', 'Nivel de spoilers')}>
      {spoilerOptions(language).map((option) => {
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
  const { language, l } = useLanguage();
  const mainWeapons = [...slot.equipment.rightHand, ...slot.equipment.leftHand]
    .filter((item) => item.handle !== 0 && item.name !== 'Mano desnuda' && item.name !== 'Bare hands');
  const topAdvice = slot.build.advice.slice(0, 4);
  const maxAttribute = Math.max(60, ...(Object.values(slot.attributes) as number[]));

  return (
    <div className="tab-stack">
      <section className="metrics-grid">
        <MetricCard icon={Clock3} label={l('Play time', 'Tiempo de juego')} value={formatDuration(slot.identity.playtimeSeconds)} detail={formatClock(slot.identity.playtimeSeconds)} tone="gold" />
        <MetricCard icon={Skull} label={l('Deaths', 'Muertes')} value={formatNumber(slot.overview.deaths, language)} detail={formatRate(slot.overview.deaths, slot.identity.playtimeSeconds, language)} tone="warning" />
        <MetricCard icon={Sparkles} label={l('Current runes', 'Runas actuales')} value={formatNumber(slot.overview.currentRunes, language)} detail={l(`${formatNumber(slot.overview.lifetimeRunes, language)} lifetime`, `${formatNumber(slot.overview.lifetimeRunes, language)} acumuladas`)} />
        <MetricCard icon={MapPin} label={l('Last Site of Grace', 'Última gracia')} value={slot.overview.lastRestedGrace} detail={slot.overview.mapLabel} />
        <MetricCard icon={FlaskConical} label={l('Flasks', 'Frascos')} value={`${slot.overview.crimsonFlasks} + ${slot.overview.ceruleanFlasks}`} detail={l(`${slot.overview.totalFlasks} charges detected`, `${slot.overview.totalFlasks} cargas detectadas`)} tone="good" />
        <MetricCard icon={Layers3} label={l('Talisman slots', 'Ranuras de talismán')} value={String(slot.overview.talismanSlots)} detail={l(`${slot.equipment.talismans.filter((item) => item.handle !== 0).length} occupied`, `${slot.equipment.talismans.filter((item) => item.handle !== 0).length} ocupadas`)} />
        <MetricCard icon={HeartPulse} label={l('Max HP', 'PV máximos')} value={formatNumber(slot.vitals.hp.max, language)} detail={l(`${formatNumber(slot.vitals.stamina.max, language)} stamina`, `${formatNumber(slot.vitals.stamina.max, language)} de aguante`)} />
        <MetricCard icon={Swords} label={l('Main weapon', 'Arma principal')} value={mainWeapons[0]?.name ?? l('Unresolved', 'No resuelta')} detail={mainWeapons[0]?.upgradeLevel ? l(`Upgrade +${mainWeapons[0].upgradeLevel}`, `Mejora +${mainWeapons[0].upgradeLevel}`) : l('See the Equipment tab', 'Revisa la pestaña Equipo')} tone="gold" />
      </section>

      {slot.overview.bloodstainRunes > 0 && (
        <div className="inline-alert inline-alert--warning">
          <AlertTriangle aria-hidden="true" size={20} />
          <div>
            <strong>{l(
              `There are ${formatNumber(slot.overview.bloodstainRunes, language)} runes in a bloodstain`,
              `Hay ${formatNumber(slot.overview.bloodstainRunes, language)} runas en una mancha de sangre`,
            )}</strong>
            <p>{l(
              'This is a fact read from the save. The analyzer does not know whether you are already on your way to recover them.',
              'Es un hecho leído del save. El analizador no conoce si ya estás camino de recuperarlas.',
            )}</p>
          </div>
        </div>
      )}

      <div className="two-column">
        <Panel>
          <SectionHeading icon={Gauge} eyebrow={l('Distribution', 'Distribución')} title={l('Attributes', 'Atributos')} description={l(`Level ${slot.identity.level} · ${slot.identity.className}`, `Nivel ${slot.identity.level} · ${slot.identity.className}`)} />
          <div className="attribute-bars">
            {(Object.entries(slot.attributes) as Array<[AttributeKey, number]>).map(([key, value]) => (
              <div className={joinClass('attribute-bar', slot.build.primaryStats.includes(key) && 'attribute-bar--primary')} key={key}>
                <div><span>{ATTRIBUTE_LABELS[language][key]}</span><strong>{value}</strong></div>
                <span className="attribute-bar__track"><span style={{ width: `${Math.min(100, (value / maxAttribute) * 100)}%` }} /></span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeading icon={Brain} eyebrow={l('Automatic analysis', 'Lectura automática')} title={slot.build.archetype} description={slot.build.summary} />
          <div className="focus-score">
            <div className="focus-score__dial" style={{ '--score': `${slot.build.levelEfficiency * 3.6}deg` } as CSSProperties}>
              <strong>{slot.build.levelEfficiency}</strong><span>/100</span>
            </div>
            <div><strong>{l('Offensive point concentration', 'Concentración de puntos ofensivos')}</strong><p>{l(
              'This is not a “good or bad” build score; it measures how concentrated the investment is instead of how spread out it is.',
              'No es una nota de “buena o mala” build: mide cuánto se concentra la inversión frente a dispersarse.',
            )}</p></div>
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
        <SectionHeading icon={Database} eyebrow={l('Transparency', 'Transparencia')} title={l('What could be read', 'Qué se ha podido leer')} description={l('The parser separates interpreted data from internal blobs without reliable public meaning.', 'El parser distingue datos interpretados de blobs internos sin significado público fiable.')} />
        <div className="coverage-grid">
          <div><strong>{formatNumber(slot.inventory.length, language)}</strong><span>{l('resolved inventory entries', 'entradas de inventario resueltas')}</span></div>
          <div><strong>{formatNumber(slot.raw.gaItems.length, language)}</strong><span>{l('active GAItem records', 'registros GAItem activos')}</span></div>
          <div><strong>{formatNumber(slot.raw.unlockedRegionIds.length, language)}</strong><span>{l('unlocked internal regions', 'regiones internas desbloqueadas')}</span></div>
          <div><strong>{formatNumber(slot.raw.opaqueSections.length, language)}</strong><span>{l('indexed opaque sections', 'secciones opacas indexadas')}</span></div>
        </div>
      </Panel>
    </div>
  );
}

function BuildTab({ slot }: { slot: SemanticSlot }) {
  const { language, l } = useLanguage();
  const [targetLevel, setTargetLevel] = useState(slot.identity.level + 10);
  useEffect(() => setTargetLevel(slot.identity.level + 10), [slot.identity.level]);
  const needed = runesBetweenLevels(slot.identity.level, targetLevel);
  const next = runeCostForNextLevel(slot.identity.level);
  const activeWeapons = [...slot.equipment.rightHand, ...slot.equipment.leftHand]
    .filter((item) => item.handle !== 0 && item.name !== 'Mano desnuda' && item.name !== 'Bare hands');

  return (
    <div className="tab-stack">
      <div className="two-column two-column--wide-left">
        <Panel>
          <SectionHeading icon={Brain} eyebrow={l('Diagnosis', 'Diagnóstico')} title={slot.build.archetype} description={slot.build.summary} />
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
            <SectionHeading icon={Sparkles} eyebrow={l('Planner', 'Planificador')} title={l('Level cost', 'Coste de niveles')} description={l("Calculated with the game's rune curve.", 'Cálculo con la curva de runas del juego.')} />
            <label className="number-field">
              <span>{l('Target level', 'Nivel objetivo')}</span>
              <input
                type="number"
                min={slot.identity.level}
                max={713}
                value={targetLevel}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTargetLevel(Math.max(slot.identity.level, Math.min(713, Number(event.target.value) || slot.identity.level)))}
              />
            </label>
            <div className="planner-result"><strong>{formatNumber(needed, language)}</strong><span>{l(`runes to reach level ${targetLevel}`, `runas para llegar a nivel ${targetLevel}`)}</span></div>
            <p className="muted-copy">{l(
              `Next level: ${formatNumber(next, language)} runes. You currently have ${formatNumber(slot.overview.currentRunes, language)}.`,
              `Siguiente nivel: ${formatNumber(next, language)} runas. Actualmente llevas ${formatNumber(slot.overview.currentRunes, language)}.`,
            )}</p>
          </Panel>

          <Panel>
            <SectionHeading icon={Swords} eyebrow={l('Practical scaling', 'Escalado práctico')} title={l('Active weapons', 'Armas activas')} />
            <div className="equipment-stack">
              {activeWeapons.length > 0 ? activeWeapons.map((item, index) => <EquipmentLine item={item} label={l(`Weapon ${index + 1}`, `Arma ${index + 1}`)} key={`${item.handle}-${index}`} />) : <p className="empty-copy">{l('No active weapon was resolved.', 'No se ha resuelto ningún arma activa.')}</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <SectionHeading icon={Activity} eyebrow={l('Details', 'Ficha')} title={l('Attributes and resources', 'Atributos y recursos')} description={l('Values stored in PlayerGameData.', 'Valores almacenados en PlayerGameData.')} />
        <div className="stat-table">
          {(Object.entries(slot.attributes) as Array<[AttributeKey, number]>).map(([key, value]) => (
            <div key={key} className={slot.build.primaryStats.includes(key) ? 'stat-table__primary' : undefined}>
              <span>{ATTRIBUTE_LABELS[language][key]}</span><strong>{value}</strong>
            </div>
          ))}
          <div><span>{l('HP', 'PV')}</span><strong>{slot.vitals.hp.current}/{slot.vitals.hp.max}</strong></div>
          <div><span>{l('FP', 'PC')}</span><strong>{slot.vitals.fp.current}/{slot.vitals.fp.max}</strong></div>
          <div><span>{l('Current stamina', 'Aguante actual')}</span><strong>{slot.vitals.stamina.current}/{slot.vitals.stamina.max}</strong></div>
          <div><span>{l('Matchmaking weapon level', 'Nivel de arma para matchmaking')}</span><strong>{slot.raw.player.matchmakingWeaponLevel}</strong></div>
        </div>
      </Panel>
    </div>
  );
}

function EquipmentTab({ slot }: { slot: SemanticSlot }) {
  const { l } = useLanguage();
  return (
    <div className="tab-stack">
      <div className="equipment-layout">
        <Panel>
          <SectionHeading icon={Swords} eyebrow={l('Armaments', 'Armamento')} title={l('Hands and slots', 'Manos y ranuras')} />
          <div className="equipment-columns">
            <div><h3>{l('Right hand', 'Mano derecha')}</h3>{slot.equipment.rightHand.map((item, index) => <EquipmentLine item={item} label={l(`Slot ${index + 1}`, `Ranura ${index + 1}`)} key={`r-${index}`} />)}</div>
            <div><h3>{l('Left hand', 'Mano izquierda')}</h3>{slot.equipment.leftHand.map((item, index) => <EquipmentLine item={item} label={l(`Slot ${index + 1}`, `Ranura ${index + 1}`)} key={`l-${index}`} />)}</div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading icon={ShieldCheck} eyebrow={l('Protection', 'Protección')} title={l('Armor', 'Armadura')} />
          <div className="equipment-stack">
            <EquipmentLine item={slot.equipment.armor.head} label={l('Head', 'Cabeza')} />
            <EquipmentLine item={slot.equipment.armor.chest} label={l('Chest', 'Torso')} />
            <EquipmentLine item={slot.equipment.armor.arms} label={l('Arms', 'Brazos')} />
            <EquipmentLine item={slot.equipment.armor.legs} label={l('Legs', 'Piernas')} />
          </div>
        </Panel>
      </div>

      <div className="three-column">
        <Panel>
          <SectionHeading icon={Layers3} eyebrow={l(`${slot.equipment.talismans.filter((item) => item.handle !== 0).length}/${slot.overview.talismanSlots} occupied`, `${slot.equipment.talismans.filter((item) => item.handle !== 0).length}/${slot.overview.talismanSlots} ocupadas`)} title={l('Talismans', 'Talismanes')} />
          <div className="equipment-stack">{slot.equipment.talismans.slice(0, slot.overview.talismanSlots).map((item, index) => <EquipmentLine item={item} label={l(`Slot ${index + 1}`, `Ranura ${index + 1}`)} key={`t-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={FlaskConical} eyebrow={l('Current mixture', 'Mezcla actual')} title={l('Flask of Wondrous Physick', 'Físico Maravilloso')} description={l('The flask holds two tears; resolved handles are shown here.', 'El frasco admite dos lágrimas; aquí se muestran los handles ya resueltos.')} />
          <div className="equipment-stack">{slot.equipment.physickTears.map((item, index) => <EquipmentLine item={item} label={l(`Tear ${index + 1}`, `Lágrima ${index + 1}`)} key={`p-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={Zap} eyebrow={l('Memorized', 'Memorizados')} title={l('Spells', 'Hechizos')} />
          <div className="simple-list">
            {slot.equipment.spells.filter((spell) => spell.id !== 0 && spell.id !== 0xffff_ffff).map((spell) => <div key={spell.id}><strong>{spell.name}</strong><span>0x{spell.hexId}</span></div>)}
            {slot.equipment.spells.every((spell) => spell.id === 0 || spell.id === 0xffff_ffff) && <p className="empty-copy">{l('No spells are equipped.', 'No hay hechizos equipados.')}</p>}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel>
          <SectionHeading icon={Archive} eyebrow={l('Quick access', 'Acceso rápido')} title={l('Quick items', 'Objetos rápidos')} />
          <div className="quick-grid">{slot.equipment.quickSlots.map((item, index) => <EquipmentLine item={item} label={`${index + 1}`} key={`q-${index}`} />)}</div>
        </Panel>
        <Panel>
          <SectionHeading icon={PackageSearch} eyebrow={l('Pouch', 'Bolsa')} title={l('Pouch items', 'Objetos de la bolsa')} />
          <div className="quick-grid">{slot.equipment.pouch.map((item, index) => <EquipmentLine item={item} label={`${index + 1}`} key={`po-${index}`} />)}</div>
        </Panel>
      </div>
    </div>
  );
}

function InventoryTab({ slot }: { slot: SemanticSlot }) {
  const { language, l } = useLanguage();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ResolvedInventoryItem['type'] | 'all'>('all');
  const [storage, setStorage] = useState<'all' | 'held' | 'chest'>('all');
  const [keyOnly, setKeyOnly] = useState(false);
  const [equippedOnly, setEquippedOnly] = useState(false);
  const normalized = query.trim().toLocaleLowerCase(language);
  const filtered = useMemo(() => slot.inventory.filter((item) => {
    if (normalized && !`${item.name} ${item.classification ?? ''} ${item.hexId}`.toLocaleLowerCase(language).includes(normalized)) return false;
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
          eyebrow={l(`${formatNumber(filtered.length, language)} of ${formatNumber(slot.inventory.length, language)}`, `${formatNumber(filtered.length, language)} de ${formatNumber(slot.inventory.length, language)}`)}
          title={l('Inventory and chest', 'Inventario y baúl')}
          description={l('Names come from the semantic catalog; each row retains a confidence level to avoid false certainty.', 'Los nombres proceden del catálogo semántico; cada fila conserva un nivel de confianza para no fingir certezas.')}
          action={<button className="secondary-button" type="button" onClick={resetFilters}><RefreshCw size={16} /> {l('Clear filters', 'Limpiar filtros')}</button>}
        />
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder={l('Search item, class, or ID…', 'Buscar objeto, clase o ID…')} /></label>
          <label className="select-field"><span>{l('Type', 'Tipo')}</span><select value={type} onChange={(event: ChangeEvent<HTMLSelectElement>) => setType(event.target.value as typeof type)}>{Object.entries(TYPE_LABELS[language]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="select-field"><span>{l('Location', 'Ubicación')}</span><select value={storage} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStorage(event.target.value as typeof storage)}><option value="all">{l('All', 'Todo')}</option><option value="held">{l('Inventory', 'Inventario')}</option><option value="chest">{l('Chest', 'Baúl')}</option></select></label>
          <label className="check-chip"><input type="checkbox" checked={keyOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setKeyOnly(event.target.checked)} /><span>{l('Key items only', 'Solo clave')}</span></label>
          <label className="check-chip"><input type="checkbox" checked={equippedOnly} onChange={(event: ChangeEvent<HTMLInputElement>) => setEquippedOnly(event.target.checked)} /><span>{l('Equipped only', 'Solo equipado')}</span></label>
        </div>
      </Panel>

      <Panel className="inventory-panel">
        {filtered.length === 0 ? (
          <div className="empty-state"><PackageSearch size={34} /><strong>{l('No matches', 'No hay coincidencias')}</strong><p>{l('Try different filters or clear the search.', 'Prueba otros filtros o limpia la búsqueda.')}</p></div>
        ) : (
          <div className="inventory-table" role="table" aria-label={l('Inventory', 'Inventario')}>
            <div className="inventory-row inventory-row--head" role="row">
              <span>{l('Item', 'Objeto')}</span><span>{l('Quantity', 'Cantidad')}</span><span>{l('Type', 'Tipo')}</span><span>{l('Location', 'Ubicación')}</span><span>{l('Status', 'Estado')}</span>
            </div>
            {filtered.map((item) => (
              <div className="inventory-row" role="row" key={`${item.storage}-${item.inventoryIndex}-${item.handle}`}>
                <div className="inventory-name">
                  <strong>{item.name}{item.upgradeLevel > 0 && !item.name.match(/\+\d+$/) ? ` +${item.upgradeLevel}` : ''}</strong>
                  <small>{item.classification ?? l(`Semantic ID 0x${item.hexId}`, `ID semántico 0x${item.hexId}`)}</small>
                  {item.semanticSummary && <em>{item.semanticSummary}</em>}
                </div>
                <strong>×{formatNumber(item.quantity, language)}</strong>
                <span>{TYPE_LABELS[language][item.type]}</span>
                <span>{item.storage === 'held' ? l('Inventory', 'Inventario') : l('Chest', 'Baúl')}{item.keyItem ? l(' · key', ' · clave') : ''}</span>
                <div className="row-pills">
                  {item.equipped && <StatusPill tone="gold">{l('Equipped', 'Equipado')}</StatusPill>}
                  <StatusPill tone={item.confidence === 'high' ? 'good' : item.confidence === 'medium' ? 'warning' : 'danger'}>{item.confidence === 'high' ? l('Resolved', 'Resuelto') : item.confidence === 'medium' ? l('Probable', 'Probable') : l('Raw ID', 'ID raw')}</StatusPill>
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
  const { language, l } = useLanguage();
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
        <SectionHeading icon={EyeOff} eyebrow={l('Explicit control', 'Control explícito')} title={l('Spoiler level', 'Nivel de spoilers')} description={l('The mode applies to this view and the AI export.', 'El modo se aplica a esta vista y a la exportación para IA.')} />
        <SpoilerSelector value={spoilerMode} onChange={onSpoilerMode} />
      </Panel>

      <div className="inline-alert inline-alert--info">
        <Info aria-hidden="true" size={20} />
        <div><strong>{l('“Achievements” means inferred milestones', '“Logros” significa hitos inferidos')}</strong><p>{l(
          'Save flags can detect many bosses, Sites of Grace, and progress items, but they are not the official Steam achievement history.',
          'Las banderas del save permiten detectar muchos jefes, gracias y objetos de progreso, pero no constituyen el historial oficial de logros de Steam.',
        )}</p></div>
      </div>
      {catalogLimited && (
        <div className="inline-alert inline-alert--warning">
          <AlertTriangle size={20} />
          <div><strong>{l('The full catalog is not available yet', 'Catálogo completo no disponible todavía')}</strong><p>{l(
            'Base parsing remains valid, but progress counts may be incomplete until semantic data finishes loading.',
            'La lectura base sigue siendo válida, pero los recuentos de progreso pueden estar incompletos hasta que se carguen los datos semánticos.',
          )}</p></div>
        </div>
      )}

      <section className="progress-metrics">
        <MetricCard icon={Skull} label={l('Detected bosses/milestones', 'Jefes/hitos detectados')} value={formatNumber(slot.progress.defeatedBosses.length, language)} detail={slot.progress.totals.bossesKnown ? l(`of ${formatNumber(slot.progress.totals.bossesKnown, language)} cataloged flags`, `sobre ${formatNumber(slot.progress.totals.bossesKnown, language)} banderas catalogadas`) : l('minimal catalog', 'catálogo mínimo')} tone="gold" />
        <MetricCard icon={MapPin} label={l('Discovered Sites of Grace', 'Gracias descubiertas')} value={formatNumber(slot.progress.discoveredGraces.length, language)} detail={slot.progress.totals.gracesKnown ? l(`of ${formatNumber(slot.progress.totals.gracesKnown, language)} cataloged`, `sobre ${formatNumber(slot.progress.totals.gracesKnown, language)} catalogadas`) : l('minimal catalog', 'catálogo mínimo')} />
        <MetricCard icon={BookOpen} label={l('Cookbooks', 'Recetarios')} value={formatNumber(slot.progress.acquiredCookbooks.length, language)} detail={l('acquired according to flags', 'adquiridos según banderas')} />
        <MetricCard icon={Settings2} label={l('Whetblades', 'Hojas de afilar')} value={formatNumber(slot.progress.acquiredWhetblades.length, language)} detail={l('acquired according to flags', 'adquiridas según banderas')} />
      </section>

      <ProgressList title={l('Defeated bosses and milestones', 'Jefes e hitos ya derrotados')} items={slot.progress.defeatedBosses} emptyText={l('No milestones were resolved with the currently loaded catalog.', 'No hay hitos resueltos con el catálogo actualmente cargado.')} />
      <ProgressList title={l('Discovered Sites of Grace', 'Lugares de gracia ya descubiertos')} items={slot.progress.discoveredGraces} emptyText={l('No Sites of Grace were resolved with the currently loaded catalog.', 'No hay gracias resueltas con el catálogo actualmente cargado.')} />
      <div className="two-column">
        <ProgressList title={l('Acquired cookbooks', 'Libros de recetas adquiridos')} items={slot.progress.acquiredCookbooks} emptyText={l('None detected.', 'Ninguno detectado.')} limit={35} />
        <ProgressList title={l('Acquired bell bearings', 'Rodamientos de campana adquiridos')} items={slot.progress.acquiredBellBearings} emptyText={l('None detected.', 'Ninguno detectado.')} limit={35} />
      </div>
      <ProgressList title={l('Acquired whetblades', 'Hojas de afilar adquiridas')} items={slot.progress.acquiredWhetblades} emptyText={l('None detected.', 'Ninguna detectada.')} limit={35} />

      {spoilerMode === 'precise' && missing && (
        <Panel className="spoiler-counts">
          <SectionHeading icon={EyeOff} eyebrow={l('No names', 'Sin nombres')} title={l('Undetected content', 'Contenido no detectado')} description={l('Only quantities are shown to avoid revealing identities or locations.', 'Solo se muestran cantidades para no revelar identidades ni ubicaciones.')} />
          <div className="coverage-grid">
            <div><strong>{formatNumber(missing.bosses.length, language)}</strong><span>{l('undetected bosses/milestones', 'jefes/hitos no detectados')}</span></div>
            <div><strong>{formatNumber(missing.graces.length, language)}</strong><span>{l('undetected Sites of Grace', 'gracias no detectadas')}</span></div>
            <div><strong>{formatNumber(missing.cookbooks.length, language)}</strong><span>{l('undetected cookbooks', 'recetarios no detectados')}</span></div>
            <div><strong>{formatNumber(missing.whetblades.length, language)}</strong><span>{l('undetected whetblades', 'hojas no detectadas')}</span></div>
          </div>
        </Panel>
      )}

      {spoilerMode === 'completion' && missing && (
        <div className="completion-zone">
          <div className="inline-alert inline-alert--danger">
            <Eye size={20} />
            <div><strong>{l('Completionist mode is active', 'Modo completista activo')}</strong><p>{l('The following lists reveal content names that the save does not mark as complete.', 'Las listas siguientes revelan nombres de contenido que el save no marca como completado.')}</p></div>
          </div>
          <ProgressList title={l('Undetected bosses/milestones', 'Jefes/hitos no detectados')} items={missing.bosses} emptyText={l('None remain in the loaded catalog.', 'No queda ninguno dentro del catálogo cargado.')} />
          <ProgressList title={l('Undetected Sites of Grace', 'Gracias no detectadas')} items={missing.graces} emptyText={l('None remain in the loaded catalog.', 'No queda ninguna dentro del catálogo cargado.')} />
          <div className="two-column">
            <ProgressList title={l('Undetected cookbooks', 'Recetarios no detectados')} items={missing.cookbooks} emptyText={l('None remain.', 'No queda ninguno.')} limit={35} />
            <ProgressList title={l('Undetected bell bearings', 'Rodamientos no detectados')} items={missing.bellBearings} emptyText={l('None remain.', 'No queda ninguno.')} limit={35} />
          </div>
          <ProgressList title={l('Undetected whetblades', 'Hojas de afilar no detectadas')} items={missing.whetblades} emptyText={l('None remain.', 'No queda ninguna.')} limit={35} />
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
  const { language, l } = useLanguage();
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
      showToast({ kind: 'success', message: l('File generated in your browser.', 'Archivo generado en tu navegador.') });
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const copyPrompt = async () => {
    const prompt = `${l(
      'Analyze my Elden Ring save using the attached JSON. Do not reveal future content unless it already appears as discovered, obtained, or defeated. Separate facts, inferences, and recommendations; prioritize optimizing my build and identifying useful things I can already do without editing the save.',
      'Analiza mi partida de Elden Ring usando el JSON adjunto. No reveles contenido futuro que no aparezca ya como descubierto, obtenido o derrotado. Separa hechos, inferencias y recomendaciones; prioriza optimizar mi build y señalar cosas útiles que ya puedo hacer sin editar el save.',
    )}\n\n${preview}`;
    try {
      await copyText(prompt, language);
      showToast({ kind: 'success', message: l('Prompt and JSON copied to the clipboard.', 'Prompt y JSON copiados al portapapeles.') });
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const update = (key: keyof ExportPrivacyOptions, value: boolean) => setPrivacy((current) => ({ ...current, [key]: value }));

  return (
    <div className="tab-stack">
      <div className="two-column two-column--wide-left">
        <Panel>
          <SectionHeading icon={Bot} eyebrow={l('Language model', 'Modelo de lenguaje')} title={l('AI-ready semantic JSON', 'JSON semántico listo para IA')} description={l('Preserves useful meaning, removes opaque bytes, and applies the privacy options on the right.', 'Conserva el significado útil, elimina bytes opacos y aplica las opciones de privacidad de la derecha.')} />
          <div className="export-actions">
            <button className="primary-button" type="button" onClick={() => doDownload('semantic')}><Download size={18} /> {l('Download semantic JSON', 'Descargar JSON semántico')}</button>
            <button className="secondary-button" type="button" onClick={copyPrompt}><Clipboard size={18} /> {l('Copy prompt + JSON', 'Copiar prompt + JSON')}</button>
            <button className="secondary-button" type="button" onClick={() => doDownload('markdown')}><ScrollText size={18} /> {l('Markdown report', 'Informe Markdown')}</button>
            <button className="ghost-button" type="button" onClick={() => doDownload('forensic')}><Database size={18} /> {l('Forensic JSON', 'JSON forense')}</button>
          </div>
          <div className="code-preview">
            <div className="code-preview__top"><span><FileJson size={16} /> {l('Preview', 'Vista previa')}</span><small>{formatBytes(new Blob([preview]).size, language)}</small></div>
            <pre>{preview.slice(0, 18_000)}{preview.length > 18_000 ? l('\n… preview truncated; the download contains everything.', '\n… vista previa truncada; la descarga contiene todo.') : ''}</pre>
          </div>
        </Panel>

        <div className="side-stack">
          <Panel>
            <SectionHeading icon={LockKeyhole} eyebrow={l('Privacy', 'Privacidad')} title={l('What you allow in exports', 'Qué permites exportar')} description={l('Steam IDs, exact location, and forensic data are disabled by default.', 'Steam IDs, ubicación exacta y datos forenses están desactivados por defecto.')} />
            <div className="toggle-stack">
              <Toggle checked={privacy.includeSteamIds} onChange={(value) => update('includeSteamIds', value)} title={l('Steam identifiers', 'Identificadores de Steam')} description={l('Includes the global and character Steam IDs.', 'Incluye el Steam ID global y el del personaje.')} warning />
              <Toggle checked={privacy.includeCoordinates} onChange={(value) => update('includeCoordinates', value)} title={l('Precise coordinates', 'Coordenadas precisas')} description={l('Includes position, map, orientation, mount, and bloodstain.', 'Incluye posición, mapa, orientación, montura y mancha.')} warning />
              <Toggle checked={privacy.includeRawInternalIds} onChange={(value) => update('includeRawInternalIds', value)} title={l('Internal IDs', 'IDs internos')} description={l('Handles, item IDs, offsets, and individual flags.', 'Handles, IDs de objetos, offsets y banderas individuales.')} />
              <Toggle checked={privacy.includeRawEventFlags} onChange={(value) => update('includeRawEventFlags', value)} title={l('Complete event bitfield', 'Bitfield completo de eventos')} description={l(`Adds ${formatBytes(context.slot.raw.eventFlags.byteLength, language)} as Base64; the JSON will grow substantially.`, `Añade ${formatBytes(context.slot.raw.eventFlags.byteLength, language)} en Base64; el JSON crecerá mucho.`)} warning />
            </div>
          </Panel>
          <Panel>
            <SectionHeading icon={ShieldCheck} eyebrow={l('Applied rules', 'Reglas aplicadas')} title={l('Safe export', 'Exportación segura')} />
            <ul className="check-list">
              <li><CheckCircle2 size={16} /> {l('Does not include local computer paths.', 'No incluye rutas locales del ordenador.')}</li>
              <li><CheckCircle2 size={16} /> {l('Does not contain the original binary file.', 'No contiene el archivo binario original.')}</li>
              <li><CheckCircle2 size={16} /> {l('Separates inferred milestones from official achievements.', 'Distingue hitos inferidos de logros oficiales.')}</li>
              <li><CheckCircle2 size={16} /> {l('Preserves the selected spoiler level.', 'Conserva el nivel de spoilers seleccionado.')}</li>
              <li><Info size={16} /> {l("Includes the visible character name and the file's base name.", 'Sí incluye el nombre visible del personaje y el nombre base del archivo.')}</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RawTab({ save, slot }: { save: ParsedSave; slot: SemanticSlot }) {
  const { language, l } = useLanguage();
  return (
    <div className="tab-stack">
      <div className="three-column">
        <MetricCard icon={ShieldCheck} label={l('Slot integrity', 'Integridad de ranura')} value={slot.raw.integrity.valid ? l('Valid MD5', 'MD5 válido') : l('Mismatch', 'No coincide')} detail={`${slot.raw.integrity.computedMd5Hex.slice(0, 12)}…`} tone={slot.raw.integrity.valid ? 'good' : 'warning'} />
        <MetricCard icon={Database} label={l('Internal version', 'Versión interna')} value={String(slot.raw.version)} detail={`Base ${slot.raw.baseVersion.value}`} />
        <MetricCard icon={FileSearch} label={l('Parser end', 'Fin del parseo')} value={formatOffset(slot.raw.parseEndOffset)} detail={l(`${formatNumber(slot.raw.opaqueSections.length, language)} opaque sections`, `${formatNumber(slot.raw.opaqueSections.length, language)} secciones opacas`)} />
      </div>

      {save.warnings.length > 0 && (
        <Panel>
          <SectionHeading icon={AlertTriangle} eyebrow="Parser" title={l('Warnings', 'Avisos')} />
          <ul className="warning-list">{save.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </Panel>
      )}

      <Panel>
        <SectionHeading icon={UserRound} eyebrow="UserData10" title={l('Profile table', 'Tabla de perfiles')} description={l('Empty slots are also retained in the global index.', 'Las ranuras vacías también se conservan en el índice global.')} />
        <div className="profile-table">
          <div className="profile-row profile-row--head"><span>{l('Slot', 'Ranura')}</span><span>{l('Status', 'Estado')}</span><span>{l('Name', 'Nombre')}</span><span>{l('Level', 'Nivel')}</span><span>{l('Time', 'Tiempo')}</span></div>
          {save.profiles.map((profile) => (
            <div className="profile-row" key={profile.slotIndex}>
              <strong>{profile.slotIndex + 1}</strong>
              <span><StatusPill tone={profile.active ? 'good' : 'neutral'}>{profile.active ? l('Active', 'Activa') : l('Empty', 'Vacía')}</StatusPill></span>
              <span>{profile.name || '—'}</span><span>{profile.active ? profile.level : '—'}</span><span>{profile.active ? formatDuration(profile.secondsPlayed) : '—'}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading icon={Layers3} eyebrow={l('Honest coverage', 'Cobertura honesta')} title={l('Opaque section index', 'Índice de secciones opacas')} description={l('The offset and size are known, but no unverified meaning is assigned.', 'Se conocen el desplazamiento y tamaño, pero no se les atribuye una semántica no verificada.')} />
        <div className="opaque-table">
          <div className="opaque-row opaque-row--head"><span>{l('Section', 'Sección')}</span><span>{l('Absolute offset', 'Offset absoluto')}</span><span>{l('Size', 'Tamaño')}</span><span>{l('Preview', 'Vista previa')}</span></div>
          {slot.raw.opaqueSections.map((section, index) => (
            <div className="opaque-row" key={`${section.name}-${index}`}>
              <code>{section.name}</code><code>{formatOffset(section.offset)}</code><span>{formatBytes(section.length)}</span><code>{section.previewHex ? `${section.previewHex.slice(0, 24)}…` : '—'}</code>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading icon={Database} eyebrow={l('Large blocks', 'Bloques grandes')} title={l('Preserved data', 'Datos preservados')} />
        <div className="coverage-grid">
          <div><strong>{formatBytes(slot.raw.eventFlags.byteLength, language)}</strong><span>{l('event flags', 'banderas de evento')}</span></div>
          <div><strong>{formatNumber(slot.raw.gaItems.length, language)}</strong><span>{l('non-empty GAItems', 'GAItems no vacíos')}</span></div>
          <div><strong>{formatNumber(slot.raw.heldInventory.commonItems.length + slot.raw.heldInventory.keyItems.length, language)}</strong><span>{l('held entries', 'entradas portadas')}</span></div>
          <div><strong>{formatNumber(slot.raw.chestInventory.commonItems.length + slot.raw.chestInventory.keyItems.length, language)}</strong><span>{l('chest entries', 'entradas del baúl')}</span></div>
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
  const { language, l } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const slot = slots.find((item) => item.slotIndex === selectedSlotId) ?? slots[0];
  if (!slot) return null;
  const context: ExportContext = { save, slot, catalog, privacy, spoilerMode, language };

  return (
    <main className="dashboard">
      <section className="character-hero">
        <div className="character-hero__identity">
          <span className="character-rune" aria-hidden="true">{slot.identity.level}</span>
          <div>
            <div className="hero-kicker"><span>{l(`Slot ${slot.slotIndex + 1}`, `Ranura ${slot.slotIndex + 1}`)}</span><span>·</span><span>{slot.identity.className}</span></div>
            <h2>{slot.identity.name}</h2>
            <p>{slot.build.summary}</p>
            <div className="hero-pills">
              <StatusPill tone="gold" icon={Gauge}>{l(`Level ${slot.identity.level}`, `Nivel ${slot.identity.level}`)}</StatusPill>
              <StatusPill tone={slot.raw.integrity.valid ? 'good' : 'danger'} icon={slot.raw.integrity.valid ? ShieldCheck : AlertTriangle}>{slot.raw.integrity.valid ? l('Valid checksum', 'Checksum correcto') : l('Invalid checksum', 'Checksum no válido')}</StatusPill>
              <StatusPill icon={EyeOff}>{spoilerOptions(language).find((option) => option.value === spoilerMode)?.label}</StatusPill>
            </div>
          </div>
        </div>
        <div className="character-hero__controls">
          {slots.length > 1 && (
            <label className="slot-select"><span>{l('Character', 'Personaje')}</span><select value={selectedSlotId} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectSlot(Number(event.target.value))}>{slots.map((item) => <option value={item.slotIndex} key={item.slotIndex}>{item.identity.name} · {l('level', 'nivel')} {item.identity.level}</option>)}</select></label>
          )}
          <button className="secondary-button" type="button" onClick={onReset}><UploadCloud size={17} /> {l('Analyze another save', 'Analizar otro save')}</button>
        </div>
      </section>

      <nav className="tab-nav" aria-label={l('Analysis sections', 'Secciones del análisis')}>
        {tabs(language).map((tab) => {
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
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const stored = window.localStorage.getItem('eldenring-savegame-analyzer.language');
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  });
  const l = useCallback(
    (english: string, spanish: string) => localize(language, english, spanish),
    [language],
  );
  const [catalog, setCatalog] = useState<SemanticCatalog>(() => getFallbackCatalog(language));
  const [catalogStatus, setCatalogStatus] = useState(localize(language, 'Minimal catalog', 'Catálogo mínimo'));
  const [save, setSave] = useState<ParsedSave | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(localize(language, 'Preparing…', 'Preparando…'));
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
    document.documentElement.lang = language;
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      l(
        'A local, semantic, read-only analyzer for Elden Ring PC save files.',
        'Analizador local, semántico y de solo lectura para partidas de Elden Ring en PC.',
      ),
    );
    window.localStorage.setItem('eldenring-savegame-analyzer.language', language);
    setCatalog(getFallbackCatalog(language));
    setCatalogStatus(l('Minimal catalog', 'Catálogo mínimo'));
    void loadSemanticCatalog((message) => alive && setCatalogStatus(message), language).then((loaded) => {
      if (!alive) return;
      setCatalog(loaded);
      setCatalogStatus(loaded.loadedSources.length > 1 ? l('Catalog ready', 'Catálogo listo') : l('Minimal catalog', 'Catálogo mínimo'));
    });
    return () => { alive = false; };
  }, [language, l]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  const semanticSlots = useMemo(
    () => save ? createSemanticSlots(save.slots, catalog, language) : [],
    [save, catalog, language],
  );

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
      setError(l(
        'Select a PC save file with an .sl2 or .co2 extension.',
        'Selecciona un archivo de partida PC con extensión .sl2 o .co2.',
      ));
      return;
    }
    if (file.size < 25_000_000) {
      setError(l(
        `The file is only ${formatBytes(file.size, language)}; a complete PC save should be around 28 MiB.`,
        `El archivo solo ocupa ${formatBytes(file.size, language)}; una partida PC completa debería rondar 28 MiB.`,
      ));
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      setError(l(
        `The file is ${formatBytes(file.size, language)} and exceeds the 64 MiB safety limit.`,
        `El archivo ocupa ${formatBytes(file.size, language)} y supera el límite de seguridad de 64 MiB.`,
      ));
      return;
    }

    setBusy(true);
    setProgress(0.01);
    setStage(l('Reading the local file…', 'Leyendo el archivo local…'));
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
        setStage(l('Analysis complete', 'Análisis terminado'));
        setSpoilerMode('safe');
        setPrivacy({ includeSteamIds: false, includeCoordinates: false, includeRawEventFlags: false, includeRawInternalIds: false });
      };
      worker.onerror = (event) => {
        worker.terminate(); workerRef.current = null; setBusy(false);
        setError(event.message || l('The analysis worker failed.', 'El worker de análisis ha fallado.'));
      };
      const request: WorkerParseRequest = {
        type: 'parse', language, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, buffer,
      };
      worker.postMessage(request, [buffer]);
    } catch (caught) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setBusy(false);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [language, l]);

  const fetchSteamDeckSave = useCallback(async (connection: SteamDeckConnection) => {
    setError(null);
    const isLoopback = window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1'
      || window.location.hostname === '::1';
    if (!isLoopback) {
      setError(l(
        'Steam Deck access is only available from the local app opened on localhost.',
        'El acceso a Steam Deck solo está disponible desde la app local abierta en localhost.',
      ));
      return;
    }

    setDeckBusy(true);
    setProgress(0.03);
    setStage(l('Connecting securely to SteamOS…', 'Conectando de forma segura con SteamOS…'));
    try {
      const response = await fetch('/api/local/steam-deck-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connection),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const fileName = response.headers.get('X-Save-File-Name');
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? l('The Steam Deck connection failed.', 'La conexión con Steam Deck ha fallado.'));
      }
      if (fileName !== 'ER0000.sl2' && fileName !== 'ER0000.co2') {
        throw new Error(l(
          'The local SSH bridge is not available. Start the app with npm run dev.',
          'El puente SSH local no está disponible. Inicia la app con npm run dev.',
        ));
      }

      const expectedSize = Number(response.headers.get('Content-Length'));
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 64 * 1024 * 1024) {
        throw new Error(l('The remote save size is not valid.', 'El tamaño de la partida remota no es válido.'));
      }
      if (!response.body) throw new Error(l('The remote save response is empty.', 'La respuesta de la partida remota está vacía.'));

      setStage(l('Downloading the read-only copy…', 'Descargando la copia de solo lectura…'));
      const reader = response.body.getReader();
      const chunks: ArrayBuffer[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > expectedSize || received > 64 * 1024 * 1024) {
          await reader.cancel();
          throw new Error(l('The remote save exceeded its declared size.', 'La partida remota superó el tamaño declarado.'));
        }
        const chunk = new ArrayBuffer(value.byteLength);
        new Uint8Array(chunk).set(value);
        chunks.push(chunk);
        setProgress(0.05 + (received / expectedSize) * 0.28);
      }
      if (received !== expectedSize) {
        throw new Error(l('The remote save download was incomplete.', 'La descarga de la partida remota quedó incompleta.'));
      }

      const lastModifiedHeader = Number(response.headers.get('X-Save-Last-Modified'));
      const lastModified = Number.isFinite(lastModifiedHeader) && lastModifiedHeader > 0 ? lastModifiedHeader : Date.now();
      const file = new File(chunks, fileName, { type: 'application/octet-stream', lastModified });
      setDeckBusy(false);
      await parseFile(file);
    } catch (caught) {
      setDeckBusy(false);
      setProgress(0);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [l, parseFile]);

  const reset = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setSave(null); setError(null); setBusy(false); setDeckBusy(false); setProgress(0); setStage(l('Preparing…', 'Preparando…')); setToast(null);
  };

  return (
    <LanguageContext.Provider value={{ language, l }}>
    <div className="app-shell">
      <AppHeader catalog={catalog} catalogStatus={catalogStatus} language={language} onLanguage={setLanguage} />
      {!save ? (
        <UploadScreen busy={busy || deckBusy} progress={progress} stage={stage} dragging={dragging} error={error} onFile={parseFile} onSteamDeck={fetchSteamDeckSave} onDragState={setDragging} />
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
        <span>{l(
          'Elden Ring Savegame Analyzer · a community project not affiliated with FromSoftware, Bandai Namco, or Valve.',
          'Elden Ring Savegame Analyzer · proyecto comunitario no afiliado a FromSoftware, Bandai Namco ni Valve.',
        )}</span>
        <span>{l(
          'Read-only parser · Semantic names are attributed in',
          'Parser de solo lectura · Los nombres semánticos tienen atribución en',
        )} <code>THIRD_PARTY_NOTICES.md</code>.</span>
      </footer>
    </div>
    </LanguageContext.Provider>
  );
}
