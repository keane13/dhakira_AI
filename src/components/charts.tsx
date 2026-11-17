import { useId, useMemo, useState, type ReactNode } from 'react';
import { selectComparable } from '../engine/pipeline';
import { BASELINE_VISITS, calibrationFor, fmt, REPEAT_Z, REVIEW_Z } from '../engine/scoring';
import type { ChangePoint } from '../engine/monitoring';
import { POSITION_LABEL, type AreaRow, type TaskKey } from '../engine/domains';
import type { Case } from '../engine/types';
import type { Proportion } from '../engine/metrics';
import { useApp } from '../store';

const SERIES_1 = '#008572';
const SERIES_2 = '#c2571a';

interface Tip { x: number; y: number; text: string }

/** Positions a tooltip over an SVG mark using viewBox percentages, so it stays right at any width. */
function TipBox({ tip, w, h }: { tip: Tip | null; w: number; h: number }) {
  if (!tip) return null;
  return <div className="chart-tip num" style={{ left: `${(tip.x / w) * 100}%`, top: `${(tip.y / h) * 100}%` }}>{tip.text}</div>;
}

/** Marks stay left to right in both languages because the axis is time. */
export function ObservationChart({ c }: { c: Case }) {
  const { t } = useApp();
  const [tip, setTip] = useState<Tip | null>(null);
  const titleId = useId();
  const W = 560, H = 230, L = 34, R = 22, T = 18, B = 40;
  const obs = c.observations.filter((o) => o.score !== null);
  const { comparable, protocol } = selectComparable(c);
  const comparableVisits = new Set(comparable.map((o) => o.visit));
  const calibration = protocol ? calibrationFor(protocol.language, c.education) : null;
  const x = (i: number) => L + (obs.length <= 1 ? 0 : (i * (W - L - R)) / (obs.length - 1));
  const y = (v: number) => T + ((10 - v) * (H - T - B)) / 10;
  const base = comparable.slice(0, BASELINE_VISITS).map((o) => o.score as number);
  const baseMean = base.length === BASELINE_VISITS ? base.reduce((a, b) => a + b, 0) / base.length : null;
  const line = obs.filter((o) => comparableVisits.has(o.visit));
  const path = line.map((o) => `${x(obs.indexOf(o))},${y(o.score as number)}`).join(' ');
  // The range a two-visit follow-up average would normally fall in, from this person's own baseline.
  const band = baseMean !== null && calibration
    ? {
        hi: Math.min(10, baseMean + calibration.practiceGain + 1.96 * calibration.sd * Math.sqrt((1 - calibration.reliability) * (1 / 3 + 1 / 2))),
        lo: Math.max(0, baseMean + calibration.practiceGain - 1.96 * calibration.sd * Math.sqrt((1 - calibration.reliability) * (1 / 3 + 1 / 2))),
      }
    : null;

  if (obs.length === 0) return <p className="muted small">{t('No checks recorded yet. Give a cognitive check to add the first one.', 'لا توجد فحوص مسجلة بعد. أجرِ فحصًا إدراكيًا لإضافة أول فحص.')}</p>;

  return (
    <div className="chart-box" dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{t('Task results at each visit out of 10', 'نتائج المهام في كل زيارة من أصل 10')}</title>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {band && <rect x={L} width={W - L - R} y={y(band.hi)} height={y(band.lo) - y(band.hi)} fill="#e4f2f4" />}
        {baseMean !== null && (
          <g>
            <line x1={L} x2={W - R} y1={y(baseMean)} y2={y(baseMean)} stroke="#4f626a" strokeWidth={1} />
            <text x={W - R} y={y(baseMean) - 6} textAnchor="end">{t('Baseline', 'خط الأساس')} {fmt(baseMean)}</text>
          </g>
        )}
        <polyline points={path} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {obs.map((o, i) => {
          const inSet = comparableVisits.has(o.visit);
          return (
            <g key={o.visit}>
              <circle cx={x(i)} cy={y(o.score as number)} r={inSet ? 5 : 5} fill={inSet ? SERIES_1 : '#fff'} stroke={inSet ? '#fff' : SERIES_2} strokeWidth={2} />
              <circle
                cx={x(i)} cy={y(o.score as number)} r={16} fill="transparent"
                onMouseEnter={() => setTip({ x: x(i), y: y(o.score as number), text: `${o.date} · ${o.score}/10 · ${o.mode}${o.source === 'live-check' ? ' · live' : ''}` })}
                onMouseLeave={() => setTip(null)}
              />
              <text x={x(i)} y={H - B + 18} textAnchor="middle">V{o.visit}</text>
              <text x={x(i)} y={H - B + 32} textAnchor="middle" style={{ fontSize: 10 }}>{o.date.slice(2, 7)}</text>
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} w={W} h={H} />
      {band && <p className="tiny muted" dir="auto">{t('Shaded: the range a follow-up average would normally fall in, from this patient\'s own baseline. Synthetic calibration.', 'المظلل: النطاق الذي يقع فيه عادة متوسط المتابعة، من خط أساس هذا المريض. معايرة اصطناعية.')}</p>}
      {obs.length !== comparable.length && (
        <p className="tiny muted" dir="auto">{t('Hollow marks are not comparable with the baseline and are left out of the calculation.', 'العلامات المفرغة غير قابلة للمقارنة مع خط الأساس ومستبعدة من الحساب.')}</p>
      )}
    </div>
  );
}

/** Shows the stated thresholds and where this patient sits, so the rule is visible, not implied. */
export function ThresholdScale({ z }: { z: number }) {
  const { t } = useApp();
  const W = 560, H = 74, MIN = -5, MAX = 2, BAR_Y = 26, BAR_H = 16;
  const x = (v: number) => ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * W;
  return (
    <div dir="ltr">
      <svg
        className="scale" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={t(`z score ${fmt(z)}. At or below -1.96 goes to review. Down to -1.645 goes to a repeat check.`, `درجة z ${fmt(z)}. عند -1.96 أو أقل تُحال إلى المراجعة. وحتى -1.645 تُعاد.`, `Skor z ${fmt(z)}. Pada -1.96 atau lebih rendah diteruskan ke review. Sampai -1.645 dilakukan cek ulang.`)}
      >
        <rect x={x(MIN)} y={BAR_Y} width={x(REVIEW_Z) - x(MIN)} height={BAR_H} fill="#eee9f8" />
        <rect x={x(REVIEW_Z)} y={BAR_Y} width={x(REPEAT_Z) - x(REVIEW_Z)} height={BAR_H} fill="#fcf0d2" />
        <rect x={x(REPEAT_Z)} y={BAR_Y} width={x(MAX) - x(REPEAT_Z)} height={BAR_H} fill="#e2f2e7" />
        <text x={x(REVIEW_Z) - 2} y={H - 8} textAnchor="end" style={{ fill: '#38256d', fontWeight: 600 }}>{t('Review at -1.96 or below', 'مراجعة عند -1.96 أو أقل')}</text>
        <text x={x(REPEAT_Z) + 2} y={H - 8} textAnchor="start" style={{ fill: '#6b4700', fontWeight: 600 }}>{t('Repeat down to -1.645', 'إعادة حتى -1.645')}</text>
        <text x={W} y={H - 8} textAnchor="end" style={{ fill: '#0f4a29', fontWeight: 600 }}>{t('Expected', 'متوقع')}</text>
        <line x1={x(z)} x2={x(z)} y1={14} y2={BAR_Y + BAR_H + 4} stroke="#15262c" strokeWidth={2} />
        <text x={x(z)} y={11} textAnchor={x(z) < 40 ? 'start' : x(z) > W - 40 ? 'end' : 'middle'} style={{ fill: '#15262c', fontWeight: 600 }}>z {fmt(z)}</text>
      </svg>
    </div>
  );
}

export function ChangeChart({ points }: { points: ChangePoint[] }) {
  const { t } = useApp();
  const [tip, setTip] = useState<Tip | null>(null);
  const titleId = useId();
  const W = 560, H = 230, L = 40, R = 22, T = 18, B = 40;
  const low = Math.min(-3, ...points.map((p) => p.lo));
  const high = Math.max(1, ...points.map((p) => p.hi));
  const y = (v: number) => T + ((high - v) * (H - T - B)) / (high - low);
  const x = (i: number) => L + ((i + 0.5) * (W - L - R)) / Math.max(points.length, 1);

  if (points.length === 0) return <p className="muted small">{t('No estimate is available. It stays empty rather than showing zero.', 'لا يوجد تقدير. يبقى فارغًا بدلًا من عرض صفر.')}</p>;

  return (
    <div className="chart-box" dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{t('Adjusted change from baseline at each encounter with an illustrative 95% interval', 'التغيّر المعدّل عن خط الأساس في كل زيارة مع فاصل توضيحي 95%')}</title>
        {[Math.ceil(low), 0, Math.floor(high)].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'axis' : 'grid'} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.visit}>
            <line x1={x(i)} x2={x(i)} y1={y(p.hi)} y2={y(p.lo)} stroke={SERIES_1} strokeWidth={2} strokeLinecap="round" />
            <circle cx={x(i)} cy={y(p.adjusted)} r={5} fill={SERIES_1} stroke="#fff" strokeWidth={2} />
            <circle
              cx={x(i)} cy={y(p.adjusted)} r={18} fill="transparent"
              onMouseEnter={() => setTip({ x: x(i), y: y(p.adjusted), text: `${p.date} · ${fmt(p.adjusted)} · z ${fmt(p.z)} · ${fmt(p.lo)} to ${fmt(p.hi)}` })}
              onMouseLeave={() => setTip(null)}
            />
            {i === points.length - 1 && <text x={x(i) + 10} y={y(p.adjusted) + 4} style={{ fontWeight: 600, fill: '#1a2422' }}>{fmt(p.adjusted)}</text>}
            <text x={x(i)} y={H - B + 18} textAnchor="middle">V{p.visit}</text>
            <text x={x(i)} y={H - B + 32} textAnchor="middle" style={{ fontSize: 10 }}>{p.date.slice(2, 7)}</text>
          </g>
        ))}
      </svg>
      <TipBox tip={tip} w={W} h={H} />
    </div>
  );
}

