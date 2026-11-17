import type { ReactNode } from 'react';
import { CASES } from '../data/cases';
import { sourceById } from '../data/sources';
import { ROUTE_LABEL } from '../engine/pipeline';
import type { AssessmentLanguage, Education, Route, StageResult, StageStatus } from '../engine/types';
import { useApp, type PageId } from '../store';
import { LANGS } from '../i18n';

const STATUS_LABEL: Record<StageStatus, { en: string; ar: string; cls: string }> = {
  passed: { en: 'Passed', ar: 'اجتاز', cls: 'tag-pass' },
  stopped: { en: 'Stopped', ar: 'أُوقف', cls: 'tag-stop' },
  held: { en: 'Held', ar: 'مُعلّق', cls: 'tag-hold' },
  skipped: { en: 'Skipped', ar: 'مُتخطى', cls: 'tag-none' },
  null: { en: 'Empty', ar: 'فارغ', cls: 'tag-none' },
  waiting: { en: 'Waiting for a person', ar: 'بانتظار شخص', cls: 'tag-wait' },
  recorded: { en: 'Recorded', ar: 'مُسجّل', cls: 'tag-pass' },
  pending: { en: 'Pending', ar: 'قيد الانتظار', cls: 'tag-none' },
};

export function StatusTag({ status }: { status: StageStatus }) {
  const { t } = useApp();
  const s = STATUS_LABEL[status];
  return <span className={`tag ${s.cls}`}>{t(s.en, s.ar)}</span>;
}

const ROUTE_CLASS: Record<Route, string> = {
  routine: 'tag-pass', repeat: 'tag-wait', qualified_review: 'tag-wait', urgent: 'tag-stop', held: 'tag-hold', stopped: 'tag-stop',
};

export function RouteTag({ route }: { route: Route }) {
  const { tx } = useApp();
  return <span className={`tag ${ROUTE_CLASS[route]}`}>{tx(ROUTE_LABEL[route])}</span>;
}

export const routeNoticeClass = (route: Route) => (
  route === 'urgent' || route === 'stopped' ? 'notice-stop'
    : route === 'held' ? 'notice-hold'
      : route === 'routine' ? 'notice-pass' : 'notice-wait'
);

export const routePanelClass = (route: Route) => (
  route === 'urgent' || route === 'stopped' ? 'path-stop'
    : route === 'held' ? 'path-hold'
      : route === 'routine' ? 'path-pass' : 'path-wait'
);

export function OutcomeNotice() {
  const { run, t, tx } = useApp();
  return (
    <div className={`notice ${routeNoticeClass(run.outcome.route)}`}>
      <div className="row">
        <RouteTag route={run.outcome.route} />
        <span className="small strong">{t('Proposed path. A clinician decides the care.', 'مسار مقترح. يقرر الطبيب الرعاية.')}</span>
      </div>
      <p style={{ marginTop: 6 }}>{tx(run.outcome.reason)}</p>
      <p className="strong" style={{ marginTop: 4 }}>{t('Next step: ', 'الخطوة التالية: ')}{tx(run.outcome.nextStep)}</p>
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
    </header>
  );
}

export function CasePicker() {
  const { caseId, setCaseId, tx, t } = useApp();
  return (
    <label className="field patient-select no-print">
      {t('Change patient', 'تغيير المريض')}
      <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
        {CASES.map((c) => (
          <option key={c.id} value={c.id}>{c.name}, {c.age} · {tx(c.pathLabel)}</option>
        ))}
      </select>
    </label>
  );
}

export const LANGUAGE: Record<AssessmentLanguage, { en: string; ar: string; id: string }> = {
  ar: { en: 'Arabic', ar: 'العربية', id: 'Arab' },
  en: { en: 'English', ar: 'الإنجليزية', id: 'Inggris' },
  id: { en: 'Indonesian', ar: 'الإندونيسية', id: 'Indonesia' },
  ur: { en: 'Urdu', ar: 'الأردية', id: 'Urdu' },
};

