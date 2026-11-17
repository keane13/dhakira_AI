import { useEffect, useMemo, useState } from 'react';
import { ROUTE_LABEL } from '../engine/pipeline';
import { domainProfile } from '../engine/domains';
import { actionFor, groupFor } from '../engine/queue';
import { fmt, fmtSigned } from '../engine/scoring';
import { useApp } from '../store';
import { GoButton, PageHead, PatientBanner, StageBoard, routePanelClass } from '../components/ui';
import { ChangeChart, ChartCard, DomainChart, ObservationChart, ThresholdScale } from '../components/charts';
import { changeSeries } from '../engine/monitoring';
import { WorkupCard } from '../components/Workup';
import { LabsCard, MedicinesCard } from '../components/MedsLabs';
import { ShadowCard } from '../components/ShadowModel';
import type { ConsentScope, Lang, Localised, ResolvedContext } from '../engine/types';
import { pick, pickL } from '../i18n';
import { LANGUAGE } from '../components/ui';

const DOMAIN_LABEL: Record<string, { en: string; ar: string }> = {
  screening: { en: 'Programme screen', ar: 'فحص البرنامج' },
  physical: { en: 'Physical', ar: 'بدني' }, metabolic: { en: 'Metabolic', ar: 'أيضي' }, sleep: { en: 'Sleep', ar: 'النوم' },
  mental: { en: 'Mental wellbeing', ar: 'الصحة النفسية' }, lifestyle: { en: 'Lifestyle', ar: 'نمط الحياة' }, sensory: { en: 'Hearing and vision', ar: 'السمع والبصر' },
  medication: { en: 'Medicines', ar: 'الأدوية' }, family: { en: 'Family history', ar: 'التاريخ العائلي' }, genomic: { en: 'Genomic', ar: 'جيني' },
};

