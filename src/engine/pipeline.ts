import { CONTRIBUTORS } from '../data/contributors';
import { calculateChange, calibrationFor, fmt, BASELINE_VISITS, FORMULA_VERSION } from './scoring';
import { modelInputFrom, shadowPredict } from './shadow';
import type { Prediction } from './model';
import {
  L, type AuditEvent, type Case, type ChangeResult, type Contributor, type ContributorId, type Localised,
  type Outcome, type PipelineOptions, type PipelineRun, type ResolvedContext, type Route,
  type Service, type StageDef, type StageResult, type StageStatus,
} from './types';

export const STAGES: StageDef[] = [
  { n: 1, key: 'permission', title: L('Permission', 'الإذن'), agent: L('Consent & Access Agent', 'وكيل الموافقة والوصول'), tool: 'check_consent', kind: 'rules' },
  { n: 2, key: 'safety', title: L('Immediate safety', 'السلامة الفورية'), agent: L('Safety Triage Agent', 'وكيل فرز السلامة'), tool: 'check_safety_flag', kind: 'rules' },
  { n: 3, key: 'context', title: L('Risk context', 'سياق الخطر'), agent: L('Clinical Context Agent', 'وكيل السياق السريري'), tool: 'read_authorised_context', kind: 'rules' },
  { n: 4, key: 'access', title: L('Access and fairness', 'الوصول والإنصاف'), agent: L('Access & Language Agent', 'وكيل الوصول واللغة'), tool: 'check_language_and_senses', kind: 'rules' },
  { n: 5, key: 'protocol', title: L('Baseline and protocol', 'خط الأساس والبروتوكول'), agent: L('Assessment Protocol Agent', 'وكيل بروتوكول التقييم'), tool: 'select_comparable_visits', kind: 'scoring' },
  { n: 6, key: 'change', title: L('Change analysis', 'تحليل التغيّر'), agent: L('Cognitive Change Scoring Agent', 'وكيل حساب التغيّر الإدراكي'), tool: 'calculate_cognitive_change', kind: 'scoring' },
  { n: 7, key: 'prevention', title: L('Prevention and access', 'الوقاية والوصول'), agent: L('Care Pathway Agent', 'وكيل مسار الرعاية'), tool: 'list_contributors', kind: 'assistance' },
  { n: 8, key: 'model', title: L('Optional model', 'نموذج اختياري'), agent: L('Specialist Model Liaison Agent', 'وكيل تنسيق النماذج المتخصصة'), tool: 'request_specialist_estimate', kind: 'assistance' },
  { n: 9, key: 'evidence', title: L('Evidence and draft', 'الأدلة والمسودة'), agent: L('Evidence & Documentation Agent', 'وكيل الأدلة والتوثيق'), tool: 'attach_sources', kind: 'assistance' },
  { n: 10, key: 'review', title: L('Clinician review', 'مراجعة الطبيب'), agent: L('Qualified clinician', 'طبيب مؤهل'), tool: 'human_decision', kind: 'human' },
  { n: 11, key: 'followup', title: L('Follow-up', 'المتابعة'), agent: L('Follow-up Coordination Agent', 'وكيل تنسيق المتابعة'), tool: 'prepare_follow_up_task', kind: 'human' },
  { n: 12, key: 'audit', title: L('Quality and equity', 'الجودة والإنصاف'), agent: L('Quality & Equity Audit Agent', 'وكيل تدقيق الجودة والإنصاف'), tool: 'record_evaluation', kind: 'human' },
];

export function resolveContext(c: Case): ResolvedContext[] {
  return c.context.map((item) => {
    const authorised = c.consent[item.consent];
    return authorised
      ? { ...item, authorised }
      : {
          ...item,
          authorised,
          value: null,
          status: 'unknown',
          date: null,
          source: L('Not authorised by the person', 'لم يصرّح به الشخص'),
        };
  });
}

