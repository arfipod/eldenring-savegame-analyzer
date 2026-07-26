const integerFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? integerFormatter.format(value) : '—';
}

export function formatDecimal(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  if (digits === 2) return decimalFormatter.format(value);
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(value);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} d`);
  if (hours > 0 || days > 0) parts.push(`${hours} h`);
  parts.push(`${minutes} min`);
  if (days === 0 && hours === 0) parts.push(`${secs} s`);
  return parts.join(' ');
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${formatDecimal(value, value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatOffset(offset: number): string {
  return `0x${Math.max(0, offset).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function formatRate(numerator: number, seconds: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(seconds) || seconds <= 0) return '—';
  return `${formatDecimal((numerator / seconds) * 3_600, 2)}/h`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)} %`;
}

export function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return cleaned || 'elden-ring-save';
}
