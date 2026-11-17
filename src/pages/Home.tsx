import { useMemo, useState } from 'react';
import { CASES } from '../data/cases';
import { buildQueue, GROUP_ORDER, type QueueGroup } from '../engine/queue';
import { fmtSigned, fmt } from '../engine/scoring';
import { useApp } from '../store';
import { PageHead } from '../components/ui';

const GROUP_LABEL: Record<QueueGroup, { en: string; ar: string }> = {
  urgent: { en: 'Urgent: hand off now', ar: 'عاجل: التحويل الآن' },
  signoff: { en: 'Needs a doctor\'s sign-off', ar: 'تحتاج إلى توقيع الطبيب' },
  repeat: { en: 'Repeat the check', ar: 'إعادة الفحص' },
  held: { en: 'Held: no fair number yet', ar: 'مُعلّق: لا رقم منصف بعد' },
  routine: { en: 'Routine', ar: 'روتيني' },
  done: { en: 'Signed off, in follow-up', ar: 'موقّع، قيد المتابعة' },
  stopped: { en: 'No permission', ar: 'لا إذن' },
};

const GROUP_TAG: Record<QueueGroup, string> = {
  urgent: 'tag-stop', signoff: 'tag-wait', repeat: 'tag-wait', held: 'tag-hold', routine: 'tag-pass', done: 'tag-none', stopped: 'tag-stop',
};

export function Home() {
  const { session, runFor, decisions, setCaseId, go, t, tx } = useApp();
  const role = session?.role ?? 'nurse';
  const [filter, setFilter] = useState<QueueGroup | 'all'>('all');
  const queue = useMemo(
    () => buildQueue(CASES, runFor, (id) => decisions[id] ?? null, role),
    [runFor, decisions, role],
  );
  const counts = GROUP_ORDER.map((g) => ({ g, n: queue.filter((q) => q.group === g).length })).filter((x) => x.n > 0);
  const visible = filter === 'all' ? queue : queue.filter((q) => q.group === filter);
  const groups = GROUP_ORDER.filter((g) => visible.some((q) => q.group === g));

  const open = (id: string, page: Parameters<typeof go>[0]) => {
    setCaseId(id);
    go(page);
  };

  return (
    <>
      <PageHead title={t('Patient queue', 'قائمة المرضى')}>
        {role === 'doctor'
          ? t('Ordered by who needs a person first. Your next action is on each row, and only a doctor can sign off a care route.', 'مرتبة حسب من يحتاج إلى شخص أولًا. إجراؤك التالي في كل صف، ويستطيع الطبيب فقط توقيع مسار الرعاية.')
          : t('Ordered by who needs a person first. Your next action is on each row: give the check, record the context, and prepare the review for a doctor.', 'مرتبة حسب من يحتاج إلى شخص أولًا. إجراؤك التالي في كل صف: أجرِ الفحص وسجل السياق وأعدّ المراجعة للطبيب.')}
      </PageHead>

      <div className="segmented" role="group" aria-label={t('Filter the queue', 'تصفية القائمة')}>
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('All', 'الكل')} <span className="num">{queue.length}</span></button>
        {counts.map(({ g, n }) => (
          <button key={g} type="button" aria-pressed={filter === g} onClick={() => setFilter(g)}>{tx(GROUP_LABEL[g]).split(':')[0]} <span className="num">{n}</span></button>
        ))}
      </div>

      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="queue">
            <thead>
              <tr>
                <th>{t('Patient', 'المريض')}</th>
                <th>{t('Why they are here', 'سبب وجودهم هنا')}</th>
                <th>{t('Change from own baseline', 'التغيّر عن خط الأساس')}</th>
                <th>{t('Last seen', 'آخر زيارة')}</th>
                <th>{t('Your next action', 'إجراؤك التالي')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((g) => [
                <tr key={`g-${g}`} className="queue-group"><td colSpan={5}>{tx(GROUP_LABEL[g])}</td></tr>,
                ...visible.filter((q) => q.group === g).map((q) => (
                  <tr key={q.c.id} onClick={() => open(q.c.id, 'workspace')}>
                    <td>
                      <div className="strong"><bdi dir="ltr">{q.c.name}, {q.c.age}</bdi></div>
                      <div className="tiny muted mono">{q.c.id}</div>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div className="small strong">{tx(q.c.concern)}</div>
                      <div className="small muted">{tx(q.run.outcome.reason)}</div>
                    </td>
                    <td>
                      {q.run.change
                        ? <><div className="num strong">{fmtSigned(q.run.change.adjustedChange)}</div><div className="tiny muted num">z {fmt(q.run.change.z)}</div></>
                        : <span className="small muted"><em>{t('No estimate', 'لا تقدير')}</em></span>}
                    </td>
                    <td className="num small">{q.lastSeen ?? t('Not seen', 'لم تتم زيارته')}</td>
                    <td>
                      <button
                        type="button"
                        className={`btn ${q.group === 'urgent' ? 'btn-primary' : q.group === 'signoff' && role === 'doctor' ? 'btn-human' : ''}`}
                        onClick={(e) => { e.stopPropagation(); open(q.c.id, q.action.page); }}
                      >{tx(q.action.label)}</button>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </section>

      <p className="small muted">
        {t('All eight patients are fictional, and they exist to show each path. Open the demo walkthrough in the top bar for a two-minute tour.', 'جميع المرضى الثمانية خياليون، وهم موجودون لعرض كل مسار. افتح جولة العرض في الشريط العلوي لجولة مدتها دقيقتان.')}
        {' '}
        <span className={`tag ${GROUP_TAG.signoff}`} style={{ display: 'inline-flex' }}>{t('Violet marks a decision for a person', 'البنفسجي يشير إلى قرار لشخص')}</span>
      </p>
    </>
  );
}
