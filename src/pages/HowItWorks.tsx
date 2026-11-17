import { useState } from 'react';
import { useApp } from '../store';
import { PageHead } from '../components/ui';

type Status = 'runs' | 'sim' | 'none';

const AGENTS: { stage: string; name: { en: string; ar: string }; does: { en: string; ar: string }; status: Status; today: { en: string; ar: string }; production: { en: string; ar: string } }[] = [
  { stage: '01-02', name: { en: 'Consent & Access, Safety Triage', ar: 'الموافقة والوصول، فرز السلامة' }, does: { en: 'Decide whether and how the case proceeds', ar: 'تقرر هل تستمر الحالة وكيف' }, status: 'runs', today: { en: 'Rules on fictional flags', ar: 'قواعد على إشارات خيالية' }, production: { en: 'Consent registry, identity, local urgent protocol', ar: 'سجل الموافقات والهوية والبروتوكول العاجل المحلي' } },
  { stage: '03', name: { en: 'Clinical Context', ar: 'السياق السريري' }, does: { en: 'Read authorised context with its sources', ar: 'قراءة السياق المصرّح به مع مصادره' }, status: 'sim', today: { en: 'Reads authored fields and applies per-domain consent', ar: 'يقرأ حقولًا معدّة ويطبق الموافقة لكل مجال' }, production: { en: 'Authorised record API, FHIR where supported', ar: 'واجهة سجلات مصرّح بها، FHIR حيث يُدعم' } },
  { stage: '04-05', name: { en: 'Access & Language, Assessment Protocol', ar: 'الوصول واللغة، بروتوكول التقييم' }, does: { en: 'Check language, senses and comparability', ar: 'التحقق من اللغة والحواس وقابلية المقارنة' }, status: 'runs', today: { en: 'Rules over each visit\'s language and mode', ar: 'قواعد على لغة وطريقة كل زيارة' }, production: { en: 'Locally validated protocol registry', ar: 'سجل بروتوكولات متحقق منها محليًا' } },
  { stage: '06', name: { en: 'Cognitive Change Scoring', ar: 'حساب التغيّر الإدراكي' }, does: { en: 'Call the formula tool and explain the verified result', ar: 'استدعاء أداة المعادلة وشرح النتيجة المتحقق منها' }, status: 'runs', today: { en: 'Scores from code; optional live model for wording only', ar: 'الدرجات من الكود؛ نموذج مباشر اختياري للصياغة فقط' }, production: { en: 'Versioned code, local norms, validated thresholds', ar: 'كود ذو إصدار ومعايير محلية وعتبات متحقق منها' } },
  { stage: '07, 09', name: { en: 'Care Pathway, Evidence & Documentation', ar: 'مسار الرعاية، الأدلة والتوثيق' }, does: { en: 'List contributors, attach sources, prepare a draft', ar: 'ذكر العوامل وإرفاق المصادر وإعداد مسودة' }, status: 'sim', today: { en: 'Curated sources S1 to S14, checked by hand', ar: 'مصادر مختارة من S1 إلى S14، فُحصت يدويًا' }, production: { en: 'Retrieval from a clinician-approved corpus with citation checks', ar: 'استرجاع من مصادر يعتمدها الأطباء مع فحص الاستشهادات' } },
  { stage: '08', name: { en: 'Specialist Model Liaison', ar: 'تنسيق النماذج المتخصصة' }, does: { en: 'Optional target-specific estimate', ar: 'تقدير اختياري محدد الهدف' }, status: 'none', today: { en: 'Returns null with a reason', ar: 'يُرجع قيمة فارغة مع السبب' }, production: { en: 'Validated models only, same contract', ar: 'نماذج متحقق منها فقط، بالعقد نفسه' } },
  { stage: '10', name: { en: 'Nurse preparation and doctor sign-off (people)', ar: 'إعداد الممرض وتوقيع الطبيب (أشخاص)' }, does: { en: 'A nurse prepares and hands over. A doctor edits, chooses the route, and signs off or returns', ar: 'يُعدّ الممرض ويسلّم. ويعدّل الطبيب ويختار المسار ويوقّع أو يعيد' }, status: 'sim', today: { en: 'Works by hand with role-based actions; sign-in stays in this browser', ar: 'يعمل يدويًا بإجراءات حسب الدور؛ ويبقى تسجيل الدخول في هذا المتصفح' }, production: { en: 'Facility single sign-on, authenticated sign-off and a staffed queue', ar: 'تسجيل دخول موحد للمنشأة وتوقيع موثق وقائمة انتظار مزودة بالموظفين' } },
  { stage: '11-12', name: { en: 'Follow-up Coordination, Quality & Equity Audit', ar: 'تنسيق المتابعة، تدقيق الجودة والإنصاف' }, does: { en: 'Track the next step and measure performance', ar: 'تتبع الخطوة التالية وقياس الأداء' }, status: 'runs', today: { en: 'Local tasks, audit log, synthetic evaluation', ar: 'مهام محلية وسجل تدقيق وتقييم اصطناعي' }, production: { en: 'Care-system task queue and subgroup monitoring', ar: 'قائمة مهام نظام الرعاية ومراقبة الفئات الفرعية' } },
];

