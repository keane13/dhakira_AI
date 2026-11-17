import { useCallback, useEffect, useRef, useState } from 'react';
import { exampleDecision } from './engine/plan';
import { LEAD_CASE_ID } from './data/cases';
import { today, useApp, type PageId } from './store';
import { Sidebar } from './components/Sidebar';
import { Icon } from './components/icons';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Wordmark } from './components/brand';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { HowItWorks } from './pages/HowItWorks';
import { Workspace } from './pages/Workspace';
import { BrainCheck } from './pages/BrainCheck';
import { Review } from './pages/Review';
import { Validation } from './pages/Validation';
import { RecordPage } from './pages/RecordPage';
import { Monitoring } from './pages/Monitoring';
import { Docs } from './pages/Docs';

const VIEWS: Record<PageId, () => React.JSX.Element> = {
  home: Home, how: HowItWorks, workspace: Workspace, check: BrainCheck, review: Review,
  validation: Validation, record: RecordPage, monitoring: Monitoring, docs: Docs,
};

interface TourStep {
  page: PageId;
  caseId?: string;
  reveal?: number;
  apply?: 'approve' | 'clear';
  anchor?: string;
  title: { en: string; ar: string };
  body: { en: string; ar: string };
}

const TOUR: TourStep[] = [
  { page: 'home', title: { en: 'Start with who needs a person first', ar: 'ابدأ بمن يحتاج إلى شخص أولًا' }, body: { en: 'The queue orders fictional patients by urgency and shows each role its own next action.', ar: 'ترتب القائمة المرضى الخياليين حسب الإلحاح وتعرض لكل دور إجراءه التالي.' } },
  { page: 'workspace', caseId: LEAD_CASE_ID, apply: 'clear', title: { en: 'Khalid: the answer comes first', ar: 'خالد: الجواب أولًا' }, body: { en: 'His daughter reports new difficulty with bills and medicines. The proposed path, reason and next step sit at the top.', ar: 'تبلغ ابنته عن صعوبة جديدة في الفواتير والأدوية. يظهر المسار المقترح والسبب والخطوة التالية في الأعلى.' } },
  { page: 'workspace', caseId: LEAD_CASE_ID, reveal: 6, anchor: 'trace', title: { en: 'Code calculates the number', ar: 'الكود يحسب الرقم' }, body: { en: 'The scoring agent calls a versioned formula, comparing him with his own baseline. A language model never produces this number.', ar: 'يستدعي وكيل الحساب معادلة ذات إصدار، ويقارنه بخط أساسه. لا ينتج نموذج لغوي هذا الرقم أبدًا.' } },
  { page: 'workspace', caseId: LEAD_CASE_ID, reveal: 12, anchor: 'trace', title: { en: 'The draft waits for a person', ar: 'المسودة بانتظار شخص' }, body: { en: 'Stage 10 holds everything until a doctor decides. No care action is released before that.', ar: 'تعلّق المرحلة 10 كل شيء حتى يقرر الطبيب. لا يُفرج عن أي إجراء رعاية قبل ذلك.' } },
  { page: 'check', title: { en: 'A brief check in Arabic or English', ar: 'فحص قصير بالعربية أو الإنجليزية' }, body: { en: 'A nurse sets it up from the patient\'s baseline, with picture-first items, sound or sight modes, larger text and a paper option.', ar: 'يُعدّه الممرض من خط أساس المريض، مع بنود مصوّرة وطرق بالصوت أو البصر ونص أكبر وخيار ورقي.' } },
  { page: 'review', caseId: LEAD_CASE_ID, apply: 'approve', title: { en: 'The doctor edits and signs off', ar: 'يعدّل الطبيب ويوقّع' }, body: { en: 'This fictional doctor accepts the path and chooses the contributors. Nothing is booked or sent.', ar: 'يقبل هذا الطبيب الخيالي المسار ويختار العوامل. لم يُحجز أو يُرسل شيء.' } },
  { page: 'review', caseId: LEAD_CASE_ID, anchor: 'person-plan', title: { en: 'A plan the patient can read', ar: 'خطة يستطيع المريض قراءتها' }, body: { en: 'Plain language in English and Arabic, with local adaptation notes. The Arabic needs linguistic and cultural review before real use.', ar: 'لغة بسيطة بالإنجليزية والعربية مع ملاحظات التكييف المحلي. تحتاج العربية إلى مراجعة لغوية وثقافية قبل الاستخدام الفعلي.' } },
  { page: 'record', caseId: LEAD_CASE_ID, title: { en: 'One dated record', ar: 'سجل واحد مؤرخ' }, body: { en: 'The calculation trail, sources, decision and audit log, ready to print or export.', ar: 'مسار الحساب والمصادر والقرار وسجل التدقيق، جاهزة للطباعة أو التصدير.' } },
  { page: 'monitoring', caseId: LEAD_CASE_ID, title: { en: 'Follow the patient over time', ar: 'متابعة المريض عبر الزمن' }, body: { en: 'Every flag shows its source. Acknowledging a flag records that someone saw it. It does not close the concern.', ar: 'تعرض كل إشارة مصدرها. يسجل الإقرار بها أن شخصًا رآها، ولا يغلق موضوع القلق.' } },
  { page: 'validation', title: { en: 'Measure it from day one', ar: 'القياس منذ اليوم الأول' }, body: { en: 'Every metric the challenge names, split by language, age and education. These are synthetic records: they show the calculations work, not performance.', ar: 'كل مقياس ذكره التحدي، مقسم حسب اللغة والعمر والتعليم. هذه سجلات اصطناعية: تبيّن أن الحسابات تعمل، لا الأداء.' } },
  { page: 'workspace', caseId: 'SYN-107', title: { en: 'Noura: stopped', ar: 'نورة: أُوقف' }, body: { en: 'A sudden-change flag bypasses routine work for an urgent human handoff.', ar: 'تتجاوز إشارة التغيّر المفاجئ العمل الروتيني إلى تحويل بشري عاجل.' } },
  { page: 'workspace', caseId: 'SYN-108', title: { en: 'Hessa: stable numbers, high-risk context', ar: 'حصة: أرقام مستقرة وسياق عالي الخطورة' }, body: { en: 'Her task results are stable, but a positive mood screen still requires a qualified person.', ar: 'نتائج مهامها مستقرة، لكن فحص المزاج الإيجابي يتطلب شخصًا مؤهلًا.' } },
  { page: 'workspace', caseId: 'SYN-104', title: { en: 'Salem: held', ar: 'سالم: مُعلّق' }, body: { en: 'A hearing concern affects his auditory baseline, and a visual score cannot stand in for it. The number stays empty.', ar: 'يؤثر القلق بشأن السمع في خط أساسه السمعي، ولا تحل الدرجة البصرية محله. يبقى الرقم فارغًا.' } },
  { page: 'workspace', caseId: 'SYN-105', title: { en: 'Imran: number withheld', ar: 'عمران: الرقم محجوب' }, body: { en: 'No calibration exists for Urdu, so the tool withholds the number. Parameters are never borrowed from another language.', ar: 'لا معايرة للأردية، لذا تحجب الأداة الرقم. لا تُستعار المعايير من لغة أخرى أبدًا.' } },
];

