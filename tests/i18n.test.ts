import { describe, expect, it } from 'vitest';
import { formatNumber } from '../src/lib/format';
import { isAppLanguage, localize } from '../src/lib/i18n';

describe('application localization', () => {
  it('selects English and Spanish text explicitly', () => {
    expect(localize('en', 'Read only', 'Solo lectura')).toBe('Read only');
    expect(localize('es', 'Read only', 'Solo lectura')).toBe('Solo lectura');
  });

  it('formats numbers for the selected locale', () => {
    expect(formatNumber(12_345, 'en')).toBe('12,345');
    expect(formatNumber(12_345, 'es')).toBe('12.345');
  });

  it('accepts only supported persisted language values', () => {
    expect(isAppLanguage('en')).toBe(true);
    expect(isAppLanguage('es')).toBe(true);
    expect(isAppLanguage('fr')).toBe(false);
  });
});
