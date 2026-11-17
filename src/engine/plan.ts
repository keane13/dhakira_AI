import { fmt } from './scoring';
import { CONTRIBUTORS } from '../data/contributors';
import { ROUTE_LABEL, SERVICE_LABEL } from './pipeline';
import { L, type Case, type ClinicianDecision, type ContributorId, type Localised, type PipelineRun, type Route } from './types';

/** Prefilled text a clinician can edit. Every line stays editable and nothing is released until approval. */
export function draftReview(c: Case, run: PipelineRun) {
  const r = run.change;
  const concern = c.concern.en.toLowerCase();
  const summary = r
    ? `${c.name}, ${c.age}: ${concern}. Comparable observations moved from a baseline average of ${fmt(r.baselineMean)} to ${fmt(r.followupMean)} out of 10.`
    : `${c.name}, ${c.age}: ${concern}. No change estimate is available.`;
  const missing = run.context.filter((i) => i.value === null).map((i) => i.label.en.toLowerCase());
  return {
    summary,
    stillToClarify: [...c.clarify.map((q) => q.en), missing.length ? `Missing or not authorised: ${missing.join(', ')}.` : ''].filter(Boolean).join(' '),
  };
}

export function exampleDecision(c: Case, run: PipelineRun, today: string): ClinicianDecision {
  const draft = draftReview(c, run);
  const route = run.outcome.route;
  const chosen = run.contributors.slice(0, 3).map((x) => x.id);
  const days = route === 'repeat' ? 21 : route === 'routine' ? 180 : 14;
  return {
    reviewer: 'Dr Amal (fictional reviewer)',
    reviewerRole: 'doctor',
    summary: draft.summary,
    stillToClarify: draft.stillToClarify,
    assessment: 'Example reviewer note: the reported change and the calculated result support a conversation. Neither establishes a diagnosis, and reversible causes are still to be checked.',
    nextStep: `Example plan: ${ROUTE_LABEL[route].en.toLowerCase()}, clarify the selected contributors, and record a ${days}-day follow-up task. Nothing is booked or sent by this prototype.`,
    contributors: chosen,
    route,
    services: run.suggestedServices.slice(0, 3),
    rationale: 'Example rationale: the reviewer accepts the proposed route after reading the sources and the gaps.',
    followUpDays: days,
    summaryConfirmed: true,
    contributorsReviewed: true,
    status: 'approved',
    decidedAt: today,
  };
}

const ROUTE_MEANING: Record<Route, Localised> = {
  routine: L(
    'Your results are close to your own earlier results, and no change in daily life was reported. This does not rule out a problem, so please tell us sooner if you or your family notice a change.',
    'نتائجك قريبة من نتائجك السابقة، ولم يُبلغ عن تغيّر في حياتك اليومية. لا يستبعد هذا وجود مشكلة، لذا أخبرنا مبكرًا إذا لاحظت أنت أو عائلتك أي تغيّر.',
  ),
  repeat: L(
    'Your result was slightly lower than your own earlier results. This often happens by chance or after poor sleep, so the fair next step is to repeat it under the same conditions.',
    'كانت نتيجتك أقل قليلًا من نتائجك السابقة. يحدث هذا غالبًا بالصدفة أو بعد نوم سيئ، لذا فالخطوة المنصفة هي إعادتها في الظروف نفسها.',
  ),
  qualified_review: L(
    'Some of your results or daily tasks have changed compared with your own earlier results. This is not a diagnosis. Many causes can be treated, so a clinician will talk it through with you.',
    'تغيّرت بعض نتائجك أو مهامك اليومية مقارنة بنتائجك السابقة. هذا ليس تشخيصًا. يمكن علاج كثير من الأسباب، لذا سيناقش الطبيب الأمر معك.',
  ),
  urgent: L(
    'A sudden change needs to be seen by a person straight away.',
    'يحتاج التغيّر المفاجئ إلى أن يراه شخص مختص فورًا.',
  ),
  held: L(
    'We cannot give you a fair result yet, so we are not showing a number. The next step below will make a fair comparison possible.',
    'لا يمكننا بعد إعطاؤك نتيجة منصفة، لذا لا نعرض رقمًا. ستجعل الخطوة التالية أدناه المقارنة المنصفة ممكنة.',
  ),
  stopped: L(
    'This check has stopped and no information was read.',
    'توقف هذا الفحص ولم تُقرأ أي معلومات.',
  ),
};

export interface PersonPlan {
  meaning: Localised;
  actions: { id: ContributorId; label: Localised; action: Localised; localNote: Localised | null }[];
  services: Localised[];
  followUp: Localised;
  limits: Localised;
}

export function buildPersonPlan(decision: ClinicianDecision): PersonPlan {
  return {
    meaning: ROUTE_MEANING[decision.route],
    actions: decision.contributors.map((id) => {
      const k = CONTRIBUTORS[id];
      return { id, label: k.label, action: k.action, localNote: k.localNote };
    }),
    services: decision.services.map((s) => SERVICE_LABEL[s]),
    followUp: L(
      `Your care team chose to follow up in ${decision.followUpDays} days. This prototype has not booked or sent anything.`,
      `اختار فريق الرعاية المتابعة خلال ${decision.followUpDays} يومًا. لم يحجز هذا النموذج الأولي أو يرسل أي شيء.`,
      `Tim perawatan Anda memilih tindak lanjut dalam ${decision.followUpDays} hari. Prototipe ini tidak menjadwalkan atau mengirim apa pun.`,
    ),
    limits: L(
      'This is a fictional example. The check has not been validated, and these steps are for discussion with your clinician.',
      'هذا مثال خيالي. لم يُتحقق من صحة الفحص، وهذه الخطوات للنقاش مع طبيبك.',
    ),
  };
}
