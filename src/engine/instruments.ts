import { LOINC, type QuantityMeasure } from '../data/measures';
import { L, type ContextItem, type Localised } from './types';

/**
 * Where the brief check sits in international practice, and how a validated
 * instrument result is recorded.
 *
 * The app never reproduces a licensed instrument's items and never applies a
 * published cut-off: cut-offs come from other populations and depend on language
 * and schooling (S18). The clinician who gave the instrument records how they read it.
 */

export type InstrumentId = 'moca' | 'rudas' | 'minicog';

export interface Instrument {
  id: InstrumentId;
  name: string;
  max: number;
  loinc: { code: string; display: string };
  about: Localised;
  sources: string[];
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  minicog: {
    id: 'minicog', name: 'Mini-Cog', max: 5, loinc: LOINC.minicog,
    about: L(
      'Three-word recall and clock drawing, about 3 minutes. Named by NICE for non-specialist settings.',
      'تذكر ثلاث كلمات ورسم الساعة، نحو 3 دقائق. تذكره NICE للخدمات غير المتخصصة.',
      'Mengingat tiga kata dan menggambar jam, sekitar 3 menit. Disebut NICE untuk layanan non-spesialis.',
    ),
    sources: ['S17', 'S19'],
  },
  rudas: {
    id: 'rudas', name: 'RUDAS', max: 30, loinc: LOINC.rudas,
    about: L(
      'Six items written with cultural advisory groups for multicultural populations.',
      'ستة بنود كُتبت مع مجموعات استشارية ثقافية لمجتمعات متعددة الثقافات.',
      'Enam item yang disusun bersama kelompok penasihat budaya untuk populasi multikultural.',
    ),
    sources: ['S9'],
  },
  moca: {
    id: 'moca', name: 'MoCA', max: 30, loinc: LOINC.moca,
    about: L(
      'About 10 minutes, 30 points, more domains. Given by trained staff under the publisher\'s terms.',
      'نحو 10 دقائق و30 نقطة ومجالات أكثر. يجريه موظفون مدرّبون وفق شروط الناشر.',
      'Sekitar 10 menit, 30 poin, lebih banyak ranah. Diberikan oleh staf terlatih sesuai ketentuan penerbit.',
    ),
    sources: ['S18'],
  },
};

export interface InstrumentResult {
  instrument: InstrumentId;
  score: number;
  date: string;
  /** Version and language as printed on the form, for example "Arabic 8.1". */
  version: string;
  /** The administering clinician's reading. The app does not apply a cut-off. */
  reading: 'ok' | 'attention';
  givenBy: string;
  trained: boolean;
}

export function resultProblems(r: InstrumentResult, asOf: string): string[] {
  const max = INSTRUMENTS[r.instrument].max;
  const problems: string[] = [];
  if (!Number.isInteger(r.score) || r.score < 0 || r.score > max) problems.push('score');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > asOf) problems.push('date');
  if (!r.version.trim()) problems.push('version');
  if (!r.trained) problems.push('trained');
  return problems;
}

const READING: Record<InstrumentResult['reading'], Localised> = {
  ok: L('read by the clinician as expected for this person', 'قرأه الطبيب كما هو متوقع لهذا الشخص', 'dibaca klinisi sesuai harapan untuk orang ini'),
  attention: L('read by the clinician as needing attention', 'قرأه الطبيب كأمر يحتاج إلى انتباه', 'dibaca klinisi sebagai perlu perhatian'),
};

/** The recorded result replaces the programme screen in the patient's context. */
export function instrumentItem(r: InstrumentResult): ContextItem {
  const ins = INSTRUMENTS[r.instrument];
  const measure: QuantityMeasure = {
    kind: 'quantity', loinc: ins.loinc.code, display: ins.loinc.display, category: 'survey',
    value: r.score, unit: 'score', ucum: '{score}',
  };
  const head = `${ins.name} ${r.score}/${ins.max}, ${r.version.trim()}`;
  return {
    id: 'screen',
    domain: 'screening',
    label: L('Validated cognitive instrument', 'أداة إدراكية معتمدة', 'Instrumen kognitif tervalidasi'),
    value: L(`${head}, ${READING[r.reading].en}`, `${head}، ${READING[r.reading].ar}`, `${head}, ${READING[r.reading].id}`),
    status: r.reading,
    source: L(`Entered by ${r.givenBy}`, `أدخله ${r.givenBy}`, `Dimasukkan oleh ${r.givenBy}`),
    date: r.date,
    consent: 'clinical',
    measure,
  };
}