export function ContextTable({ items, lang }: { items: ResolvedContext[]; lang: Lang }) {
  const t = (en: string, ar: string, id?: string) => pick(lang, en, ar, id);
  const tx = (l: Localised) => pickL(lang, l);
  if (items.length === 0) return <p className="muted small">{t('No context was read for this patient, so nothing is shown.', 'لم يُقرأ أي سياق لهذا المريض، لذا لا يُعرض شيء.')}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('Area', 'المجال')}</th>
            <th>{t('Item', 'البند')}</th>
            <th>{t('Value', 'القيمة')}</th>
            <th>{t('Source and date', 'المصدر والتاريخ')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="small muted">{tx(DOMAIN_LABEL[i.domain])}</td>
              <td>{tx(i.label)}</td>
              <td>
                {i.value
                  ? <span className={i.status === 'attention' ? 'strong' : ''}>{tx(i.value)}</span>
                  : <span className="muted"><em>{i.authorised ? t('Missing', 'ناقص') : t('Not authorised', 'غير مصرّح به')}</em></span>}
                {i.highRisk && i.authorised
                  ? <span className="tag tag-stop" style={{ marginInlineStart: 8 }}>{t('High risk', 'عالي الخطورة')}</span>
                  : i.status === 'attention' && <span className="tag tag-hold" style={{ marginInlineStart: 8 }}>{t('Discuss', 'للنقاش')}</span>}
              </td>
              <td className="small muted">{tx(i.source)}{i.date ? <> · <span className="num">{i.date}</span></> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Brief() {
  const { currentCase: c, run, t, tx, lang } = useApp();
  const r = run.change;
  const missing = run.context.filter((i) => i.value === null);
  const lastObs = c.observations.at(-1);
  const stopped = run.outcome.route === 'stopped';
  const lastFn = c.functionReports.at(-1);
  return (
    <section className="card">
      <div>
        <h2>{t('Before you see the patient', 'قبل أن ترى المريض')}</h2>
        {!stopped && <p className="muted small">{t('Supplied information, not yet confirmed by a clinician.', 'معلومات واردة، لم يؤكدها طبيب بعد.')}</p>}
      </div>
      {stopped ? (
        <p className="muted">{t('No patient data was read, so there is nothing to summarise.', 'لم تُقرأ أي بيانات، فلا يوجد ما يُلخّص.')}</p>
      ) : (
        <>
          <div>
            <div className="brief-label">{t('Reason for review', 'سبب المراجعة')}</div>
            <p className="strong">{tx(c.concern)}</p>
          </div>
          <div className="grid-2 start">
            <div className="stack">
              <div>
                <div className="brief-label">{t('What changed', 'ما الذي تغيّر')}</div>
                {lastFn
                  ? <p className="small"><span className="strong">{t('Daily function: ', 'الأداء اليومي: ')}</span>{tx(lastFn.note)}</p>
                  : <p className="small muted">{t('No report of daily function has been supplied.', 'لم يرد أي تقرير عن الأداء اليومي.')}</p>}
                {r
                  ? <p className="small"><span className="strong">{t('Repeated checks: ', 'الفحوص المتكررة: ')}</span>{t('baseline', 'خط الأساس')} <span className="num">{fmt(r.baselineMean)}</span>, {t('follow-up', 'المتابعة')} <span className="num">{fmt(r.followupMean)}</span> {t('out of 10', 'من 10')}.</p>
                  : <p className="small"><span className="strong">{t('Repeated checks: ', 'الفحوص المتكررة: ')}</span>{run.changeNull ? tx(run.changeNull) : t('Not reached.', 'لم يُوصل إليها.')}</p>}
              </div>
              <div>
                <div className="brief-label">{t('What could affect interpretation', 'ما قد يؤثر في التفسير')}</div>
                {lastObs && <p className="small">{t('Latest check: ', 'آخر فحص: ')}{tx(LANGUAGE[lastObs.language])}, {lastObs.mode === 'visual' ? t('by sight', 'بصري') : t('by sound', 'سمعي')}, {t('form', 'النموذج')} <span className="num">{lastObs.form}</span>.</p>}
                {run.interpretationNotes.map((n) => <p key={n.en} className="small">{tx(n)}</p>)}
                {run.excluded.map((e) => <p key={e.visit} className="small">{t('Visit', 'الزيارة')} <span className="num">{e.visit}</span>: {tx(e.reason)}</p>)}
                {missing.length > 0 && <p className="small"><span className="strong">{t('Missing: ', 'ناقص: ')}</span>{missing.map((m) => tx(m.label)).join(lang === 'ar' ? '، ' : ', ')}.</p>}
              </div>
            </div>
            <div>
              <div className="brief-label">{t('Ask today', 'اسأل اليوم')}</div>
              {c.clarify.length === 0
                ? <p className="small muted">{t('Hand off now. Questions can wait until the patient is safe.', 'حوّل الآن. يمكن أن تنتظر الأسئلة حتى يصبح المريض بأمان.')}</p>
                : <ul className="plain small">{c.clarify.map((q) => <li key={q.en}>{tx(q)}</li>)}</ul>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const CONSENT_SCOPES: { scope: ConsentScope; label: { en: string; ar: string } }[] = [
  { scope: 'clinical', label: { en: 'Clinical record', ar: 'السجل السريري' } },
  { scope: 'wearable', label: { en: 'Wearable data', ar: 'بيانات الجهاز القابل للارتداء' } },
  { scope: 'family', label: { en: 'Family history', ar: 'التاريخ العائلي' } },
  { scope: 'genomic', label: { en: 'Genomic results', ar: 'النتائج الجينية' } },
];

function Trace() {
  const { run, t, tx, revealed, setRevealed, traceOpen, setTraceOpen, evidenceAvailable, setEvidenceAvailable, currentCase: c, caseId, setPermission } = useApp();
  const [selected, setSelected] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const current = run.stages.find((s) => s.n === (selected ?? revealed));

  useEffect(() => { setSelected(null); }, [revealed, caseId]);

  useEffect(() => {
    if (!auto) return undefined;
    if (revealed >= 12) { setAuto(false); return undefined; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setRevealed(reduced ? 12 : revealed + 1), reduced ? 0 : 380);
    return () => window.clearTimeout(timer);
  }, [auto, revealed, setRevealed]);

  return (
    <details id="trace" className="card fold no-print" open={traceOpen} onToggle={(e) => setTraceOpen(e.currentTarget.open)}>
      <summary>{t('How this summary was prepared', 'كيف أُعدّ هذا الملخص')}</summary>
      <p className="small muted">{t('A fixed 12-stage workflow runs one tool per stage. Code sets numbers and routes, and only a person can release care.', 'يشغّل سير عمل ثابت من 12 مرحلة أداة واحدة لكل مرحلة. يحدد الكود الأرقام والمسارات، ولا يفرج عن الرعاية إلا شخص.')}</p>
      <div className="row between">
        <span className="small muted">{t('Stage', 'المرحلة')} <span className="num">{revealed} / 12</span></span>
        <div className="row">
          <button type="button" className="btn" disabled={auto} onClick={() => { setRevealed(0); setAuto(true); }}>{t('Replay the stages', 'إعادة عرض المراحل')}</button>
          <button type="button" className="btn" disabled={revealed >= 12 || auto} onClick={() => setRevealed(revealed + 1)}>{t('Run one stage', 'تشغيل مرحلة واحدة')}</button>
        </div>
      </div>
      <StageBoard stages={run.stages} revealed={revealed} selected={selected ?? revealed} onSelect={setSelected} />
      {current && (
        <div className="notice notice-info" aria-live="polite">
          <div className="row"><span className="strong">{tx(current.agent)}</span><span className="mono muted">{current.tool}()</span></div>
          <p style={{ marginTop: 4 }}>{tx(current.message)}</p>
        </div>
      )}
      <div className="row small">
        <span className="strong">{t('Try a gate:', 'جرّب بوابة:')}</span>
        <label className="check"><input type="checkbox" checked={!c.consent.access} onChange={(e) => setPermission(caseId, !e.target.checked)} />{t('Patient refuses access', 'يرفض المريض الوصول')}</label>
        <label className="check"><input type="checkbox" checked={!evidenceAvailable} onChange={(e) => setEvidenceAvailable(!e.target.checked)} />{t('Evidence store is down', 'مخزن الأدلة معطل')}</label>
      </div>
    </details>
  );
}

/** Change by task area. A view of the same visits as the total, never a map of the brain. */
function DomainCard() {
  const { currentCase: c, run, t, tx } = useApp();
  const profile = useMemo(() => domainProfile(c, run), [c, run]);
  return (
    <section className="card" id="task-areas" aria-labelledby="task-areas-title">
      <div>
        <h3 id="task-areas-title">{t('Which task areas changed?', 'أي مجالات المهام تغيّرت؟', 'Ranah tugas mana yang berubah?')}</h3>
        <p className="muted small">{t(
          'Each task against this patient\'s own baseline, using the same visits as the total. These are task areas, not parts of the brain: every task draws on many brain networks at once.',
          'كل مهمة مقابل خط أساس هذا المريض، باستخدام الزيارات نفسها التي يستخدمها المجموع. هذه مجالات مهام، لا أجزاء من الدماغ: كل مهمة تعتمد على شبكات دماغية كثيرة في وقت واحد.',
          'Setiap tugas dibanding baseline pasien ini sendiri, memakai kunjungan yang sama dengan total. Ini ranah tugas, bukan bagian otak: setiap tugas melibatkan banyak jaringan otak sekaligus.',
        )}</p>
      </div>
      {profile.ok
        ? <DomainChart rows={profile.rows} baselineVisits={profile.baselineVisits} followupVisits={profile.followupVisits} />
        : <div className="notice notice-info">{tx(profile.reason)}</div>}
      <p className="tiny muted">{t(
        'Descriptive only. Each task is scored out of 2 or 4, so one point is a big step and has no calibration of its own. Only the total is tested against a threshold. Alternate forms are used at each visit.',
        'وصفي فقط. تُقيَّم كل مهمة من 2 أو 4، لذا النقطة الواحدة خطوة كبيرة ولا معايرة خاصة بها. وحده المجموع يُختبر مقابل عتبة. تُستخدم نماذج بديلة في كل زيارة.',
        'Hanya deskriptif. Setiap tugas dinilai dari 2 atau 4, jadi satu poin adalah langkah besar dan tidak punya kalibrasi sendiri. Hanya total yang diuji terhadap ambang. Formulir alternatif dipakai di setiap kunjungan.',
      )}</p>
    </section>
  );
}

export function Workspace() {
  const { currentCase: c, run, decision, session, setConsent, go, caseId, t, tx, lang } = useApp();
  const r = run.change;
  const role = session?.role ?? 'nurse';
  const action = actionFor(groupFor(run, decision), role, decision);
  const stopped = run.outcome.route === 'stopped';

  return (
    <>
      <PageHead title={t('Patient summary', 'ملخص المريض')} />
      <PatientBanner />

      <div className="grid-2 start">
        <section className={`path-panel ${routePanelClass(run.outcome.route)}`} aria-live="polite">
          <span className="small strong">{t('Proposed path. A clinician decides the care.', 'مسار مقترح. يقرر الطبيب الرعاية.')}</span>
          <h2>{tx(ROUTE_LABEL[run.outcome.route])}</h2>
          <p>{tx(run.outcome.reason)}</p>
          <p className="strong">{t('Next step: ', 'الخطوة التالية: ')}{tx(run.outcome.nextStep)}</p>
          <div className="row no-print" style={{ marginTop: 6 }}>
            {action.page !== 'workspace' && <button type="button" className="btn btn-human" onClick={() => go(action.page)}>{tx(action.label)}</button>}
            {!stopped && run.outcome.route !== 'urgent' && action.page !== 'check' && <GoButton to="check">{t('Give a cognitive check', 'إجراء فحص إدراكي')}</GoButton>}
            <GoButton to="record">{t('Open the visit record', 'فتح سجل الزيارة')}</GoButton>
          </div>
        </section>

        <section className="card">
          <h3>{t('Is this outside the patient\'s own expected range?', 'هل هذا خارج النطاق المتوقع للمريض نفسه؟')}</h3>
          {r ? (
            <>
              <div className="row" style={{ gap: 24 }}>
                <div><div className="big-number num">{fmtSigned(r.adjustedChange)}</div><div className="tiny muted">{t('tasks, after allowing for practice', 'مهمة، بعد احتساب أثر التمرين')}</div></div>
                <div className="small muted"><span className="num">{fmt(r.baselineMean)} → {fmt(r.followupMean)}</span> {t('out of 10', 'من 10')}<br />{t('95% interval, illustrative: ', 'فاصل 95%، توضيحي: ')}<span className="num">{fmt(r.ci95[0])} {t('to', 'إلى')} {fmt(r.ci95[1])}</span></div>
              </div>
              <ThresholdScale z={r.z} />
            </>
          ) : (
            <div className="notice notice-hold">{run.changeNull ? tx(run.changeNull) : t('No estimate was reached because this patient\'s path stopped earlier. No number is shown, and that is not the same as no change.', 'لم يُوصل إلى تقدير لأن مسار هذا المريض توقف مبكرًا. لا يُعرض رقم، وهذا لا يعني عدم وجود تغيّر.')}</div>
          )}
          <p className="tiny muted">{t('Calibration is synthetic and accuracy is not established for this population. A result with no flag does not rule out impairment.', 'المعايرة اصطناعية والدقة غير مثبتة لهذه الفئة. ولا تستبعد النتيجة دون إشارة وجود قصور.')}</p>
        </section>
      </div>

      <Brief />

      {!stopped && (
        <>
          <div className="grid-2 start">
            <ChartCard
              title={t('What was recorded at each visit, against the expected range?', 'ما الذي سُجل في كل زيارة مقارنة بالنطاق المتوقع؟')}
              sub={t('Out of 10. Only visits in the same language and mode are compared.', 'من 10. تُقارن الزيارات باللغة والطريقة نفسيهما فقط.')}
            >
              <ObservationChart c={c} />
            </ChartCard>
            <ChartCard
              title={t('How did each calculation compare with baseline?', 'كيف قورن كل حساب بخط الأساس؟')}
              sub={t('Adjusted change, with an illustrative 95% interval.', 'التغيّر المعدّل، مع فاصل توضيحي 95%.')}
            >
              <ChangeChart points={changeSeries(c)} />
            </ChartCard>
          </div>

          <DomainCard />
          <ShadowCard />

          {run.context.length > 0 && (
            <section className="card">
              <div>
                <h2>{t('Integrated risk context', 'سياق الخطر المتكامل')}</h2>
                <p className="muted small">{t(
                  'Each value keeps its source. Family and genomic information add context for you and never change the proposed path.',
                  'تحتفظ كل قيمة بمصدرها. يضيف التاريخ العائلي والمعلومات الجينية سياقًا لك، ولا يغيّران المسار المقترح أبدًا.',
                )}</p>
              </div>
              <div className="row small">
                <span className="strong">{t('Consent on file:', 'الموافقة المسجلة:')}</span>
                {CONSENT_SCOPES.map(({ scope, label }) => (
                  <label key={scope} className="check">
                    <input type="checkbox" checked={c.consent[scope]} onChange={(e) => setConsent(caseId, scope, e.target.checked)} />
                    {tx(label)}
                  </label>
                ))}
              </div>
              <ContextTable items={run.context} lang={lang} />
            </section>
          )}

          {run.outcome.route !== 'urgent' && (
            <>
              <MedicinesCard key={`m-${caseId}`} />
              <LabsCard key={`l-${caseId}`} />
              <WorkupCard />
            </>
          )}
        </>
      )}

      <Trace />
    </>
  );
}
