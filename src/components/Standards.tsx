import { useState } from 'react';
import { today, useApp } from '../store';
import { DOMAINS, INSTRUMENTS, TIERS, TIER_IN_APP, resultProblems, type Coverage, type InstrumentId, type InstrumentResult } from '../engine/instruments';
import { SourceRefs } from './ui';

/** Where the brief check sits, what it covers, and where a validated instrument result is recorded. */
export function StandardsSection() {
  const { t, tx, caseId } = useApp();
  const coverageLabel: Record<Coverage, { text: string; cls: string }> = {
    brief: { text: t('This check', 'هذا الفحص', 'Cek ini'), cls: 'tag-pass' },
    tier2: { text: t('Tier 2', 'المستوى 2', 'Tingkat 2'), cls: 'tag-wait' },
    tier3: { text: t('Tier 3', 'المستوى 3', 'Tingkat 3'), cls: 'tag-none' },
  };
  return (
    <section className="card stack-lg" aria-labelledby="standards-title">
      <div className="stack">
        <h2 id="standards-title">{t('How this check fits international practice', 'كيف يتوافق هذا الفحص مع الممارسة الدولية', 'Posisi cek ini dalam praktik internasional')}</h2>
        <p className="small muted" style={{ maxWidth: '80ch' }}>{t(
          'Guidelines outside specialist services ask for a brief, validated, structured tool, not a long one. More items do not make a tool valid. Validation in the local language and population does. This check is tier 1: it follows change in one person over time and decides who moves on to tier 2.',
          'تطلب الإرشادات خارج الخدمات المتخصصة أداة قصيرة ومعتمدة ومنظمة، لا أداة طويلة. كثرة البنود لا تجعل الأداة معتمدة، بل التحقق منها بلغة السكان المحليين وفيهم. هذا الفحص هو المستوى 1: يتابع التغيّر لدى الشخص نفسه عبر الزمن ويحدد من ينتقل إلى المستوى 2.',
          'Pedoman untuk layanan non-spesialis meminta alat singkat, tervalidasi, dan terstruktur, bukan alat yang panjang. Jumlah item yang banyak tidak membuat alat menjadi valid. Yang membuatnya valid adalah validasi dalam bahasa dan populasi setempat. Cek ini adalah tingkat 1: mengikuti perubahan pada satu orang dari waktu ke waktu dan menentukan siapa yang lanjut ke tingkat 2.',
        )} <SourceRefs ids={['S17', 'S20']} /></p>
      </div>

      <ol className="tiers">
        {TIERS.map((tier) => (
          <li key={tier.n} className={`tier ${tier.here ? 'is-here' : ''}`}>
            <span className="tier-n num" aria-hidden="true">{tier.n}</span>
            <div className="stack" style={{ gap: 4 }}>
              <span className="strong">{t('Tier', 'المستوى', 'Tingkat')} {tier.n}: {tx(tier.title)}{tier.here && <span className="tag tag-pass" style={{ marginInlineStart: 8 }}>{t('You are here', 'أنت هنا', 'Posisi Anda')}</span>}</span>
              <span className="small muted">{tx(tier.body)}</span>
              <span className="small"><span className="strong">{t('In this app:', 'في هذا التطبيق:', 'Di aplikasi ini:')}</span> {tx(TIER_IN_APP[tier.n])}</span>
              {tier.n === 2 && (
                <button type="button" className="link-btn" onClick={() => document.getElementById('tier2-form')?.scrollIntoView({ block: 'start' })}>
                  {t('Go to the tier 2 result form', 'الانتقال إلى نموذج نتيجة المستوى 2', 'Ke formulir hasil tingkat 2')}
                </button>
              )}
              <SourceRefs ids={tier.sources} />
            </div>
          </li>
        ))}
      </ol>

      <div className="stack">
        <h3>{t('What each part covers', 'ما يغطيه كل جزء', 'Cakupan tiap bagian')}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Domain', 'المجال', 'Ranah')}</th><th>{t('How it is assessed', 'كيف يُقيَّم', 'Cara dinilai')}</th><th>{t('Where', 'أين', 'Di mana')}</th></tr></thead>
            <tbody>{DOMAINS.map((d) => (
              <tr key={d.name.en}>
                <td className="strong">{tx(d.name)}</td>
                <td>{tx(d.task)}</td>
                <td><span className={`tag ${coverageLabel[d.coverage].cls}`}>{coverageLabel[d.coverage].text}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="tiny muted">{t(
          'The four tasks are original and unvalidated. Their part in the pathway is to measure change against the person\'s own baseline, not to grade a single visit.',
          'المهام الأربع أصلية وغير معتمدة. دورها في المسار قياس التغيّر مقارنة بخط أساس الشخص نفسه، لا تقييم زيارة واحدة.',
          'Keempat tugas ini orisinal dan belum divalidasi. Perannya dalam alur adalah mengukur perubahan terhadap baseline orang itu sendiri, bukan menilai satu kunjungan.',
        )}</p>
      </div>

      <InstrumentForm key={caseId} />
    </section>
  );
}

function InstrumentForm() {
  const { t, tx, currentCase: c, caseId, instruments, setInstrument, session } = useApp();
  const existing = instruments[caseId];
  const blank = (): InstrumentResult => ({
    instrument: 'minicog', score: Number.NaN, date: today(), version: '', reading: 'ok',
    givenBy: session?.name ?? '', trained: false,
  });
  const [draft, setDraft] = useState<InstrumentResult>(existing ?? blank);
  const [tried, setTried] = useState(false);
  const [saved, setSaved] = useState(false);
  const ins = INSTRUMENTS[draft.instrument];
  const problems = resultProblems(draft, today());
  const set = (patch: Partial<InstrumentResult>) => { setDraft({ ...draft, ...patch }); setSaved(false); };
  const show = (p: string) => tried && problems.includes(p);

  const save = () => {
    setTried(true);
    if (problems.length || !c.consent.access) return;
    setInstrument(caseId, { ...draft, version: draft.version.trim(), givenBy: draft.givenBy.trim() || (session?.name ?? '') });
    setSaved(true);
  };

  return (
    <div className="stack">
      <h3 id="tier2-form">{t('Record a tier 2 result', 'تسجيل نتيجة المستوى 2', 'Catat hasil tingkat 2')}</h3>
      <p className="small muted">{t(
        `For ${c.name}. Give the instrument on its own licensed form, then enter the total here. The app keeps the score, the version and your reading. It applies no cut-off, because published cut-offs come from other populations and change with language and schooling.`,
        `لـ${c.name}. أجرِ الأداة على نموذجها المرخّص، ثم أدخل المجموع هنا. يحفظ التطبيق الدرجة والإصدار وقراءتك. لا يطبق أي عتبة، لأن العتبات المنشورة جاءت من مجتمعات أخرى وتتغير مع اللغة والتعليم.`,
        `Untuk ${c.name}. Berikan instrumen pada formulir berlisensinya, lalu masukkan totalnya di sini. Aplikasi menyimpan skor, versi, dan pembacaan Anda. Aplikasi tidak menerapkan batas skor, karena batas yang dipublikasikan berasal dari populasi lain dan berubah menurut bahasa dan pendidikan.`,
      )} <SourceRefs ids={['S18']} /></p>

      <div className="grid-3">
        <label className="field">
          {t('Instrument', 'الأداة', 'Instrumen')}
          <select value={draft.instrument} onChange={(e) => set({ instrument: e.target.value as InstrumentId, score: Number.NaN })}>
            {Object.values(INSTRUMENTS).map((i) => <option key={i.id} value={i.id}>{i.name} (0 {t('to', 'إلى', 'sampai')} {i.max})</option>)}
          </select>
        </label>
        <label className="field">
          {t('Total score', 'المجموع', 'Skor total')} (0 {t('to', 'إلى', 'sampai')} {ins.max})
          <input
            type="number" inputMode="numeric" min={0} max={ins.max} step={1}
            value={Number.isNaN(draft.score) ? '' : draft.score}
            aria-invalid={show('score')}
            onChange={(e) => set({ score: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
          />
          {show('score') && <span className="field-error">{t(`Enter a whole number from 0 to ${ins.max}.`, `أدخل عددًا صحيحًا من 0 إلى ${ins.max}.`, `Masukkan bilangan bulat dari 0 sampai ${ins.max}.`)}</span>}
        </label>
        <label className="field">
          {t('Date given', 'تاريخ الإجراء', 'Tanggal diberikan')}
          <input type="date" value={draft.date} max={today()} aria-invalid={show('date')} onChange={(e) => set({ date: e.target.value })} />
          {show('date') && <span className="field-error">{t('Enter a date that is not in the future.', 'أدخل تاريخًا ليس في المستقبل.', 'Masukkan tanggal yang tidak di masa depan.')}</span>}
        </label>
      </div>
      <p className="tiny muted">{tx(ins.about)} <SourceRefs ids={ins.sources} /></p>

      <div className="grid-2">
        <label className="field">
          {t('Version and language on the form', 'الإصدار واللغة على النموذج', 'Versi dan bahasa pada formulir')}
          <input type="text" value={draft.version} placeholder={t('For example: Arabic, version 8.1', 'مثال: العربية، الإصدار 8.1', 'Contoh: Arab, versi 8.1')} aria-invalid={show('version')} onChange={(e) => set({ version: e.target.value })} />
          {show('version') && <span className="field-error">{t('Enter the version and language, so later results can be compared.', 'أدخل الإصدار واللغة، لتمكن مقارنة النتائج اللاحقة.', 'Masukkan versi dan bahasa, supaya hasil berikutnya bisa dibandingkan.')}</span>}
        </label>
        <label className="field">
          {t('Given by', 'أجراه', 'Diberikan oleh')}
          <input type="text" value={draft.givenBy} onChange={(e) => set({ givenBy: e.target.value })} />
        </label>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
        <legend className="small strong" style={{ marginBottom: 6 }}>{t('Your reading of this result', 'قراءتك لهذه النتيجة', 'Pembacaan Anda atas hasil ini')}</legend>
        <div className="segmented" role="group">
          <button type="button" aria-pressed={draft.reading === 'ok'} onClick={() => set({ reading: 'ok' })}>{t('As expected for this person', 'كما هو متوقع لهذا الشخص', 'Sesuai harapan untuk orang ini')}</button>
          <button type="button" aria-pressed={draft.reading === 'attention'} onClick={() => set({ reading: 'attention' })}>{t('Needs attention', 'يحتاج إلى انتباه', 'Perlu perhatian')}</button>
        </div>
        <span className="tiny muted">{t('Read it with the person\'s language, schooling and the conditions on the day.', 'اقرأها مع مراعاة لغة الشخص وتعليمه وظروف اليوم.', 'Baca dengan mempertimbangkan bahasa, pendidikan, dan kondisi orang itu pada hari tersebut.')}</span>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={draft.trained} aria-invalid={show('trained')} onChange={(e) => set({ trained: e.target.checked })} />
        {t('I am trained to give this instrument, and it was given on its own licensed form', 'أنا مدرّب على إجراء هذه الأداة، وقد أُجريت على نموذجها المرخّص', 'Saya terlatih memberikan instrumen ini, dan instrumen diberikan pada formulir berlisensinya')}
      </label>
      {show('trained') && <span className="field-error">{t('Confirm training and the licensed form before saving.', 'أكّد التدريب والنموذج المرخّص قبل الحفظ.', 'Konfirmasi pelatihan dan formulir berlisensi sebelum menyimpan.')}</span>}

      {!c.consent.access && <div className="notice notice-stop">{t('Permission is off for this case, so the result cannot be saved to it.', 'الإذن معطل لهذه الحالة، فلا يمكن حفظ النتيجة فيها.')}</div>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!c.consent.access} onClick={save}>{t('Save to the patient\'s context', 'الحفظ في سياق المريض', 'Simpan ke konteks pasien')}</button>
      </div>
      {saved && <div className="notice notice-pass" role="status">{t(
        'Saved. It replaces the programme screen in the patient summary, is exported with its LOINC code, and clears any earlier sign-off so a doctor sees it.',
        'حُفظت. تحل محل فحص البرنامج في ملخص المريض، وتُصدَّر برمز LOINC الخاص بها، وتلغي أي توقيع سابق ليراها الطبيب.',
        'Tersimpan. Hasil ini menggantikan skrining program di ringkasan pasien, diekspor dengan kode LOINC-nya, dan menghapus tanda tangan sebelumnya agar dokter melihatnya.',
      )}</div>}
      {!saved && existing && <p className="tiny muted">{t('Last saved', 'آخر حفظ', 'Terakhir disimpan')}: {INSTRUMENTS[existing.instrument].name} <span className="num">{existing.score}/{INSTRUMENTS[existing.instrument].max}</span>, <span className="num">{existing.date}</span></p>}
    </div>
  );
}
