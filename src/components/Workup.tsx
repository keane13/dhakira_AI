import { useMemo } from 'react';
import { STATUS_LABEL, summariseWorkup, workupRows, type WorkupStatus } from '../engine/workup';
import { today, useApp } from '../store';
import { workupEvidence } from '../engine/medslabs';
import { SourceRefs } from './ui';

const STATUS_CLASS: Record<WorkupStatus, string> = {
  not_started: 'tag-none', ordered: 'tag-wait', normal: 'tag-pass', abnormal: 'tag-hold', not_needed: 'tag-none',
};

export function useWorkup() {
  const { run, workup, caseId } = useApp();
  const rows = useMemo(() => workupRows(run, workup[caseId]), [run, workup, caseId]);
  return { rows, summary: summariseWorkup(rows) };
}

export function WorkupSummaryLine() {
  const { t } = useApp();
  const { summary } = useWorkup();
  return (
    <p className="small">
      <span className="strong">{t('Reversible-cause work-up: ', 'استبعاد الأسباب القابلة للعكس: ', 'Penelusuran penyebab yang bisa dipulihkan: ')}</span>
      <span className="num">{summary.open}</span> {t('open', 'مفتوحة', 'terbuka')} · <span className="num">{summary.ruledOut}</span> {t('ruled out', 'مستبعدة', 'disingkirkan')} · <span className="num">{summary.needsFollowUp}</span> {t('need follow-up', 'تحتاج إلى متابعة', 'perlu tindak lanjut')}
    </p>
  );
}

/** The clinician records what was checked. The page never names a cause or changes the path. */
export function WorkupCard() {
  const { t, tx, caseId, setWorkupEntry, session, labs, medicines } = useApp();
  const { rows, summary } = useWorkup();
  const evidenceFor = (id: string) => (id === 'meds' || id === 'b12' || id === 'thyroid' || id === 'glucose'
    ? workupEvidence(id, labs[caseId] ?? [], medicines[caseId] ?? [])
    : []);
  return (
    <section className="card" id="workup">
      <div>
        <h2>{t('Rule out reversible causes', 'استبعاد الأسباب القابلة للعكس', 'Singkirkan penyebab yang bisa dipulihkan')}</h2>
        <p className="muted small">{t(
          'Possible contributors to check before reading a change as lasting. Suggested items come from this patient\'s own context. What you record here is your finding: the tool does not decide a cause, and the proposed path does not change.',
          'عوامل محتملة يجب فحصها قبل اعتبار التغيّر دائمًا. تأتي البنود المقترحة من سياق هذا المريض. ما تسجله هنا هو نتيجتك: لا تحدد الأداة سببًا، ولا يتغيّر المسار المقترح.',
          'Kemungkinan faktor yang perlu dicek sebelum menyimpulkan perubahan itu menetap. Item yang diusulkan berasal dari konteks pasien ini sendiri. Yang Anda catat di sini adalah temuan Anda: alat ini tidak menentukan penyebab, dan jalur usulan tidak berubah.',
        )}</p>
      </div>
      <div className="row small">
        <span className="tag tag-wait">{summary.suggested} {t('suggested', 'مقترحة', 'diusulkan')}</span>
        <span className="tag tag-none">{summary.open} {t('open', 'مفتوحة', 'terbuka')}</span>
        <span className="tag tag-pass">{summary.ruledOut} {t('ruled out', 'مستبعدة', 'disingkirkan')}</span>
        <span className="tag tag-hold">{summary.needsFollowUp} {t('need follow-up', 'تحتاج إلى متابعة', 'perlu tindak lanjut')}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('Check', 'الفحص', 'Pemeriksaan')}</th>
              <th>{t('Why it matters', 'سبب أهميته', 'Mengapa penting')}</th>
              <th>{t('Status', 'الحالة', 'Status')}</th>
              <th>{t('Note', 'ملاحظة', 'Catatan')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="strong small">{tx(r.label)}</div>
                  {r.suggested && <span className="tag tag-wait">{t('Suggested for this patient', 'مقترح لهذا المريض', 'Diusulkan untuk pasien ini')}</span>}
                  {evidenceFor(r.id).length > 0 && (
                    <ul className="evidence-list tiny">
                      {evidenceFor(r.id).map((line) => <li key={line.en}>{tx(line)}</li>)}
                    </ul>
                  )}
                </td>
                <td className="small muted">{tx(r.why)} <SourceRefs ids={r.sources} /></td>
                <td style={{ minWidth: 190 }}>
                  <label className="field">
                    <span className="sr-only">{t('Status for ', 'حالة ', 'Status untuk ')}{tx(r.label)}</span>
                    <select
                      value={r.entry.status}
                      onChange={(e) => setWorkupEntry(caseId, r.id, { ...r.entry, status: e.target.value as WorkupStatus, date: today() })}
                    >
                      {(Object.keys(STATUS_LABEL) as WorkupStatus[]).map((s) => <option key={s} value={s}>{tx(STATUS_LABEL[s])}</option>)}
                    </select>
                  </label>
                  {r.entry.status !== 'not_started' && <span className={`tag ${STATUS_CLASS[r.entry.status]}`} style={{ marginTop: 4 }}>{r.entry.date}</span>}
                </td>
                <td style={{ minWidth: 180 }}>
                  <label className="field">
                    <span className="sr-only">{t('Note for ', 'ملاحظة لـ', 'Catatan untuk ')}{tx(r.label)}</span>
                    <input
                      type="text" value={r.entry.note} placeholder={t('Result or plan', 'النتيجة أو الخطة', 'Hasil atau rencana')}
                      onChange={(e) => setWorkupEntry(caseId, r.id, { ...r.entry, note: e.target.value, date: r.entry.date || today() })}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">{t('Recorded by ', 'سجّلها ', 'Dicatat oleh ')}{session?.name}. {t('Entries stay in this browser with the patient record.', 'تبقى الإدخالات في هذا المتصفح مع سجل المريض.', 'Catatan tersimpan di browser ini bersama rekam pasien.')}</p>
    </section>
  );
}