/** One control for the interface language, used on sign-in and in the top bar. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useApp();
  return (
    <div className="segmented" role="group" aria-label={t('Interface language', 'لغة الواجهة', 'Bahasa antarmuka')}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</button>
      ))}
    </div>
  );
}
const SCHOOLING: Record<Education, { en: string; ar: string }> = {
  low: { en: 'Primary or less', ar: 'ابتدائي أو أقل' }, mid: { en: 'Secondary', ar: 'ثانوي' }, high: { en: 'Tertiary', ar: 'جامعي' },
};

/** The same reference point on every patient page: who this is and what to be careful about. */
export function PatientBanner() {
  const { currentCase: c, run, t, tx } = useApp();
  const noCalibration = run.changeNull && run.outcome.route === 'held' && c.preferredLanguage === 'ur';
  return (
    <section className="patient-banner" aria-label={t('Current patient', 'المريض الحالي')}>
      <span className="avatar avatar-lg" aria-hidden="true">{c.name[0]}</span>
      <div className="grow">
        <div className="row">
          <h2><bdi dir="ltr">{c.name}, {c.age}</bdi></h2>
          <span className="mono muted small">{c.id}</span>
          <RouteTag route={run.outcome.route} />
          {c.suddenChangeFlag && <span className="tag tag-stop">{t('Sudden change reported', 'أُبلغ عن تغيّر مفاجئ')}</span>}
          {c.hearingConcern && <span className="tag tag-hold">{t('Hearing concern', 'قلق بشأن السمع')}</span>}
          {c.visionConcern && <span className="tag tag-hold">{t('Vision concern', 'قلق بشأن البصر')}</span>}
          {noCalibration && <span className="tag tag-hold">{t('No calibration for this language', 'لا معايرة لهذه اللغة')}</span>}
        </div>
        <div className="patient-meta">
          <span>{c.sex === 'F' ? t('Female', 'أنثى') : t('Male', 'ذكر')}</span>
          <span>{t('Language: ', 'اللغة: ')}{tx(LANGUAGE[c.preferredLanguage])}</span>
          <span>{t('Schooling: ', 'التعليم: ')}{tx(SCHOOLING[c.education])}</span>
          <span>{t('Care partner: ', 'مرافق الرعاية: ')}{c.carePartner ? tx(c.carePartner) : t('None recorded', 'غير مسجل')}</span>
        </div>
      </div>
      <CasePicker />
    </section>
  );
}

export function StageBoard({ stages, revealed, selected, onSelect }: {
  stages: StageResult[]; revealed: number; selected: number | null; onSelect?: (n: number) => void;
}) {
  const { tx } = useApp();
  return (
    <div className="stages">
      {stages.map((s) => {
        const shown = s.n <= revealed;
        return (
          <button
            key={s.n}
            type="button"
            className={`stage ${shown ? '' : 'is-future'} ${selected === s.n ? 'is-selected' : ''} ${s.kind === 'human' ? 'is-human' : ''}`}
            onClick={() => onSelect?.(s.n)}
            disabled={!shown}
          >
            <span className="n num">{String(s.n).padStart(2, '0')}</span>
            <span className="ttl">{tx(s.title)}</span>
            <span className="ag">{tx(s.agent)}</span>
            {shown && <StatusTag status={s.status} />}
          </button>
        );
      })}
    </div>
  );
}

export function SourceRefs({ ids }: { ids: string[] }) {
  return (
    <span className="tiny mono">
      {ids.map((id, i) => {
        const s = sourceById(id);
        return (
          <span key={id}>
            {i > 0 && ', '}
            {s ? <a href={s.url} target="_blank" rel="noreferrer" title={s.citation}>{id}</a> : id}
          </span>
        );
      })}
    </span>
  );
}

export function Metric({ label, value, detail, variant }: { label: string; value: ReactNode; detail?: ReactNode; variant?: 'dark' | 'tint' }) {
  return (
    <div className={`metric ${variant ? `metric-${variant}` : ''}`}>
      <span className="lbl">{label}</span>
      <span className="val num">{value}</span>
      {detail && <span className="det">{detail}</span>}
    </div>
  );
}

export function GoButton({ to, children, primary }: { to: PageId; children: ReactNode; primary?: boolean }) {
  const { go } = useApp();
  return <button type="button" className={`btn ${primary ? 'btn-primary' : ''}`} onClick={() => go(to)}>{children}</button>;
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
