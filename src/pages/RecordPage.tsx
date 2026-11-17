import { useMemo, useState } from 'react';
import { templateExplanation } from '../engine/explain';
import { ROUTE_LABEL, SERVICE_LABEL } from '../engine/pipeline';
import { buildPersonPlan } from '../engine/plan';
import { fmt, fmtSigned } from '../engine/scoring';
import { buildTasks, changeSeries } from '../engine/monitoring';
import { buildFhirBundle } from '../engine/fhir';
import { today, useApp, type ExplainState, type SavedRecord } from '../store';
import { CasePicker, Metric, PageHead, RouteTag, StatusTag, download } from '../components/ui';
import { ChangeChart, ChartCard, ObservationChart } from '../components/charts';
import { ContextTable } from './Workspace';
import { PatientPlan } from './Review';
import type { Case, ClinicianDecision, PipelineRun } from '../engine/types';

function RecordView({ c, run, decision, explain, onExplain, busy }: {
  c: Case; run: PipelineRun; decision: ClinicianDecision | null; explain: ExplainState | null; onExplain?: () => void; busy?: boolean;
}) {
  const { t, tx, lang } = useApp();
  const r = run.change;
  const points = useMemo(() => changeSeries(c), [c]);
  const shown = explain ?? (r ? { source: 'template' as const, explanation: templateExplanation(r) } : null);
  // Records saved before Indonesian existed have no `id` text; they fall back to English.
  const text = shown ? (shown.explanation[lang] ?? shown.explanation.en) : null;

  return (
    <div className="stack-lg">
      <section className="person-band">
        <span className="avatar" aria-hidden="true">{c.name[0]}</span>
        <div className="grow">
          <h2>{c.name}, <span className="num">{c.age}</span> <span className="mono small muted">{c.id}</span></h2>
          <p className="muted small">{tx(c.concern)}</p>
        </div>
        <RouteTag route={run.outcome.route} />
      </section>

      <div className="notice notice-info small">{t('Fictional record. Calculations use synthetic calibration. No hospital system, referral or message is connected.', 'سجل خيالي. تستخدم الحسابات معايرة اصطناعية. لا يوجد اتصال بنظام مستشفى أو إحالة أو رسالة.')}</div>

      <section className="card">
        <div className="row between">
          <h3>{t('Reading the result', 'قراءة النتيجة')}</h3>
          {shown && (shown.source === 'live'
            ? <span className="tag tag-pass">{t('Live model, checks passed', 'نموذج مباشر، اجتاز الفحوص')}{shown.model ? ` · ${shown.model}` : ''}</span>
            : <span className="tag tag-none">{t('Template wording, no model used', 'صياغة قالب، دون نموذج')}</span>)}
        </div>
        {text ? (
          <>
            <h3>{text.headline}</h3>
            <p>{text.body}</p>
            {c.functionReports.some((f) => f.level > 0) && <p className="strong">{t('Reported change in daily function remains the leading concern for review, whatever the number says.', 'يبقى التغيّر المبلّغ عنه في الأداء اليومي هو الشاغل الرئيسي للمراجعة، أيًا كان الرقم.')}</p>}
            {shown?.reason && <p className="small muted">{t('Why the template was used: ', 'سبب استخدام القالب: ')}{shown.reason}</p>}
            {onExplain && (
              <div className="row no-print">
                <button type="button" className="btn" disabled={busy} onClick={onExplain}>{busy ? t('Asking the model…', 'جارٍ سؤال النموذج…') : t('Ask a live model to explain', 'طلب الشرح من نموذج مباشر')}</button>
                <span className="tiny muted">{t('Sends only the fixed case ID and numeric scores. The model may word the result, and code checks every number.', 'يرسل معرّف الحالة الثابت والدرجات الرقمية فقط. يصوغ النموذج النتيجة، ويفحص الكود كل رقم.')}</span>
              </div>
            )}
          </>
        ) : <p className="muted">{run.changeNull ? tx(run.changeNull) : t('No estimate was reached.', 'لم يُوصل إلى تقدير.')}</p>}
        {run.interpretationNotes.map((n) => <p key={n.en} className="small muted">{tx(n)}</p>)}
      </section>

      {r && (
        <>
          <div className="grid-3">
            <Metric label={t('Baseline average', 'متوسط خط الأساس')} value={<>{fmt(r.baselineMean)} <span className="small">/10</span></>} detail={t(`${r.baselineValues.length} earlier observations`, `${r.baselineValues.length} ملاحظات سابقة`, `${r.baselineValues.length} observasi sebelumnya`)} />
            <Metric label={t('Follow-up average', 'متوسط المتابعة')} value={<>{fmt(r.followupMean)} <span className="small">/10</span></>} detail={t(`${r.followupValues.length} observations`, `${r.followupValues.length} ملاحظات`, `${r.followupValues.length} observasi`)} />
            <Metric variant="tint" label={t('Change after practice adjustment', 'التغيّر بعد تعديل أثر التمرين')} value={fmtSigned(r.adjustedChange)} detail={t('Task completions, not a percentage', 'مهام مكتملة، وليست نسبة مئوية')} />
          </div>
          <section className="card">
            <h3>{t('How this result is calculated', 'كيف تُحسب هذه النتيجة')}</h3>
            <div className="table-wrap" dir="ltr">
              <table>
                <thead><tr><th>Step</th><th>Calculation</th><th>Meaning</th></tr></thead>
                <tbody>
                  <tr><td className="strong">1. Baseline average</td><td className="mono">({r.baselineValues.join(' + ')}) ÷ {r.baselineValues.length} = {fmt(r.baselineMean)}</td><td>Average of the first three comparable visits</td></tr>
                  <tr><td className="strong">2. Follow-up average</td><td className="mono">({r.followupValues.join(' + ')}) ÷ {r.followupValues.length} = {fmt(r.followupMean)}</td><td>Average of the latest visits, not one visit alone</td></tr>
                  <tr><td className="strong">3. Observed change</td><td className="mono">{fmt(r.followupMean)} − {fmt(r.baselineMean)} = {fmt(r.observedChange)}</td><td>Follow-up minus baseline, before any adjustment</td></tr>
                  <tr><td className="strong">4. Assumed practice gain</td><td className="mono">+{fmt(r.practiceGain)}</td><td>Fixed synthetic assumption. It was not measured in this person</td></tr>
                  <tr><td className="strong">5. Adjusted change</td><td className="mono">{fmt(r.observedChange)} − {fmt(r.practiceGain)} = {fmt(r.adjustedChange)}</td><td>Negative means below that expectation</td></tr>
                  <tr><td className="strong">6. Standard error</td><td className="mono">{r.calibration.sd} × √[(1 − {r.calibration.reliability}) × (1/{r.baselineValues.length} + 1/{r.followupValues.length})] = {fmt(r.se, 3)}</td><td>Synthetic SD and reliability</td></tr>
                  <tr><td className="strong">7. z and 95% interval</td><td className="mono">z = {fmt(r.z)}; {fmt(r.ci95[0])} to {fmt(r.ci95[1])}</td><td>At or below −1.96: review. Down to −1.645: consider a repeat</td></tr>
                </tbody>
              </table>
            </div>
            <div className="notice notice-hold small">{t('Limit: the practice gain and uncertainty calibration are synthetic assumptions. The arithmetic is reproducible, but clinical accuracy has not been established. A no-flag result does not rule out impairment.', 'حد: أثر التمرين ومعايرة عدم اليقين افتراضات اصطناعية. يمكن إعادة الحساب، لكن الدقة السريرية لم تثبت. ولا تستبعد النتيجة دون إشارة وجود قصور.')}</div>
            <p className="tiny muted mono">{r.formulaVersion} · {r.calibration.version}</p>
          </section>
        </>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <ChartCard title={t('Recorded observations over time', 'الملاحظات المسجلة عبر الزمن')} sub={t('What was recorded at each encounter.', 'ما سُجل في كل زيارة.')}>
          <ObservationChart c={c} />
        </ChartCard>
        <ChartCard title={t('Adjusted change at each encounter', 'التغيّر المعدّل في كل زيارة')} sub={t('How each calculation compared with baseline, with an illustrative 95% interval.', 'كيف قورن كل حساب بخط الأساس، مع فاصل توضيحي 95%.')}>
          <ChangeChart points={points} />
        </ChartCard>
      </div>

      {run.context.length > 0 && (
        <section className="card">
          <h3>{t('Authorised context and its sources', 'السياق المصرّح به ومصادره')}</h3>
          <ContextTable items={run.context} lang={lang} />
        </section>
      )}

      <section className="card">
        <h3>{t('Clinician decision', 'قرار الطبيب')}</h3>
        {decision?.status === 'approved' ? (
          <div className="stack small">
            <p><span className="strong">{t('Reviewer: ', 'المراجع: ')}</span>{decision.reviewer} · <span className="num">{decision.decidedAt}</span></p>
            <p><span className="strong">{t('Summary: ', 'الملخص: ')}</span>{decision.summary}</p>
            <p><span className="strong">{t('Still to clarify: ', 'ما يزال للتوضيح: ')}</span>{decision.stillToClarify}</p>
            <p><span className="strong">{t('Assessment: ', 'التقييم: ')}</span>{decision.assessment}</p>
            <p><span className="strong">{t('Agreed next step: ', 'الخطوة التالية: ')}</span>{decision.nextStep}</p>
            <p><span className="strong">{t('Route: ', 'المسار: ')}</span>{tx(ROUTE_LABEL[decision.route])}{decision.services.length > 0 && <> · {decision.services.map((s) => tx(SERVICE_LABEL[s])).join(lang === 'ar' ? '، ' : ', ')}</>} · <span className="num">{decision.followUpDays}</span> {t('days', 'يومًا')}</p>
          </div>
        ) : <div className="notice notice-wait">{decision?.status === 'returned'
          ? t('Returned for more information. No care action is released.', 'أعيد لطلب مزيد من المعلومات. لم يُفرج عن أي إجراء رعاية.')
          : decision?.status === 'prepared'
            ? t(`Prepared by ${decision.reviewer}, waiting for a doctor to sign off. No care action is released.`, `أعدّها ${decision.reviewer}، بانتظار توقيع الطبيب. لم يُفرج عن أي إجراء رعاية.`, `Disiapkan oleh ${decision.reviewer}, menunggu tanda tangan dokter. Tidak ada tindakan perawatan yang dilepas.`)
            : t('No clinician decision is recorded. No care action is released.', 'لم يُسجل قرار طبيب. لم يُفرج عن أي إجراء رعاية.')}</div>}
      </section>

      {decision?.status === 'approved' && (
        <PatientPlan plan={buildPersonPlan(decision)} preferred={c.preferredLanguage} />
      )}

      <details className="card">
        <summary>{t('Audit trail: one event per stage', 'سجل التدقيق: حدث واحد لكل مرحلة')}</summary>
        <div className="table-wrap" dir="ltr" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>#</th><th>Agent</th><th>Tool</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {run.audit.map((e) => (
                <tr key={e.seq}><td className="num">{e.stage}</td><td>{e.agent}</td><td className="mono">{e.tool}</td><td><StatusTag status={e.status} /></td><td className="small">{e.detail}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function RecordPage() {
  const { currentCase: c, run, caseId, decisions, explanations, setExplanation, records, saveRecord, t, tx } = useApp();
  const [viewing, setViewing] = useState<SavedRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [fhirNote, setFhirNote] = useState<{ ok: boolean; text: string } | null>(null);
  const decision = decisions[caseId] ?? null;

  const exportFhir = () => {
    const src = viewing ? { c: viewing.caseSnapshot, run: viewing.run, decision: viewing.decision } : { c, run, decision };
    const result = buildFhirBundle(src.c, src.run, src.decision, buildTasks(src.c, src.run, src.decision, today()), new Date());
    if ('error' in result) {
      setFhirNote({ ok: false, text: t('No permission to access this patient, so no FHIR record was exported.', 'لا يوجد إذن للوصول إلى هذا المريض، لذلك لم يُصدَّر سجل FHIR.', 'Tidak ada izin mengakses pasien ini, jadi tidak ada rekam FHIR yang diekspor.') });
      return;
    }
    download(`dhakira-${src.c.id}-fhir-r4.json`, JSON.stringify(result.bundle, null, 2), 'application/fhir+json');
    const n = String(result.bundle.entry.length);
    setFhirNote({
      ok: true,
      text: t(
        `FHIR R4 Bundle exported with ${n} resources, tagged as test data. Nothing was sent to any system. Context without patient permission or without an agreed code was left out.`,
        `صُدّرت حزمة FHIR R4 تضم ${n} موردًا، موسومة كبيانات اختبار. لم يُرسل شيء إلى أي نظام. استُبعد السياق الذي لا إذن به من المريض أو لا رمز متفقًا عليه له.`,
        `Bundle FHIR R4 diekspor dengan ${n} resource, ditandai sebagai data uji. Tidak ada yang dikirim ke sistem mana pun. Konteks tanpa izin pasien atau tanpa kode yang disepakati tidak disertakan.`,
      ),
    });
  };

  const askModel = async () => {
    setBusy(true);
    try {
      const extraScores = c.observations.filter((o) => o.source === 'live-check').map((o) => o.score as number);
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId, extraScores }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.explanation) {
        setExplanation(caseId, { source: data.source, model: data.model, reason: data.reason, explanation: data.explanation });
      } else if (run.change) {
        setExplanation(caseId, { source: 'template', reason: data?.error ?? t('The model endpoint is not available on this deployment.', 'نقطة النموذج غير متاحة في هذا النشر.'), explanation: templateExplanation(run.change) });
      }
    } catch {
      if (run.change) setExplanation(caseId, { source: 'template', reason: t('The model endpoint could not be reached.', 'تعذر الوصول إلى نقطة النموذج.'), explanation: templateExplanation(run.change) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={t('Visit record', 'سجل الزيارة')}>
        {t('One dated record for one visit: the supplied information, the calculated findings, the clinician decision and every handoff. Records stay in this browser until you export them.', 'سجل مؤرخ واحد لزيارة واحدة: المعلومات الواردة والنتائج المحسوبة وقرار الطبيب وكل تسليم. تبقى السجلات في هذا المتصفح حتى تصدّرها.')}
      </PageHead>

      <div className="row between no-print">
        {viewing
          ? <button type="button" className="btn" onClick={() => setViewing(null)}>{t('Back to the current visit', 'العودة إلى الزيارة الحالية')}</button>
          : <CasePicker />}
        <div className="row">
          {!viewing && <button type="button" className="btn btn-primary" onClick={() => { setViewing(saveRecord()); setJustSaved(true); }}>{t('Save dated record', 'حفظ السجل المؤرخ')}</button>}
          <button type="button" className="btn" onClick={() => window.print()}>{t('Print or save as PDF', 'طباعة أو حفظ PDF')}</button>
          <button
            type="button" className="btn"
            onClick={() => download(`dhakira-${(viewing?.caseSnapshot ?? c).id}.json`, JSON.stringify(viewing ?? { caseSnapshot: c, run, decision, explain: explanations[caseId] ?? null }, null, 2))}
          >{t('Export JSON', 'تصدير JSON')}</button>
          <button type="button" className="btn" onClick={exportFhir}>{t('Export FHIR R4', 'تصدير FHIR R4', 'Ekspor FHIR R4')}</button>
        </div>
      </div>

      {fhirNote && <div className={`notice ${fhirNote.ok ? 'notice-info' : 'notice-hold'} no-print`} role="status">{fhirNote.text}</div>}

      {viewing && justSaved && <div className="notice notice-pass">{t('Record saved in this browser. It will not change if the case changes later.', 'حُفظ السجل في هذا المتصفح. لن يتغيّر إذا تغيّرت الحالة لاحقًا.')}</div>}

      {viewing
        ? <RecordView c={viewing.caseSnapshot} run={viewing.run} decision={viewing.decision} explain={viewing.explain} />
        : <RecordView c={c} run={run} decision={decision} explain={explanations[caseId] ?? null} onExplain={run.change ? askModel : undefined} busy={busy} />}

      <section className="card no-print">
        <h3>{t('Saved records', 'السجلات المحفوظة')}</h3>
        {records.length === 0
          ? <p className="small muted">{t('None yet. Save the current visit to keep a dated copy.', 'لا يوجد بعد. احفظ الزيارة الحالية للاحتفاظ بنسخة مؤرخة.')}</p>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Saved', 'حُفظ')}</th><th>{t('Person', 'الشخص')}</th><th>{t('Route', 'المسار')}</th><th /></tr></thead>
                <tbody>
                  {records.map((rec) => (
                    <tr key={rec.id}>
                      <td className="num">{rec.savedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{rec.caseSnapshot.name}</td>
                      <td>{tx(ROUTE_LABEL[rec.run.outcome.route])}</td>
                      <td><button type="button" className="btn" onClick={() => { setViewing(rec); setJustSaved(false); window.scrollTo(0, 0); }}>{t('Open', 'فتح')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </>
  );
}