export interface ForestRow { label: string; value: Proportion }

/** One proportion per subgroup with its interval. Null rows say so instead of plotting zero. */
export function ForestChart({ rows, title, nullLabel }: { rows: ForestRow[]; title: string; nullLabel: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const titleId = useId();
  const rowH = 30;
  const W = 560, L = 170, R = 56, T = 8, B = 26;
  const H = T + rows.length * rowH + B;
  const x = (p: number) => L + p * (W - L - R);
  return (
    <div className="chart-box" dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{title}</title>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={x(v)} x2={x(v)} y1={T} y2={H - B} />
            <text x={x(v)} y={H - 8} textAnchor="middle">{v * 100}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = T + i * rowH + rowH / 2;
          const { p, lo, hi, k, n } = r.value;
          return (
            <g key={r.label}>
              <text x={L - 10} y={cy + 4} textAnchor="end" style={{ fill: '#1a2422' }}>{r.label}</text>
              {p === null || lo === null || hi === null ? (
                <text x={L + 4} y={cy + 4} style={{ fontStyle: 'italic' }}>{nullLabel}</text>
              ) : (
                <>
                  <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={SERIES_1} strokeWidth={2} strokeLinecap="round" />
                  <circle cx={x(p)} cy={cy} r={5} fill={SERIES_1} stroke="#fff" strokeWidth={2} />
                  <text x={W - R + 8} y={cy + 4}>{Math.round(p * 100)}%</text>
                  <rect
                    x={L} y={cy - rowH / 2} width={W - L - R} height={rowH} fill="transparent"
                    onMouseEnter={() => setTip({ x: x(p), y: cy, text: `${k}/${n} · ${(p * 100).toFixed(1)}% · ${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)}` })}
                    onMouseLeave={() => setTip(null)}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} w={W} h={H} />
    </div>
  );
}

export interface ThresholdPoint { threshold: number; sensitivity: number | null; specificity: number | null }

export function ThresholdChart({ points, current, title, labels }: {
  points: ThresholdPoint[]; current: number; title: string; labels: { sensitivity: string; specificity: string };
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const titleId = useId();
  const W = 560, H = 220, L = 40, R = 16, T = 14, B = 34;
  const min = points[0].threshold, max = points[points.length - 1].threshold;
  const x = (v: number) => L + ((v - min) * (W - L - R)) / (max - min);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const series = useMemo(() => ([
    { key: 'sensitivity' as const, color: SERIES_1, label: labels.sensitivity },
    { key: 'specificity' as const, color: SERIES_2, label: labels.specificity },
  ]), [labels]);
  return (
    <div className="stack">
      <div className="row small" style={{ gap: 16 }}>
        {series.map((s) => (
          <span key={s.key} className="row" style={{ gap: 6 }}>
            <svg width="16" height="10" aria-hidden="true"><line x1="0" x2="16" y1="5" y2="5" stroke={s.color} strokeWidth="2" /></svg>
            {s.label}
          </span>
        ))}
      </div>
      <div className="chart-box" dir="ltr">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>{title}</title>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text>
            </g>
          ))}
          <line x1={x(current)} x2={x(current)} y1={T} y2={H - B} stroke="#1a2422" strokeWidth={1} />
          <text x={x(current)} y={H - 6} textAnchor="middle" style={{ fontWeight: 600, fill: '#1a2422' }}>z {current.toFixed(2)}</text>
          <text x={L} y={H - 6}>{min.toFixed(1)}</text>
          <text x={W - R} y={H - 6} textAnchor="end">{max.toFixed(1)}</text>
          {series.map((s) => (
            <polyline
              key={s.key} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round"
              points={points.flatMap((p) => (p[s.key] === null ? [] : [`${x(p.threshold)},${y(p[s.key] as number)}`])).join(' ')}
            />
          ))}
          {points.map((p) => (
            <rect
              key={p.threshold} x={x(p.threshold) - 10} y={T} width={20} height={H - T - B} fill="transparent"
              onMouseEnter={() => setTip({
                x: x(p.threshold), y: T + 30,
                text: `z ${p.threshold.toFixed(2)} · ${labels.sensitivity} ${p.sensitivity === null ? 'n/a' : Math.round(p.sensitivity * 100)}% · ${labels.specificity} ${p.specificity === null ? 'n/a' : Math.round(p.specificity * 100)}%`,
              })}
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </svg>
        <TipBox tip={tip} w={W} h={H} />
      </div>
    </div>
  );
}

/** One habit over twelve or more weeks, with its published reference line when one exists. */
export function HabitChart({ points, max, reference, title, emptyText }: {
  points: { week: string; value: number | null }[];
  max: number;
  reference: { value: number; text: string } | null;
  title: string;
  emptyText: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const titleId = useId();
  const W = 320, H = 150, L = 34, R = 10, T = 14, B = 24;
  const known = points.filter((p) => p.value !== null);
  if (known.length === 0) return <p className="small muted">{emptyText}</p>;
  const x = (i: number) => L + (points.length <= 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((max - Math.min(max, v)) * (H - T - B)) / max;
  const segs = points.map((p, i) => (p.value === null ? null : `${x(i)},${y(p.value)}`));
  return (
    <div className="chart-box" dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{title}</title>
        {[0, max].map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {reference && (
          <g>
            <line x1={L} x2={W - R} y1={y(reference.value)} y2={y(reference.value)} stroke="#4f626a" strokeWidth={1} />
            <text x={L + 4} y={y(reference.value) - 5} textAnchor="start">{reference.text}</text>
          </g>
        )}
        <polyline points={segs.filter(Boolean).join(' ')} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => p.value !== null && (
          <g key={p.week}>
            <circle cx={x(i)} cy={y(p.value)} r={3.5} fill={SERIES_1} stroke="#fff" strokeWidth={1.5} />
            <circle
              cx={x(i)} cy={y(p.value)} r={10} fill="transparent"
              onMouseEnter={() => setTip({ x: x(i), y: y(p.value as number), text: `${p.week} · ${p.value}` })}
              onMouseLeave={() => setTip(null)}
            />
          </g>
        ))}
        <text x={L} y={H - 6}>{points[0].week.slice(2)}</text>
        <text x={W - R} y={H - 6} textAnchor="end">{points.at(-1)?.week.slice(2)}</text>
        <text x={x(points.length - 1) - 4} y={y(known.at(-1)?.value as number) - 8} textAnchor="end" style={{ fontWeight: 600, fill: '#15262c' }}>{known.at(-1)?.value}</text>
      </svg>
      <TipBox tip={tip} w={W} h={H} />
    </div>
  );
}

/**
 * One row per task area: the patient's own baseline range as a band, its average as a
 * tick, and the follow-up average as a dot. Each row is scaled to that task's points,
 * because the tasks have different maximums. Descriptive: no thresholds are drawn.
 */
export function DomainChart({ rows, baselineVisits, followupVisits }: { rows: AreaRow[]; baselineVisits: number[]; followupVisits: number[] }) {
  const { t, tx } = useApp();
  const [tip, setTip] = useState<{ row: TaskKey; tip: Tip } | null>(null);
  const titleId = useId();
  // Labels are HTML, so they keep their reading size on a phone; only the track is SVG.
  const W = 300, H = 32, PAD = 10;
  const x = (share: number) => PAD + share * (W - 2 * PAD);
  const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const visits = (v: number[]) => v.map((n) => `V${n}`).join(', ');
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row small" style={{ gap: 16 }}>
        <span className="row" style={{ gap: 6 }}>
          <svg width="22" height="14" aria-hidden="true"><rect x="0" y="2" width="22" height="10" rx="3" fill="#e4f2f4" /><line x1="11" x2="11" y1="0" y2="14" stroke="#4f626a" strokeWidth="2" /></svg>
          {t('Own baseline: range and average', 'خط الأساس الخاص: النطاق والمتوسط', 'Baseline sendiri: rentang dan rata-rata')} <span className="num muted">({visits(baselineVisits)})</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill={SERIES_1} stroke="#fff" strokeWidth="2" /></svg>
          {t('Follow-up average', 'متوسط المتابعة', 'Rata-rata tindak lanjut')} <span className="num muted">({visits(followupVisits)})</span>
        </span>
      </div>
      <div className="domain-chart" role="img" aria-labelledby={titleId}>
        <span id={titleId} className="sr-only">{t('Task points by area, follow-up against own baseline. The same values are in the table below.', 'نقاط المهام حسب المجال، المتابعة مقابل خط الأساس الخاص. القيم نفسها في الجدول أدناه.', 'Poin tugas per ranah, tindak lanjut dibanding baseline sendiri. Nilai yang sama ada di tabel di bawah.')}</span>
        {rows.map((r) => {
          const s = (n: number) => n / r.area.max;
          const bandW = Math.max(4, x(s(r.baseMax)) - x(s(r.baseMin)));
          const cy = H / 2;
          return (
            <div key={r.area.key} className="domain-row" aria-hidden="true">
              <div className="domain-label">
                <span className="strong small">{tx(r.area.area)}</span>
                <span className="tiny muted">{tx(r.area.task)} · {t('out of', 'من', 'dari')} {r.area.max}</span>
              </div>
              <div className="chart-box domain-track" dir="ltr">
                <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                  {[0, 0.5, 1].map((v) => <line key={v} className="grid" x1={x(v)} x2={x(v)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />)}
                  <rect x={x(s(r.baseMin)) - (bandW === 4 ? 2 : 0)} y={cy - 8} width={bandW} height={16} rx={4} fill="#e4f2f4" />
                  <line x1={x(s(r.baseMean))} x2={x(s(r.baseMean))} y1={cy - 11} y2={cy + 11} stroke="#4f626a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <rect
                    x={0} y={0} width={W} height={H} fill="transparent"
                    onMouseEnter={() => setTip({
                      row: r.area.key,
                      tip: { x: x(s(r.followMean)), y: 0, text: `${t('Baseline', 'خط الأساس', 'Baseline')} ${r.baseline.join(', ')} · ${t('follow-up', 'المتابعة', 'tindak lanjut')} ${one(r.followMean)} / ${r.area.max}` },
                    })}
                    onMouseLeave={() => setTip(null)}
                  />
                </svg>
                {/* The dot is HTML so it stays round when the track stretches. */}
                <span className="domain-dot" style={{ left: `${(x(s(r.followMean)) / W) * 100}%` }} />
                <TipBox tip={tip?.row === r.area.key ? tip.tip : null} w={W} h={H} />
              </div>
              <span className="domain-value num">{one(r.followMean)}/{r.area.max}</span>
            </div>
          );
        })}
        <div className="domain-row domain-axis" aria-hidden="true">
          <span />
          <div className="domain-ticks" dir="ltr">
            {[0, 50, 100].map((v) => <span key={v} className="tiny muted num" style={{ left: `${((x(v / 100)) / W) * 100}%` }}>{v}%</span>)}
          </div>
          <span />
        </div>
      </div>
      <details>
        <summary className="small">{t('Show as a table', 'العرض كجدول', 'Tampilkan sebagai tabel')}</summary>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>{t('Area', 'المجال', 'Ranah')}</th>
              <th>{t('Task', 'المهمة', 'Tugas')}</th>
              <th>{t('Baseline visits', 'زيارات خط الأساس', 'Kunjungan baseline')}</th>
              <th>{t('Follow-up average', 'متوسط المتابعة', 'Rata-rata tindak lanjut')}</th>
              <th>{t('Where it sits', 'موقعها', 'Posisi')}</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.area.key}>
                <td className="strong">{tx(r.area.area)}</td>
                <td>{tx(r.area.task)}</td>
                <td className="num">{r.baseline.join(', ')} / {r.area.max}</td>
                <td className="num">{one(r.followMean)} / {r.area.max}</td>
                <td>{tx(POSITION_LABEL[r.position])}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function ChartCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div>
        <h3>{title}</h3>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