const GATES: { label: { en: string; ar: string }; cls: string; title: { en: string; ar: string }; body: { en: string; ar: string } }[] = [
  { label: { en: 'Stop', ar: 'إيقاف' }, cls: 'tag-stop', title: { en: 'No permission', ar: 'لا إذن' }, body: { en: 'No case data is read. The gate event is recorded.', ar: 'لا تُقرأ أي بيانات. يُسجل حدث البوابة.' } },
  { label: { en: 'Stop', ar: 'إيقاف' }, cls: 'tag-stop', title: { en: 'Sudden change', ar: 'تغيّر مفاجئ' }, body: { en: 'Routine work is bypassed for an urgent human handoff.', ar: 'يُتجاوز العمل الروتيني إلى تحويل بشري عاجل.' } },
  { label: { en: 'Hold', ar: 'تعليق' }, cls: 'tag-hold', title: { en: 'Not comparable or not fair', ar: 'غير قابل للمقارنة أو غير منصف' }, body: { en: 'A hearing or vision concern, a language with no calibration, or too few visits.', ar: 'قلق بشأن السمع أو البصر، أو لغة بلا معايرة، أو زيارات قليلة.' } },
  { label: { en: 'Hold', ar: 'تعليق' }, cls: 'tag-hold', title: { en: 'Evidence unavailable', ar: 'الأدلة غير متاحة' }, body: { en: 'The report is held. Measurements are kept.', ar: 'يُعلّق التقرير. تُحفظ القياسات.' } },
  { label: { en: 'Wait', ar: 'انتظار' }, cls: 'tag-wait', title: { en: 'No clinician approval', ar: 'لا موافقة من الطبيب' }, body: { en: 'The draft waits for review. No care action is released.', ar: 'تنتظر المسودة المراجعة. لا يُفرج عن أي إجراء رعاية.' } },
];

