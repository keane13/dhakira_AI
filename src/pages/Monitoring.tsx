import { useMemo } from 'react';
import { buildFlags, buildTasks, changeSeries } from '../engine/monitoring';
import { fmtSigned } from '../engine/scoring';
import { SOURCES } from '../data/sources';
import { today, useApp } from '../store';
import { Metric, PageHead, PatientBanner, download } from '../components/ui';
import { ChangeChart, ChartCard, ObservationChart } from '../components/charts';
import { HabitsSection } from '../components/Habits';
import { buildIcs } from '../engine/calendar';

export function Monitoring() {
  const { currentCase: c, run, caseId, decisions, acks, ack, t, tx } = useApp();
  const decision = decisions[caseId] ?? null;
  const asOf = today();
  const flags = useMemo(() => buildFlags(c, run), [c, run]);
  const tasks = useMemo(() => buildTasks(c, run, decision, asOf), [c, run, decision, asOf]);
  const points = useMemo(() => changeSeries(c), [c]);
  const latest = c.observations.filter((o) => o.score !== null).at(-1);
  const awaiting = flags.filter((f) => !acks[`${caseId}:${f.id}`]);
  const overdue = tasks.filter((x) => x.status === 'overdue').length;

  // Calendar entries carry a generic task type and the pseudonymous ID only: no name, result or note.
  const calendarTitle = (id: string) => (
    id === 'followup' ? 'Dhakira follow-up review'
      : id === 'hold' ? 'Dhakira: resolve a hold'
        : id === 'review' ? 'Dhakira: clinician review'
          : 'Dhakira: obtain a missing result'
  );
  const exportCalendar = () => {
    const ics = buildIcs(tasks.map((x) => ({ uid: `${c.id}-${x.id}`, caseId: c.id, title: calendarTitle(x.id), due: x.due })), new Date());
    download(`dhakira-${c.id}-follow-up.ics`, ics, 'text/calendar');
  };

  const timeline = useMemo(() => {
    const events = [
      ...c.observations.map((o) => ({
        date: o.date, key: `obs-${o.visit}`,
        title: t(`Visit ${o.visit}: ${o.score ?? 'not recorded'}/10`, `الزيارة ${o.visit}: ${o.score ?? 'غير مسجل'}/10`, `Kunjungan ${o.visit}: ${o.score ?? 'tidak tercatat'}/10`),
        detail: t(
          `${o.language}, ${o.mode}, form ${o.form}${o.source === 'live-check' ? ', live check' : ''}${o.conditions.poorSleep ? ', poor sleep reported' : ''}`,
          `${o.language}، ${o.mode}، النموذج ${o.form}${o.source === 'live-check' ? '، فحص مباشر' : ''}${o.conditions.poorSleep ? '، أُبلغ عن نوم سيئ' : ''}`,
          `${o.language}, ${o.mode}, formulir ${o.form}${o.source === 'live-check' ? ', cek langsung' : ''}${o.conditions.poorSleep ? ', dilaporkan kurang tidur' : ''}`,
        ),
      })),
      ...c.functionReports.map((f, i) => ({
        date: f.date, key: `fn-${i}`,
        title: f.reporter === 'care_partner' ? t('Care partner report', 'تقرير مرافق الرعاية') : t('Self report', 'تقرير ذاتي'),
        detail: tx(f.note),
      })),
      ...(decision ? [{ date: decision.decidedAt, key: 'decision', title: t('Clinician decision', 'قرار الطبيب'), detail: decision.nextStep }] : []),
    ];
    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [c, decision, t, tx]);

  const stopped = run.outcome.route === 'stopped';

  return (
    <>
      <PageHead title={t('Patient monitoring', 'متابعة المريض')}>
        {t('Dated observations and concerns brought together for one person. This updates when opened. There is no continuous sensor feed, background notification or automatic care action.', 'ملاحظات ومخاوف مؤرخة مجمعة لشخص واحد. يُحدّث هذا عند الفتح. لا توجد تغذية مستمرة من أجهزة الاستشعار أو إشعار في الخلفية أو إجراء رعاية تلقائي.')}
      </PageHead>

      <PatientBanner />

      {stopped ? (
        <div className="notice notice-stop">{tx(run.outcome.reason)}</div>
      ) : (
        <>
          <p className="muted small">{t('As of', 'حتى')} <span className="num">{asOf}</span>{latest && <> · {t('latest encounter', 'آخر زيارة')} <span className="num">{latest.date}</span></>}</p>

          <nav className="anchor-nav no-print" aria-label={t('Sections', 'الأقسام')}>
            <a href="#m-overview" onClick={(e) => { e.preventDefault(); document.getElementById('m-overview')?.scrollIntoView(); }}>{t('Overview', 'نظرة عامة')}</a>
            <a href="#m-change" onClick={(e) => { e.preventDefault(); document.getElementById('m-change')?.scrollIntoView(); }}>{t('Change', 'التغيّر')}</a>
            <a href="#m-priorities" onClick={(e) => { e.preventDefault(); document.getElementById('m-priorities')?.scrollIntoView(); }}>{t('Review priorities', 'أولويات المراجعة')}</a>
            <a href="#m-timeline" onClick={(e) => { e.preventDefault(); document.getElementById('m-timeline')?.scrollIntoView(); }}>{t('Timeline', 'الخط الزمني')}</a>
            <a href="#m-habits" onClick={(e) => { e.preventDefault(); document.getElementById('m-habits')?.scrollIntoView(); }}>{t('Habits', 'العادات', 'Kebiasaan')}</a>
            <a href="#m-evidence" onClick={(e) => { e.preventDefault(); document.getElementById('m-evidence')?.scrollIntoView(); }}>{t('Evidence', 'الأدلة')}</a>
          </nav>

          <section id="m-overview" className="stack">
            <h2>{t('See the result. Keep the context.', 'انظر إلى النتيجة، واحتفظ بالسياق.')}</h2>
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 20 }}>
              <div>
                <p className="sub">{t('Latest recorded task result', 'آخر نتيجة مهمة مسجلة')}</p>
                <p className="num" style={{ fontSize: '2.3rem', fontWeight: 600, lineHeight: 1.2, color: 'var(--primary-dark)' }}>{latest ? `${latest.score} / 10` : t('None yet', 'لا يوجد بعد')}</p>
                <p className="small muted">{tx(c.concern)}</p>
              </div>
              <div>
                <h3>{t('Read the result in context', 'اقرأ النتيجة في سياقها')}</h3>
                <p className="small muted">{t('Task observations, reported everyday function and unfinished follow-up belong together. This report does not establish the cause of a change.', 'تنتمي ملاحظات المهام والأداء اليومي المبلّغ عنه والمتابعة غير المكتملة معًا. لا يحدد هذا التقرير سبب التغيّر.')}</p>
              </div>
            </div>
            <div className="grid-4">
              <Metric label={t('Dated encounters', 'زيارات مؤرخة')} value={c.observations.length} detail={t('Patient-specific history', 'تاريخ خاص بالمريض')} />
              <Metric variant="tint" label={t('Signals awaiting review', 'إشارات بانتظار المراجعة')} value={awaiting.length} detail={t('Acknowledging is not resolving', 'الإقرار ليس حلًا')} />
              <Metric variant="dark" label={t('Outstanding follow-up tasks', 'مهام متابعة معلقة')} value={tasks.length} detail={t(`${overdue} overdue, administrative status`, `${overdue} متأخرة، حالة إدارية`, `${overdue} terlambat, status administratif`)} />
              <Metric label={t('Latest adjusted change', 'آخر تغيّر معدّل')} value={run.change ? fmtSigned(run.change.adjustedChange) : t('n/a', 'غير متاح')} detail={run.change ? t('Illustrative completion units', 'وحدات إكمال توضيحية') : t('No estimate. This is not zero.', 'لا تقدير. وهذا ليس صفرًا.')} />
            </div>
            <div className="notice notice-wait"><span className="strong">{t('What to review first: ', 'ما يُراجع أولًا: ')}</span>{tx(run.outcome.reason)}</div>
          </section>

          <section id="m-change" className="stack">
            <h2>{t('Two charts, two different questions', 'رسمان بيانيان وسؤالان مختلفان')}</h2>
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <ChartCard title={t('What was recorded at each encounter?', 'ما الذي سُجل في كل زيارة؟')}>
                <ObservationChart c={c} />
              </ChartCard>
              <ChartCard title={t('How did each calculation compare with baseline?', 'كيف قورن كل حساب بخط الأساس؟')}>
                <ChangeChart points={points} />
              </ChartCard>
            </div>
          </section>

          <section id="m-priorities" className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card">
              <h2>{t('Review priorities', 'أولويات المراجعة')}</h2>
              {flags.length === 0 && <p className="small muted">{t('No flags from the supplied information. This does not rule out a problem.', 'لا توجد إشارات من المعلومات الواردة. لا يستبعد هذا وجود مشكلة.')}</p>}
              {flags.map((f) => {
                const key = `${caseId}:${f.id}`;
                return (
                  <div key={f.id} className="row between" style={{ borderBottom: '1px solid #ece6db', paddingBottom: 10 }}>
                    <div className="grow">
                      <div className="row"><span className={`tag ${f.level === 'review' ? 'tag-wait' : 'tag-hold'}`}>{f.level === 'review' ? t('Review', 'مراجعة') : t('Watch', 'مراقبة')}</span><span className="small strong">{tx(f.title)}</span></div>
                      <p className="tiny muted">{t('Source: ', 'المصدر: ')}{tx(f.source)} · <span className="num">{f.date}</span></p>
                    </div>
                    {acks[key]
                      ? <span className="tag tag-none">{t('Acknowledged, still open', 'تم الإقرار، ما زال مفتوحًا')}</span>
                      : <button type="button" className="btn" onClick={() => ack(key)}>{t('Acknowledge', 'إقرار')}</button>}
                  </div>
                );
              })}
            </div>
            <div className="card">
              <h2>{t('Follow-up tasks', 'مهام المتابعة')}</h2>
              {tasks.length === 0 && <p className="small muted">{t('No tasks are open for this path.', 'لا توجد مهام مفتوحة لهذا المسار.')}</p>}
              {tasks.map((x) => (
                <div key={x.id} style={{ borderBottom: '1px solid #ece6db', paddingBottom: 10 }}>
                  <div className="row"><span className={`tag ${x.status === 'overdue' ? 'tag-stop' : 'tag-none'}`}>{x.status === 'overdue' ? t('Overdue', 'متأخرة') : t('Open', 'مفتوحة')}</span><span className="tiny muted">{t('Due', 'الاستحقاق')} <span className="num">{x.due}</span></span></div>
                  <p className="small">{tx(x.title)}</p>
                </div>
              ))}
              {tasks.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row no-print">
                    <button type="button" className="btn" onClick={exportCalendar}>{t('Add to calendar (.ics)', 'إضافة إلى التقويم (.ics)', 'Tambahkan ke kalender (.ics)')}</button>
                  </div>
                  <p className="tiny muted">{t(
                    'Import the file into Google Calendar (Settings, then Import), Outlook or Apple Calendar. Each entry holds only the patient ID and the task type, with no name or clinical detail.',
                    'استورد الملف إلى تقويم Google (الإعدادات ثم الاستيراد) أو Outlook أو تقويم Apple. يحتوي كل إدخال على معرّف المريض ونوع المهمة فقط، دون اسم أو تفاصيل سريرية.',
                    'Impor file ke Google Calendar (Setelan, lalu Impor), Outlook, atau Apple Calendar. Setiap entri hanya berisi ID pasien dan jenis tugas, tanpa nama atau detail klinis.',
                  )}</p>
                </div>
              )}
            </div>
          </section>

          <HabitsSection />

          <section id="m-timeline" className="card">
            <h2>{t('Timeline', 'الخط الزمني')}</h2>
            <div className="table-wrap">
              <table>
                <tbody>
                  {timeline.map((e) => (
                    <tr key={e.key}><td className="num small" style={{ whiteSpace: 'nowrap' }}>{e.date}</td><td className="strong small">{e.title}</td><td className="small muted">{e.detail}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="m-evidence" className="card">
            <h2>{t('Evidence', 'الأدلة')}</h2>
            <ul className="plain small">
              {SOURCES.filter((s) => run.contributors.some((k) => k.sources.includes(s.id))).map((s) => (
                <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer"><span className="mono">{s.id}</span></a> {tx(s.use)}</li>
              ))}
            </ul>
            {run.contributors.length === 0 && <p className="small muted">{t('No contributor sources apply to this path yet.', 'لا تنطبق مصادر عوامل على هذا المسار بعد.')}</p>}
          </section>
        </>
      )}
    </>
  );
}
