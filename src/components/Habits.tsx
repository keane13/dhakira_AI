import { useMemo, useState, type FormEvent } from 'react';
import { HABITS, habitSignals, validLog, visibleHabits, type HabitWeek } from '../engine/habits';
import { sourceById } from '../data/sources';
import { today, useApp } from '../store';
import { HabitChart } from './charts';

/** Habits a clinician can follow between visits. Context for the conversation, never a route change. */
export function HabitsSection() {
  const { t, tx, currentCase: c, caseId, habitLogs, addHabitLog } = useApp();
  const weeks = useMemo(() => visibleHabits(c, habitLogs[caseId] ?? []), [c, habitLogs, caseId]);
  const signals = useMemo(() => habitSignals(weeks), [weeks]);
  const [sleep, setSleep] = useState('');
  const [active, setActive] = useState('');
  const [social, setSocial] = useState('');
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const entry: Partial<HabitWeek> = { week: today(), sleepHours: num(sleep), activeMinutes: num(active), socialDays: num(social), source: 'reported' };
    const empty = entry.sleepHours === null && entry.activeMinutes === null && entry.socialDays === null;
    if (empty || !validLog(entry)) { setError(true); setSaved(false); return; }
    addHabitLog(caseId, entry);
    setError(false);
    setSaved(true);
    setSleep(''); setActive(''); setSocial('');
  };

  return (
    <section id="m-habits" className="stack">
      <div>
        <h2>{t('Brain-health habits', 'عادات صحة الدماغ', 'Kebiasaan kesehatan otak')}</h2>
        <p className="muted small">{t(
          'Weekly sleep and activity from an authorised wearable, and social contact reported to a nurse. These are modifiable risks to discuss. They do not change the proposed path.',
          'النوم والنشاط الأسبوعيان من جهاز قابل للارتداء مصرّح به، والتواصل الاجتماعي كما يُبلّغ للممرض. هذه مخاطر قابلة للتعديل للنقاش، ولا تغيّر المسار المقترح.',
          'Tidur dan aktivitas mingguan dari wearable yang diizinkan, serta kontak sosial yang dilaporkan ke perawat. Ini risiko yang bisa diubah untuk dibahas, dan tidak mengubah jalur usulan.',
        )}</p>
      </div>
      {!c.consent.wearable && (
        <div className="notice notice-hold">{t(
          'Wearable data is not authorised for this patient, so sleep and activity stay empty. Reported values can still be logged below.',
          'بيانات الجهاز القابل للارتداء غير مصرّح بها لهذا المريض، لذا يبقى النوم والنشاط فارغين. ويمكن تسجيل القيم المُبلّغ عنها أدناه.',
          'Data wearable tidak diizinkan untuk pasien ini, jadi tidur dan aktivitas tetap kosong. Nilai yang dilaporkan tetap bisa dicatat di bawah.',
        )}</div>
      )}
      {signals.length > 0 && (
        <div className="notice notice-wait">
          <span className="strong">{t('Worth discussing: ', 'تستحق النقاش: ', 'Perlu dibahas: ')}</span>
          {signals.map((s) => tx(s.text)).join(' · ')}
        </div>
      )}
      <div className="grid-3">
        {HABITS.map((h) => {
          const ref = h.reference;
          const src = ref ? sourceById(ref.source) : null;
          return (
            <div key={h.key} className="card card-tight">
              <h3>{tx(h.label)}</h3>
              <p className="tiny muted">{tx(h.unit)}</p>
              <HabitChart
                points={weeks.map((w) => ({ week: w.week, value: w[h.key] }))}
                max={h.max}
                reference={ref ? { value: ref.value, text: tx(ref.text) } : null}
                title={tx(h.label)}
                emptyText={t('No values yet, or not authorised. Empty is not zero.', 'لا قيم بعد، أو غير مصرّح بها. الفراغ ليس صفرًا.', 'Belum ada nilai, atau tidak diizinkan. Kosong bukan nol.')}
              />
              {src && <p className="tiny muted">{t('Reference: ', 'المرجع: ', 'Rujukan: ')}<a href={src.url} target="_blank" rel="noreferrer">{src.id}</a></p>}
            </div>
          );
        })}
      </div>
      <form className="card card-sand" onSubmit={submit} noValidate>
        <h3>{t('Log this week, as reported by the patient', 'تسجيل هذا الأسبوع كما يُبلّغ المريض', 'Catat minggu ini, sesuai laporan pasien')}</h3>
        <div className="grid-3">
          <label className="field">{t('Sleep per night (hours)', 'النوم في الليلة (ساعات)', 'Tidur per malam (jam)')}
            <input type="number" min={0} max={16} step={0.5} value={sleep} onChange={(e) => setSleep(e.target.value)} />
          </label>
          <label className="field">{t('Moderate activity (minutes this week)', 'النشاط المعتدل (دقائق هذا الأسبوع)', 'Aktivitas sedang (menit minggu ini)')}
            <input type="number" min={0} max={2000} step={10} value={active} onChange={(e) => setActive(e.target.value)} />
          </label>
          <label className="field">{t('Days with social contact (0 to 7)', 'أيام التواصل الاجتماعي (0 إلى 7)', 'Hari dengan kontak sosial (0 sampai 7)')}
            <input type="number" min={0} max={7} step={1} value={social} onChange={(e) => setSocial(e.target.value)} />
          </label>
        </div>
        {error && <p className="field-error" role="alert">{t('Enter at least one value, within the stated range.', 'أدخل قيمة واحدة على الأقل ضمن النطاق المذكور.', 'Isi minimal satu nilai, dalam rentang yang disebutkan.')}</p>}
        {saved && <p className="small" role="status">{t('Logged for this week. The charts now include it.', 'سُجّل لهذا الأسبوع. تتضمنه الرسوم الآن.', 'Tercatat untuk minggu ini. Grafik sudah memuatnya.')}</p>}
        <div className="row"><button type="submit" className="btn btn-primary">{t('Log this week', 'تسجيل هذا الأسبوع', 'Catat minggu ini')}</button></div>
      </form>
    </section>
  );
}
