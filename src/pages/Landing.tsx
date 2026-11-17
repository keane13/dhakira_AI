import { Suspense, lazy, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../store';
import { LANGS } from '../i18n';
import { Wordmark } from '../components/brand';
import { SHADOW } from '../engine/shadow';
import type { Lang } from '../engine/types';

// three.js loads only here, so signed-in pages never download it.
const BrainScene = lazy(() => import('../components/BrainScene'));

const SHORT_LANG: Record<Lang, string> = { en: 'EN', ar: 'عربي', id: 'ID' };

const goSignIn = () => { window.location.hash = '#/login'; };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });

/**
 * Slides elements marked data-reveal into view as they enter the screen. Content is
 * only hidden once this runs, so it stays visible if scripts or observers fail.
 */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || reducedMotion() || !('IntersectionObserver' in window)) return undefined;
    el.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/** A delay for the nth item, so rows arrive one after another. */
const stagger = (i: number): CSSProperties => ({ '--reveal-delay': `${i * 90}ms` } as CSSProperties);

function LangPills() {
  const { lang, setLang, t } = useApp();
  return (
    <div className="landing-lang" role="group" aria-label={t('Interface language', 'لغة الواجهة', 'Bahasa antarmuka')}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} aria-label={l.label} title={l.label} onClick={() => setLang(l.code)}>{SHORT_LANG[l.code]}</button>
      ))}
    </div>
  );
}

