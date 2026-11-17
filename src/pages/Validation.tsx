import { useMemo, useState } from 'react';
import {
  COHORT_SEED, evaluateCohort, generateCohort, NO_FILTER, oneOffComparison, UNSTABLE_N,
  type AgeBand, type CohortFilter,
} from '../engine/cohort';
import type { Proportion } from '../engine/metrics';
import type { AssessmentLanguage, Education } from '../engine/types';
import { useApp } from '../store';
import { Metric, PageHead, download } from '../components/ui';
import { ChartCard, ForestChart, ThresholdChart, type ForestRow } from '../components/charts';
import { ShadowEvaluation } from '../components/ShadowModel';

const pct = (p: Proportion) => (p.p === null ? null : `${(p.p * 100).toFixed(1)}%`);
const ci = (p: Proportion) => (p.lo === null || p.hi === null ? null : `${(p.lo * 100).toFixed(1)} to ${(p.hi * 100).toFixed(1)}`);

export function Validation() {
  const { t } = useApp();
  const records = useMemo(() => generateCohort(), []);
  const [filter, setFilter] = useState<CohortFilter>(NO_FILTER);
  const [threshold, setThreshold] = useState(-1.96);
  const m = useMemo(() => evaluateCohort(records, filter, threshold), [records, filter, threshold]);

  const nullText = t('Not calculable', 'غير قابل للحساب');
  const langLabel: Record<AssessmentLanguage, string> = { ar: t('Arabic', 'العربية'), en: t('English', 'الإنجليزية'), id: t('Indonesian', 'الإندونيسية', 'Indonesia'), ur: t('Urdu', 'الأردية') };
  const eduLabel: Record<Education, string> = { low: t('Primary or less', 'ابتدائي أو أقل'), mid: t('Secondary', 'ثانوي'), high: t('Tertiary', 'جامعي') };

  const segments = useMemo(() => {
    const rows: { label: string; f: CohortFilter }[] = [
      ...(['ar', 'en', 'ur'] as AssessmentLanguage[]).map((language) => ({ label: langLabel[language], f: { ...NO_FILTER, language } })),
      ...(['50-59', '60-69', '70+'] as AgeBand[]).map((ageBand) => ({ label: ageBand, f: { ...NO_FILTER, ageBand } })),
      ...(['low', 'mid', 'high'] as Education[]).map((education) => ({ label: eduLabel[education], f: { ...NO_FILTER, education } })),
    ];
    return rows.map((r) => ({ label: r.label, metrics: evaluateCohort(records, r.f, threshold) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, threshold, t]);

  const forest = (key: 'sensitivity' | 'specificity' | 'falseReferral' | 'completion'): ForestRow[] =>
    segments.map((s) => ({ label: s.label, value: s.metrics[key] }));

  const curve = useMemo(() => {
    const out = [];
    for (let z = -3; z <= -0.9999; z += 0.25) {
      const e = evaluateCohort(records, filter, Number(z.toFixed(2)));
      out.push({ threshold: Number(z.toFixed(2)), sensitivity: e.sensitivity.p, specificity: e.specificity.p });
    }
    return out;
  }, [records, filter]);

  const oneOff = useMemo(() => oneOffComparison(records), [records]);

  const selected = records.filter((c) =>
    (filter.language === 'all' || c.language === filter.language)
    && (filter.education === 'all' || c.education === filter.education)
    && (filter.ageBand === 'all' || c.ageBand === filter.ageBand));

  const missing = t('Stays empty. It is not zero.', 'يبقى فارغًا. وليس صفرًا.');
  const NA = t('n/a', 'غير متاح');

  return (
    <>
      <PageHead title={t('Tool validation', 'التحقق من الأداة')}>
        {t(
          `Computed live by the scoring engine from ${records.length} synthetic records (seed ${COHORT_SEED}). This shows the calculations work. It says nothing about real performance, and a pilot needs independent qualified assessment for its reference labels.`,
          `تُحسب مباشرة بمحرك الحساب من ${records.length} سجلًا اصطناعيًا (البذرة ${COHORT_SEED}). يبيّن هذا أن الحسابات تعمل، ولا يقول شيئًا عن الأداء الفعلي، وتحتاج التجربة إلى تقييم مؤهل مستقل لتسميات المرجع.`,
          `Dihitung langsung oleh mesin penilai dari ${records.length} catatan sintetis (seed ${COHORT_SEED}). Ini menunjukkan perhitungannya berjalan. Ini tidak menunjukkan performa sebenarnya, dan pilot memerlukan penilaian independen yang berkualifikasi sebagai label rujukan.`,
        )}
      </PageHead>

      <section className="card">
        <div className="grid-3">
          <label className="field">{t('Language', 'اللغة')}
            <select value={filter.language} onChange={(e) => setFilter({ ...filter, language: e.target.value as CohortFilter['language'] })}>
              <option value="all">{t('All languages', 'جميع اللغات')}</option>
              {(['ar', 'en', 'ur'] as AssessmentLanguage[]).map((l) => <option key={l} value={l}>{langLabel[l]}</option>)}
            </select>
          </label>
          <label className="field">{t('Age', 'العمر')}
            <select value={filter.ageBand} onChange={(e) => setFilter({ ...filter, ageBand: e.target.value as CohortFilter['ageBand'] })}>
              <option value="all">{t('All ages', 'جميع الأعمار')}</option>
              {(['50-59', '60-69', '70+'] as AgeBand[]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="field">{t('Education', 'التعليم')}
            <select value={filter.education} onChange={(e) => setFilter({ ...filter, education: e.target.value as CohortFilter['education'] })}>
              <option value="all">{t('All education groups', 'جميع فئات التعليم')}</option>
              {(['low', 'mid', 'high'] as Education[]).map((x) => <option key={x} value={x}>{eduLabel[x]}</option>)}
            </select>
          </label>
        </div>
        <div className="row between">
          <p className="small muted num">{m.selected} / {records.length} {t('records', 'سجلًا')} · {m.completion.k} {t('complete', 'مكتمل')} · {m.selected - m.completion.k} {t('incomplete', 'غير مكتمل')} · {m.withheld} {t('withheld, no calibration', 'محجوب، بلا معايرة')}</p>
          <button type="button" className="btn" onClick={() => download('dhakira-synthetic-metrics.json', JSON.stringify({ synthetic: true, seed: COHORT_SEED, filter, threshold, metrics: m, records: selected }, null, 2))}>{t('Export filtered data and metrics', 'تصدير البيانات والمقاييس المصفّاة')}</button>
        </div>
        {m.unstable && (
          <div className="notice notice-hold">{t(`Fewer than ${UNSTABLE_N} reference-positive or reference-negative records are selected, so these figures are unstable. Read the intervals, not the point estimates.`, `السجلات الإيجابية أو السلبية المرجعية المحددة أقل من ${UNSTABLE_N}، لذا هذه الأرقام غير مستقرة. اقرأ الفواصل لا التقديرات.`, `Catatan positif atau negatif menurut rujukan yang terpilih kurang dari ${UNSTABLE_N}, jadi angka ini belum stabil. Bacalah intervalnya, bukan estimasi titiknya.`)}</div>
        )}
        {m.withheld > 0 && m.completion.k === m.withheld && (
          <div className="notice notice-hold">{t('This group has no calibration. Sensitivity and specificity stay empty rather than reading as zero, and that gap is itself a finding to report.', 'لا معايرة لهذه الفئة. تبقى الحساسية والنوعية فارغتين بدلًا من صفر، وهذا النقص نفسه نتيجة يجب الإبلاغ عنها.')}</div>
        )}
      </section>

      <section className="grid-3">
        <Metric label={t('Completion', 'الإكمال')} value={pct(m.completion) ?? NA} detail={<><span className="num">{m.completion.k}/{m.completion.n}</span> · 95% CI <span className="num">{ci(m.completion) ?? missing}</span></>} />
        <Metric label={t('Sensitivity', 'الحساسية')} value={pct(m.sensitivity) ?? NA} detail={<><span className="num">{m.sensitivity.k}/{m.sensitivity.n}</span> {t('reference positive', 'إيجابي مرجعيًا')} · 95% CI <span className="num">{ci(m.sensitivity) ?? missing}</span></>} />
        <Metric label={t('Specificity', 'النوعية')} value={pct(m.specificity) ?? NA} detail={<><span className="num">{m.specificity.k}/{m.specificity.n}</span> {t('reference negative', 'سلبي مرجعيًا')} · 95% CI <span className="num">{ci(m.specificity) ?? missing}</span></>} />
        <Metric label={t('Test-retest reliability', 'ثبات الاختبار وإعادته')} value={m.icc === null ? NA : m.icc.toFixed(3)} detail={<>ICC(A,1) · <span className="num">{m.iccPairs}</span> {t('paired first and second visits, same task and scale', 'زوجًا من الزيارتين الأولى والثانية، المهمة والمقياس نفسهما')}</>} />
        <Metric label={t('False-referral burden', 'عبء الإحالات الخاطئة')} value={pct(m.falseReferral) ?? NA} detail={<><span className="num">{m.falseReferral.k}/{m.falseReferral.n}</span> {t('referred but reference negative', 'أحيل لكنه سلبي مرجعيًا')} · 95% CI <span className="num">{ci(m.falseReferral) ?? missing}</span></>} />
        <Metric label={t('Time to clinical assessment', 'الوقت حتى التقييم السريري')} value={m.meanDaysToAssessment === null ? NA : <>{m.meanDaysToAssessment.toFixed(1)} <span className="small">{t('days', 'يومًا')}</span></>} detail={<>{t('Mean of', 'متوسط')} <span className="num">{m.assessedReferrals}</span> {t('assessed referrals', 'إحالات مقيّمة')} · <span className="num">{m.missingAssessmentTime}</span> {t('missing a time', 'بلا وقت مسجل')}</>} />
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>{t('Can it identify meaningful change?', 'هل يمكنها تحديد التغيّر ذي المعنى؟')}</h2>
          <div className="row" style={{ gap: 14 }}>
            <span className="big-number num">{m.changeAuc === null ? NA : m.changeAuc.toFixed(2)}</span>
            <span className="small muted">{t('Area under the ROC curve for the change estimate against the reference label. 0.50 is chance and 1.00 is perfect. It does not depend on the threshold.', 'المساحة تحت منحنى ROC لتقدير التغيّر مقابل التسمية المرجعية. 0.50 صدفة و1.00 مثالي. ولا تعتمد على العتبة.')}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Referred by the tool', 'أحالته الأداة')}</th><th>{t('Reference: changed', 'المرجع: تغيّر')}</th><th>{t('Reference: no change', 'المرجع: لا تغيّر')}</th></tr></thead>
              <tbody>
                <tr><td className="strong">{t('Yes', 'نعم')}</td><td className="num">{t('True positive', 'إيجابي صحيح')} {m.matrix.tp}</td><td className="num">{t('False positive', 'إيجابي خاطئ')} {m.matrix.fp}</td></tr>
                <tr><td className="strong">{t('No', 'لا')}</td><td className="num">{t('False negative', 'سلبي خاطئ')} {m.matrix.fn}</td><td className="num">{t('True negative', 'سلبي صحيح')} {m.matrix.tn}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">
            {t('Referral rate', 'معدل الإحالة')} <span className="num">{pct(m.referralRate) ?? NA}</span>. <span className="num">{m.functionOverrides}</span> {t('referrals came from reported daily-function change when the number alone would not have flagged. Incomplete and withheld records stay out of classification and stay in the completion count.', 'إحالات جاءت من تغيّر مبلّغ عنه في الأداء اليومي حين لم يكن الرقم وحده ليشير إليها. تبقى السجلات غير المكتملة والمحجوبة خارج التصنيف وداخل عدد الإكمال.')}
          </p>
        </section>

        <ChartCard title={t('What moving the threshold costs', 'كلفة تحريك العتبة')} sub={t('A stricter z-score misses more people. A looser one refers more people who do not need it.', 'تفوّت درجة z الأشد عددًا أكبر، وتحيل الأكثر تساهلًا عددًا أكبر ممن لا يحتاجون.')}>
          <label className="field">
            {t('Review threshold (z)', 'عتبة المراجعة (z)')} <span className="num">{threshold.toFixed(2)}</span>
            <input type="range" min={-3} max={-1} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} dir="ltr" />
          </label>
          <ThresholdChart points={curve} current={threshold} title={t('Sensitivity and specificity at each z threshold', 'الحساسية والنوعية عند كل عتبة z')} labels={{ sensitivity: t('Sensitivity', 'الحساسية'), specificity: t('Specificity', 'النوعية') }} />
          {threshold !== -1.96 && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setThreshold(-1.96)}>{t('Back to -1.96', 'العودة إلى -1.96')}</button>}
        </ChartCard>
      </div>

      <section className="stack">
        <h2>{t('Every metric by language, age and education', 'كل مقياس حسب اللغة والعمر والتعليم')}</h2>
        <div className="grid-2">
          <ChartCard title={t('Sensitivity by subgroup', 'الحساسية حسب الفئة')} sub={t('Dots are estimates, and lines are 95% Wilson intervals.', 'النقاط تقديرات، والخطوط فواصل ويلسون 95%.')}>
            <ForestChart rows={forest('sensitivity')} title={t('Sensitivity by subgroup', 'الحساسية حسب الفئة')} nullLabel={nullText} />
          </ChartCard>
          <ChartCard title={t('Specificity by subgroup', 'النوعية حسب الفئة')} sub={t('Urdu stays empty because the tool has no calibration for it.', 'تبقى الأردية فارغة لأن الأداة لا تملك معايرة لها.')}>
            <ForestChart rows={forest('specificity')} title={t('Specificity by subgroup', 'النوعية حسب الفئة')} nullLabel={nullText} />
          </ChartCard>
          <ChartCard title={t('Completion by subgroup', 'الإكمال حسب الفئة')} sub={t('Who finishes, and who cannot.', 'من يُكمل، ومن لا يستطيع.')}>
            <ForestChart rows={forest('completion')} title={t('Completion by subgroup', 'الإكمال حسب الفئة')} nullLabel={nullText} />
          </ChartCard>
          <ChartCard title={t('False-referral burden by subgroup', 'عبء الإحالات الخاطئة حسب الفئة')} sub={t('Share of referrals with a negative reference.', 'نسبة الإحالات ذات المرجع السلبي.')}>
            <ForestChart rows={forest('falseReferral')} title={t('False-referral burden by subgroup', 'عبء الإحالات الخاطئة حسب الفئة')} nullLabel={nullText} />
          </ChartCard>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h3>{t('The question the pilot must answer', 'السؤال الذي يجب أن تجيب عنه التجربة')}</h3>
          <p className="small muted">{t(
            'Does a personal baseline flag fewer people with no real change than a one-off cut-off, especially people with less schooling? The simulator assumes lower starting scores for less schooling, so this table illustrates the question and is not evidence.',
            'هل يشير خط الأساس الشخصي إلى عدد أقل ممن لا يوجد لديهم تغيّر حقيقي مقارنة بنقطة قطع لمرة واحدة، خاصة لمن تعليمهم أقل؟ يفترض المحاكي درجات بداية أقل لمن تعليمهم أقل، لذا يوضح هذا الجدول السؤال وليس دليلًا.',
          )}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Education', 'التعليم')}</th><th>{t('One-off cut-off below 6', 'نقطة قطع لمرة واحدة أقل من 6')}</th><th>{t('Personal baseline', 'خط الأساس الشخصي')}</th></tr></thead>
              <tbody>
                {oneOff.map((o) => (
                  <tr key={o.education}>
                    <td>{eduLabel[o.education]}</td>
                    <td className="num">{pct(o.oneOff) ?? NA} ({o.oneOff.k}/{o.oneOff.n})</td>
                    <td className="num">{pct(o.personal) ?? NA} ({o.personal.k}/{o.personal.n})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">{t('Share flagged among people whose reference label says no change.', 'نسبة من أُشير إليهم ممن تقول تسميتهم المرجعية إنه لا تغيّر.')}</p>
        </section>
        <section className="card">
          <h3>{t('What the pilot still needs to measure', 'ما زال على التجربة قياسه')}</h3>
          <ul className="plain small">
            <li>{t('Source accuracy, unsupported advice and missed information in prepared drafts', 'دقة المصادر والنصائح غير المدعومة والمعلومات الفائتة في المسودات')}</li>
            <li>{t('Preparation time and clinician workload', 'وقت التحضير وعبء عمل الأطباء')}</li>
            <li>{t('Anxiety and false reassurance reported by participants', 'القلق والطمأنة الزائفة كما يبلّغ المشاركون')}</li>
            <li>{t('Arabic item validity, by dialect and education', 'صلاحية البنود العربية حسب اللهجة والتعليم')}</li>
            <li>{t('Serial correlation and regression to the mean in the change formula', 'الارتباط التسلسلي والانحدار نحو المتوسط في معادلة التغيّر')}</li>
          </ul>
          <p className="small muted">{t('These are proposed measures, not results. ICC(A,1) is two-way, absolute agreement, single measurement. Wilson intervals use each metric\'s displayed denominator. No fairness claim is supported.', 'هذه مقاييس مقترحة وليست نتائج. ICC(A,1) ثنائي الاتجاه واتفاق مطلق وقياس واحد. تستخدم فواصل ويلسون المقام المعروض لكل مقياس. لا يوجد ادعاء مدعوم بالإنصاف.')}</p>
        </section>
      </div>

      <details className="card">
        <summary>{t('Inspect the filtered synthetic records', 'فحص السجلات الاصطناعية المصفّاة')}</summary>
        <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto', marginTop: 12 }}>
          <table>
            <thead><tr><th>ID</th><th>{t('Language', 'اللغة')}</th><th>{t('Age', 'العمر')}</th><th>{t('Education', 'التعليم')}</th><th>{t('Scores', 'الدرجات')}</th><th>{t('Reference', 'المرجع')}</th><th>{t('Function', 'الأداء')}</th><th>{t('Days', 'الأيام')}</th></tr></thead>
            <tbody>
              {selected.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td>{langLabel[c.language]}</td>
                  <td className="num">{c.ageBand}</td>
                  <td>{eduLabel[c.education]}</td>
                  <td className="num">{c.scores?.join(', ') ?? <em className="muted">{t('Incomplete', 'غير مكتمل')}</em>}</td>
                  <td>{c.referenceChange === null ? NA : c.referenceChange ? t('Changed', 'تغيّر') : t('No change', 'لا تغيّر')}</td>
                  <td>{c.functionReported ? t('Reported', 'مُبلّغ') : NA}</td>
                  <td className="num">{c.daysToAssessment ?? NA}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <ShadowEvaluation />
    </>
  );
}