const LLM_YES: { en: string; ar: string }[] = [
  { en: 'Now: call the approved scoring tool', ar: 'الآن: استدعاء أداة الحساب المعتمدة' },
  { en: 'Now: explain the tool result in English and Arabic', ar: 'الآن: شرح نتيجة الأداة بالإنجليزية والعربية' },
  { en: 'Next: extract authorised notes with their sources', ar: 'لاحقًا: استخراج الملاحظات المصرّح بها مع مصادرها' },
  { en: 'Next: approved retrieval and cited drafts', ar: 'لاحقًا: استرجاع معتمد ومسودات موثقة' },
];
const LLM_NO: { en: string; ar: string }[] = [
  { en: 'Inventing scores, thresholds or estimates', ar: 'اختراع درجات أو عتبات أو تقديرات' },
  { en: 'Routing, stopping or holding decisions', ar: 'قرارات التوجيه أو الإيقاف أو التعليق' },
  { en: 'Diagnosis, referral or approval', ar: 'التشخيص أو الإحالة أو الاعتماد' },
  { en: 'Filling in a missing value', ar: 'تعبئة قيمة ناقصة' },
];
const BOUNDS: { en: string; ar: string }[] = [
  { en: 'Fixed case IDs only', ar: 'معرّفات حالات ثابتة فقط' },
  { en: 'One fixed task', ar: 'مهمة واحدة ثابتة' },
  { en: 'Schema-checked output', ar: 'مخرجات مفحوصة بالمخطط' },
  { en: 'Numbers and wording checked by code', ar: 'الأرقام والصياغة يفحصها الكود' },
  { en: 'Accept, or use the labelled template', ar: 'القبول أو استخدام القالب الموسوم' },
];

const HELPS: { title: { en: string; ar: string; id: string }; body: { en: string; ar: string; id: string } }[] = [
  {
    title: { en: 'Noticing change that may need assessment', ar: 'ملاحظة تغيّر قد يحتاج إلى تقييم', id: 'Menangkap perubahan yang mungkin perlu dinilai' },
    body: {
      en: 'Gradual change in memory, attention and daily function that a clinician may then assess for mild cognitive impairment or dementia, such as Alzheimer\'s disease or vascular causes. The tool flags change. It does not say which condition, if any, is present.',
      ar: 'تغيّر تدريجي في الذاكرة والانتباه والأداء اليومي قد يقيّمه الطبيب بعد ذلك بحثًا عن ضعف إدراكي بسيط أو خرف، مثل مرض ألزهايمر أو الأسباب الوعائية. تشير الأداة إلى التغيّر، ولا تحدد أي حالة موجودة إن وُجدت.',
      id: 'Perubahan bertahap pada memori, perhatian, dan fungsi harian yang kemudian bisa dinilai klinisi untuk gangguan kognitif ringan atau demensia, seperti penyakit Alzheimer atau penyebab vaskular. Alat ini menandai perubahan. Alat ini tidak menyebut kondisi apa yang ada, bila memang ada.',
    },
  },
  {
    title: { en: 'Ruling out treatable contributors', ar: 'استبعاد العوامل القابلة للعلاج', id: 'Menyingkirkan faktor yang bisa diobati' },
    body: {
      en: 'Low mood and depression, poor sleep and sleep apnoea, medicine side effects, low B12, thyroid problems, poorly controlled diabetes or blood pressure, and hearing or vision loss. Each can look like cognitive change or make it worse, and each can be treated.',
      ar: 'تدني المزاج والاكتئاب، وسوء النوم وانقطاع النفس أثناء النوم، والآثار الجانبية للأدوية، ونقص فيتامين ب12، ومشاكل الغدة الدرقية، وضعف ضبط السكري أو ضغط الدم، وفقدان السمع أو البصر. قد يبدو كل منها كتغيّر إدراكي أو يزيده سوءًا، ويمكن علاج كل منها.',
      id: 'Suasana hati murung dan depresi, tidur buruk dan apnea tidur, efek samping obat, B12 rendah, gangguan tiroid, diabetes atau tekanan darah yang tidak terkontrol, serta gangguan pendengaran atau penglihatan. Masing-masing bisa tampak seperti perubahan kognitif atau memperburuknya, dan masing-masing bisa diobati.',
    },
  },
  {
    title: { en: 'Prevention conversations', ar: 'حوارات الوقاية', id: 'Percakapan pencegahan' },
    body: {
      en: 'Modifiable risks such as physical inactivity, smoking, social isolation, high blood pressure, diabetes and high LDL cholesterol, with sleep, activity and social contact followed over time.',
      ar: 'مخاطر قابلة للتعديل مثل قلة النشاط البدني والتدخين والعزلة الاجتماعية وارتفاع ضغط الدم والسكري وارتفاع الكوليسترول الضار، مع متابعة النوم والنشاط والتواصل الاجتماعي عبر الزمن.',
      id: 'Risiko yang bisa diubah seperti kurang gerak, merokok, isolasi sosial, tekanan darah tinggi, diabetes, dan kolesterol LDL tinggi, dengan tidur, aktivitas, dan kontak sosial yang dipantau dari waktu ke waktu.',
    },
  },
];