export function selectComparable(c: Case) {
  const recorded = c.observations.filter((o) => o.score !== null);
  const excluded: { visit: number; reason: Localised }[] = [];
  c.observations.filter((o) => o.score === null).forEach((o) => {
    excluded.push({ visit: o.visit, reason: L('No score recorded. It stays missing, not zero.', 'لم تُسجل درجة. تبقى ناقصة وليست صفرًا.') });
  });
  if (recorded.length === 0) return { comparable: [], excluded, protocol: null };
  const protocol = { language: recorded[0].language, mode: recorded[0].mode };
  const comparable = recorded.filter((o) => {
    if (o.language !== protocol.language) {
      excluded.push({ visit: o.visit, reason: L('Different language from the baseline', 'لغة مختلفة عن خط الأساس') });
      return false;
    }
    if (o.mode !== protocol.mode) {
      excluded.push({ visit: o.visit, reason: L('Different presentation mode. Visual and auditory are not interchangeable.', 'طريقة عرض مختلفة. البصري والسمعي غير قابلين للتبادل.') });
      return false;
    }
    return true;
  });
  return { comparable, excluded, protocol };
}

function listContributors(context: ResolvedContext[], functionLevel: number): Contributor[] {
  const ids: ContributorId[] = [];
  const add = (id?: ContributorId) => { if (id && !ids.includes(id)) ids.push(id); };
  if (functionLevel > 0) add('function');
  context.filter((i) => i.status === 'attention').forEach((i) => add(i.contributor));
  context.filter((i) => i.status === 'unknown' && i.authorised).forEach((i) => add(i.contributor));
  // Reversible causes come before longer-term prevention, so the first prompts are the most actionable.
  const order: ContributorId[] = ['function', 'medicines', 'sleep', 'mood', 'sensory', 'metabolic', 'vascular', 'activity', 'social', 'family_genetics'];
  return order.filter((id) => ids.includes(id)).map((id) => CONTRIBUTORS[id]);
}

function suggestServices(contributors: Contributor[], change: ChangeResult | null, functionLevel: number, age: number): Service[] {
  const services = new Set<Service>();
  if (functionLevel > 0 || change?.numericFlag === 'review') {
    services.add('primary_care');
    services.add(age >= 65 ? 'geriatrics' : 'neurology');
  }
  contributors.forEach((c) => { if (c.service) services.add(c.service); });
  return [...services];
}

function interpretationNotes(c: Case, comparableVisits: number[]): Localised[] {
  const notes: Localised[] = [];
  const last = c.observations.filter((o) => comparableVisits.includes(o.visit)).at(-1);
  if (!last) return notes;
  if (last.conditions.poorSleep) notes.push(L('Poor sleep was reported before the latest check. It is noted beside the result and does not change the number.', 'أُبلغ عن نوم سيئ قبل آخر فحص. يُذكر بجانب النتيجة ولا يغيّر الرقم.'));
  if (last.conditions.fasting) notes.push(L('The latest check was done while fasting. Compare with a non-fasting visit before drawing conclusions.', 'أُجري آخر فحص أثناء الصيام. قارن بزيارة دون صيام قبل الاستنتاج.'));
  if (last.conditions.lowMood) notes.push(L('Low mood was reported on the day. Consider a mood screen.', 'أُبلغ عن تدني المزاج في ذلك اليوم. يُنظر في فحص المزاج.'));
  if (last.conditions.distraction) notes.push(L('Distraction was reported during the check.', 'أُبلغ عن تشتت أثناء الفحص.'));
  if (last.conditions.assisted) notes.push(L('Someone helped during the check, which may not match earlier visits.', 'ساعد شخص ما أثناء الفحص، وقد لا يطابق ذلك الزيارات السابقة.'));
  if (last.administration === 'staff-paper') notes.push(L('Staff gave the latest check on paper and entered the result.', 'أجرى الموظفون آخر فحص ورقيًا وأدخلوا النتيجة.'));
  return notes;
}

interface RunState {
  stopped: boolean;
  held: boolean;
  outcome: Outcome | null;
  change: ChangeResult | null;
  changeNull: Localised | null;
  excluded: { visit: number; reason: Localised }[];
  context: ResolvedContext[];
  contributors: Contributor[];
  suggestedServices: Service[];
  notes: Localised[];
  functionLevel: number;
  highRisk: ResolvedContext[];
  /** The numeric flag before the latest visit, used to confirm a borderline result on repeat. */
  priorFlag: ChangeResult['numericFlag'] | null;
}

