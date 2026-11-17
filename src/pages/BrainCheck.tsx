import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORMS, FUNCTION_ITEMS, formForVisit, functionLevel, learnItems, recognitionItems, scoreRecall, scoreSearches,
  scoreSequences, scoreSwitching, toFunctionReport, toObservation, totalScore,
  type CheckForm, type CheckParts, type Fill, type FormId, type LiveCheck, type Shape,
} from '../engine/checkin';
import type { AssessmentLanguage, Conditions, Lang, Localised, Mode } from '../engine/types';
import { today, useApp } from '../store';
import { pick, pickL } from '../i18n';
import { GoButton, PageHead, PatientBanner, RouteTag, download } from '../components/ui';
import { selectComparable } from '../engine/pipeline';
import { StandardsSection } from '../components/Standards';

const LANGUAGE_NAME: Record<AssessmentLanguage, { en: string; ar: string; id: string }> = {
  ar: { en: 'Arabic', ar: 'العربية', id: 'Arab' },
  en: { en: 'English', ar: 'الإنجليزية', id: 'Inggris' },
  id: { en: 'Indonesian', ar: 'الإندونيسية', id: 'Indonesia' },
  ur: { en: 'Urdu', ar: 'الأردية', id: 'Urdu' },
};

type Step = 'setup' | 'paper' | 'context' | 'learn' | 'sequence' | 'search' | 'switch' | 'recall' | 'function' | 'done';
const FLOW: Step[] = ['context', 'learn', 'sequence', 'search', 'switch', 'recall', 'function', 'done'];

function ShapeMark({ shape, fill, size = 44 }: { shape: Shape; fill: Fill; size?: number }) {
  const props = { fill: fill === 'solid' ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 3 };
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      {shape === 'circle' && <circle cx="22" cy="22" r="17" {...props} />}
      {shape === 'square' && <rect x="6" y="6" width="32" height="32" {...props} />}
      {shape === 'diamond' && <polygon points="22,4 40,22 22,40 4,22" {...props} />}
      {shape === 'triangle' && <polygon points="22,5 40,38 4,38" {...props} />}
    </svg>
  );
}

const SHAPE_NAME: Record<Shape, { en: string; ar: string }> = {
  circle: { en: 'circle', ar: 'دائرة' }, square: { en: 'square', ar: 'مربع' },
  diamond: { en: 'diamond', ar: 'معيّن' }, triangle: { en: 'triangle', ar: 'مثلث' },
};

let audioCtx: AudioContext | null = null;
function tone(index: number) {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = [262, 330, 392, 440][index];
    gain.gain.value = 0.12;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    // Sound is unavailable on this device; the setup screen tells people to use visual mode.
  }
}

function speak(text: string, language: AssessmentLanguage): boolean {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  const tag = language === 'ar' ? 'ar' : language === 'id' ? 'id' : 'en';
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(tag));
  if (!voice && synth.getVoices().length > 0) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag === 'ar' ? 'ar-AE' : tag === 'id' ? 'id-ID' : 'en-GB';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  synth.speak(u);
  return true;
}

