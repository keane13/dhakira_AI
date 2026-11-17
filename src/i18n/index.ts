import type { Lang, Localised } from '../engine/types';
import { ID_CHECK } from './id-check';
import { ID_CORE } from './id-core';
import { ID_PAGES } from './id-pages';

/**
 * Indonesian is keyed by the English source text, so call sites stay two-argument
 * for static copy. Text built from values carries an explicit third argument.
 * tests/i18n.test.ts fails when any static string has no Indonesian entry.
 */
export const ID: Record<string, string> = { ...ID_CORE, ...ID_CHECK, ...ID_PAGES };

export const LANGS: { code: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'id', label: 'Bahasa Indonesia', dir: 'ltr' },
];

export const idOf = (l: Localised): string => l.id ?? ID[l.en] ?? l.en;

export function pick(lang: Lang, en: string, ar: string, id?: string): string {
  if (lang === 'ar') return ar;
  if (lang === 'id') return id ?? ID[en] ?? en;
  return en;
}

export const pickL = (lang: Lang, l: Localised): string => pick(lang, l.en, l.ar, l.id);
