export type AppLanguage = 'en' | 'es';

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export function localize(language: AppLanguage, english: string, spanish: string): string {
  return language === 'es' ? spanish : english;
}

export function localeFor(language: AppLanguage): string {
  return language === 'es' ? 'es-ES' : 'en-US';
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'es';
}