function numericRoute(state: RunState): Outcome {
  const { change, functionLevel, highRisk } = state;
  if (functionLevel > 0) {
    return {
      route: 'qualified_review',
      reason: L('Reported change in daily function goes to qualified review, whatever the number says.', 'يُحال التغيّر المبلّغ عنه في الأداء اليومي إلى مراجعة مؤهلة، أيًا كان الرقم.'),
      nextStep: L('Arrange a qualified review and clarify the listed contributors.', 'ترتيب مراجعة مؤهلة وتوضيح العوامل المذكورة.'),
    };
  }
  if (highRisk.length > 0) {
    return {
      route: 'qualified_review',
      reason: L('A high-risk result in the authorised context needs a qualified person to look at it.', 'تتطلب نتيجة عالية الخطورة في السياق المصرّح به مراجعة من شخص مؤهل.'),
      nextStep: L('Arrange a qualified review of the high-risk result.', 'ترتيب مراجعة مؤهلة للنتيجة عالية الخطورة.'),
    };
  }
  if (change?.rapidDrop) {
    return {
      route: 'qualified_review',
      reason: L('Scores fell by 3 or more between two visits. Rapid change goes to qualified review.', 'انخفضت الدرجات بمقدار 3 أو أكثر بين زيارتين. يُحال التغيّر السريع إلى مراجعة مؤهلة.'),
      nextStep: L('Arrange a prompt qualified review.', 'ترتيب مراجعة مؤهلة عاجلة.'),
    };
  }
  if (change?.numericFlag === 'review') {
    return {
      route: 'qualified_review',
      reason: L(`The adjusted change crossed the review threshold (z ${fmt(change.z)}, at or below -1.96).`, `تجاوز التغيّر المعدّل عتبة المراجعة (z ${fmt(change.z)}، عند -1.96 أو أقل).`, `Perubahan terkoreksi melewati ambang review (z ${fmt(change.z)}, pada -1.96 atau lebih rendah).`),
      nextStep: L('Arrange a qualified review. The number does not establish a cause or a diagnosis.', 'ترتيب مراجعة مؤهلة. لا يحدد الرقم سببًا أو تشخيصًا.'),
    };
  }
  if (change?.numericFlag === 'repeat' && state.priorFlag && state.priorFlag !== 'none') {
    return {
      route: 'qualified_review',
      reason: L(`The result was flagged again on repeat (z ${fmt(change.z)}). A repeated flag goes to qualified review.`, `ظهرت الإشارة مجددًا عند الإعادة (z ${fmt(change.z)}). تُحال الإشارة المتكررة إلى مراجعة مؤهلة.`, `Sinyal muncul lagi saat cek ulang (z ${fmt(change.z)}). Sinyal berulang diteruskan ke review berkualifikasi.`),
      nextStep: L('Arrange a qualified review. The number does not establish a cause or a diagnosis.', 'ترتيب مراجعة مؤهلة. لا يحدد الرقم سببًا أو تشخيصًا.'),
    };
  }
  if (change?.numericFlag === 'repeat') {
    return {
      route: 'repeat',
      reason: L(`The result is borderline (z ${fmt(change.z)}, between -1.96 and -1.645). One changed score is common in healthy people.`, `النتيجة حدّية (z ${fmt(change.z)}، بين -1.96 و-1.645). تغيّر درجة واحدة شائع لدى الأصحاء.`, `Hasilnya di batas (z ${fmt(change.z)}, antara -1.96 dan -1.645). Satu skor yang berubah umum terjadi pada orang sehat.`),
      nextStep: L('Repeat in 2 to 4 weeks with the same language, mode and time of day. Review if it is flagged again.', 'إعادة الفحص خلال 2 إلى 4 أسابيع باللغة والطريقة والوقت نفسه. المراجعة إذا ظهرت الإشارة مجددًا.'),
    };
  }
  return {
    route: 'routine',
    reason: L('No numerical flag and no reported change in daily function. This does not rule out impairment.', 'لا إشارة رقمية ولا تغيّر مبلّغ عنه في الأداء اليومي. لا يستبعد هذا وجود قصور.'),
    nextStep: L('Keep the routine schedule, discuss prevention, and invite the person to report concerns sooner.', 'الاستمرار في الجدول الروتيني ومناقشة الوقاية ودعوة الشخص إلى الإبلاغ عن أي قلق مبكرًا.'),
  };
}

/**
 * Deterministic 12-stage state machine. Each stage reads the state, runs one
 * tool and hands on. Stops and holds skip later clinical stages. Stage 12
 * always records the outcome, and it reads no case demographics when permission
 * was refused.
 */