/** Three tiers, as in NICE NG97 and the Alzheimer's Association wellness-visit algorithm. */
/** What the app does at each tier, and why tiers 2 and 3 are not tests inside the app. */
export const TIER_IN_APP: Record<number, Localised> = {
  1: L('Runs in this app.', 'يعمل داخل هذا التطبيق.', 'Berjalan di aplikasi ini.'),
  2: L(
    'Not built into the app on purpose. These are published, validated instruments with their own forms, training and licence terms. A copy inside an app would no longer be the validated instrument. Staff give it on the licensed form, then record the score below.',
    'لم تُبنَ داخل التطبيق عمدًا. هذه أدوات منشورة ومعتمدة لها نماذجها وتدريبها وشروط ترخيصها. النسخة داخل تطبيق لن تبقى الأداة المعتمدة نفسها. يجريها الموظفون على النموذج المرخّص ثم يسجلون الدرجة أدناه.',
    'Sengaja tidak dibuat di dalam aplikasi. Ini instrumen tervalidasi yang sudah dipublikasikan, dengan formulir, pelatihan, dan ketentuan lisensinya sendiri. Salinan di dalam aplikasi bukan lagi instrumen yang tervalidasi. Staf memberikannya pada formulir berlisensi, lalu mencatat skornya di bawah.',
  ),
  3: L(
    'Not an app task. A specialist assessment needs a specialist with the person, plus laboratory tests and imaging. The app prepares the referral, which a doctor signs off, and records lab results and the outcome.',
    'ليست مهمة للتطبيق. يحتاج التقييم المتخصص إلى مختص مع الشخص، إضافة إلى الفحوص المخبرية والتصوير. يُعدّ التطبيق الإحالة التي يوقّعها الطبيب، ويسجل نتائج المختبر والنتيجة.',
    'Bukan tugas aplikasi. Asesmen spesialis memerlukan spesialis yang bertemu langsung dengan orangnya, plus tes laboratorium dan pencitraan. Aplikasi menyiapkan rujukan yang ditandatangani dokter, dan mencatat hasil lab serta hasil akhirnya.',
  ),
};

export const TIERS: { n: number; title: Localised; body: Localised; here: boolean; sources: string[] }[] = [
  {
    n: 1, here: true, sources: ['S20', 'S8'],
    title: L('Brief check, repeated', 'فحص قصير متكرر', 'Cek singkat, berulang'),
    body: L(
      'This app. Four tasks and daily-life questions in about four minutes, repeated with alternate forms to follow change in one person. It flags who needs tier 2. It does not screen people for dementia.',
      'هذا التطبيق. أربع مهام وأسئلة عن الحياة اليومية في نحو أربع دقائق، تتكرر بنماذج بديلة لمتابعة التغيّر لدى الشخص نفسه. يحدد من يحتاج إلى المستوى 2. لا يفحص الناس للكشف عن الخرف.',
      'Aplikasi ini. Empat tugas dan pertanyaan kehidupan sehari-hari dalam sekitar empat menit, diulang dengan formulir alternatif untuk mengikuti perubahan pada satu orang. Cek ini menandai siapa yang perlu tingkat 2. Cek ini bukan skrining demensia.',
    ),
  },
  {
    n: 2, here: false, sources: ['S17', 'S19', 'S9', 'S18'],
    title: L('Validated instrument and informant', 'أداة معتمدة ومُخبر', 'Instrumen tervalidasi dan informan'),
    body: L(
      'Given by trained staff when tier 1 flags change: Mini-Cog, RUDAS or MoCA, plus a structured informant questionnaire. Record the result below. A normal score does not rule anything out.',
      'يجريها موظفون مدرّبون عندما يشير المستوى 1 إلى تغيّر: Mini-Cog أو RUDAS أو MoCA، مع استبيان منظم للمخبر. سجّل النتيجة أدناه. الدرجة الطبيعية لا تستبعد شيئًا.',
      'Diberikan oleh staf terlatih bila tingkat 1 menandai perubahan: Mini-Cog, RUDAS, atau MoCA, ditambah kuesioner informan terstruktur. Catat hasilnya di bawah. Skor normal tidak menyingkirkan apa pun.',
    ),
  },
  {
    n: 3, here: false, sources: ['S17'],
    title: L('Specialist assessment', 'تقييم متخصص', 'Asesmen spesialis'),
    body: L(
      'A memory service: full history, examination, blood and urine tests for reversible causes, detailed neuropsychological testing, and imaging when a specialist decides it is needed.',
      'خدمة الذاكرة: تاريخ كامل وفحص سريري وفحوص الدم والبول للأسباب القابلة للعلاج واختبارات نفسية عصبية مفصلة، وتصوير عندما يقرر المختص ذلك.',
      'Layanan memori: riwayat lengkap, pemeriksaan fisik, tes darah dan urine untuk penyebab yang bisa dipulihkan, tes neuropsikologis rinci, dan pencitraan bila spesialis memutuskan perlu.',
    ),
  },
];