export function BrainCheck() {
  const app = useApp();
  const { t, tx, currentCase: c, caseId, addLiveCheck, addStudio, clearStudio, studio, extraObservations, run, lang } = app;

  const [purpose, setPurpose] = useState<'observation' | 'practice'>('observation');
  const [administration, setAdministration] = useState<'device' | 'staff-paper'>('device');
  const protocol = useMemo(() => selectComparable(c).protocol, [c]);
  const [language, setLanguage] = useState<AssessmentLanguage>(lang);
  const [mode, setMode] = useState<Mode>('visual');
  const [pictureFirst, setPictureFirst] = useState(false);
  const [paperParts, setPaperParts] = useState<CheckParts>({ recall: 0, sequence: 0, search: 0, switching: 0 });

  // Set up from the patient's record, so a repeat check stays comparable by default.
  useEffect(() => {
    setLanguage(protocol?.language ?? c.preferredLanguage);
    setMode(protocol?.mode ?? 'visual');
    setPictureFirst(c.education === 'low');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);
  const [noTimeLimit, setNoTimeLimit] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [reporter, setReporter] = useState<'self' | 'care_partner'>('self');
  const [voiceMissing, setVoiceMissing] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('text-large', largeText);
    document.documentElement.classList.toggle('contrast-high', highContrast);
    return () => document.documentElement.classList.remove('text-large', 'contrast-high');
  }, [largeText, highContrast]);

  const [step, setStep] = useState<Step>('setup');
  const [conditions, setConditions] = useState<Conditions>({ poorSleep: false, fasting: false, lowMood: false, distraction: false, aidsWorn: false, assisted: false });

  const visit = c.observations.length + 1;
  const formId: FormId = purpose === 'observation' ? formForVisit(visit) : (['A', 'B', 'C'] as FormId[])[studio.length % 3];
  const form = FORMS[formId];

  const [seqResponses, setSeqResponses] = useState<number[][]>([]);
  const [searchSel, setSearchSel] = useState<number[][]>([]);
  const [switchAns, setSwitchAns] = useState<number[]>([]);
  const [recallSel, setRecallSel] = useState<string[]>([]);
  const [funcAns, setFuncAns] = useState<number[]>(FUNCTION_ITEMS.map(() => 0));
  const [saved, setSaved] = useState(false);

  // The check speaks its own language, separate from the interface language.
  const checkLang: Lang = language === 'ur' ? 'en' : language;
  const q = useCallback((en: string, ar: string, id?: string) => pick(checkLang, en, ar, id), [checkLang]);
  const ql = useCallback((l: Localised) => pickL(checkLang, l), [checkLang]);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const say = useCallback((text: string) => {
    if (!readAloud) return;
    if (!speak(text, language)) setVoiceMissing(true);
  }, [readAloud, language]);

  const next = () => {
    const i = FLOW.indexOf(step);
    setStep(FLOW[i + 1]);
  };

  const parts: CheckParts = useMemo(() => (administration === 'staff-paper' ? paperParts : {
    recall: scoreRecall(form, recallSel),
    sequence: scoreSequences(form, seqResponses),
    search: scoreSearches(form, searchSel),
    switching: scoreSwitching(form, switchAns),
  }), [administration, paperParts, form, recallSel, seqResponses, searchSel, switchAns]);

  const restart = () => {
    setStep('setup');
    setSeqResponses([]); setSearchSel([]); setSwitchAns([]); setRecallSel([]);
    setFuncAns(FUNCTION_ITEMS.map(() => 0));
    setPaperParts({ recall: 0, sequence: 0, search: 0, switching: 0 });
    setSaved(false);
  };

  const notComparable = purpose === 'observation' && protocol && (protocol.language !== language || protocol.mode !== mode);

  const saveToCase = () => {
    const check: LiveCheck = {
      parts, language, mode, form: formId, reporter, date: today(), administration,
      conditions: { ...conditions, assisted }, functionAnswers: funcAns,
    };
    addLiveCheck(caseId, toObservation({ ...c, observations: c.observations.filter((o) => o.source !== 'live-check') }, extraObservations[caseId] ?? [], check), toFunctionReport(check));
    setSaved(true);
  };

  const saveToStudio = () => {
    addStudio({ id: `P-${Date.now()}`, date: today(), purpose: 'practice', language, mode, parts });
    setSaved(true);
  };

  const canProceed = language !== 'ur';
  const stepIndex = FLOW.indexOf(step);

  return (
    <>
      <PageHead title={t('Cognitive check', 'الفحص الإدراكي')}>
        {t(
          'A four-minute check with four short tasks and daily-life questions, given on a device or on paper. Items are original and have not been validated, so this shows the monitoring approach and is not a scored clinical instrument.',
          'فحص من أربع دقائق يضم أربع مهام قصيرة وأسئلة عن الحياة اليومية، على جهاز أو ورقيًا. البنود أصلية ولم يُتحقق من صحتها، لذا يبيّن هذا طريقة المتابعة وليس أداة سريرية معتمدة.',
        )}
      </PageHead>

      {step === 'setup' && <PatientBanner />}

      {step === 'setup' && (
        <div className="wide-narrow">
          <section className="card stack-lg">
            <div className="stack">
              <h2>{t('Set up the check', 'إعداد الفحص')}</h2>
              <p className="small muted">{t('Language, mode and picture-first are set from the patient\'s record. Change them only if the patient needs it.', 'تُضبط اللغة والطريقة والصور أولًا من سجل المريض. غيّرها فقط إذا احتاج المريض إلى ذلك.')}</p>
              <div className="segmented" role="group" aria-label={t('Purpose', 'الغرض')}>
                <button type="button" aria-pressed={purpose === 'observation'} onClick={() => setPurpose('observation')}>{t('Fixed observation', 'ملاحظة ثابتة')}</button>
                <button type="button" aria-pressed={purpose === 'practice'} onClick={() => setPurpose('practice')}>{t('Practice only', 'تمرين فقط')}</button>
              </div>
              <p className="small muted">{purpose === 'observation'
                ? t('Uses the next alternate form and can be saved to a case. Different forms limit item learning.', 'يستخدم النموذج البديل التالي ويمكن حفظه في حالة. تحدّ النماذج المختلفة من تعلّم البنود.')
                : t('Goes to a separate log and can never change a case or its route.', 'يذهب إلى سجل منفصل ولا يمكنه أبدًا تغيير حالة أو مسارها.')}</p>
            </div>
            <div className="stack">
              <span className="small strong">{t('How is the check given?', 'كيف يُجرى الفحص؟')}</span>
              <div className="segmented" role="group" aria-label={t('How the check is given', 'طريقة إجراء الفحص')}>
                <button type="button" aria-pressed={administration === 'device'} onClick={() => setAdministration('device')}>{t('On a device', 'على جهاز')}</button>
                <button type="button" aria-pressed={administration === 'staff-paper'} onClick={() => setAdministration('staff-paper')}>{t('On paper, with staff', 'ورقيًا، مع الموظفين')}</button>
              </div>
              {administration === 'staff-paper' && <p className="small muted">{t('For patients who cannot or prefer not to use a device. Print the staff sheet, give the check, then enter the scores.', 'للمرضى الذين لا يستطيعون أو لا يفضلون استخدام جهاز. اطبع ورقة الموظفين وأجرِ الفحص ثم أدخل الدرجات.')}</p>}
            </div>
            <div className="grid-2">
              <label className="field">
                {t('Language of the check', 'لغة الفحص')}
                <select value={language} onChange={(e) => setLanguage(e.target.value as AssessmentLanguage)}>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="en">English</option>
                  <option value="id">Bahasa Indonesia ({t('Indonesian', 'الإندونيسية', 'Indonesia')})</option>
                  <option value="ur">{t('Urdu: not available yet', 'الأردية: غير متاحة بعد')}</option>
                </select>
              </label>
              <label className="field">
                {t('Sequence task presented by', 'تُعرض مهمة التسلسل عبر')}
                <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="visual">{t('Sight (no sound needed)', 'البصر (دون صوت)')}</option>
                  <option value="auditory">{t('Sound (tones only)', 'الصوت (نغمات فقط)')}</option>
                </select>
              </label>
            </div>
            {language === 'ur' && (
              <div className="notice notice-hold">{t(
                'The check has no Urdu version or calibration. Staff should offer an interpreter-supported conversation instead of a translated score.',
                'لا توجد نسخة أردية أو معايرة للفحص. ينبغي للموظفين تقديم حديث بدعم مترجم بدلًا من درجة مترجمة.',
              )}</div>
            )}
            {language === 'id' && (
              <div className="notice notice-hold">{t(
                'The check can be given in Indonesian, but there is no Indonesian calibration yet. The result is saved, and its change number is withheld until local norms exist.',
                'يمكن إجراء الفحص بالإندونيسية، لكن لا توجد معايرة إندونيسية بعد. تُحفظ النتيجة، ويُحجب رقم التغيّر حتى تتوفر معايير محلية.',
                'Cek bisa diberikan dalam bahasa Indonesia, tetapi kalibrasi bahasa Indonesia belum ada. Hasilnya disimpan, dan angka perubahannya ditahan sampai norma lokal tersedia.',
              )}</div>
            )}
            {notComparable && language !== 'ur' && (
              <div className="notice notice-hold">{t(
                'This differs from the patient\'s baseline language or mode. The result will be kept, but it will be left out of the change comparison, and the record will say why.',
                'يختلف هذا عن لغة خط أساس المريض أو طريقته. ستُحفظ النتيجة لكنها ستُستبعد من مقارنة التغيّر، وسيذكر السجل السبب.',
              )}</div>
            )}
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend className="strong" style={{ marginBottom: 8 }}>{t('Accommodations', 'التيسيرات')}</legend>
              <div className="grid-2">
                <label className="check"><input type="checkbox" checked={pictureFirst} onChange={(e) => setPictureFirst(e.target.checked)} />{t('Picture-first, for people who prefer not to read', 'الصور أولًا، لمن يفضلون عدم القراءة')}</label>
                <label className="check"><input type="checkbox" checked={noTimeLimit} onChange={(e) => setNoTimeLimit(e.target.checked)} />{t('No time limit on the learning screen', 'دون حد زمني في شاشة التعلّم')}</label>
                <label className="check"><input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />{t('Read the instructions aloud', 'قراءة التعليمات بصوت عالٍ')}</label>
                <label className="check"><input type="checkbox" checked={assisted} onChange={(e) => setAssisted(e.target.checked)} />{t('A family member or staff member helps with the device', 'يساعد أحد أفراد العائلة أو الموظفين في استخدام الجهاز')}</label>
                <label className="check"><input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} />{t('Larger text', 'نص أكبر')}</label>
                <label className="check"><input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />{t('Higher contrast', 'تباين أعلى')}</label>
              </div>
              <p className="small muted">{t('Accommodations are recorded with the result. A clinician reads them beside it, and they do not change the number.', 'تُسجل التيسيرات مع النتيجة. يقرؤها الطبيب بجانبها، ولا تغيّر الرقم.')}</p>
              {voiceMissing && <div className="notice notice-hold">{t('This device has no voice for that language, so a person should read the instructions aloud.', 'لا يوجد صوت لهذه اللغة على هذا الجهاز، لذا ينبغي أن يقرأ شخص التعليمات بصوت عالٍ.')}</div>}
            </fieldset>
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={() => setStep(administration === 'staff-paper' ? 'paper' : 'context')}>{administration === 'staff-paper' ? t('Open the staff sheet', 'فتح ورقة الموظفين') : t('Start the check', 'بدء الفحص')}</button>
            </div>
          </section>

          <aside className="stack">
            <section className="card card-tight">
              <h3>{t('Why alternate forms and modes matter', 'لماذا تهم النماذج البديلة والطرق')}</h3>
              <p className="small muted">{t(
                'Sight and sound versions are never swapped. A check taken in a different language or mode is kept but left out of the comparison, and the record says why.',
                'لا تُستبدل نسختا البصر والصوت أبدًا. يُحتفظ بالفحص الذي يُجرى بلغة أو طريقة مختلفة لكنه يُستبعد من المقارنة، ويذكر السجل السبب.',
              )}</p>
            </section>
            {purpose === 'practice' && (
              <section className="card card-tight">
                <div className="row between">
                  <h3>{t('Separate practice log', 'سجل التمرين المنفصل')}</h3>
                  {studio.length > 0 && <button type="button" className="btn" onClick={clearStudio}>{t('Clear', 'مسح')}</button>}
                </div>
                {studio.length === 0
                  ? <p className="small muted">{t('No practice rounds yet. Finish a round to see it here.', 'لا توجد جولات تمرين بعد. أكمل جولة لتراها هنا.')}</p>
                  : (
                    <>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>{t('Date', 'التاريخ')}</th><th>{t('Language and mode', 'اللغة والطريقة')}</th><th>{t('Points', 'النقاط')}</th></tr></thead>
                          <tbody>{studio.slice(0, 6).map((s) => (
                            <tr key={s.id}><td className="num">{s.date}</td><td>{s.language}, {s.mode}</td><td className="num">{totalScore(s.parts)}/10</td></tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <button type="button" className="btn" onClick={() => download('dhakira-practice-log.json', JSON.stringify(studio, null, 2))}>{t('Export practice log', 'تصدير سجل التمرين')}</button>
                    </>
                  )}
                <p className="tiny muted">{t('Evidence for brain-training activities is mixed. This log makes no claim of benefit.', 'الأدلة على أنشطة تدريب الدماغ متباينة. لا يدّعي هذا السجل أي فائدة.')}</p>
              </section>
            )}
          </aside>
        </div>
      )}

      {step === 'setup' && <StandardsSection />}

      {step === 'paper' && (
        <PaperEntry
          form={form} language={language} parts={paperParts} setParts={setPaperParts}
          conditions={conditions} setConditions={setConditions} answers={funcAns} setAnswers={setFuncAns}
          reporter={reporter} setReporter={setReporter} onDone={() => setStep('done')}
        />
      )}

      {step !== 'setup' && step !== 'paper' && (
        <p className="small muted no-print">{t(
          `The check is shown in the patient's language (${LANGUAGE_NAME[language].en}), set in the setup. Staff instructions stay in the interface language.`,
          `يُعرض الفحص بلغة المريض (${LANGUAGE_NAME[language].ar})، المحددة في الإعداد. تبقى تعليمات الموظفين بلغة الواجهة.`,
          `Cek ditampilkan dalam bahasa pasien (${LANGUAGE_NAME[language].id}), sesuai pengaturan. Petunjuk untuk staf tetap dalam bahasa antarmuka.`,
        )}</p>
      )}

      {step !== 'setup' && step !== 'paper' && (
        <section className="check-stage" dir={dir} lang={language}>
          <div className="progress" aria-hidden="true">
            {FLOW.map((s, i) => <span key={s} className={i <= stepIndex ? 'on' : ''} />)}
          </div>

          {step === 'context' && <ContextStep q={q} say={say} conditions={conditions} setConditions={setConditions} onNext={next} />}
          {step === 'learn' && <LearnStep q={q} say={say} tx={ql} items={learnItems(form)} pictureFirst={pictureFirst} noTimeLimit={noTimeLimit} onNext={next} />}
          {step === 'sequence' && <SequenceStep q={q} say={say} sequences={form.sequences} mode={mode} onDone={(r) => { setSeqResponses(r); next(); }} />}
          {step === 'search' && <SearchStep q={q} say={say} language={checkLang} searches={form.searches} onDone={(r) => { setSearchSel(r); next(); }} />}
          {step === 'switch' && <SwitchStep q={q} say={say} trials={form.switches} onDone={(r) => { setSwitchAns(r); next(); }} />}
          {step === 'recall' && <RecallStep q={q} say={say} tx={ql} items={recognitionItems(form)} pictureFirst={pictureFirst} onDone={(r) => { setRecallSel(r); next(); }} />}
          {step === 'function' && <FunctionStep q={q} say={say} tx={ql} answers={funcAns} setAnswers={setFuncAns} reporter={reporter} setReporter={setReporter} onNext={next} />}

          {step === 'done' && (
            <div className="stack" style={{ alignItems: 'center' }}>
              <div className="prompt">{q('Thank you. That is the end of the check.', 'شكرًا لك. انتهى الفحص.')}</div>
              <p className="muted">{q('A clinician reads this with your earlier results. One result on its own is not a diagnosis.', 'يقرأ الطبيب هذه النتيجة مع نتائجك السابقة. النتيجة الواحدة وحدها ليست تشخيصًا.')}</p>
            </div>
          )}
        </section>
      )}

      {step === 'done' && (
        <section className="card">
          <h2>{t('For staff: what was recorded', 'للموظفين: ما تم تسجيله')}</h2>
          <div className="grid-4">
            <div className="metric"><span className="lbl">{t('Picture recall', 'تذكر الصور')}</span><span className="val num">{parts.recall}/4</span></div>
            <div className="metric"><span className="lbl">{t('Sequence', 'التسلسل')}</span><span className="val num">{parts.sequence}/2</span></div>
            <div className="metric"><span className="lbl">{t('Find the target', 'إيجاد الهدف')}</span><span className="val num">{parts.search}/2</span></div>
            <div className="metric"><span className="lbl">{t('Rule switching', 'تبديل القواعد')}</span><span className="val num">{parts.switching}/2</span></div>
          </div>
          <p>
            <span className="strong">{t('Total ', 'المجموع ')}</span><span className="num strong">{totalScore(parts)}/10</span>
            <span className="muted small"> · {t('form', 'النموذج')} {formId} · {language} · {mode}{functionLevel(funcAns) > 0 ? t(' · daily-life change reported', ' · أُبلغ عن تغيّر في الحياة اليومية') : ''}</span>
          </p>
          {purpose === 'practice' ? (
            !saved
              ? <div className="row"><button type="button" className="btn btn-primary" onClick={saveToStudio}>{t('Save to the separate practice log', 'الحفظ في سجل التمرين المنفصل')}</button><button type="button" className="btn" onClick={restart}>{t('Discard', 'تجاهل')}</button></div>
              : <div className="row"><span className="notice notice-pass">{t('Saved to the practice log. The case was not changed.', 'حُفظ في سجل التمرين. لم تتغيّر الحالة.')}</span><button type="button" className="btn" onClick={restart}>{t('Start again', 'البدء من جديد')}</button></div>
          ) : !saved ? (
            <div className="stack">
              {!c.consent.access && <div className="notice notice-stop">{t('Permission is off for this case, so the result cannot be saved to it.', 'الإذن معطل لهذه الحالة، فلا يمكن حفظ النتيجة فيها.')}</div>}
              <div className="row">
                <button type="button" className="btn btn-primary" disabled={!c.consent.access} onClick={saveToCase}>{t(`Save as a new visit for ${c.name}`, `الحفظ كزيارة جديدة لـ${c.name}`, `Simpan sebagai kunjungan baru untuk ${c.name}`)}</button>
                <button type="button" className="btn" onClick={restart}>{t('Discard', 'تجاهل')}</button>
              </div>
              <p className="small muted">{t('Saving clears any earlier approval for this case, because a clinician needs to see the new result.', 'يلغي الحفظ أي اعتماد سابق لهذه الحالة، لأن الطبيب يحتاج إلى رؤية النتيجة الجديدة.')}</p>
            </div>
          ) : (
            <div className="stack">
              <div className="notice notice-info">
                <div className="row"><RouteTag route={run.outcome.route} /><span className="strong">{t('The pipeline ran again with this result.', 'أعيد تشغيل المسار بهذه النتيجة.')}</span></div>
                <p style={{ marginTop: 6 }}>{tx(run.outcome.reason)}</p>
              </div>
              <div className="row">
                <GoButton to="workspace" primary>{t('Open in the workspace', 'الفتح في مساحة العمل')}</GoButton>
                <GoButton to="monitoring">{t('See the trend', 'عرض الاتجاه')}</GoButton>
                <button type="button" className="btn" onClick={restart}>{t('Take another check', 'إجراء فحص آخر')}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {step !== 'setup' && step !== 'done' && (
        <div className="row no-print"><button type="button" className="btn" onClick={restart}>{t('Stop and go back to setup', 'التوقف والعودة إلى الإعداد')}</button></div>
      )}
    </>
  );
}

/** Digital-access route: the same alternate form on paper, with staff entering the part scores. */
function PaperEntry({ form, language, parts, setParts, conditions, setConditions, answers, setAnswers, reporter, setReporter, onDone }: {
  form: CheckForm; language: AssessmentLanguage; parts: CheckParts; setParts: (p: CheckParts) => void;
  conditions: Conditions; setConditions: (c: Conditions) => void; answers: number[]; setAnswers: (a: number[]) => void;
  reporter: 'self' | 'care_partner'; setReporter: (r: 'self' | 'care_partner') => void; onDone: () => void;
}) {
  const { t, tx } = useApp();
  const sheetText = (l: Localised) => pickL(language === 'ur' ? 'en' : language, l);
  const fields: { key: keyof CheckParts; label: string; max: number }[] = [
    { key: 'recall', label: t('Picture recall (hits minus wrong picks, up to 4)', 'تذكر الصور (الصحيح ناقص الخطأ، حتى 4)'), max: 4 },
    { key: 'sequence', label: t('Sequences repeated exactly', 'التسلسلات المكررة بدقة'), max: 2 },
    { key: 'search', label: t('Target grids fully correct', 'شبكات الهدف الصحيحة بالكامل'), max: 2 },
    { key: 'switching', label: t('Rule switching (4 correct = 2, 3 correct = 1)', 'تبديل القواعد (4 صحيحة = 2، 3 صحيحة = 1)'), max: 2 },
  ];
  const valid = fields.every((f) => Number.isInteger(parts[f.key]) && parts[f.key] >= 0 && parts[f.key] <= f.max);
  const conditionItems: { key: keyof Conditions; label: string }[] = [
    { key: 'poorSleep', label: t('Slept badly last night', 'نوم سيئ الليلة الماضية') },
    { key: 'fasting', label: t('Fasting today', 'صائم اليوم') },
    { key: 'lowMood', label: t('Feeling low or worried today', 'حزن أو قلق اليوم') },
    { key: 'distraction', label: t('Noise or interruptions', 'ضجيج أو مقاطعات') },
    { key: 'aidsWorn', label: t('Glasses or hearing aids worn', 'يرتدي النظارة أو السماعة') },
  ];
  return (
    <>
      <section className="card">
        <div className="row between">
          <div>
            <h2>{t('Staff sheet, form ', 'ورقة الموظفين، النموذج ')}<span className="num">{form.id}</span></h2>
            <p className="small muted">{t('Show the pictures, wait about 20 seconds, then give the other tasks before asking for recall.', 'اعرض الصور، وانتظر نحو 20 ثانية، ثم أجرِ المهام الأخرى قبل طلب التذكر.')}</p>
          </div>
          <button type="button" className="btn no-print" onClick={() => window.print()}>{t('Print the staff sheet', 'طباعة ورقة الموظفين')}</button>
        </div>
        <div className="grid-2 start">
          <div>
            <p className="strong small">{t('1. Pictures to learn', '1. الصور المطلوب تعلمها')}</p>
            <div className="pics" style={{ justifyContent: 'flex-start' }}>{learnItems(form).map((p) => <span key={p.id} className="tag tag-none">{p.glyph} {sheetText(p.label)}</span>)}</div>
            <p className="strong small" style={{ marginTop: 10 }}>{t('4. Recall: ask the patient to pick the five from these ten', '4. التذكر: اطلب من المريض اختيار الخمس من هذه العشر')}</p>
            <div className="pics" style={{ justifyContent: 'flex-start' }}>{recognitionItems(form).map((p) => <span key={p.id} className="tag tag-none">{p.glyph} {sheetText(p.label)}</span>)}</div>
          </div>
          <div>
            <p className="strong small">{t('2. Tap these tile numbers, then ask the patient to repeat them', '2. انقر أرقام المربعات هذه، ثم اطلب من المريض تكرارها')}</p>
            <p className="num">{form.sequences.map((s) => s.map((n) => n + 1).join(' ')).join('   |   ')}</p>
            <p className="strong small" style={{ marginTop: 10 }}>{t('3. Find every shape like the first one, then the four rule trials', '3. إيجاد كل شكل يشبه الأول، ثم محاولات القواعد الأربع')}</p>
            <div className="row paper-sheet">
              {form.searches.map((s) => (
                <div key={s.grid.join()} className="row">
                  <ShapeMark shape={s.target} fill="solid" size={26} />
                  <div className="paper-grid">{s.grid.map((shape, i) => <span key={i}><ShapeMark shape={shape} fill="solid" size={26} /></span>)}</div>
                </div>
              ))}
            </div>
            <ol className="plain small">
              {form.switches.map((sw, i) => (
                <li key={i}>
                  {sw.rule === 'shape' ? t('Same shape', 'الشكل نفسه') : t('Same fill', 'التعبئة نفسها')}: {' '}
                  <span className="paper-sheet" style={{ display: 'inline-flex', gap: 6, verticalAlign: 'middle' }}>
                    <ShapeMark shape={sw.target.shape} fill={sw.target.fill} size={20} />
                    <span>{t('from', 'من')}</span>
                    {sw.options.map((o, j) => <ShapeMark key={j} shape={o.shape} fill={o.fill} size={20} />)}
                  </span>
                  <span className="muted"> ({t('answer', 'الإجابة')} <span className="num">{sw.answer + 1}</span>)</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="card no-print">
        <h2>{t('Enter the result', 'إدخال النتيجة')}</h2>
        <div className="score-inputs">
          {fields.map((f) => (
            <label key={f.key} className="field">{f.label}
              <input type="number" min={0} max={f.max} step={1} value={parts[f.key]} aria-invalid={!(parts[f.key] >= 0 && parts[f.key] <= f.max)} onChange={(e) => setParts({ ...parts, [f.key]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        {!valid && <p className="field-error" role="alert">{t('Each score must be a whole number within the stated range.', 'يجب أن تكون كل درجة عددًا صحيحًا ضمن النطاق المذكور.')}</p>}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <legend className="strong" style={{ marginBottom: 6 }}>{t('On the day', 'في ذلك اليوم')}</legend>
          <div className="grid-2">
            {conditionItems.map((i) => (
              <label key={i.key} className="check"><input type="checkbox" checked={conditions[i.key]} onChange={(e) => setConditions({ ...conditions, [i.key]: e.target.checked })} />{i.label}</label>
            ))}
          </div>
        </fieldset>
        <div className="stack">
          <span className="strong small">{t('Compared with a year ago, has anything changed?', 'مقارنة بما قبل سنة، هل تغيّر شيء؟')}</span>
          <div className="segmented" role="group" aria-label={t('Who is answering', 'من يجيب')}>
            <button type="button" aria-pressed={reporter === 'self'} onClick={() => setReporter('self')}>{t('The patient', 'المريض')}</button>
            <button type="button" aria-pressed={reporter === 'care_partner'} onClick={() => setReporter('care_partner')}>{t('A care partner, with permission', 'مرافق رعاية، بإذن')}</button>
          </div>
          {FUNCTION_ITEMS.map((item, i) => (
            <div key={item.en} className="q-row">
              <span>{tx(item)}</span>
              <div className="segmented" role="group" aria-label={tx(item)}>
                {[t('No change', 'لا تغيير'), t('Some change', 'بعض التغيّر'), t('Major change', 'تغيّر كبير')].map((o, v) => (
                  <button key={o} type="button" aria-pressed={answers[i] === v} onClick={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))}>{o}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="row"><button type="button" className="btn btn-primary" disabled={!valid} onClick={onDone}>{t('Review the entered result', 'مراجعة النتيجة المُدخلة')}</button></div>
      </section>
    </>
  );
}

interface StepProps { q: (en: string, ar: string, id?: string) => string; say: (text: string) => void }
type Tx = (l: Localised) => string;

function useInstruction(say: (t: string) => void, text: string) {
  useEffect(() => { say(text); }, [say, text]);
}

function ContextStep({ q, say, conditions, setConditions, onNext }: StepProps & { conditions: Conditions; setConditions: (c: Conditions) => void; onNext: () => void }) {
  const text = q('First, a few questions about today. There are no right or wrong answers.', 'أولًا، بعض الأسئلة عن اليوم. لا توجد إجابات صحيحة أو خاطئة.');
  useInstruction(say, text);
  const items: { key: keyof Conditions; label: string }[] = [
    { key: 'poorSleep', label: q('I slept badly last night', 'نمت نومًا سيئًا الليلة الماضية') },
    { key: 'fasting', label: q('I am fasting today', 'أنا صائم اليوم') },
    { key: 'lowMood', label: q('I am feeling low or worried today', 'أشعر بالحزن أو القلق اليوم') },
    { key: 'distraction', label: q('It is noisy or there are interruptions here', 'يوجد ضجيج أو مقاطعات هنا') },
    { key: 'aidsWorn', label: q('I am wearing my glasses or hearing aids', 'أرتدي نظارتي أو سماعتي') },
  ];
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <div className="stack" style={{ textAlign: 'start' }}>
        {items.map((i) => (
          <label key={i.key} className="check">
            <input type="checkbox" checked={conditions[i.key]} onChange={(e) => setConditions({ ...conditions, [i.key]: e.target.checked })} />
            {i.label}
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={onNext}>{q('Continue', 'متابعة')}</button>
    </div>
  );
}

const LEARN_SECONDS = 20;

function LearnStep({ q, say, tx, items, pictureFirst, noTimeLimit, onNext }: StepProps & { tx: Tx; items: { id: string; glyph: string; label: { en: string; ar: string } }[]; pictureFirst: boolean; noTimeLimit: boolean; onNext: () => void }) {
  const [left, setLeft] = useState(LEARN_SECONDS);
  const text = q('Look at these five pictures and try to remember them. We will ask about them later.', 'انظر إلى هذه الصور الخمس وحاول تذكرها. سنسأل عنها لاحقًا.');
  useInstruction(say, text);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  useEffect(() => {
    if (noTimeLimit) return undefined;
    if (left <= 0) { onNextRef.current(); return undefined; }
    const timer = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, noTimeLimit]);
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <div className="pics">
        {items.map((p) => (
          <div key={p.id} className="pic"><span className="glyph" aria-hidden="true">{p.glyph}</span>{!pictureFirst && <span>{tx(p.label)}</span>}</div>
        ))}
      </div>
      {!noTimeLimit && <p className="muted small num" aria-live="off">{left}s</p>}
      <button type="button" className="btn btn-primary" onClick={onNext}>{q('I am ready', 'أنا مستعد')}</button>
    </div>
  );
}

function SequenceStep({ q, say, sequences, mode, onDone }: StepProps & { sequences: [number[], number[]]; mode: Mode; onDone: (r: number[][]) => void }) {
  const [round, setRound] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [entry, setEntry] = useState<number[]>([]);
  const [all, setAll] = useState<number[][]>([]);
  const seq = sequences[round];
  const text = mode === 'visual'
    ? q('Watch the tiles light up, then press them in the same order.', 'راقب إضاءة المربعات، ثم اضغطها بالترتيب نفسه.')
    : q('Listen to the tones, then press the tiles in the same order.', 'استمع إلى النغمات، ثم اضغط المربعات بالترتيب نفسه.');
  useInstruction(say, text);

  const play = () => {
    setPlaying(true);
    setPlayed(true);
    seq.forEach((tile, i) => {
      window.setTimeout(() => {
        if (mode === 'visual') setLit(tile); else tone(tile);
      }, 900 * i + 300);
      window.setTimeout(() => setLit(null), 900 * i + 950);
    });
    window.setTimeout(() => setPlaying(false), 900 * seq.length + 400);
  };

  const press = (i: number) => {
    if (mode === 'auditory') tone(i);
    const nextEntry = [...entry, i];
    if (nextEntry.length < seq.length) { setEntry(nextEntry); return; }
    const collected = [...all, nextEntry];
    if (round + 1 < sequences.length) {
      setAll(collected); setEntry([]); setRound(round + 1); setPlayed(false);
    } else {
      onDone(collected);
    }
  };

  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <p className="muted small">{q('Round', 'الجولة')} <span className="num">{round + 1}/{sequences.length}</span> · {q('tiles to press', 'مربعات للضغط')} <span className="num">{seq.length - entry.length}</span></p>
      <div className="tiles">
        {[0, 1, 2, 3].map((i) => (
          <button key={i} type="button" className={`tile ${lit === i ? 'lit' : ''}`} disabled={playing || !played} onClick={() => press(i)}>{i + 1}</button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" disabled={playing || played} onClick={play}>{mode === 'visual' ? q('Show me', 'أرني') : q('Play the tones', 'تشغيل النغمات')}</button>
    </div>
  );
}

function SearchStep({ q, say, language, searches, onDone }: StepProps & { language: Lang; searches: { target: Shape; grid: Shape[] }[]; onDone: (r: number[][]) => void }) {
  const [round, setRound] = useState(0);
  const [sel, setSel] = useState<number[]>([]);
  const [all, setAll] = useState<number[][]>([]);
  const s = searches[round];
  const name = pickL(language, SHAPE_NAME[s.target]);
  const text = q(`Press every ${name} like this one, then press Done.`, `اضغط كل ${name} مثل هذا، ثم اضغط تم.`, `Tekan setiap ${name} yang sama seperti ini, lalu tekan Selesai.`);
  useInstruction(say, text);
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <div className="row"><ShapeMark shape={s.target} fill="solid" size={40} /></div>
      <div className="search-grid">
        {s.grid.map((shape, i) => (
          <button
            key={`${round}-${i}`} type="button" className="search-cell" aria-pressed={sel.includes(i)}
            aria-label={`${pickL(language, SHAPE_NAME[shape])} ${i + 1}`}
            onClick={() => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i])}
          >
            <ShapeMark shape={shape} fill="solid" size={38} />
          </button>
        ))}
      </div>
      <button
        type="button" className="btn btn-primary"
        onClick={() => {
          const collected = [...all, sel];
          if (round + 1 < searches.length) { setAll(collected); setSel([]); setRound(round + 1); } else onDone(collected);
        }}
      >{q('Done', 'تم')}</button>
    </div>
  );
}

function SwitchStep({ q, say, trials, onDone }: StepProps & { trials: { rule: 'shape' | 'fill'; target: { shape: Shape; fill: Fill }; options: { shape: Shape; fill: Fill }[] }[]; onDone: (r: number[]) => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const trial = trials[i];
  const text = trial.rule === 'shape'
    ? q('Find the one with the SAME SHAPE.', 'اختر الذي له الشكل نفسه.')
    : q('Find the one that is FILLED THE SAME WAY.', 'اختر الذي له التعبئة نفسها.');
  useInstruction(say, text);
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <p className="muted small num">{i + 1}/{trials.length}</p>
      <ShapeMark shape={trial.target.shape} fill={trial.target.fill} size={64} />
      <div className="switch-opts">
        {trial.options.map((o, idx) => (
          <button
            key={idx} type="button" className="switch-opt"
            aria-label={`${q('Option', 'الخيار')} ${idx + 1}`}
            onClick={() => {
              const collected = [...answers, idx];
              if (i + 1 < trials.length) { setAnswers(collected); setI(i + 1); } else onDone(collected);
            }}
          >
            <ShapeMark shape={o.shape} fill={o.fill} size={60} />
          </button>
        ))}
      </div>
    </div>
  );
}

function RecallStep({ q, say, tx, items, pictureFirst, onDone }: StepProps & { tx: Tx; items: { id: string; glyph: string; label: { en: string; ar: string } }[]; pictureFirst: boolean; onDone: (r: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const text = q('Earlier you saw five pictures. Press the ones you remember, then press Done.', 'رأيت سابقًا خمس صور. اضغط التي تتذكرها، ثم اضغط تم.');
  useInstruction(say, text);
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <div className="pics">
        {items.map((p) => (
          <button key={p.id} type="button" className="pic" aria-pressed={sel.includes(p.id)} aria-label={tx(p.label)} onClick={() => setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id])}>
            <span className="glyph" aria-hidden="true">{p.glyph}</span>{!pictureFirst && <span>{tx(p.label)}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => onDone(sel)}>{q('Done', 'تم')}</button>
    </div>
  );
}

function FunctionStep({ q, say, tx, answers, setAnswers, reporter, setReporter, onNext }: StepProps & { tx: Tx; answers: number[]; setAnswers: (a: number[]) => void; reporter: 'self' | 'care_partner'; setReporter: (r: 'self' | 'care_partner') => void; onNext: () => void }) {
  const text = q('Compared with a year ago, has anything changed in these everyday activities?', 'مقارنة بما قبل سنة، هل تغيّر شيء في هذه الأنشطة اليومية؟');
  useInstruction(say, text);
  const options = [q('No change', 'لا تغيير'), q('Some change', 'بعض التغيّر'), q('Major change', 'تغيّر كبير')];
  return (
    <div className="stack" style={{ width: '100%', maxWidth: 720, alignItems: 'center' }}>
      <div className="prompt">{text}</div>
      <div className="segmented" role="group" aria-label={q('Who is answering', 'من يجيب')}>
        <button type="button" aria-pressed={reporter === 'self'} onClick={() => setReporter('self')}>{q('The person', 'الشخص نفسه')}</button>
        <button type="button" aria-pressed={reporter === 'care_partner'} onClick={() => setReporter('care_partner')}>{q('A care partner, with permission', 'مرافق رعاية، بإذن')}</button>
      </div>
      {FUNCTION_ITEMS.map((item, i) => (
        <div key={item.en} className="q-row">
          <span>{tx(item)}</span>
          <div className="segmented" role="group" aria-label={tx(item)}>
            {options.map((o, v) => (
              <button key={o} type="button" aria-pressed={answers[i] === v} onClick={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-primary" onClick={onNext}>{q('Finish', 'إنهاء')}</button>
    </div>
  );
}
