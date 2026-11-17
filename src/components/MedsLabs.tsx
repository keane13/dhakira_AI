import { useState } from 'react';
import { today, useApp } from '../store';
import {
  LAB_TESTS, SOURCE_LABEL, labFlag, labLine, labProblems, labTest, medicineProblems, medicineSignals, rangeText,
  type Flag, type LabId, type LabResult, type MedicineEntry,
} from '../engine/medslabs';
import { SourceRefs } from './ui';

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const toNumber = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));
const toBound = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Entering is allowed only with access and clinical-record permission. */
function useCanEnter() {
  const { currentCase: c } = useApp();
  return c.consent.access && c.consent.clinical;
}

export function MedicinesCard() {
  const { t, tx, caseId, medicines, addMedicine, removeMedicine, session, currentCase: c } = useApp();
  const list = medicines[caseId] ?? [];
  const canEnter = useCanEnter();
  const blank = (): MedicineEntry => ({
    id: '', name: '', dose: '', source: 'patient', confirmed: false, withoutPrescription: false,
    anticholinergic: false, cnsActive: false, date: today(), enteredBy: session?.name ?? '',
  });
  const [draft, setDraft] = useState<MedicineEntry>(blank);
  const [tried, setTried] = useState(false);
  const problems = medicineProblems(draft);
  const set = (patch: Partial<MedicineEntry>) => setDraft({ ...draft, ...patch });
  const signals = medicineSignals(list);

  const add = () => {
    setTried(true);
    if (problems.length || !canEnter) return;
    addMedicine(caseId, { ...draft, id: newId('med'), name: draft.name.trim(), dose: draft.dose.trim(), date: today(), enteredBy: session?.name ?? '' });
    setDraft(blank());
    setTried(false);
  };

  return (
    <section className="card" id="medicines" aria-labelledby="medicines-title">
      <div>
        <h2 id="medicines-title">{t('Medicines', 'الأدوية', 'Obat')}</h2>
        <p className="muted small">{t(
          `Everything ${c.name} takes, including medicines bought without a prescription and herbal products. The list replaces the summary in the risk context and feeds the medicine row of the work-up.`,
          `كل ما يتناوله ${c.name}، بما في ذلك الأدوية المشتراة دون وصفة والمنتجات العشبية. تحل القائمة محل الملخص في سياق الخطر وتغذي بند الأدوية في الفحوص.`,
          `Semua yang dikonsumsi ${c.name}, termasuk obat tanpa resep dan produk herbal. Daftar ini menggantikan ringkasan di konteks risiko dan mengisi baris obat pada pemeriksaan penyebab.`,
        )}</p>
      </div>

      {signals.map((s) => (
        <div key={s.key} className={`notice ${s.key === 'otc' ? 'notice-info' : 'notice-hold'}`}>{tx(s.text)} <SourceRefs ids={s.sources} /></div>
      ))}

      {list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Medicine', 'الدواء', 'Obat')}</th><th>{t('Dose and timing', 'الجرعة والتوقيت', 'Dosis dan waktu')}</th><th>{t('Source', 'المصدر', 'Sumber')}</th><th>{t('Marked', 'العلامات', 'Tanda')}</th><th /></tr></thead>
            <tbody>{list.map((m) => (
              <tr key={m.id}>
                <td className="strong">{m.name}</td>
                <td>{m.dose}</td>
                <td className="small">{tx(SOURCE_LABEL[m.source])}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <span className={`tag ${m.confirmed ? 'tag-pass' : 'tag-hold'}`}>{m.confirmed ? t('Confirmed', 'مؤكد', 'Terkonfirmasi') : t('Not confirmed', 'غير مؤكد', 'Belum dikonfirmasi')}</span>
                    {m.withoutPrescription && <span className="tag tag-none">{t('No prescription', 'دون وصفة', 'Tanpa resep')}</span>}
                    {m.anticholinergic && <span className="tag tag-wait">{t('Anticholinergic', 'مضاد للكولين', 'Antikolinergik')}</span>}
                    {m.cnsActive && <span className="tag tag-wait">{t('Acts on the brain', 'يؤثر في الدماغ', 'Bekerja pada otak')}</span>}
                  </div>
                </td>
                <td><button type="button" className="btn" disabled={!canEnter} onClick={() => removeMedicine(caseId, m.id)} aria-label={`${t('Remove', 'إزالة', 'Hapus')} ${m.name}`}>{t('Remove', 'إزالة', 'Hapus')}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="strong" style={{ marginBottom: 8 }}>{t('Add a medicine', 'إضافة دواء', 'Tambah obat')}</legend>
        <div className="grid-3">
          <label className="field">
            {t('Name', 'الاسم', 'Nama')}
            <input type="text" value={draft.name} aria-invalid={tried && problems.includes('name')} placeholder={t('As on the packet', 'كما على العبوة', 'Seperti di kemasan')} onChange={(e) => set({ name: e.target.value })} />
            {tried && problems.includes('name') && <span className="field-error">{t('Enter the medicine name.', 'أدخل اسم الدواء.', 'Masukkan nama obat.')}</span>}
          </label>
          <label className="field">
            {t('Dose and timing', 'الجرعة والتوقيت', 'Dosis dan waktu')}
            <input type="text" value={draft.dose} aria-invalid={tried && problems.includes('dose')} placeholder={t('For example: 25 mg at night', 'مثال: 25 ملغ ليلًا', 'Contoh: 25 mg malam hari')} onChange={(e) => set({ dose: e.target.value })} />
            {tried && problems.includes('dose') && <span className="field-error">{t('Enter the dose and when it is taken, or "not known".', 'أدخل الجرعة وموعد تناولها، أو "غير معروف".', 'Masukkan dosis dan waktu minum, atau "tidak diketahui".')}</span>}
          </label>
          <label className="field">
            {t('Who told us', 'مصدر المعلومة', 'Sumber informasi')}
            <select value={draft.source} onChange={(e) => set({ source: e.target.value as MedicineEntry['source'] })}>
              {(Object.keys(SOURCE_LABEL) as MedicineEntry['source'][]).map((s) => <option key={s} value={s}>{tx(SOURCE_LABEL[s])}</option>)}
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="check"><input type="checkbox" checked={draft.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} />{t('Confirmed on a prescription, pharmacy record or the packet', 'مؤكد في وصفة أو سجل صيدلية أو على العبوة', 'Dikonfirmasi dari resep, catatan apotek, atau kemasan')}</label>
          <label className="check"><input type="checkbox" checked={draft.withoutPrescription} onChange={(e) => set({ withoutPrescription: e.target.checked })} />{t('Bought without a prescription', 'اشتُري دون وصفة', 'Dibeli tanpa resep')}</label>
          <label className="check"><input type="checkbox" checked={draft.anticholinergic} onChange={(e) => set({ anticholinergic: e.target.checked })} />{t('Anticholinergic, checked by a clinician or pharmacist', 'مضاد للكولين، بعد تحقق طبيب أو صيدلي', 'Antikolinergik, sudah dicek klinisi atau apoteker')}</label>
          <label className="check"><input type="checkbox" checked={draft.cnsActive} onChange={(e) => set({ cnsActive: e.target.checked })} />{t('Acts on the brain (CNS-active), checked by a clinician or pharmacist', 'يؤثر في الدماغ، بعد تحقق طبيب أو صيدلي', 'Bekerja pada otak (aktif SSP), sudah dicek klinisi atau apoteker')}</label>
        </div>
        <p className="tiny muted">{t(
          'The app has no drug list and does not judge single medicines. CNS-active classes in Beers 2023 include benzodiazepines, antipsychotics, opioids and skeletal muscle relaxants. Beers 2023 was written for the United States and needs local adaptation.',
          'لا يحتوي التطبيق على قائمة أدوية ولا يحكم على دواء منفرد. تشمل فئات الأدوية المؤثرة في الدماغ في Beers 2023 البنزوديازيبينات ومضادات الذهان والمواد الأفيونية ومرخيات العضلات الهيكلية. كُتبت معايير Beers 2023 للولايات المتحدة وتحتاج إلى تكييف محلي.',
          'Aplikasi tidak memiliki daftar obat dan tidak menilai obat satu per satu. Golongan yang bekerja pada otak dalam Beers 2023 antara lain benzodiazepin, antipsikotik, opioid, dan pelemas otot rangka. Beers 2023 ditulis untuk Amerika Serikat dan perlu adaptasi lokal.',
        )} <SourceRefs ids={['S21']} /></p>
        {!canEnter && <div className="notice notice-stop">{t('Clinical-record permission is off for this patient, so medicines cannot be entered.', 'إذن السجل السريري معطل لهذا المريض، فلا يمكن إدخال الأدوية.', 'Izin rekam klinis untuk pasien ini nonaktif, jadi obat tidak bisa dimasukkan.')}</div>}
        <div className="row"><button type="button" className="btn btn-primary" disabled={!canEnter} onClick={add}>{t('Add medicine', 'إضافة الدواء', 'Tambah obat')}</button></div>
      </fieldset>
    </section>
  );
}

const FLAG_CLASS: Record<Flag, string> = { L: 'tag-hold', H: 'tag-hold', N: 'tag-pass' };

export function LabsCard() {
  const { t, tx, caseId, labs, addLab, removeLab, session } = useApp();
  const list = [...(labs[caseId] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const canEnter = useCanEnter();
  const [test, setTest] = useState<LabId>('b12');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [tried, setTried] = useState(false);
  const unit = labTest(test).unit;
  const draft: LabResult = { id: '', test, value: toNumber(value), date, low: toBound(low), high: toBound(high), enteredBy: session?.name ?? '' };
  const problems = labProblems(draft, today());
  const show = (p: string) => tried && problems.includes(p);
  const flagLabel: Record<Flag, string> = {
    L: t('Low', 'منخفض', 'Rendah'), H: t('High', 'مرتفع', 'Tinggi'), N: t('In range', 'ضمن النطاق', 'Dalam rentang'),
  };

  const add = () => {
    setTried(true);
    if (problems.length || !canEnter) return;
    addLab(caseId, { ...draft, id: newId('lab') });
    setValue(''); setLow(''); setHigh(''); setTried(false);
  };

  return (
    <section className="card" id="labs" aria-labelledby="labs-title">
      <div>
        <h2 id="labs-title">{t('Lab results', 'نتائج المختبر', 'Hasil lab')}</h2>
        <p className="muted small">{t(
          'Blood tests used to look for reversible causes before reading a change as lasting. Enter the value and the reference range printed on the lab report. The app ships no ranges of its own, because they differ by laboratory and method.',
          'فحوص دم تُستخدم للبحث عن أسباب قابلة للعلاج قبل اعتبار التغيّر دائمًا. أدخل القيمة والنطاق المرجعي المطبوع على تقرير المختبر. لا يحمل التطبيق نطاقات خاصة به، لأنها تختلف حسب المختبر والطريقة.',
          'Tes darah untuk mencari penyebab yang bisa dipulihkan sebelum menyimpulkan perubahan itu menetap. Masukkan nilai dan rentang rujukan yang tercetak di laporan lab. Aplikasi tidak membawa rentang sendiri, karena rentang berbeda antar laboratorium dan metode.',
        )} <SourceRefs ids={['S17', 'S14']} /></p>
      </div>

      {list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Test', 'الفحص', 'Tes')}</th><th>{t('Result', 'النتيجة', 'Hasil')}</th><th>{t('Lab range', 'نطاق المختبر', 'Rentang lab')}</th><th>{t('Sample date', 'تاريخ العينة', 'Tanggal sampel')}</th><th /></tr></thead>
            <tbody>{list.map((r) => {
              const flag = labFlag(r);
              return (
                <tr key={r.id}>
                  <td className="strong">{tx(labTest(r.test).name)}</td>
                  <td><span className="num">{r.value} {labTest(r.test).unit}</span> <span className={`tag ${FLAG_CLASS[flag]}`}>{flagLabel[flag]}</span></td>
                  <td className="num small">{rangeText(r, labTest(r.test).unit)}</td>
                  <td className="num">{r.date}</td>
                  <td><button type="button" className="btn" disabled={!canEnter} onClick={() => removeLab(caseId, r.id)} aria-label={`${t('Remove', 'إزالة', 'Hapus')} ${tx(labTest(r.test).name)} ${r.date}`}>{t('Remove', 'إزالة', 'Hapus')}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="strong" style={{ marginBottom: 8 }}>{t('Add a result from a lab report', 'إضافة نتيجة من تقرير مختبر', 'Tambah hasil dari laporan lab')}</legend>
        <div className="grid-3">
          <label className="field">
            {t('Test', 'الفحص', 'Tes')}
            <select value={test} onChange={(e) => setTest(e.target.value as LabId)}>
              {LAB_TESTS.map((x) => <option key={x.id} value={x.id}>{tx(x.name)} ({x.unit})</option>)}
            </select>
          </label>
          <label className="field">
            {t('Result', 'النتيجة', 'Hasil')} ({unit})
            <input type="text" inputMode="decimal" value={value} aria-invalid={show('value')} onChange={(e) => setValue(e.target.value)} />
            {show('value') && <span className="field-error">{t('Enter a number, as on the report.', 'أدخل رقمًا كما في التقرير.', 'Masukkan angka seperti di laporan.')}</span>}
          </label>
          <label className="field">
            {t('Sample date', 'تاريخ العينة', 'Tanggal sampel')}
            <input type="date" value={date} max={today()} aria-invalid={show('date')} onChange={(e) => setDate(e.target.value)} />
            {show('date') && <span className="field-error">{t('Enter a date that is not in the future.', 'أدخل تاريخًا ليس في المستقبل.', 'Masukkan tanggal yang tidak di masa depan.')}</span>}
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            {t('Lab range, lower limit', 'نطاق المختبر، الحد الأدنى', 'Rentang lab, batas bawah')} ({unit})
            <input type="text" inputMode="decimal" value={low} aria-invalid={show('range')} onChange={(e) => setLow(e.target.value)} />
          </label>
          <label className="field">
            {t('Lab range, upper limit', 'نطاق المختبر، الحد الأعلى', 'Rentang lab, batas atas')} ({unit})
            <input type="text" inputMode="decimal" value={high} aria-invalid={show('range')} onChange={(e) => setHigh(e.target.value)} />
          </label>
        </div>
        {show('range') && <span className="field-error">{t('Enter at least one limit from the report. If both, the lower must be below the upper.', 'أدخل حدًا واحدًا على الأقل من التقرير. إذا أدخلت الاثنين، يجب أن يكون الأدنى أقل من الأعلى.', 'Masukkan minimal satu batas dari laporan. Jika keduanya, batas bawah harus lebih kecil dari batas atas.')}</span>}
        {!problems.length && <p className="small muted">{t('Preview', 'معاينة', 'Pratinjau')}: {tx(labTest(test).name)} {tx(labLine(draft))}</p>}
        {!canEnter && <div className="notice notice-stop">{t('Clinical-record permission is off for this patient, so results cannot be entered.', 'إذن السجل السريري معطل لهذا المريض، فلا يمكن إدخال النتائج.', 'Izin rekam klinis untuk pasien ini nonaktif, jadi hasil tidak bisa dimasukkan.')}</div>}
        <div className="row"><button type="button" className="btn btn-primary" disabled={!canEnter} onClick={add}>{t('Add result', 'إضافة النتيجة', 'Tambah hasil')}</button></div>
        <p className="tiny muted">{t('Adding or removing a result clears any earlier sign-off for this patient, so a doctor sees it.', 'تؤدي إضافة نتيجة أو إزالتها إلى إلغاء أي توقيع سابق لهذا المريض، ليراها الطبيب.', 'Menambah atau menghapus hasil akan menghapus tanda tangan sebelumnya untuk pasien ini, agar dokter melihatnya.')}</p>
      </fieldset>
    </section>
  );
}