export type Coverage = 'brief' | 'tier2' | 'tier3';

/** Domains follow the usual neurocognitive grouping. Tier 2 instruments differ: MoCA covers more of them than Mini-Cog. */
export const DOMAINS: { name: Localised; task: Localised; coverage: Coverage }[] = [
  { name: L('Learning and memory', 'التعلّم والذاكرة', 'Belajar dan memori'), task: L('Picture learning, then recognition after the other tasks', 'تعلّم الصور ثم التعرّف عليها بعد المهام الأخرى', 'Belajar gambar, lalu mengenali setelah tugas lain'), coverage: 'brief' },
  { name: L('Attention and working memory', 'الانتباه والذاكرة العاملة', 'Atensi dan memori kerja'), task: L('Repeat a sequence by sight or sound', 'تكرار تسلسل بالبصر أو الصوت', 'Mengulang urutan lewat penglihatan atau suara'), coverage: 'brief' },
  { name: L('Processing speed', 'سرعة المعالجة', 'Kecepatan pemrosesan'), task: L('Find every target in a grid', 'إيجاد كل هدف في شبكة', 'Menemukan semua target di kisi'), coverage: 'brief' },
  { name: L('Executive function', 'الوظائف التنفيذية', 'Fungsi eksekutif'), task: L('Switch between shape and fill rules', 'التبديل بين قاعدتي الشكل والتعبئة', 'Berganti aturan bentuk dan isian'), coverage: 'brief' },
  { name: L('Daily function', 'الوظيفة اليومية', 'Fungsi sehari-hari'), task: L('Questions to the patient or a care partner', 'أسئلة للمريض أو لمرافق الرعاية', 'Pertanyaan untuk pasien atau pendamping'), coverage: 'brief' },
  { name: L('Orientation', 'التوجّه', 'Orientasi'), task: L('Date and place questions in a validated instrument', 'أسئلة التاريخ والمكان في أداة معتمدة', 'Pertanyaan tanggal dan tempat di instrumen tervalidasi'), coverage: 'tier2' },
  { name: L('Free recall after a delay', 'الاستدعاء الحر بعد تأخير', 'Mengingat bebas setelah jeda'), task: L('Word recall in Mini-Cog, RUDAS or MoCA', 'تذكر الكلمات في Mini-Cog أو RUDAS أو MoCA', 'Mengingat kata di Mini-Cog, RUDAS, atau MoCA'), coverage: 'tier2' },
  { name: L('Visuospatial and construction', 'المهارات البصرية المكانية والبناء', 'Visuospasial dan konstruksi'), task: L('Clock drawing or copying in a validated instrument', 'رسم الساعة أو النسخ في أداة معتمدة', 'Menggambar jam atau menyalin di instrumen tervalidasi'), coverage: 'tier2' },
  { name: L('Language', 'اللغة', 'Bahasa'), task: L('Naming and fluency, mainly in MoCA and specialist testing', 'التسمية والطلاقة، أساسًا في MoCA والاختبارات المتخصصة', 'Penamaan dan kelancaran, terutama di MoCA dan tes spesialis'), coverage: 'tier2' },
  { name: L('Social cognition and detailed profiles', 'الإدراك الاجتماعي والملفات المفصلة', 'Kognisi sosial dan profil rinci'), task: L('Full neuropsychological assessment', 'تقييم نفسي عصبي كامل', 'Asesmen neuropsikologis lengkap'), coverage: 'tier3' },
];