export function runPipeline(c: Case, options: PipelineOptions): PipelineRun {
  const state: RunState = {
    stopped: false, held: false, outcome: null, change: null, changeNull: null, excluded: [],
    context: [], contributors: [], suggestedServices: [], notes: [], functionLevel: 0, highRisk: [], priorFlag: null,
  };
  const stages: StageResult[] = [];
  const audit: AuditEvent[] = [];
  const blocked = () => state.stopped || state.held;
  let shadow: Prediction | null = null;

  const push = (def: StageDef, status: StageStatus, message: Localised) => {
    stages.push({ ...def, status, message });
    audit.push({ seq: audit.length + 1, stage: def.n, agent: def.agent.en, tool: def.tool, status, detail: message.en });
  };
  const skip = (def: StageDef) => push(def, 'skipped', L('Skipped because an earlier gate stopped or held this case.', 'تُخطيت لأن بوابة سابقة أوقفت هذه الحالة أو علّقتها.'));
  const stop = (def: StageDef, outcome: Outcome, msg: Localised) => {
    state.stopped = true; state.outcome = outcome; push(def, 'stopped', msg);
  };
  const hold = (def: StageDef, outcome: Outcome, msg: Localised) => {
    state.held = true; state.outcome = outcome; push(def, 'held', msg);
  };

  for (const def of STAGES) {
    if (def.n !== 12 && blocked()) { skip(def); continue; }
    switch (def.key) {
      case 'permission':
        if (!c.consent.access) {
          stop(def, {
            route: 'stopped',
            reason: L('No permission to access this case. No case data was read.', 'لا إذن للوصول إلى هذه الحالة. لم تُقرأ أي بيانات.'),
            nextStep: L('Ask the person for permission, or end here.', 'طلب الإذن من الشخص، أو التوقف هنا.'),
          }, L('Permission not given. No case data was read. Gate event recorded.', 'لم يُمنح الإذن. لم تُقرأ أي بيانات. سُجل حدث البوابة.'));
        } else {
          push(def, 'passed', L('Permission to access this fictional case is recorded.', 'سُجل إذن الوصول إلى هذه الحالة الخيالية.'));
        }
        break;

      case 'safety':
        if (c.suddenChangeFlag) {
          stop(def, {
            route: 'urgent',
            reason: c.suddenChangeNote ?? L('A sudden change was reported.', 'أُبلغ عن تغيّر مفاجئ.'),
            nextStep: L('Routine work is bypassed. Hand off to a person now, following the local urgent protocol.', 'يُتجاوز العمل الروتيني. التحويل إلى شخص الآن وفق البروتوكول العاجل المحلي.'),
          }, L('A sudden-change flag was supplied, so routine work is bypassed for an urgent human handoff. This agent checks a supplied flag. It does not detect sudden change, and no flag is not clearance.', 'وردت إشارة تغيّر مفاجئ، فيُتجاوز العمل الروتيني إلى تحويل بشري عاجل. يتحقق هذا الوكيل من إشارة واردة ولا يكتشف التغيّر المفاجئ، وغياب الإشارة ليس إذنًا سريريًا.'));
        } else {
          push(def, 'passed', L('No sudden-change flag was supplied. That is not clinical clearance.', 'لم ترد إشارة تغيّر مفاجئ. وهذا ليس إذنًا سريريًا.'));
        }
        break;

      case 'context': {
        state.context = resolveContext(c);
        state.functionLevel = Math.max(0, ...c.functionReports.map((r) => r.level));
        state.highRisk = state.context.filter((i) => i.authorised && i.highRisk);
        const known = state.context.filter((i) => i.value !== null).length;
        const missing = state.context.length - known;
        push(def, 'passed', L(`${known} authorised items read with their sources. ${missing} stay missing, and none is filled in.`, `قُرئت ${known} عناصر مصرّح بها مع مصادرها. وتبقى ${missing} ناقصة دون تعبئتها.`, `${known} item yang diizinkan dibaca beserta sumbernya. ${missing} tetap kosong, dan tidak ada yang diisi.`));
        break;
      }

      case 'access': {
        const { protocol } = selectComparable(c);
        if (c.hearingConcern && protocol?.mode === 'auditory') {
          state.changeNull = L('No estimate: the baseline used hearing, and hearing is in question.', 'لا تقدير: استخدم خط الأساس السمع، والسمع موضع شك.');
          hold(def, {
            route: 'held',
            reason: L('A hearing concern affects an auditory baseline. A visual score cannot stand in for it.', 'يؤثر القلق بشأن السمع في خط الأساس السمعي. ولا تحل الدرجة البصرية محله.'),
            nextStep: L('Discuss a hearing test, then build a separate visual baseline over three visits.', 'مناقشة فحص السمع، ثم بناء خط أساس بصري منفصل عبر ثلاث زيارات.'),
          }, L('Held: hearing concern with an auditory protocol. No cross-mode substitution.', 'مُعلّق: قلق بشأن السمع مع بروتوكول سمعي. لا استبدال بين الطريقتين.'));
        } else if (c.visionConcern && protocol?.mode === 'visual') {
          state.changeNull = L('No estimate: the baseline used vision, and vision is in question.', 'لا تقدير: استخدم خط الأساس البصر، والبصر موضع شك.');
          hold(def, {
            route: 'held',
            reason: L('A vision concern affects a visual baseline.', 'يؤثر القلق بشأن البصر في خط الأساس البصري.'),
            nextStep: L('Discuss a vision check, then repeat with the right aids.', 'مناقشة فحص البصر، ثم الإعادة بالوسائل المناسبة.'),
          }, L('Held: vision concern with a visual protocol.', 'مُعلّق: قلق بشأن البصر مع بروتوكول بصري.'));
        } else if (protocol && !calibrationFor(protocol.language, c.education)) {
          state.changeNull = L('No estimate: this language and education group has no calibration. Parameters are not borrowed from another language.', 'لا تقدير: لا معايرة لهذه اللغة وفئة التعليم. ولا تُستعار المعايير من لغة أخرى.');
          hold(def, {
            route: 'held',
            reason: L('No calibration exists for this language, so the number is withheld.', 'لا توجد معايرة لهذه اللغة، لذا حُجب الرقم.'),
            nextStep: L('Offer an interpreter-supported clinical conversation, and add this language to local validation.', 'تقديم حديث سريري بدعم مترجم، وإضافة هذه اللغة إلى التحقق المحلي.'),
          }, L('Held: no calibration for this language and education group. The number is withheld.', 'مُعلّق: لا معايرة لهذه اللغة وفئة التعليم. حُجب الرقم.'));
        } else {
          push(def, 'passed', L('Language has a synthetic calibration, and no sensory concern affects the presentation mode.', 'للغة معايرة اصطناعية، ولا يؤثر أي قلق حسي في طريقة العرض.'));
        }
        break;
      }

      case 'protocol': {
        const { comparable, excluded } = selectComparable(c);
        state.excluded = excluded;
        state.notes = interpretationNotes(c, comparable.map((o) => o.visit));
        if (comparable.length < BASELINE_VISITS + 1) {
          state.changeNull = L(`No estimate: ${comparable.length} comparable visits exist and ${BASELINE_VISITS + 1} are needed.`, `لا تقدير: توجد ${comparable.length} زيارات قابلة للمقارنة والمطلوب ${BASELINE_VISITS + 1}.`, `Tidak ada estimasi: baru ada ${comparable.length} kunjungan yang sebanding dan dibutuhkan ${BASELINE_VISITS + 1}.`);
          hold(def, {
            route: 'held',
            reason: L(`Only ${comparable.length} comparable visits exist, so no change can be estimated. This is not the same as no change.`, `توجد ${comparable.length} زيارات قابلة للمقارنة فقط، فلا يمكن تقدير التغيّر. وهذا لا يعني عدم وجود تغيّر.`, `Baru ada ${comparable.length} kunjungan yang sebanding, jadi perubahan belum bisa diestimasi. Ini tidak sama dengan tidak ada perubahan.`),
            nextStep: L('Complete the baseline in the same language and mode, and fill in the missing context.', 'إكمال خط الأساس باللغة والطريقة نفسيهما، واستكمال السياق الناقص.'),
          }, L('Held: not enough comparable visits for a change estimate.', 'مُعلّق: الزيارات القابلة للمقارنة غير كافية لتقدير التغيّر.'));
        } else {
          push(def, 'passed', L(`${comparable.length} comparable visits selected, in the same language and mode.`, `اختيرت ${comparable.length} زيارات قابلة للمقارنة، باللغة والطريقة نفسيهما.`, `${comparable.length} kunjungan yang sebanding dipilih, dengan bahasa dan mode yang sama.`));
        }
        break;
      }

      case 'change': {
        const { comparable, protocol } = selectComparable(c);
        const calibration = protocol ? calibrationFor(protocol.language, c.education) : null;
        const values = comparable.map((o) => o.score as number);
        state.change = calibration ? calculateChange(values, calibration) : null;
        state.priorFlag = calibration && values.length > BASELINE_VISITS + 1
          ? calculateChange(values.slice(0, -1), calibration)?.numericFlag ?? null
          : null;
        if (!state.change) {
          state.changeNull = L('No estimate: the formula tool returned nothing.', 'لا تقدير: لم تُرجع أداة المعادلة أي نتيجة.');
          hold(def, {
            route: 'held',
            reason: L('The formula tool returned no result, so no number is shown.', 'لم تُرجع أداة المعادلة نتيجة، فلا يُعرض أي رقم.'),
            nextStep: L('Check the inputs.', 'التحقق من المدخلات.'),
          }, L('Held: no result from the formula tool.', 'مُعلّق: لا نتيجة من أداة المعادلة.'));
        } else {
          const r = state.change;
          push(def, 'passed', L(
            `${FORMULA_VERSION}: baseline ${fmt(r.baselineMean)}, follow-up ${fmt(r.followupMean)}, adjusted ${fmt(r.adjustedChange)}, z ${fmt(r.z)}. Synthetic calibration, not a diagnosis.`,
            `${FORMULA_VERSION}: خط الأساس ${fmt(r.baselineMean)}، المتابعة ${fmt(r.followupMean)}، المعدّل ${fmt(r.adjustedChange)}، z ${fmt(r.z)}. معايرة اصطناعية وليست تشخيصًا.`,
            `${FORMULA_VERSION}: baseline ${fmt(r.baselineMean)}, tindak lanjut ${fmt(r.followupMean)}, terkoreksi ${fmt(r.adjustedChange)}, z ${fmt(r.z)}. Kalibrasi sintetis, bukan diagnosis.`,
          ));
        }
        break;
      }

      case 'prevention':
        state.contributors = listContributors(state.context, state.functionLevel);
        state.suggestedServices = suggestServices(state.contributors, state.change, state.functionLevel, c.age);
        push(def, 'passed', L(`${state.contributors.length} contributors listed for a clinician to choose from. Nothing is prescribed.`, `ذُكرت ${state.contributors.length} عوامل ليختار منها الطبيب. لا يوجد أي وصف علاجي.`, `${state.contributors.length} faktor dicantumkan untuk dipilih klinisi. Tidak ada yang diresepkan.`));
        break;

      case 'model':
        // Shadow mode: the estimate is attached for the clinician and never feeds the route below.
        if (options.shadowModel === false) {
          push(def, 'null', L('The shadow model is switched off for this run.', 'النموذج الظلي متوقف في هذا التشغيل.', 'Model bayangan dimatikan untuk proses ini.'));
        } else {
          shadow = shadowPredict(modelInputFrom(c, selectComparable(c).comparable, state.functionLevel));
          push(def, shadow.ok ? 'passed' : 'null', shadow.ok
            ? L('Shadow-mode estimate attached beside the formula. It does not change the proposed path.', 'أُرفق تقدير النموذج الظلي بجانب المعادلة. لا يغيّر المسار المقترح.', 'Estimasi model bayangan dilampirkan di samping rumus. Estimasi ini tidak mengubah jalur usulan.')
            : shadow.reason);
        }
        break;

      case 'evidence':
        if (!options.evidenceAvailable) {
          hold(def, {
            route: 'held',
            reason: L('The evidence store is unavailable, so the report is held. Measurements are kept.', 'مخزن الأدلة غير متاح، لذا عُلّق التقرير. وحُفظت القياسات.'),
            nextStep: L('Restore the evidence store and run the case again.', 'استعادة مخزن الأدلة وإعادة تشغيل الحالة.'),
          }, L('Held: sources could not be attached. Measurements are kept.', 'مُعلّق: تعذر إرفاق المصادر. حُفظت القياسات.'));
        } else {
          push(def, 'passed', L('Each contributor is linked to approved sources, and a draft is ready for review.', 'رُبط كل عامل بمصادر معتمدة، والمسودة جاهزة للمراجعة.'));
        }
        break;

      case 'review':
        if (!options.decision) {
          state.outcome = numericRoute(state);
          push(def, 'waiting', L('The draft is held for a clinician. No care action is released.', 'المسودة بانتظار الطبيب. لم يُفرج عن أي إجراء رعاية.'));
        } else if (options.decision.status === 'prepared') {
          state.outcome = numericRoute(state);
          push(def, 'waiting', L(`Prepared by ${options.decision.reviewer}. Waiting for a doctor to sign off. No care action is released.`, `أعدّها ${options.decision.reviewer}. بانتظار توقيع الطبيب. لم يُفرج عن أي إجراء رعاية.`, `Disiapkan oleh ${options.decision.reviewer}. Menunggu tanda tangan dokter. Tidak ada tindakan perawatan yang dilepas.`));
        } else if (options.decision.status === 'returned') {
          state.outcome = numericRoute(state);
          push(def, 'waiting', L('Returned by the clinician for more information. No care action is released.', 'أعادها الطبيب لطلب مزيد من المعلومات. لم يُفرج عن أي إجراء رعاية.'));
        } else {
          const proposed = numericRoute(state);
          state.outcome = {
            route: options.decision.route,
            reason: options.decision.route === proposed.route
              ? proposed.reason
              : L(`Clinician changed the route: ${options.decision.rationale}`, `غيّر الطبيب المسار: ${options.decision.rationale}`, `Klinisi mengubah jalur: ${options.decision.rationale}`),
            nextStep: L(options.decision.nextStep, options.decision.nextStep, options.decision.nextStep),
          };
          push(def, 'passed', L(`Approved by ${options.decision.reviewer}.`, `اعتمده ${options.decision.reviewer}.`, `Disetujui oleh ${options.decision.reviewer}.`));
        }
        break;

      case 'followup':
        if (options.decision?.status === 'approved') {
          push(def, 'passed', L(`Follow-up task prepared for ${options.decision.followUpDays} days. Nothing was booked or sent.`, `أُعدت مهمة متابعة خلال ${options.decision.followUpDays} يومًا. لم يُحجز أو يُرسل شيء.`, `Tugas tindak lanjut disiapkan untuk ${options.decision.followUpDays} hari. Tidak ada yang dijadwalkan atau dikirim.`));
        } else {
          push(def, 'pending', L('Waiting for the clinician decision.', 'بانتظار قرار الطبيب.'));
        }
        break;

      case 'audit':
        push(def, 'recorded', c.consent.access
          ? L('Route, gates and missing values recorded for evaluation.', 'سُجل المسار والبوابات والقيم الناقصة للتقييم.')
          : L('Gate event recorded without any case demographics.', 'سُجل حدث البوابة دون أي بيانات ديموغرافية.'));
        break;
    }
  }

  return {
    caseId: c.id,
    stages,
    audit,
    outcome: state.outcome ?? numericRoute(state),
    change: state.change,
    changeNull: state.changeNull,
    excluded: state.excluded,
    context: state.context,
    contributors: state.contributors,
    suggestedServices: state.suggestedServices,
    interpretationNotes: state.notes,
    shadow,
  };
}

export const ROUTE_LABEL: Record<Route, Localised> = {
  routine: L('Routine follow-up', 'متابعة روتينية'),
  repeat: L('Repeat the check', 'إعادة الفحص'),
  qualified_review: L('Qualified clinical review', 'مراجعة سريرية مؤهلة'),
  urgent: L('Urgent human handoff', 'تحويل بشري عاجل'),
  held: L('Held', 'مُعلّق'),
  stopped: L('Stopped', 'أُوقف'),
};

export const SERVICE_LABEL: Record<Service, Localised> = {
  primary_care: L('Primary care', 'الرعاية الأولية'),
  neurology: L('Neurology', 'طب الأعصاب'),
  geriatrics: L('Geriatrics', 'طب الشيخوخة'),
  mental_health: L('Mental health', 'الصحة النفسية'),
  audiology: L('Audiology', 'السمعيات'),
  optometry: L('Optometry', 'البصريات'),
  sleep_clinic: L('Sleep assessment', 'تقييم النوم'),
  genetic_counselling: L('Genetic counselling', 'الاستشارة الوراثية'),
};
