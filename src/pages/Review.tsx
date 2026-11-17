import { useEffect, useMemo, useState } from 'react';
import { SOURCES } from '../data/sources';
import { ROUTE_LABEL, SERVICE_LABEL } from '../engine/pipeline';
import { buildPersonPlan, draftReview, exampleDecision, type PersonPlan } from '../engine/plan';
import type { AssessmentLanguage, ClinicianDecision, ContributorId, Lang, Localised, Route, Service } from '../engine/types';
import { LANGS, pick, pickL } from '../i18n';
import { today, useApp } from '../store';
import { GoButton, OutcomeNotice, PageHead, PatientBanner, RouteTag, SourceRefs } from '../components/ui';
import { Brief } from './Workspace';
import { WorkupSummaryLine } from '../components/Workup';

export function PlanColumn({ plan, lang }: { plan: PersonPlan; lang: Lang }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const t = (en: string, ar: string, id?: string) => pick(lang, en, ar, id);
  const tx = (l: Localised) => pickL(lang, l);
  return (
    <div className="card plan" dir={dir} lang={lang}>
      <h3>{t('Plan for the patient, in English', 'الخطة للمريض، بالعربية', 'Rencana untuk pasien, dalam bahasa Indonesia')}</h3>
      <p>{tx(plan.meaning)}</p>
      {plan.actions.length > 0 && (
        <div>
          <p className="strong">{t('Things to talk through with your clinician', 'أمور لمناقشتها مع طبيبك')}</p>
          <ul>
            {plan.actions.map((a) => (
              <li key={a.id}>
                <span className="strong">{tx(a.label)}: </span>{tx(a.action)}
                {a.localNote && <span className="muted"> {tx(a.localNote)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.services.length > 0 && <p><span className="strong">{t('Services your clinician chose to discuss: ', 'الخدمات التي اختار طبيبك مناقشتها: ')}</span>{plan.services.map((s) => tx(s)).join(lang === 'ar' ? '، ' : ', ')}.</p>}
      <p>{tx(plan.followUp)}</p>
      <p className="small muted">{tx(plan.limits)}</p>
      {lang !== 'en' && <p className="tiny muted">{t('', 'صياغة عربية توضيحية تحتاج إلى تحقق لغوي وثقافي قبل الاستخدام السريري.', 'Terjemahan ilustratif yang perlu diperiksa secara bahasa dan budaya sebelum dipakai secara klinis.')}</p>}
    </div>
  );
}

/** The plan is shown in the patient's own language, and any other can be chosen for the conversation. */
export function PatientPlan({ plan, preferred }: { plan: PersonPlan; preferred: AssessmentLanguage }) {
  const { t } = useApp();
  const [lang, setLang] = useState<Lang>(preferred === 'ar' || preferred === 'id' ? preferred : 'en');
  return (
    <div className="stack">
      <div className="row">
        <span className="small strong">{t('Plan language', 'لغة الخطة', 'Bahasa rencana')}</span>
        <div className="segmented" role="group" aria-label={t('Plan language', 'لغة الخطة', 'Bahasa rencana')}>
          {LANGS.map((l) => <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</button>)}
        </div>
      </div>
      <PlanColumn plan={plan} lang={lang} />
    </div>
  );
}

export function Review() {
  const { currentCase: c, run, caseId, decisions, setDecision, session, go, t, tx } = useApp();
  const saved = decisions[caseId] ?? null;
  const isDoctor = session?.role === 'doctor';

  const blocked = run.outcome.route === 'stopped' || run.outcome.route === 'urgent'
    || run.stages[8].status !== 'passed';

  const draft = useMemo(() => draftReview(c, run), [c, run]);
  const [summary, setSummary] = useState('');
  const [clarify, setClarify] = useState('');
  const [assessment, setAssessment] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [chosen, setChosen] = useState<ContributorId[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [route, setRoute] = useState<Route>('qualified_review');
  const [rationale, setRationale] = useState('');
  const [days, setDays] = useState(14);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [tried, setTried] = useState(false);

  const proposedRoute: Route = saved?.status === 'approved' ? saved.route : run.outcome.route;

  useEffect(() => {
    const d = saved;
    setSummary(d?.summary ?? draft.summary);
    setClarify(d?.stillToClarify ?? draft.stillToClarify);
    setAssessment(d?.assessment ?? '');
    setNextStep(d?.nextStep ?? '');
    setChosen(d?.contributors ?? []);
    setServices(d?.services ?? []);
    setRoute(d?.route ?? run.outcome.route);
    setRationale(d?.rationale ?? '');
    setDays(d?.followUpDays ?? (run.outcome.route === 'repeat' ? 21 : run.outcome.route === 'routine' ? 180 : 14));
    setConfirmed(d?.summaryConfirmed ?? false);
    setReviewed(d?.contributorsReviewed ?? false);
    setTried(false);
  // Reload the form when the patient or the stored decision changes, not on each keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, saved]);

  const routeChanged = route !== proposedRoute;
  const signOffProblems: string[] = [];
  if (!assessment.trim()) signOffProblems.push(t('Write your assessment.', 'اكتب تقييمك.'));
  if (!nextStep.trim()) signOffProblems.push(t('Write the agreed next step.', 'اكتب الخطوة التالية المتفق عليها.'));
  if (!confirmed) signOffProblems.push(t('Confirm or correct the summary.', 'أكد الملخص أو صححه.'));
  if (!reviewed) signOffProblems.push(t('Confirm you reviewed contributors, gaps and access needs.', 'أكد أنك راجعت العوامل والنواقص واحتياجات الوصول.'));
  if (routeChanged && !rationale.trim()) signOffProblems.push(t('Give a reason for changing the route.', 'اذكر سببًا لتغيير المسار.'));
  if (!(days >= 1 && days <= 365)) signOffProblems.push(t('Set a follow-up between 1 and 365 days.', 'حدد متابعة بين 1 و365 يومًا.'));

  const prepareProblems: string[] = [];
  if (!confirmed) prepareProblems.push(t('Confirm or correct the summary before handing over.', 'أكد الملخص أو صححه قبل التسليم.'));

  const problems = isDoctor ? signOffProblems : prepareProblems;

  const submit = (status: ClinicianDecision['status']) => {
    setTried(true);
    if (status !== 'returned' && problems.length > 0) return;
    setDecision(caseId, {
      reviewer: session?.name ?? t('Unnamed reviewer', 'مراجع غير مسمى'),
      reviewerRole: isDoctor ? 'doctor' : 'nurse',
      summary, stillToClarify: clarify, assessment, nextStep, contributors: chosen, route, services,
      rationale, followUpDays: days, summaryConfirmed: confirmed, contributorsReviewed: reviewed,
      status, decidedAt: today(),
    });
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const usedSources = new Set(run.contributors.flatMap((k) => k.sources));
  const locked = saved?.status === 'approved' && !isDoctor;

  return (
    <>
      <PageHead title={t('Review and sign-off', 'المراجعة والتوقيع')}>
        {isDoctor
          ? t('You can see where each piece of information came from, correct it and document your own decision. Nothing reaches the patient until you sign off.', 'يمكنك رؤية مصدر كل معلومة وتصحيحها وتوثيق قرارك. لا يصل شيء إلى المريض حتى توقّع.')
          : t('Check the summary, add what you learned from the patient, and hand it to a doctor. Only a doctor can sign off the care route.', 'تحقق من الملخص وأضف ما عرفته من المريض وسلّمه للطبيب. يستطيع الطبيب فقط توقيع مسار الرعاية.')}
      </PageHead>

      <PatientBanner />

      {blocked ? (
        <section className="stack">
          <OutcomeNotice />
          <p className="muted">{t('No plan is drafted for this path. Act on the next step above, then open this patient again.', 'لا تُصاغ خطة لهذا المسار. نفّذ الخطوة التالية أعلاه، ثم افتح هذا المريض مجددًا.')}</p>
          <div className="row"><GoButton to="workspace">{t('Back to the summary', 'العودة إلى الملخص')}</GoButton></div>
        </section>
      ) : (
        <>
          {saved?.status === 'approved' && (
            <div className="notice notice-pass">
              <div className="row between">
                <span className="strong">{t('Signed off by ', 'وقّعها ')}{saved.reviewer}</span>
                <RouteTag route={saved.route} />
              </div>
              <p>{t('No message, appointment, referral or record update has been sent. This prototype connects to no outside system.', 'لم تُرسل أي رسالة أو موعد أو إحالة أو تحديث للسجل. لا يتصل هذا النموذج بأي نظام خارجي.')}</p>
            </div>
          )}
          {saved?.status === 'prepared' && (
            <div className="notice notice-wait strong">{t('Prepared by ', 'أعدّها ')}{saved.reviewer}. {isDoctor ? t('Waiting for your sign-off.', 'بانتظار توقيعك.') : t('Waiting for a doctor to sign off.', 'بانتظار توقيع الطبيب.')}</div>
          )}
          {saved?.status === 'returned' && <div className="notice notice-hold strong">{t('Returned for more information by ', 'أعادها لطلب مزيد من المعلومات ')}{saved.reviewer}. {t('No care action is released.', 'لم يُفرج عن أي إجراء رعاية.')}</div>}

          <div className="grid-2 start">
            <div className="stack-lg">
              <OutcomeNotice />
              <div className="card card-tight">
                <WorkupSummaryLine />
                <button type="button" className="link-btn" onClick={() => { go('workspace'); window.setTimeout(() => document.getElementById('workup')?.scrollIntoView({ block: 'start' }), 120); }}>{t('Open the work-up on the summary page', 'فتح الاستبعاد في صفحة الملخص', 'Buka penelusuran di halaman ringkasan')}</button>
              </div>
              <Brief />
              <section className="card">
                <h3>{t('Sources supporting the discussion', 'المصادر الداعمة للنقاش')}</h3>
                {usedSources.size === 0
                  ? <p className="small muted">{t('No contributors are listed for this patient, so no sources apply.', 'لا توجد عوامل مذكورة لهذا المريض، فلا تنطبق أي مصادر.')}</p>
                  : (
                    <ul className="plain small">
                      {SOURCES.filter((s) => usedSources.has(s.id)).map((s) => (
                        <li key={s.id} style={{ marginBottom: 8 }}>
                          <a href={s.url} target="_blank" rel="noreferrer" dir="ltr"><span className="mono">{s.id}</span> {s.citation}</a>
                          <div className="muted tiny">{tx(s.use)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
              </section>
            </div>

            <section className="card card-human">
              <div>
                <h2>{isDoctor ? t('Your review', 'مراجعتك') : t('Prepare for the doctor', 'الإعداد للطبيب')}</h2>
                <p className="small">{t('Working as ', 'تعمل باسم ')}<span className="strong">{session?.name}</span>. {t('The summary and gaps are prefilled for you to confirm or correct.', 'يُعبأ الملخص والنواقص مسبقًا لتأكيدها أو تصحيحها.')}</p>
              </div>
              <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="stack">
                <label className="field">{t('Confirm or correct the summary', 'أكد الملخص أو صححه')}<textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
                <label className="field">{t('What still needs clarifying', 'ما يزال بحاجة إلى توضيح')}<textarea value={clarify} onChange={(e) => setClarify(e.target.value)} /></label>
                <label className="field">{isDoctor ? t('Your assessment', 'تقييمك') : t('Nursing notes for the doctor', 'ملاحظات التمريض للطبيب')}<textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} /></label>
                <label className="field">{isDoctor ? t('Agreed next step', 'الخطوة التالية المتفق عليها') : t('Suggested next step (the doctor decides)', 'الخطوة التالية المقترحة (يقرر الطبيب)')}<textarea value={nextStep} onChange={(e) => setNextStep(e.target.value)} /></label>
                <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{t('I confirmed or corrected the summary.', 'أكدت الملخص أو صححته.')}</label>

                <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
                  <legend className="strong" style={{ marginBottom: 6 }}>{t('Contributors to discuss', 'العوامل المطلوب مناقشتها')}</legend>
                  {run.contributors.length === 0 && <p className="small muted">{t('None listed from the supplied context.', 'لم يُذكر أي منها من السياق الوارد.')}</p>}
                  {run.contributors.map((k) => (
                    <label key={k.id} className="check">
                      <input type="checkbox" checked={chosen.includes(k.id)} onChange={() => setChosen(toggle(chosen, k.id))} />
                      <span>{tx(k.label)} <SourceRefs ids={k.sources} /><span className="small muted" style={{ display: 'block' }}>{tx(k.why)}</span></span>
                    </label>
                  ))}
                </fieldset>
                <label className="check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{t('I reviewed contributors, gaps and access needs.', 'راجعت العوامل والنواقص واحتياجات الوصول.')}</label>

                <div className="grid-2">
                  <label className="field">{t('Care route', 'مسار الرعاية')}
                    <select value={route} disabled={!isDoctor} onChange={(e) => setRoute(e.target.value as Route)}>
                      {(['routine', 'repeat', 'qualified_review', 'urgent'] as Route[]).map((r) => <option key={r} value={r}>{tx(ROUTE_LABEL[r])}</option>)}
                    </select>
                  </label>
                  <label className="field">{t('Follow-up in days', 'المتابعة بالأيام')}
                    <input type="number" min={1} max={365} value={days} disabled={!isDoctor} onChange={(e) => setDays(Number(e.target.value))} />
                  </label>
                </div>
                {isDoctor && (
                  <label className="field">{routeChanged ? t('Reason for changing the route (required)', 'سبب تغيير المسار (مطلوب)') : t('Review note (optional)', 'ملاحظة المراجعة (اختيارية)')}
                    <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
                  </label>
                )}
                <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
                  <legend className="strong" style={{ marginBottom: 6 }}>{t('Services to discuss (suggested first)', 'الخدمات للمناقشة (المقترحة أولًا)')}</legend>
                  <div className="grid-2">
                    {[...run.suggestedServices, ...(Object.keys(SERVICE_LABEL) as Service[]).filter((s) => !run.suggestedServices.includes(s))].map((s) => (
                      <label key={s} className="check">
                        <input type="checkbox" checked={services.includes(s)} onChange={() => setServices(toggle(services, s))} />
                        <span>{tx(SERVICE_LABEL[s])}{run.suggestedServices.includes(s) && <span className="tiny muted"> · {t('suggested', 'مقترح')}</span>}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </fieldset>

              {tried && problems.length > 0 && (
                <div className="notice notice-hold" role="alert"><ul className="plain">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
              )}
              {locked ? (
                <p className="small">{t('A doctor has signed this off, so it can no longer be edited here.', 'وقّعها طبيب، فلم يعد بالإمكان تعديلها هنا.')}</p>
              ) : isDoctor ? (
                <div className="row">
                  <button type="button" className="btn btn-human" onClick={() => submit('approved')}>{t('Sign off', 'توقيع')}</button>
                  <button type="button" className="btn" onClick={() => submit('returned')}>{t('Return for more information', 'إعادة لطلب معلومات')}</button>
                </div>
              ) : (
                <div className="row">
                  <button type="button" className="btn btn-human" onClick={() => submit('prepared')}>{t('Send to the doctor for sign-off', 'إرسال إلى الطبيب للتوقيع')}</button>
                </div>
              )}
              <div className="row small" style={{ borderTop: '1px solid #d7cdef', paddingTop: 10 }}>
                <span className="muted">{t('For the demo:', 'للعرض:')}</span>
                <button type="button" className="link-btn" onClick={() => setDecision(caseId, exampleDecision(c, run, today()))}>{t('Load a fictional doctor\'s sign-off', 'تحميل توقيع طبيب خيالي')}</button>
                {saved && <button type="button" className="link-btn" onClick={() => setDecision(caseId, null)}>{t('Clear the decision', 'مسح القرار')}</button>}
              </div>
            </section>
          </div>

          {saved?.status === 'approved' && (
            <>
              <section id="person-plan">
                <PatientPlan plan={buildPersonPlan(saved)} preferred={c.preferredLanguage} />
              </section>
              <section className="card">
                <div className="row between">
                  <h3>{t('Local follow-up queue', 'قائمة المتابعة المحلية')}</h3>
                  <span className="tag tag-none">{t('Pending', 'قيد الانتظار')}</span>
                </div>
                <p>{tx(ROUTE_LABEL[saved.route])} · <span className="num">{saved.followUpDays}</span> {t('days, chosen by the doctor', 'يومًا، باختيار الطبيب')}</p>
                <div className="row no-print">
                  <GoButton to="record" primary>{t('Save the dated visit record', 'حفظ سجل الزيارة المؤرخ')}</GoButton>
                  <GoButton to="monitoring">{t('Open monitoring', 'فتح المتابعة')}</GoButton>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
