/**
 * The mark is a brain with a trend line inside it: flat, then falling. It is the
 * product's one idea, a person compared with their own baseline, and it repeats
 * on the sign-in screen and in the threshold scale.
 */

const OUTLINE = 'M20 46 C12 46 7 40 8 33 C4 28 6 20 12 18 C12 11 20 7 26 10 C30 5 40 5 44 10 C51 9 57 15 56 22 C60 27 59 35 54 38 C53 44 47 47 42 45 C41 49 42 53 44 56 L38 56 C35 52 34 48 34 45 C30 47 24 47 20 46 Z';
const TREND = '14,27 23,25 32,27 41,26 50,36';
const FOLDS = [
  'M12 18 C16 21 21 20 24 17',
  'M26 10 C26 15 30 18 35 16',
  'M44 10 C43 15 46 19 51 18',
  'M8 33 C12 36 17 35 20 32',
  'M56 22 C52 23 50 25 50 29',
  'M54 38 C50 40 46 39 44 36',
  'M34 45 C33 41 35 38 39 38',
  'M20 46 C22 42 27 41 30 43',
];

export function LogoMark({ size = 36, outline = 'var(--primary)', trend = 'var(--human)' }: { size?: number; outline?: string; trend?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={OUTLINE} fill="none" stroke={outline} strokeWidth={3.4} strokeLinejoin="round" />
      <polyline points={TREND} fill="none" stroke={trend} strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="50" cy="36" r="3.4" fill={trend} />
    </svg>
  );
}

export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={`wordmark ${onDark ? 'on-dark' : ''}`}>
      <LogoMark outline={onDark ? '#ffffff' : 'var(--primary)'} trend={onDark ? 'var(--aqua)' : 'var(--human)'} />
      <span className="wordmark-text">
        <span className="en">Dhakira</span>
        <span className="ar" lang="ar">ذاكرة</span>
      </span>
    </span>
  );
}

/** The sign-in illustration: the same mark drawn large, with the baseline made explicit. */
export function BrainTrendArt() {
  return (
    <svg className="brain-art" viewBox="0 0 64 60" width="560" height="525" role="img" aria-label="A brain outline with a line inside it that stays level, then falls">
      <path d={OUTLINE} fill="rgba(255,255,255,0.05)" stroke="#ffffff" strokeWidth={0.7} strokeLinejoin="round" />
      {FOLDS.map((d) => <path key={d} d={d} fill="none" stroke="#ffffff" strokeOpacity={0.3} strokeWidth={0.45} strokeLinecap="round" />)}
      <line x1="13" x2="52" y1="26.2" y2="26.2" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.35} strokeDasharray="1.2 1" />
      <polyline points={TREND} fill="none" stroke="var(--aqua)" strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round" />
      {TREND.split(' ').map((p) => {
        const [cx, cy] = p.split(',');
        return <circle key={p} cx={cx} cy={cy} r={1} fill="var(--aqua)" stroke="var(--ink)" strokeWidth={0.35} />;
      })}
    </svg>
  );
}
