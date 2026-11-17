import { L, type Case, type Conditions, type ContextItem, type Observation } from '../engine/types';

/** All people and values in this file are fictional. */

const calm: Conditions = { poorSleep: false, fasting: false, lowMood: false, distraction: false, aidsWorn: false, assisted: false };

function series(
  language: Observation['language'],
  mode: Observation['mode'],
  rows: [string, number | null, Partial<Conditions>?, Observation['mode']?][],
): Observation[] {
  const forms = ['A', 'B', 'C'];
  return rows.map(([date, score, cond, modeOverride], i) => ({
    visit: i + 1,
    date,
    score,
    language,
    mode: modeOverride ?? mode,
    form: forms[i % 3],
    conditions: { ...calm, ...cond },
    source: 'authored',
  }));
}

const LAB = L('Authorised lab result', 'نتيجة مخبرية مصرّح بها');
const WEARABLE = L('Authorised wearable, 30-day summary', 'جهاز قابل للارتداء مصرّح به، ملخص 30 يومًا');
const REPORT = L('Reported at wellness visit', 'أُبلغ عنه في زيارة العافية');
const NOT_SUPPLIED = L('Not supplied', 'غير متوفر');
const PROGRAMME = L('Supplied from the wellness programme record', 'وارد من سجل برنامج العافية');

function item(
  id: string, domain: ContextItem['domain'], label: ContextItem['label'], value: ContextItem['value'],
  status: ContextItem['status'], source: ContextItem['source'], date: string | null,
  consent: ContextItem['consent'], contributor?: ContextItem['contributor'], highRisk?: boolean,
): ContextItem {
  return { id, domain, label, value, status, source, date, consent, contributor, highRisk };
}

const LBL = {
  screen: L('Programme cognitive screen', 'الفحص الإدراكي للبرنامج'),
  bp: L('Blood pressure', 'ضغط الدم'),
  steps: L('Daily steps', 'الخطوات اليومية'),
  hba1c: L('HbA1c', 'السكر التراكمي'),
  ldl: L('LDL cholesterol', 'الكوليسترول الضار'),
  b12: L('B12 and thyroid', 'فيتامين ب12 والغدة الدرقية'),
  sleep: L('Sleep', 'النوم'),
  mood: L('Mood screen', 'فحص المزاج'),
  tobacco: L('Tobacco and social contact', 'التبغ والتواصل الاجتماعي'),
  hearing: L('Hearing', 'السمع'),
  vision: L('Vision', 'البصر'),
  meds: L('Medicines', 'الأدوية'),
  family: L('Family history', 'التاريخ العائلي'),
  apoe: L('APOE genotype', 'النمط الجيني APOE'),
};

