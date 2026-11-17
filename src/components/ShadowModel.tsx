import { useId, useState } from 'react';
import { useApp } from '../store';
import { FEATURES, MODEL_VERSION, TARGET_SPECIFICITY, TEST_SEED, TEST_SIZE, TRAIN_SEED, TRAIN_SIZE } from '../engine/model';
import { SHADOW } from '../engine/shadow';
import type { Proportion } from '../engine/metrics';
import { Metric } from './ui';

const SERIES_1 = '#008572';
const pct = (p: number | null) => (p === null ? 'n/a' : `${(p * 100).toFixed(1)}%`);
const ci = (p: Proportion) => (p.lo === null || p.hi === null ? '' : `${(p.lo * 100).toFixed(1)} to ${(p.hi * 100).toFixed(1)}`);

/** Beside the formula on the patient summary. Shadow mode: it informs, it never routes. */
export function ShadowCard() {
  const { run, t, tx } = useApp();
  const s = run.shadow;
  if (!s) return null;
  const formulaFlags = run.change?.numericFlag === 'review' || run.outcome.route === 'qualified_review' || run.outcome.route === 'urgent';
  return (
    <section className="card" id="shadow-model" aria-labelledby="shadow-title">
      <div className="row between">
        <h3 id="shadow-title">{t('Model second opinion', 'رأي ثانٍ من النموذج', 'Opini kedua dari model')}</h3>
        <span className="tag tag-none">{t('Shadow mode', 'وضع الظل', 'Mode bayangan')}</span>
      </div>
      {!s.ok ? (
        <div className="notice notice-info">{tx(s.reason)}</div>
      ) : (
        <>
          <div className="grid-3">
            <Metric
              label={t('Estimated chance an assessment confirms change', 'الاحتمال المقدّر أن يؤكد التقييم التغيّر', 'Perkiraan peluang asesmen mengonfirmasi perubahan')}
              value={pct(s.p)}
              detail={<>{t('Operating point', 'نقطة التشغيل', 'Titik operasi')} <span className="num">{pct(s.threshold)}</span></>}
            />
            <Metric
              label={t('Model reading', 'قراءة النموذج', 'Bacaan model')}
              value={<span className="small strong">{s.above ? t('Above the operating point', 'فوق نقطة التشغيل', 'Di atas titik operasi') : t('Below the operating point', 'تحت نقطة التشغيل', 'Di bawah titik operasi')}</span>}
            />
            <Metric
              label={t('Against the formula', 'مقارنة بالمعادلة', 'Dibanding rumus')}
              value={<span className="small strong">{s.above === formulaFlags ? t('Agrees', 'يتفق', 'Sejalan') : t('Disagrees: worth a look', 'لا يتفق: يستحق النظر', 'Tidak sejalan: layak ditinjau')}</span>}
            />
          </div>
          <div>
            <p className="small strong">{t('What moved the estimate most', 'أكثر ما أثّر في التقدير', 'Yang paling memengaruhi estimasi')}</p>
            <ul className="small" style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
              {s.contributions.slice(0, 3).map((c) => (
                <li key={c.key}>{tx(c.label)}: {c.value > 0 ? t('raised it', 'رفعه', 'menaikkan') : t('lowered it', 'خفّضه', 'menurunkan')}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      <p className="tiny muted">{t(
        'Trained and tested on synthetic records only, so this shows how a model would be used, not how well it works on real patients. It never changes the proposed path, the queue or a referral. The doctor decides.',
        'دُرّب واختُبر على سجلات اصطناعية فقط، لذا يبيّن هذا كيف يُستخدم النموذج، لا مدى جودته مع مرضى حقيقيين. لا يغيّر أبدًا المسار المقترح أو القائمة أو الإحالة. القرار للطبيب.',
        'Dilatih dan diuji hanya pada data sintetis, jadi ini menunjukkan cara model dipakai, bukan seberapa baik kinerjanya pada pasien nyata. Model tidak pernah mengubah jalur usulan, antrean, atau rujukan. Dokter yang memutuskan.',
      )}</p>
    </section>
  );
}

/** Calibration: predicted against observed in five equal-count bins, with the line of perfect agreement. */
function CalibrationChart() {
  const { t } = useApp();
  const titleId = useId();
  const [tip, setTip] = useState<string | null>(null);
  const bins = SHADOW.evaluation.calibration;
  const W = 300, H = 220, L = 40, R = 12, T = 12, B = 34;
  const max = Math.max(0.8, ...bins.map((b) => Math.max(b.predicted, b.observed.hi ?? 0)));
  const x = (v: number) => L + (v / max) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <div className="chart-box" dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{t('Predicted against observed rate of confirmed change', 'المعدل المتوقع مقابل المعدل الملاحظ للتغيّر المؤكد', 'Prediksi dibanding laju perubahan terkonfirmasi yang teramati')}</title>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text>
            <text x={x(v)} y={H - 16} textAnchor="middle">{Math.round(v * 100)}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="#4f626a" strokeWidth={1} strokeDasharray="4 4" />
        <text x={W - R} y={H - 2} textAnchor="end" style={{ fontSize: 11 }}>{t('Predicted', 'المتوقع', 'Prediksi')}</text>
        {bins.map((b, i) => (
          <g key={i}>
            {b.observed.lo !== null && b.observed.hi !== null && (
              <line x1={x(b.predicted)} x2={x(b.predicted)} y1={y(b.observed.lo)} y2={y(b.observed.hi)} stroke={SERIES_1} strokeWidth={2} strokeLinecap="round" />
            )}
            <circle cx={x(b.predicted)} cy={y(b.observed.p ?? 0)} r={5} fill={SERIES_1} stroke="#fff" strokeWidth={2} />
            <circle
              cx={x(b.predicted)} cy={y(b.observed.p ?? 0)} r={14} fill="transparent"
              onMouseEnter={() => setTip(`${t('Predicted', 'المتوقع', 'Prediksi')} ${pct(b.predicted)} · ${t('observed', 'الملاحظ', 'teramati')} ${pct(b.observed.p)} (${b.observed.k}/${b.observed.n})`)}
              onMouseLeave={() => setTip(null)}
            />
          </g>
        ))}
      </svg>
      <p className="tiny muted num" aria-live="polite">{tip ?? t('Dashed line: perfect agreement. Bars: 95% interval of the observed rate.', 'الخط المتقطع: اتفاق تام. الأشرطة: فاصل 95% للمعدل الملاحظ.', 'Garis putus-putus: kesesuaian sempurna. Batang: interval 95% laju teramati.')}</p>
    </div>
  );
}

/** The model card and its held-out evaluation, with the gates that decide whether it is shown at all. */
export function ShadowEvaluation() {
  const { t, tx } = useApp();
  const e = SHADOW.evaluation;
  const m = SHADOW.model;
  const passedCount = e.gates.filter((g) => g.pass).length;
  return (
    <section className="stack" aria-labelledby="shadow-eval-title">
      <div className="stack" style={{ gap: 4 }}>
        <h2 id="shadow-eval-title">{t('Shadow model: held-out evaluation', 'النموذج الظلي: تقييم على بيانات محجوزة', 'Model bayangan: evaluasi data uji terpisah')}</h2>
        <p className="small muted" style={{ maxWidth: '80ch' }}>{t(
          `A small, explainable model on each person's own trajectory. Trained on ${TRAIN_SIZE} synthetic people (seed ${TRAIN_SEED}) and tested once on ${TEST_SIZE} different ones (seed ${TEST_SEED}). The gates were written before the first test run. If any gate fails, the model is hidden everywhere.`,
          `نموذج صغير وقابل للتفسير يعتمد على مسار كل شخص. دُرّب على ${TRAIN_SIZE} شخصًا اصطناعيًا (البذرة ${TRAIN_SEED}) واختُبر مرة واحدة على ${TEST_SIZE} آخرين (البذرة ${TEST_SEED}). كُتبت الشروط قبل أول اختبار. إذا أخفق أي شرط، يُخفى النموذج في كل مكان.`,
          `Model kecil yang bisa dijelaskan, berdasarkan lintasan tiap orang. Dilatih pada ${TRAIN_SIZE} orang sintetis (seed ${TRAIN_SEED}) dan diuji sekali pada ${TEST_SIZE} orang lain (seed ${TEST_SEED}). Syarat ditulis sebelum uji pertama. Jika satu syarat gagal, model disembunyikan di semua tempat.`,
        )}</p>
      </div>

      <div className={`notice ${e.passed ? 'notice-pass' : 'notice-stop'}`}>
        <span className="strong">{e.passed ? t('All deployment gates passed', 'اجتاز كل شروط النشر', 'Semua syarat penerapan lolos') : t('Withheld: a deployment gate failed', 'محجوب: أخفق أحد شروط النشر', 'Ditahan: ada syarat penerapan yang gagal')}</span>
        {' '}<span className="num">({passedCount}/{e.gates.length})</span>.{' '}
        {t('It runs in shadow mode beside the formula and never changes a route.', 'يعمل في وضع الظل بجانب المعادلة ولا يغيّر أي مسار.', 'Model berjalan dalam mode bayangan di samping rumus dan tidak pernah mengubah jalur.')}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('Gate', 'الشرط', 'Syarat')}</th><th>{t('Result', 'النتيجة', 'Hasil')}</th><th /></tr></thead>
          <tbody>{e.gates.map((g) => (
            <tr key={g.key}>
              <td>{tx(g.label)}</td>
              <td className="num">{g.value}</td>
              <td><span className={`tag ${g.pass ? 'tag-pass' : 'tag-stop'}`}>{g.pass ? t('Pass', 'ناجح', 'Lolos') : t('Fail', 'راسب', 'Gagal')}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="grid-2 start">
        <section className="card">
          <h3>{t('Model against the current formula', 'النموذج مقابل المعادلة الحالية', 'Model dibanding rumus saat ini')}</h3>
          <p className="small muted">{t(
            `Same held-out people, ${e.people} of them, each seen at four and at five visits. The model's operating point was set on training data for ${Math.round(TARGET_SPECIFICITY * 100)}% specificity, to keep false referrals down.`,
            `الأشخاص المحجوزون أنفسهم، وعددهم ${e.people}، وكل منهم بأربع زيارات وبخمس. ضُبطت نقطة تشغيل النموذج على بيانات التدريب لنوعية ${Math.round(TARGET_SPECIFICITY * 100)}%، لتقليل الإحالات الخاطئة.`,
            `Orang uji yang sama, ${e.people} orang, masing-masing dilihat pada empat dan lima kunjungan. Titik operasi model ditetapkan pada data latih untuk spesifisitas ${Math.round(TARGET_SPECIFICITY * 100)}%, agar rujukan keliru tetap rendah.`,
          )}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th /><th>{t('Model', 'النموذج', 'Model')}</th><th>{t('Formula', 'المعادلة', 'Rumus')}</th></tr></thead>
              <tbody>
                <tr><td>AUC</td><td className="num strong">{e.auc?.toFixed(3)} <span className="tiny muted">({e.aucCi?.[0].toFixed(3)} to {e.aucCi?.[1].toFixed(3)})</span></td><td className="num">{e.formula.auc?.toFixed(3)}</td></tr>
                <tr><td>{t('Sensitivity', 'الحساسية', 'Sensitivitas')}</td><td className="num strong">{pct(e.sensitivity.p)} <span className="tiny muted">({ci(e.sensitivity)})</span></td><td className="num">{pct(e.formula.sensitivity.p)}</td></tr>
                <tr><td>{t('Specificity', 'النوعية', 'Spesifisitas')}</td><td className="num strong">{pct(e.specificity.p)} <span className="tiny muted">({ci(e.specificity)})</span></td><td className="num">{pct(e.formula.specificity.p)}</td></tr>
                <tr><td>{t('False-referral burden', 'عبء الإحالات الخاطئة', 'Beban rujukan keliru')}</td><td className="num strong">{pct(e.falseReferral.p)}</td><td className="num">{pct(e.formula.falseReferral.p)}</td></tr>
                <tr><td>Brier</td><td className="num strong">{e.brier.toFixed(3)}</td><td className="muted small">{t('Base rate', 'المعدل الأساسي', 'Angka dasar')} <span className="num">{e.brierReference.toFixed(3)}</span></td></tr>
              </tbody>
            </table>
          </div>
          <p className="tiny muted">{t(
            'The gain over the formula is modest. A 5% share of reference labels is deliberately wrong in the synthetic data, which caps any model.',
            'التحسن على المعادلة متواضع. نسبة 5% من التسميات المرجعية خاطئة عمدًا في البيانات الاصطناعية، وهذا يحدّ من أي نموذج.',
            'Peningkatan dibanding rumus kecil. Sebanyak 5% label rujukan sengaja dibuat salah di data sintetis, sehingga membatasi model apa pun.',
          )}</p>
        </section>
        <section className="card">
          <h3>{t('Calibration', 'المعايرة', 'Kalibrasi')}</h3>
          <p className="small muted">{t('Does a 30% estimate come true about 30% of the time?', 'هل يتحقق تقدير 30% في نحو 30% من الحالات؟', 'Apakah estimasi 30% benar terjadi sekitar 30% kali?')}</p>
          <CalibrationChart />
        </section>
      </div>

      <section className="card">
        <h3>{t('By language, schooling and age', 'حسب اللغة والتعليم والعمر', 'Menurut bahasa, pendidikan, dan usia')}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('Group', 'المجموعة', 'Kelompok')}</th><th>n</th><th>{t('Positives', 'الإيجابيات', 'Positif')}</th><th>AUC</th><th>{t('Sensitivity', 'الحساسية', 'Sensitivitas')}</th><th>{t('Specificity', 'النوعية', 'Spesifisitas')}</th></tr></thead>
            <tbody>{e.subgroups.map((g) => (
              <tr key={`${g.group}-${g.label}`}>
                <td>{g.label}</td>
                <td className="num">{g.n}</td>
                <td className="num">{g.positives}</td>
                <td className="num">{g.auc?.toFixed(3) ?? 'n/a'}</td>
                <td className="num">{pct(g.sensitivity.p)}</td>
                <td className="num">{pct(g.specificity.p)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="tiny muted">{t(
          'Urdu and Indonesian are not listed: there is no calibration for them, so the model abstains rather than guess. Age 50 to 59 has the weakest AUC and the fewest positives.',
          'الأردية والإندونيسية غير مدرجتين: لا توجد معايرة لهما، لذا يمتنع النموذج بدل التخمين. الفئة العمرية 50 إلى 59 لها أضعف AUC وأقل عدد من الإيجابيات.',
          'Urdu dan Indonesia tidak tercantum: belum ada kalibrasi, jadi model abstain alih-alih menebak. Usia 50 sampai 59 punya AUC terlemah dan kasus positif paling sedikit.',
        )}</p>
      </section>

      <details className="card">
        <summary className="strong">{t('Model card', 'بطاقة النموذج', 'Kartu model')}</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <p className="small"><span className="strong">{t('Version', 'الإصدار', 'Versi')}:</span> <span className="mono">{MODEL_VERSION}</span> · {t('L2-regularised logistic regression, standardised features, Newton steps.', 'انحدار لوجستي مع تنظيم L2، وسمات معيارية، وخطوات نيوتن.', 'Regresi logistik dengan regularisasi L2, fitur terstandar, langkah Newton.')} · <span className="num">{m.trainedOn.rows}</span> {t('training rows', 'صف تدريب', 'baris latih')}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Feature', 'السمة', 'Fitur')}</th><th>{t('Weight per standard deviation', 'الوزن لكل انحراف معياري', 'Bobot per simpangan baku')}</th></tr></thead>
              <tbody>{FEATURES.map((f, i) => (
                <tr key={f.key}><td>{tx(f.label)}</td><td className="num">{m.weights[i] >= 0 ? '+' : ''}{m.weights[i].toFixed(3)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="tiny muted">{t(
            'Negative weights on change and on the latest visit mean a fall below the person\'s own baseline raises the estimate. Intended use: a second opinion beside the formula during a silent pilot. Not for diagnosis, screening decisions or any patient outside the trained languages and age range. Before real use it must be retrained and re-gated on local pilot data.',
            'الأوزان السالبة للتغيّر ولآخر زيارة تعني أن الانخفاض دون خط أساس الشخص يرفع التقدير. الاستخدام المقصود: رأي ثانٍ بجانب المعادلة خلال تجربة صامتة. ليس للتشخيص أو قرارات الفحص أو لأي مريض خارج اللغات والأعمار المدرّب عليها. قبل الاستخدام الفعلي يجب إعادة تدريبه وتقييمه بالشروط على بيانات تجربة محلية.',
            'Bobot negatif pada perubahan dan kunjungan terakhir berarti penurunan di bawah baseline sendiri menaikkan estimasi. Penggunaan: opini kedua di samping rumus selama uji coba senyap. Bukan untuk diagnosis, keputusan skrining, atau pasien di luar bahasa dan rentang usia yang dilatih. Sebelum dipakai nyata, model harus dilatih ulang dan diuji ulang dengan syarat pada data uji coba lokal.',
          )}</p>
        </div>
      </details>
    </section>
  );
}