const NOT_FOR: { en: string; ar: string; id: string }[] = [
  { en: 'Diagnosing or staging any disease', ar: 'تشخيص أي مرض أو تحديد مرحلته', id: 'Mendiagnosis penyakit apa pun atau menentukan stadiumnya' },
  { en: 'Treating any brain condition or choosing medicines. Therapy decisions stay with clinicians and services', ar: 'علاج أي حالة دماغية أو اختيار الأدوية. تبقى قرارات العلاج للأطباء والخدمات', id: 'Mengobati kondisi otak apa pun atau memilih obat. Keputusan terapi tetap di tangan klinisi dan layanan' },
  { en: 'Emergencies such as stroke, delirium, head injury or seizures. The tool only stops on a supplied flag, and urgent care follows the local protocol', ar: 'الطوارئ مثل السكتة الدماغية والهذيان وإصابة الرأس والنوبات. تتوقف الأداة فقط عند إشارة واردة، وتتبع الرعاية العاجلة البروتوكول المحلي', id: 'Kegawatan seperti stroke, delirium, cedera kepala, atau kejang. Alat ini hanya berhenti bila ada sinyal yang diterima, dan penanganan darurat mengikuti protokol setempat' },
  { en: 'Other neurological conditions such as Parkinson\'s disease, epilepsy, multiple sclerosis, migraine or brain tumours', ar: 'حالات عصبية أخرى مثل مرض باركنسون والصرع والتصلب المتعدد والصداع النصفي وأورام الدماغ', id: 'Kondisi saraf lain seperti penyakit Parkinson, epilepsi, multiple sclerosis, migrain, atau tumor otak' },
];

