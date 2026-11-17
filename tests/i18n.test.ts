import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ID, pick, pickL } from '../src/i18n';

/** Reads every source file so a new English string cannot ship without Indonesian. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'i18n' ? [] : sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = sources(join(__dirname, '..', 'src')).map((p) => ({ p, s: readFileSync(p, 'utf8') }));
const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\"/g, '"');

describe('Indonesian coverage', () => {
  it('has an entry for every static English string', () => {
    const call = /\b(?:t|L|q)\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,/gs;
    const obj = /\ben:\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*ar:/gs;
    // A call that already passes Indonesian as its third argument, or an object with an `id` key, needs no entry.
    const explicitCall = /\b(?:t|L|q)\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*(['"`])(?:\\.|(?!\3).)*\3\s*,\s*['"`]/gs;
    const explicitObj = /\ben:\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*ar:\s*(['"`])(?:\\.|(?!\3).)*\3\s*,\s*id:/gs;
    const missing: string[] = [];
    for (const { p, s } of files) {
      const explicit = new Set([...s.matchAll(explicitCall), ...s.matchAll(explicitObj)].map((m) => unescape(m[2])));
      for (const re of [call, obj]) {
        for (const m of s.matchAll(re)) {
          if (m[1] === '`' && m[2].includes('${')) continue;
          const en = unescape(m[2]);
          if (en === '' || en in ID || explicit.has(en)) continue;
          missing.push(`${p.split(/[\\/]src[\\/]/)[1]}: ${en}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every text built from values an explicit Indonesian argument', () => {
    const dyn = /\b(?:t|L|q)\(\s*`((?:\\.|[^`])*\$\{(?:\\.|[^`])*)`\s*,\s*`(?:\\.|[^`])*`\s*,?\s*\)/gs;
    const missing: string[] = [];
    for (const { p, s } of files) for (const m of s.matchAll(dyn)) missing.push(`${p.split(/[\\/]src[\\/]/)[1]}: ${m[1].slice(0, 60)}`);
    expect(missing).toEqual([]);
  });

  it('never leaves an Indonesian entry empty or identical to a long English sentence', () => {
    const lazy = Object.entries(ID).filter(([en, id]) => !id.trim() || (en.split(' ').length > 3 && en === id));
    expect(lazy).toEqual([]);
  });

  it('picks the right language and falls back to English only when nothing exists', () => {
    expect(pick('id', 'Sign in', 'تسجيل الدخول')).toBe('Masuk');
    expect(pick('ar', 'Sign in', 'تسجيل الدخول')).toBe('تسجيل الدخول');
    expect(pick('id', 'Built 3 items', 'x', 'Dibuat 3 item')).toBe('Dibuat 3 item');
    expect(pickL('id', { en: 'Primary care', ar: 'x' })).toBe('Layanan primer');
  });
});