function Section({ id, eyebrow, title, children, dark }: { id: string; eyebrow: string; title: string; children: ReactNode; dark?: boolean }) {
  return (
    <section id={id} className={`landing-section ${dark ? 'is-dark' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="landing-inner">
        <p className="section-eyebrow mono" data-reveal="up">{eyebrow}</p>
        <h2 id={`${id}-title`} data-reveal="up" style={stagger(1)}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function Landing() {
  const { t } = useApp();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const auc = SHADOW.evaluation.auc;

  const steps = [
    [t('Check', 'الفحص', 'Cek'), t('Four minutes, in the patient\'s language, on a tablet or on paper.', 'أربع دقائق، بلغة المريض، على جهاز لوحي أو ورقيًا.', 'Empat menit, dalam bahasa pasien, di tablet atau kertas.')],
    [t('Compare', 'المقارنة', 'Bandingkan'), t('Against the person\'s own baseline, with labs, medicines and history beside it.', 'مقارنة بخط أساس الشخص نفسه، مع التحاليل والأدوية والتاريخ بجانبه.', 'Dengan baseline orang itu sendiri, beserta lab, obat, dan riwayat.')],
    [t('Decide', 'القرار', 'Putuskan'), t('A nurse prepares, a doctor signs off. Nothing moves before that.', 'يُعدّ الممرض ويوقّع الطبيب. لا يتحرك شيء قبل ذلك.', 'Perawat menyiapkan, dokter menandatangani. Tidak ada yang berjalan sebelum itu.')],
  ];

  const outcomes = [
    [t('Accessible check', 'فحص سهل الوصول', 'Cek yang mudah diakses'), t('Three languages, paper route, accommodations.', 'ثلاث لغات ومسار ورقي وتيسيرات.', 'Tiga bahasa, jalur kertas, akomodasi.')],
    [t('Change over time', 'التغيّر عبر الزمن', 'Perubahan dari waktu ke waktu'), t('Reliable change against a personal baseline.', 'تغيّر موثوق مقارنة بخط أساس شخصي.', 'Perubahan bermakna terhadap baseline pribadi.')],
    [t('Risk context', 'سياق الخطر', 'Konteks risiko'), t('Labs, medicines, vascular, family, genomics.', 'التحاليل والأدوية والأوعية والعائلة والجينات.', 'Lab, obat, vaskular, keluarga, genomik.')],
    [t('Prevention', 'الوقاية', 'Pencegahan'), t('Reversible causes first, then a plain plan.', 'الأسباب القابلة للعلاج أولًا، ثم خطة واضحة.', 'Penyebab yang bisa dipulihkan dulu, lalu rencana sederhana.')],
    [t('Human oversight', 'إشراف بشري', 'Pengawasan manusia'), t('Gates that stop or hold, and a doctor\'s sign-off.', 'بوابات توقف أو تعلّق، وتوقيع الطبيب.', 'Gerbang yang menghentikan atau menahan, dan tanda tangan dokter.')],
    [t('Validation', 'التحقق', 'Validasi'), t('Every metric by language, age and schooling.', 'كل مقياس حسب اللغة والعمر والتعليم.', 'Setiap metrik menurut bahasa, usia, dan pendidikan.')],
  ];

  const rules: [string, string][] = [
    [t('No calibration, no number.', 'لا معايرة، لا رقم.', 'Tanpa kalibrasi, tanpa angka.'), t('Without local norms for a language, the score is withheld, never borrowed.', 'دون معايير محلية للغة، تُحجب الدرجة ولا تُستعار أبدًا.', 'Tanpa norma lokal untuk suatu bahasa, skor ditahan, tidak pernah dipinjam.')],
    [t('Missing stays missing.', 'الناقص يبقى ناقصًا.', 'Yang kosong tetap kosong.'), t('An absent value is shown as absent, never counted as zero.', 'تظهر القيمة الغائبة غائبةً، ولا تُحسب صفرًا أبدًا.', 'Nilai yang tidak ada ditampilkan kosong, tidak pernah dihitung nol.')],
    [t('Urgent goes to a person.', 'العاجل يذهب إلى شخص.', 'Yang mendesak langsung ke manusia.'), t('Sudden change and safety concerns skip the routine path.', 'التغيّر المفاجئ ومخاوف السلامة تتجاوز المسار الروتيني.', 'Perubahan mendadak dan masalah keamanan melewati jalur rutin.')],
    [t('A doctor signs off.', 'الطبيب يوقّع.', 'Dokter yang menandatangani.'), t('No path is released until a doctor approves it. The server enforces this.', 'لا يُفرج عن أي مسار قبل موافقة الطبيب. ويفرض الخادم ذلك.', 'Tidak ada jalur yang dilepas sebelum dokter menyetujui. Server menegakkannya.')],
    [t('The model stays in the shadow.', 'النموذج يبقى في الظل.', 'Model tetap di balik layar.'), auc === null
      ? t('A machine-learning second opinion never changes a route.', 'رأي ثانٍ من التعلّم الآلي لا يغيّر أي مسار.', 'Opini kedua dari machine learning tidak pernah mengubah jalur.')
      : t(`A second opinion with held-out AUC ${auc.toFixed(2)} on synthetic data. It never changes a route and hides itself if a safety gate fails.`, `رأي ثانٍ بقيمة AUC ${auc.toFixed(2)} على بيانات اصطناعية محجوزة. لا يغيّر أي مسار ويختفي إذا أخفق شرط أمان.`, `Opini kedua dengan AUC ${auc.toFixed(2)} pada data uji sintetis. Tidak pernah mengubah jalur dan bersembunyi jika syarat keamanan gagal.`)],
    [t('Nothing leaves quietly.', 'لا شيء يخرج بصمت.', 'Tidak ada yang keluar diam-diam.'), t('FHIR R4 export is a download, tagged as test data.', 'تصدير FHIR R4 تنزيل موسوم كبيانات اختبار.', 'Ekspor FHIR R4 berupa unduhan, ditandai data uji.')],
  ];

  return (
    <div className="landing" ref={root}>
      <div className="landing-hero-wrap">
        <div className="hero-stage" aria-hidden="true">
          <Suspense fallback={null}>
            <BrainScene />
          </Suspense>
        </div>

        <header className="landing-top">
          <Wordmark onDark />
          <nav className="landing-nav" aria-label={t('Sections', 'الأقسام', 'Bagian')}>
            <button type="button" onClick={() => scrollTo('how')}>{t('How it works', 'كيف يعمل', 'Cara kerja')}</button>
            <button type="button" onClick={() => scrollTo('safety')}>{t('Safety', 'السلامة', 'Keamanan')}</button>
          </nav>
          <span className="grow" />
          <LangPills />
          <button type="button" className="pill-btn" onClick={goSignIn}>{t('Sign in', 'تسجيل الدخول', 'Masuk')}</button>
        </header>

        <section className="landing-hero">
          <div className="hero-copy">
            <p className="hero-eyebrow hero-in" style={stagger(0)}>{t('Brain health, earlier', 'صحة الدماغ، مبكرًا', 'Kesehatan otak, lebih awal')}</p>
            <h1 className="hero-in" style={stagger(1)}>{t('See brain change early.', 'لاحظ تغيّر الدماغ مبكرًا.', 'Kenali perubahan otak lebih awal.')}</h1>
            <p className="hero-lede hero-in" style={stagger(2)}>{t('For doctors and nurses, in Arabic, English and Indonesian.', 'للأطباء والممرضين، بالعربية والإنجليزية والإندونيسية.', 'Untuk dokter dan perawat, dalam bahasa Arab, Inggris, dan Indonesia.')}</p>
            <div className="row hero-cta hero-in" style={stagger(3)}>
              <button type="button" className="pill-btn pill-btn-lg" onClick={goSignIn}>{t('Sign in', 'تسجيل الدخول', 'Masuk')}</button>
              <button type="button" className="pill-btn pill-btn-ghost pill-btn-lg" onClick={() => scrollTo('how')}>{t('How it works', 'كيف يعمل', 'Cara kerja')}</button>
            </div>
          </div>
        </section>

        <p className="hero-caption">{t(
          'Illustration only. Fictional patients. Identifies risk, does not diagnose.',
          'رسم توضيحي فقط. مرضى خياليون. يحدد الخطر ولا يشخّص.',
          'Hanya ilustrasi. Pasien fiktif. Mengidentifikasi risiko, bukan mendiagnosis.',
        )}</p>
        <button type="button" className="scroll-cue" onClick={() => scrollTo('how')} aria-label={t('Scroll to how it works', 'انتقل إلى كيف يعمل', 'Gulir ke cara kerja')}>
          <span aria-hidden="true" />
        </button>
      </div>

      <main>
        <Section id="how" eyebrow="01" title={t('Three steps, one person at a time', 'ثلاث خطوات، شخص واحد في كل مرة', 'Tiga langkah, satu orang setiap kali')}>
          <ol className="steps-track">
            {steps.map(([title, body], i) => (
              <li key={title} data-reveal="left" style={stagger(i + 2)}>
                <span className="step-index mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="outcomes" eyebrow="02" title={t('The six outcomes of the challenge', 'نتائج التحدي الست', 'Enam hasil yang diminta tantangan')}>
          <div className="outcome-grid">
            {outcomes.map(([title, body], i) => (
              <div key={title} className="outcome" data-reveal="up" style={stagger(i)}>
                <h3>{title}</h3>
                <p className="muted small">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="safety" eyebrow="03" title={t('What it will not do', 'ما لن يفعله', 'Yang tidak akan dilakukannya')} dark>
          <ol className="rules">
            {rules.map(([rule, why], i) => (
              <li key={rule} data-reveal={i % 2 ? 'right' : 'left'} style={stagger(i)}>
                <span className="rule-index mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <p className="rule-text">{rule}</p>
                <p className="rule-why">{why}</p>
              </li>
            ))}
          </ol>
        </Section>

        <section className="landing-close" data-reveal="up">
          <h2>{t('Try it with fictional patients.', 'جرّبه مع مرضى خياليين.', 'Coba dengan pasien fiktif.')}</h2>
          <button type="button" className="pill-btn pill-btn-dark pill-btn-lg" onClick={goSignIn}>{t('Sign in', 'تسجيل الدخول', 'Masuk')}</button>
        </section>
      </main>

      <footer className="landing-foot">
        <p>{t(
          'Research prototype for the Future Health Digital Innovation Challenge. Calibration and model results are synthetic.',
          'نموذج بحثي أولي لتحدي الابتكار الرقمي للصحة المستقبلية. المعايرة ونتائج النموذج اصطناعية.',
          'Prototipe riset untuk Future Health Digital Innovation Challenge. Kalibrasi dan hasil model bersifat sintetis.',
        )}</p>
      </footer>
    </div>
  );
}