/** Intended use in plain words, so no one reads a risk tool as a diagnostic or a therapy. */
function IntendedUse() {
  const { tx, t } = useApp();
  return (
    <section className="stack">
      <h2>{t('What it helps with, and what it is not for', 'ما تساعد فيه، وما ليست مخصصة له', 'Apa yang dibantu, dan apa yang bukan fungsinya')}</h2>
      <div className="grid-3">
        {HELPS.map((h) => (
          <div key={h.title.en} className="card card-tight card-tint">
            <h3>{tx(h.title)}</h3>
            <p className="small">{tx(h.body)}</p>
          </div>
        ))}
      </div>
      <div className="card card-tight">
        <h3>{t('Not for', 'ليست مخصصة لـ', 'Bukan untuk')}</h3>
        <ul className="plain small">{NOT_FOR.map((n) => <li key={n.en}>{tx(n)}</li>)}</ul>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const { t, tx } = useApp();
  const [open, setOpen] = useState(3);
  const statusTag = (s: Status) => (
    s === 'runs' ? <span className="tag tag-pass">{t('Runs in prototype', 'يعمل في النموذج')}</span>
      : s === 'sim' ? <span className="tag tag-wait">{t('Simulated', 'محاكى')}</span>
        : <span className="tag tag-none">{t('Not connected', 'غير متصل')}</span>
  );
  return (
    <>
      <PageHead title={t('A bounded agent workflow', 'سير عمل محدود للوكلاء')}>
        {t(
          'The Visit Coordination Agent runs a deterministic 12-stage state machine. Each stage reads the state, runs one tool, checks the result and hands on. It can never approve care.',
          'يشغّل وكيل تنسيق الزيارة آلة حالات حتمية من 12 مرحلة. تقرأ كل مرحلة الحالة وتشغّل أداة واحدة وتفحص النتيجة وتسلّم ما بعدها. ولا يمكنه أبدًا اعتماد الرعاية.',
        )}
      </PageHead>

      <IntendedUse />

      <section className="stack">
        <h2>{t('Five gates decide the path', 'خمس بوابات تحدد المسار')}</h2>
        <div className="grid-3">
          {GATES.map((g) => (
            <div key={g.title.en} className="card card-tight">
              <span className={`tag ${g.cls}`} style={{ alignSelf: 'flex-start' }}>{tx(g.label)}</span>
              <h3>{tx(g.title)}</h3>
              <p className="small muted">{tx(g.body)}</p>
            </div>
          ))}
          <div className="card card-tight card-dark">
            <h3>{t('Underneath every gate', 'تحت كل بوابة')}</h3>
            <p className="small">{t('An unavailable value stays null. A missing value never becomes zero. The safety agent checks a supplied flag: it does not detect sudden change, and no flag is not clearance.', 'تبقى القيمة غير المتاحة فارغة. ولا تصبح القيمة الناقصة صفرًا أبدًا. يتحقق وكيل السلامة من إشارة واردة: لا يكتشف التغيّر المفاجئ، وغياب الإشارة ليس إذنًا.')}</p>
          </div>
        </div>
      </section>

      <section className="stack">
        <h2>{t('What each agent does', 'ما يفعله كل وكيل')}</h2>
        <p className="muted small">{t('Each label says what runs today and what is only proposed. Select a row for the production plan.', 'يوضح كل وسم ما يعمل اليوم وما هو مقترح فقط. اختر صفًا لرؤية خطة الإنتاج.')}</p>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Stage', 'المرحلة')}</th>
                  <th>{t('Agent or role', 'الوكيل أو الدور')}</th>
                  <th>{t('What it does', 'ما يفعله')}</th>
                  <th>{t('Today', 'اليوم')}</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((a, i) => (
                  <tr key={a.stage} onClick={() => setOpen(i)} style={{ cursor: 'pointer', background: open === i ? 'var(--primary-tint)' : undefined }}>
                    <td className="mono">{a.stage}</td>
                    <td className="strong">
                      <button type="button" onClick={() => setOpen(i)} aria-expanded={open === i} style={{ all: 'unset', cursor: 'pointer' }}>{tx(a.name)}</button>
                    </td>
                    <td>{tx(a.does)}</td>
                    <td><div className="stack" style={{ gap: 4 }}>{statusTag(a.status)}<span className="small muted">{tx(a.today)}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice notice-info" style={{ margin: 14 }}>
            <span className="strong">{tx(AGENTS[open].name)}. {t('Proposed for production: ', 'مقترح للإنتاج: ')}</span>
            {tx(AGENTS[open].production)}
          </div>
        </div>
      </section>

      <section className="stack">
        <h2>{t('Where language models belong', 'أين تنتمي النماذج اللغوية')}</h2>
        <div className="grid-2">
          <div className="card">
            <h3>{t('Allowed', 'مسموح')}</h3>
            <ul className="plain">{LLM_YES.map((x) => <li key={x.en}>{tx(x)}</li>)}</ul>
          </div>
          <div className="card card-dark">
            <h3>{t('Kept out of', 'ممنوع من')}</h3>
            <ul className="plain">{LLM_NO.map((x) => <li key={x.en}>{tx(x)}</li>)}</ul>
          </div>
        </div>
        <div className="card card-tight card-sand">
          <h4>{t('Every model step is bounded the same way', 'كل خطوة نموذج محدودة بالطريقة نفسها')}</h4>
          <ol className="plain">{BOUNDS.map((x) => <li key={x.en}>{tx(x)}</li>)}</ol>
        </div>
      </section>
    </>
  );
}