export const CASES: Case[] = [
  {
    id: 'SYN-102',
    name: 'Khalid',
    age: 71,
    sex: 'M',
    summary: L('New difficulty with bills and medicines, reported by his daughter', 'صعوبة جديدة في الفواتير والأدوية، أبلغت عنها ابنته'),
    pathLabel: L('Qualified review', 'مراجعة مؤهلة'),
    education: 'mid',
    preferredLanguage: 'ar',
    concern: L('New difficulty with familiar daily tasks', 'صعوبة جديدة في المهام اليومية المألوفة'),
    carePartner: L('Daughter, with his permission', 'ابنته، بإذنه'),
    consent: { access: true, clinical: true, wearable: true, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('ar', 'visual', [
      ['2025-02-10', 8], ['2025-05-12', 8], ['2025-08-11', 7],
      ['2026-05-18', 7], ['2026-10-26', 5, { poorSleep: true }],
    ]),
    functionReports: [
      { date: '2025-08-11', reporter: 'self', level: 0, note: L('No change reported', 'لا تغيير مبلّغ عنه'), source: 'authored' },
      { date: '2026-10-26', reporter: 'care_partner', level: 1, note: L('Paying bills and managing medicines now need help', 'دفع الفواتير وإدارة الأدوية يحتاجان الآن إلى مساعدة'), source: 'authored' },
    ],
    context: [
      item('screen', 'screening', LBL.screen, L('MoCA 24/30, Arabic version', 'MoCA 24/30، النسخة العربية'), 'attention', PROGRAMME, '2025-02-10', 'clinical'),
      item('bp', 'physical', LBL.bp, L('148/90 mmHg', '148/90 ملم زئبق'), 'attention', REPORT, '2026-10-26', 'clinical', 'vascular'),
      item('steps', 'physical', LBL.steps, L('About 2,900 a day', 'نحو 2,900 يوميًا'), 'attention', WEARABLE, '2026-10-26', 'wearable', 'activity'),
      item('hba1c', 'metabolic', LBL.hba1c, L('8.2%', '8.2%'), 'attention', LAB, '2026-09-14', 'clinical', 'metabolic'),
      item('ldl', 'metabolic', LBL.ldl, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'metabolic'),
      item('b12', 'metabolic', LBL.b12, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'metabolic'),
      item('sleep', 'sleep', LBL.sleep, L('About 5.1 hours, broken, for 3 weeks', 'نحو 5.1 ساعات، متقطعة، منذ 3 أسابيع'), 'attention', WEARABLE, '2026-10-26', 'wearable', 'sleep'),
      item('mood', 'mental', LBL.mood, null, 'unknown', L('Not formally assessed', 'لم يُقيّم رسميًا'), null, 'clinical', 'mood'),
      item('tobacco', 'lifestyle', LBL.tobacco, L('Former smoker. Sees family weekly', 'مدخن سابق. يرى عائلته أسبوعيًا'), 'ok', REPORT, '2026-10-26', 'clinical'),
      item('hearing', 'sensory', LBL.hearing, L('Passed screening', 'اجتاز الفحص'), 'ok', REPORT, '2025-02-10', 'clinical'),
      item('vision', 'sensory', LBL.vision, L('Passed with glasses', 'اجتاز بالنظارة'), 'ok', REPORT, '2025-02-10', 'clinical'),
      item('meds', 'medication', LBL.meds, L('Metformin and amlodipine. A night-time sleep aid bought without a prescription needs confirming', 'ميتفورمين وأملوديبين. منوم ليلي دون وصفة يحتاج إلى تأكيد'), 'attention', REPORT, '2026-10-26', 'clinical', 'medicines'),
      item('family', 'family', LBL.family, L('Mother: memory problems from about age 78, not confirmed', 'الأم: مشاكل ذاكرة منذ نحو 78 عامًا، غير مؤكدة'), 'attention', REPORT, '2026-10-26', 'family', 'family_genetics'),
      item('apoe', 'genomic', LBL.apoe, L('e3/e4', 'e3/e4'), 'attention', L('Authorised genomics record', 'سجل جيني مصرّح به'), '2024-11-02', 'genomic', 'family_genetics'),
    ],
    clarify: [
      L('What has changed in familiar tasks, when did it start, and what examples can Khalid and his daughter give?', 'ما الذي تغيّر في المهام المألوفة، ومتى بدأ، وما الأمثلة التي يقدمها خالد وابنته؟'),
      L('Which medicines is he actually taking, including the night-time sleep aid?', 'ما الأدوية التي يتناولها فعلًا، بما فيها المنوم الليلي؟'),
      L('Why has sleep been broken for three weeks, and has mood changed?', 'لماذا أصبح النوم متقطعًا منذ ثلاثة أسابيع، وهل تغيّر المزاج؟'),
    ],
  },
  {
    id: 'SYN-101',
    name: 'Mariam',
    age: 66,
    sex: 'F',
    summary: L('Annual wellness check with stable results', 'فحص عافية سنوي بنتائج مستقرة'),
    pathLabel: L('Routine follow-up', 'متابعة روتينية'),
    education: 'low',
    preferredLanguage: 'ar',
    concern: L('Annual wellness check, no concern reported', 'فحص عافية سنوي، دون شكوى'),
    carePartner: L('Son, on request', 'ابنها، عند الطلب'),
    consent: { access: true, clinical: true, wearable: true, family: true, genomic: true },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('ar', 'visual', [
      ['2025-01-20', 6], ['2025-04-21', 7], ['2025-07-21', 6],
      ['2026-01-19', 6], ['2026-10-12', 7],
    ]),
    functionReports: [
      { date: '2026-10-12', reporter: 'self', level: 0, note: L('No change reported', 'لا تغيير مبلّغ عنه'), source: 'authored' },
    ],
    context: [
      item('screen', 'screening', LBL.screen, L('MoCA 21/30, Arabic version, read with low formal schooling in mind', 'MoCA 21/30، النسخة العربية، تُقرأ مع مراعاة قلة التعليم الرسمي'), 'ok', PROGRAMME, '2025-01-20', 'clinical'),
      item('bp', 'physical', LBL.bp, L('128/78 mmHg', '128/78 ملم زئبق'), 'ok', REPORT, '2026-10-12', 'clinical'),
      item('steps', 'physical', LBL.steps, L('About 3,400 a day', 'نحو 3,400 يوميًا'), 'attention', WEARABLE, '2026-10-12', 'wearable', 'activity'),
      item('hba1c', 'metabolic', LBL.hba1c, L('5.8%', '5.8%'), 'ok', LAB, '2026-09-30', 'clinical'),
      item('ldl', 'metabolic', LBL.ldl, L('3.0 mmol/L', '3.0 ملمول/لتر'), 'ok', LAB, '2026-09-30', 'clinical'),
      item('sleep', 'sleep', LBL.sleep, L('About 7 hours', 'نحو 7 ساعات'), 'ok', WEARABLE, '2026-10-12', 'wearable'),
      item('mood', 'mental', LBL.mood, L('Below the follow-up threshold', 'دون حد المتابعة'), 'ok', REPORT, '2026-10-12', 'clinical'),
      item('tobacco', 'lifestyle', LBL.tobacco, L('Never smoked. Daily family contact', 'لم تدخن قط. تواصل عائلي يومي'), 'ok', REPORT, '2026-10-12', 'clinical'),
      item('hearing', 'sensory', LBL.hearing, L('Passed screening', 'اجتازت الفحص'), 'ok', REPORT, '2025-01-20', 'clinical'),
      item('vision', 'sensory', LBL.vision, L('Passed with glasses', 'اجتازت بالنظارة'), 'ok', REPORT, '2025-01-20', 'clinical'),
      item('meds', 'medication', LBL.meds, L('Vitamin D only, confirmed', 'فيتامين د فقط، مؤكد'), 'ok', REPORT, '2026-10-12', 'clinical'),
      item('family', 'family', LBL.family, L('None known', 'لا يوجد ما هو معروف'), 'ok', REPORT, '2026-10-12', 'family'),
      item('apoe', 'genomic', LBL.apoe, L('e3/e3', 'e3/e3'), 'ok', L('Authorised genomics record', 'سجل جيني مصرّح به'), '2024-06-15', 'genomic'),
    ],
    clarify: [
      L('Is Mariam comfortable with the picture-first version, and would she like her son present?', 'هل مريم مرتاحة للنسخة المصوّرة، وهل ترغب في حضور ابنها؟'),
    ],
  },
  {
    id: 'SYN-103',
    name: 'Priya',
    age: 62,
    sex: 'F',
    summary: L('A borderline result after a night of poor sleep', 'نتيجة حدّية بعد ليلة نوم سيئة'),
    pathLabel: L('Repeat under the same conditions', 'إعادة في الظروف نفسها'),
    education: 'high',
    preferredLanguage: 'en',
    concern: L('Own concern about word finding, no change in daily tasks', 'قلق ذاتي من إيجاد الكلمات، دون تغيّر في المهام اليومية'),
    carePartner: null,
    consent: { access: true, clinical: true, wearable: true, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('en', 'visual', [
      ['2025-03-03', 9], ['2025-06-02', 9], ['2025-09-01', 9],
      ['2026-06-08', 9], ['2026-10-19', 8, { poorSleep: true }],
    ]),
    functionReports: [
      { date: '2026-10-19', reporter: 'self', level: 0, note: L('Word finding worries her. Daily tasks unchanged', 'يقلقها إيجاد الكلمات. المهام اليومية دون تغيير'), source: 'authored' },
    ],
    context: [
      item('bp', 'physical', LBL.bp, L('126/80 mmHg', '126/80 ملم زئبق'), 'ok', REPORT, '2026-10-19', 'clinical'),
      item('steps', 'physical', LBL.steps, L('About 7,800 a day', 'نحو 7,800 يوميًا'), 'ok', WEARABLE, '2026-10-19', 'wearable'),
      item('hba1c', 'metabolic', LBL.hba1c, L('5.5%', '5.5%'), 'ok', LAB, '2026-08-20', 'clinical'),
      item('sleep', 'sleep', LBL.sleep, L('Under 5 hours the night before the check', 'أقل من 5 ساعات ليلة الفحص'), 'attention', WEARABLE, '2026-10-19', 'wearable', 'sleep'),
      item('mood', 'mental', LBL.mood, null, 'unknown', L('Not formally assessed', 'لم يُقيّم رسميًا'), null, 'clinical', 'mood'),
      item('hearing', 'sensory', LBL.hearing, L('Passed screening', 'اجتازت الفحص'), 'ok', REPORT, '2025-03-03', 'clinical'),
      item('meds', 'medication', LBL.meds, L('None, confirmed', 'لا يوجد، مؤكد'), 'ok', REPORT, '2026-10-19', 'clinical'),
      item('family', 'family', LBL.family, L('Father: stroke at 74', 'الأب: سكتة دماغية في 74'), 'attention', REPORT, '2026-10-19', 'family', 'vascular'),
      item('apoe', 'genomic', LBL.apoe, null, 'unknown', NOT_SUPPLIED, null, 'genomic'),
    ],
    clarify: [
      L('Can the next check be booked after a normal night of sleep, at the same time of day?', 'هل يمكن حجز الفحص التالي بعد ليلة نوم طبيعية وفي الوقت نفسه من اليوم؟'),
      L('What word-finding moments worry Priya, and how often do they happen?', 'ما مواقف إيجاد الكلمات التي تقلق بريا، وكم مرة تحدث؟'),
    ],
  },
  {
    id: 'SYN-104',
    name: 'Salem',
    age: 68,
    sex: 'M',
    summary: L('Hearing concern, with an auditory task as his baseline', 'قلق بشأن السمع، ومهمة سمعية كخط أساس'),
    pathLabel: L('Held for audiology and a visual baseline', 'مُعلّق لفحص السمع وخط أساس بصري'),
    education: 'mid',
    preferredLanguage: 'ar',
    concern: L('Family says he often misses conversation', 'تقول العائلة إنه يفوّت الحديث غالبًا'),
    carePartner: L('Wife, with his permission', 'زوجته، بإذنه'),
    consent: { access: true, clinical: true, wearable: false, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: true,
    visionConcern: false,
    observations: series('ar', 'auditory', [
      ['2025-02-24', 7], ['2025-05-26', 7], ['2025-08-25', 8],
      ['2026-04-27', 6], ['2026-10-05', 8, {}, 'visual'],
    ]),
    functionReports: [
      { date: '2026-10-05', reporter: 'care_partner', level: 0, note: L('Misses conversation. Daily tasks unchanged', 'يفوّت الحديث. المهام اليومية دون تغيير'), source: 'authored' },
    ],
    context: [
      item('bp', 'physical', LBL.bp, L('132/84 mmHg', '132/84 ملم زئبق'), 'ok', REPORT, '2026-10-05', 'clinical'),
      item('steps', 'physical', LBL.steps, L('About 5,100 a day', 'نحو 5,100 يوميًا'), 'ok', WEARABLE, '2026-10-05', 'wearable'),
      item('hearing', 'sensory', LBL.hearing, L('Concern raised, not yet tested', 'أُثير قلق، لم يُفحص بعد'), 'attention', REPORT, '2026-10-05', 'clinical', 'sensory'),
      item('mood', 'mental', LBL.mood, null, 'unknown', L('Not formally assessed', 'لم يُقيّم رسميًا'), null, 'clinical', 'mood'),
      item('meds', 'medication', LBL.meds, L('Atorvastatin, confirmed', 'أتورفاستاتين، مؤكد'), 'ok', REPORT, '2026-10-05', 'clinical'),
      item('family', 'family', LBL.family, L('None known', 'لا يوجد ما هو معروف'), 'ok', REPORT, '2026-10-05', 'family'),
    ],
    clarify: [
      L('When can Salem have a hearing test, and does he want aids discussed?', 'متى يمكن إجراء فحص السمع لسالم، وهل يرغب في مناقشة السماعات؟'),
      L('Would he accept three visual visits to build a separate baseline?', 'هل يقبل ثلاث زيارات بصرية لبناء خط أساس منفصل؟'),
    ],
  },
  {
    id: 'SYN-105',
    name: 'Imran',
    age: 59,
    sex: 'M',
    summary: L('Assessed in Urdu, with no local calibration for that language', 'قُيّم بالأردية، دون معايرة محلية لهذه اللغة'),
    pathLabel: L('Held, number withheld', 'مُعلّق، الرقم محجوب'),
    education: 'mid',
    preferredLanguage: 'ur',
    concern: L('Employer wellness programme, no concern reported', 'برنامج عافية لجهة العمل، دون شكوى'),
    carePartner: null,
    consent: { access: true, clinical: true, wearable: false, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('ur', 'visual', [
      ['2025-03-17', 7], ['2025-06-16', 8], ['2025-09-15', 7],
      ['2026-03-16', 7], ['2026-09-21', 7],
    ]),
    functionReports: [
      { date: '2026-09-21', reporter: 'self', level: 0, note: L('No change reported', 'لا تغيير مبلّغ عنه'), source: 'authored' },
    ],
    context: [
      item('bp', 'physical', LBL.bp, L('138/86 mmHg', '138/86 ملم زئبق'), 'attention', REPORT, '2026-09-21', 'clinical', 'vascular'),
      item('hba1c', 'metabolic', LBL.hba1c, L('6.3%', '6.3%'), 'attention', LAB, '2026-09-01', 'clinical', 'metabolic'),
      item('mood', 'mental', LBL.mood, null, 'unknown', L('No validated screen offered in Urdu', 'لم يُقدّم فحص معتمد بالأردية'), null, 'clinical', 'mood'),
      item('tobacco', 'lifestyle', LBL.tobacco, L('Smokes daily. Family lives abroad', 'يدخن يوميًا. عائلته في الخارج'), 'attention', REPORT, '2026-09-21', 'clinical', 'social'),
    ],
    clarify: [
      L('Can a trained interpreter or Urdu-speaking clinician support the next visit?', 'هل يمكن لمترجم مدرّب أو طبيب يتحدث الأردية دعم الزيارة التالية؟'),
    ],
  },
  {
    id: 'SYN-106',
    name: 'Grace',
    age: 58,
    sex: 'F',
    summary: L('Only two visits and several results still missing', 'زيارتان فقط وعدة نتائج ما زالت ناقصة'),
    pathLabel: L('Held until the baseline is complete', 'مُعلّق حتى يكتمل خط الأساس'),
    education: 'mid',
    preferredLanguage: 'en',
    concern: L('New to the wellness programme', 'جديدة في برنامج العافية'),
    carePartner: null,
    consent: { access: true, clinical: true, wearable: true, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('en', 'visual', [['2026-06-15', 7], ['2026-09-14', 8]]),
    functionReports: [],
    context: [
      item('bp', 'physical', LBL.bp, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'vascular'),
      item('hba1c', 'metabolic', LBL.hba1c, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'metabolic'),
      item('sleep', 'sleep', LBL.sleep, null, 'unknown', NOT_SUPPLIED, null, 'wearable', 'sleep'),
      item('mood', 'mental', LBL.mood, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'mood'),
      item('meds', 'medication', LBL.meds, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'medicines'),
    ],
    clarify: [
      L('When can Grace complete a third visit in the same language and mode?', 'متى يمكن لجريس إكمال زيارة ثالثة باللغة والطريقة نفسيهما؟'),
    ],
  },
  {
    id: 'SYN-108',
    name: 'Hessa',
    age: 64,
    sex: 'F',
    summary: L('Stable task results, with a positive mood screen', 'نتائج مهام مستقرة، مع فحص مزاج إيجابي'),
    pathLabel: L('Qualified review for a high-risk result', 'مراجعة مؤهلة لنتيجة عالية الخطورة'),
    education: 'mid',
    preferredLanguage: 'ar',
    concern: L('Feeling low since a family bereavement, thinking feels slower', 'تدني المزاج منذ وفاة في العائلة، وتشعر ببطء التفكير'),
    carePartner: L('Sister, with her permission', 'أختها، بإذنها'),
    consent: { access: true, clinical: true, wearable: true, family: true, genomic: false },
    suddenChangeFlag: false,
    hearingConcern: false,
    visionConcern: false,
    observations: series('ar', 'visual', [
      ['2025-03-10', 7], ['2025-06-09', 8], ['2025-09-08', 7],
      ['2026-05-11', 7], ['2026-10-28', 8, { lowMood: true }],
    ]),
    functionReports: [
      { date: '2026-10-28', reporter: 'self', level: 0, note: L('Daily tasks are managed, with less interest in them', 'تُنجز المهام اليومية مع اهتمام أقل بها'), source: 'authored' },
    ],
    context: [
      item('mood', 'mental', LBL.mood, L('Positive screen, above the follow-up threshold', 'فحص إيجابي، فوق حد المتابعة'), 'attention', REPORT, '2026-10-28', 'clinical', 'mood', true),
      item('sleep', 'sleep', LBL.sleep, L('About 5.5 hours, waking early', 'نحو 5.5 ساعات، مع استيقاظ مبكر'), 'attention', WEARABLE, '2026-10-28', 'wearable', 'sleep'),
      item('bp', 'physical', LBL.bp, L('124/78 mmHg', '124/78 ملم زئبق'), 'ok', REPORT, '2026-10-28', 'clinical'),
      item('hba1c', 'metabolic', LBL.hba1c, L('5.6%', '5.6%'), 'ok', LAB, '2026-09-22', 'clinical'),
      item('meds', 'medication', LBL.meds, L('None, confirmed', 'لا يوجد، مؤكد'), 'ok', REPORT, '2026-10-28', 'clinical'),
      item('family', 'family', LBL.family, L('None known', 'لا يوجد ما هو معروف'), 'ok', REPORT, '2026-10-28', 'family'),
    ],
    clarify: [
      L('Ask directly about safety and thoughts of self-harm, following the local protocol.', 'السؤال مباشرة عن السلامة وأفكار إيذاء النفس، وفق البروتوكول المحلي.'),
      L('Would Hessa accept mental health support, and who does she want involved?', 'هل تقبل حصة دعم الصحة النفسية، ومن تريد إشراكه؟'),
    ],
  },
  {
    id: 'SYN-107',
    name: 'Noura',
    age: 77,
    sex: 'F',
    summary: L('Sudden confusion reported by her son this morning', 'ارتباك مفاجئ أبلغ عنه ابنها هذا الصباح'),
    pathLabel: L('Stopped, urgent handoff', 'أُوقف، تحويل عاجل'),
    education: 'low',
    preferredLanguage: 'ar',
    concern: L('Sudden confusion since this morning', 'ارتباك مفاجئ منذ هذا الصباح'),
    carePartner: L('Son', 'ابنها'),
    consent: { access: true, clinical: true, wearable: false, family: true, genomic: false },
    suddenChangeFlag: true,
    suddenChangeNote: L('Son reports sudden confusion since this morning', 'يبلغ الابن عن ارتباك مفاجئ منذ هذا الصباح'),
    hearingConcern: false,
    visionConcern: false,
    observations: series('ar', 'visual', [
      ['2025-04-07', 6], ['2025-07-07', 6], ['2025-10-06', 6], ['2026-04-06', 6],
    ]),
    functionReports: [],
    context: [
      item('meds', 'medication', LBL.meds, null, 'unknown', NOT_SUPPLIED, null, 'clinical', 'medicines'),
    ],
    clarify: [],
  },
];

/**
 * Points per task at each authored visit: [recall /4, sequence /2, search /2, switching /2].
 * Each row adds up to that visit's total. Fictional, like everything in this file.
 */
const PARTS: Record<string, [number, number, number, number][]> = {
  'SYN-102': [[3, 2, 2, 1], [3, 2, 1, 2], [3, 1, 2, 1], [2, 2, 2, 1], [1, 1, 2, 1]],
  'SYN-101': [[2, 1, 2, 1], [3, 1, 2, 1], [2, 1, 1, 2], [2, 1, 2, 1], [3, 1, 2, 1]],
  'SYN-103': [[4, 2, 2, 1], [4, 1, 2, 2], [3, 2, 2, 2], [4, 2, 1, 2], [3, 2, 2, 1]],
  'SYN-104': [[3, 1, 2, 1], [2, 2, 2, 1], [3, 2, 2, 1], [2, 1, 2, 1], [3, 2, 2, 1]],
  'SYN-105': [[3, 1, 2, 1], [3, 2, 2, 1], [2, 2, 2, 1], [3, 1, 2, 1], [3, 1, 2, 1]],
  'SYN-106': [[3, 1, 2, 1], [3, 2, 2, 1]],
  'SYN-108': [[3, 1, 2, 1], [3, 2, 2, 1], [2, 2, 2, 1], [3, 1, 2, 1], [3, 2, 2, 1]],
  'SYN-107': [[2, 1, 2, 1], [2, 1, 2, 1], [2, 1, 2, 1], [2, 1, 2, 1]],
};

for (const c of CASES) {
  c.observations = c.observations.map((o, i) => {
    const p = PARTS[c.id]?.[i];
    return p && o.score !== null ? { ...o, parts: { recall: p[0], sequence: p[1], search: p[2], switching: p[3] } } : o;
  });
}

export const LEAD_CASE_ID = 'SYN-102';
export const caseById = (id: string) => CASES.find((c) => c.id === id);