const STEP_MS = 8500;

function Tour({ onExit }: { onExit: () => void }) {
  const app = useApp();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const step = TOUR[i];
  const appRef = useRef(app);
  appRef.current = app;

  useEffect(() => {
    const a = appRef.current;
    if (step.caseId && step.caseId !== a.caseId) a.setCaseId(step.caseId);
    // The walkthrough changes the screen only, never server records.
    if (step.apply === 'clear' && step.caseId) a.setDecision(step.caseId, null, { localOnly: true });
    if (step.apply === 'approve' && step.caseId) {
      const c = a.caseFor(step.caseId);
      a.setDecision(step.caseId, exampleDecision(c, a.runFor(step.caseId), today()), { localOnly: true });
    }
    if (a.page !== step.page) a.go(step.page);
    const timer = window.setTimeout(() => {
      const now = appRef.current;
      if (step.reveal !== undefined) {
        now.setRevealed(step.reveal);
        now.setTraceOpen(true);
      }
      const target = step.anchor ? document.getElementById(step.anchor) : null;
      if (target) target.scrollIntoView({ block: 'center' });
      else window.scrollTo(0, 0);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (!playing) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); return undefined; }
    const timer = window.setTimeout(() => {
      if (i < TOUR.length - 1) setI(i + 1);
      else setPlaying(false);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [i, playing]);

  return (
    <div className="tour no-print" role="region" aria-label={app.t('Demo walkthrough', 'جولة العرض')}>
      <div className="grow">
        <div className="sub num">{app.t('Demo walkthrough', 'جولة العرض')} · {i + 1} / {TOUR.length}</div>
        <div className="strong">{app.tx(step.title)}</div>
        <div className="body" aria-live="polite">{app.tx(step.body)}</div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-on-dark" disabled={i === 0} onClick={() => setI(i - 1)}>{app.t('Back', 'السابق')}</button>
        <button type="button" className="btn btn-light" onClick={() => setPlaying(!playing)}>{playing ? app.t('Pause', 'إيقاف مؤقت') : app.t('Play', 'تشغيل')}</button>
        <button type="button" className="btn btn-on-dark" disabled={i === TOUR.length - 1} onClick={() => setI(i + 1)}>{app.t('Next', 'التالي')}</button>
        <button type="button" className="btn btn-on-dark" onClick={onExit}>{app.t('Exit', 'خروج')}</button>
      </div>
    </div>
  );
}

function Shell() {
  const app = useApp();
  const { t, page } = app;
  const [touring, setTouring] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const View = VIEWS[page];

  useEffect(() => {
    const start = () => setTouring(true);
    window.addEventListener('dhakira:tour', start);
    return () => window.removeEventListener('dhakira:tour', start);
  }, []);

  return (
    <div className="shell">
      <Sidebar mobileOpen={menuOpen} onCloseMobile={closeMenu} />
      <div className="main">
        <div className="mobile-bar no-print">
          <button type="button" className="btn menu-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={18} /><span>{t('Menu', 'القائمة', 'Menu')}</span>
          </button>
          <Wordmark />
        </div>
        <main className="page">
          {app.syncError && (
            <div className="notice notice-hold no-print" role="alert">
              <span className="strong">{t('Not saved on the server:', 'لم يُحفظ على الخادم:', 'Tidak tersimpan di server:')}</span> {app.syncError}{' '}
              {t('The screen now shows what the server holds.', 'تعرض الشاشة الآن ما يحفظه الخادم.', 'Layar sekarang menampilkan isi server.')}
              <button type="button" className="link-btn" style={{ marginInlineStart: 8 }} onClick={app.dismissSyncError}>{t('Dismiss', 'إغلاق', 'Tutup')}</button>
            </div>
          )}
          <ErrorBoundary key={page} message={t('This page could not be shown. Your saved records are safe in this browser.', 'تعذر عرض هذه الصفحة. سجلاتك المحفوظة آمنة في هذا المتصفح.')} action={t('Reload the page', 'إعادة تحميل الصفحة')}>
            <View />
          </ErrorBoundary>
        </main>
      </div>
      {touring && <Tour onExit={() => setTouring(false)} />}
    </div>
  );
}

/** Signed out: the landing page, or the sign-in page at #/login. */
export function App() {
  const { session } = useApp();
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (session) return <Shell />;
  return hash === '#/login' ? <Login /> : <Landing />;
}
