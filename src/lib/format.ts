import type { AppLanguage } from './i18n';
import { DEFAULT_LANGUAGE, localeFor } from './i18n';

export function formatNumber(value: number, language: AppLanguage = DEFAULT_LANGUAGE): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0 }).format(value)
    : '—';
}

export function formatDecimal(value: number, digits = 2, language: AppLanguage = DEFAULT_LANGUAGE): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: digits }).format(value);
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

export function formatBytes(bytes: number, language: AppLanguage = DEFAULT_LANGUAGE): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${formatDecimal(value, value >= 100 ? 0 : value >= 10 ? 1 : 2, language)} ${units[index]}`;
}

export function formatOffset(offset: number): string {
  return `0x${Math.max(0, offset).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function formatRate(numerator: number, seconds: number, language: AppLanguage = DEFAULT_LANGUAGE): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(seconds) || seconds <= 0) return '—';
  return `${formatDecimal((numerator / seconds) * 3_600, 2, language)}/h`;
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
