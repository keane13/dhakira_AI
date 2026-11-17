import { SOURCES } from '../data/sources';
import { useApp } from '../store';
import { PageHead } from '../components/ui';

type Fit = 'runs' | 'simulated' | 'pilot';
const FIT_LABEL: Record<Fit, { text: string; cls: string }> = {
  runs: { text: 'Runs in prototype', cls: 'tag-pass' },
  simulated: { text: 'Simulated', cls: 'tag-wait' },
  pilot: { text: 'Needs a pilot', cls: 'tag-hold' },
};

/** Each desired outcome from the challenge brief, stated at the level a judge can check by clicking. */
const CHECKLIST: { outcome: string; items: [Fit, string, string][] }[] = [
  {
    outcome: 'Culturally valid and accessible assessment',
    items: [
      ['runs', 'Three interface languages: English, Arabic with a right-to-left layout, and Indonesian, switchable on every screen including sign-in', 'Top bar, Sign in'],
      ['runs', 'A brief check of about four minutes in Arabic, English or Indonesian. Indonesian has no calibration yet, so its change number is withheld', 'Cognitive check'],
      ['runs', 'Education levels: picture-first mode, set automatically for low schooling, with calibration per education group', 'Cognitive check'],
      ['runs', 'Sensory needs: sight or sound presentation, larger text, higher contrast, read-aloud and no time limit', 'Cognitive check'],
      ['runs', 'Digital access: a paper route with a printable staff sheet, plus recorded help from family or staff', 'Cognitive check'],
      ['runs', 'Cultural context: fasting and sleep recorded on the day, familiar picture items, and family and stigma prompts', 'Cognitive check, Review'],
      ['runs', 'A language with no calibration has its number withheld and is offered an interpreter-supported conversation', 'Imran'],
      ['pilot', 'Items and Arabic wording validated with local people across dialects, and more languages added', 'Path to pilot'],
    ],
  },
  {
    outcome: 'Longitudinal change detection',
    items: [
      ['runs', 'Personal baseline over three visits, alternate forms and a practice adjustment', 'Summary'],
      ['runs', 'Normal variation is shown as an expected range for that patient, and only comparable visits are compared', 'Summary, Monitoring'],
      ['runs', 'Clear thresholds: repeat at z -1.645, review at z -1.96, review if flagged again on repeat, and review for a fall of 3 or more', 'Summary, Priya'],
      ['runs', 'Functional health is tracked beside cognition, and reported change outranks the number', 'Khalid'],
      ['pilot', 'Thresholds and norms validated locally, including serial correlation and regression to the mean', 'Path to pilot'],
    ],
  },
  {
    outcome: 'Integrated risk context',
    items: [
      ['runs', 'Programme screen, physical, metabolic, sleep, mental wellbeing, lifestyle, sensory and medicine items, each with source and date', 'Summary'],
      ['runs', 'Family history and genomic information sit under their own consent and never change the path', 'Summary, consent controls'],
      ['runs', 'Consent is set per scope, and a value that is not authorised stays empty', 'Summary, consent controls'],
      ['runs', 'Brain-health habits over 12 weeks: sleep and activity against published reference lines, and social contact, with nurse-logged weeks and signals to discuss', 'Monitoring'],
      ['simulated', 'Wearable, laboratory and programme values are authored examples, with no live device or record connection', 'Production stack'],
    ],
  },
  {
    outcome: 'Personalized prevention and timely care',
    items: [
      ['runs', 'Contributors are listed with reversible causes first, each with sources and local adaptation notes', 'Review and sign-off'],
      ['runs', 'A reversible-cause work-up: medicines, B12, thyroid, glucose, mood, sleep, hearing and vision, with the clinician recording each finding. It never names a cause', 'Summary'],
      ['runs', 'A plain-language plan in the patient\'s language, English, Arabic or Indonesian, built only from what the doctor approved', 'Review and sign-off'],
      ['runs', 'Suggested services include primary care, neurology, geriatrics, mental health, audiology, sleep and genetic counselling', 'Review and sign-off'],
      ['runs', 'Repeat timing and dated follow-up tasks with overdue status, exportable as a calendar file for Google Calendar, Outlook or Apple Calendar, holding only the patient ID', 'Monitoring'],
      ['simulated', 'No referral or appointment is really sent, because that needs a care-system integration', 'Production stack'],
      ['pilot', 'Direct calendar sync with the facility scheduling system or Google Workspace, which needs OAuth, a data processing agreement and clinical governance approval', 'Production stack'],
    ],
  },
  {
    outcome: 'Safety and human oversight',
    items: [
      ['runs', 'Risk identification is kept apart from diagnosis in the interface, the plan and the model checks', 'All pages'],
      ['runs', 'Intended use says plainly what the tool helps with and that it does not diagnose, treat or handle emergencies', 'How it works'],
      ['runs', 'Uncertainty and accuracy limits are shown beside the result: interval, synthetic calibration, and no-flag is not clearance', 'Summary, Visit record'],
      ['runs', 'Qualified review is required for abnormal, rapidly changing and high-risk results, with an urgent stop for sudden change', 'Khalid, Hessa, Noura'],
      ['runs', 'Role separation: a nurse prepares and hands over, and only a doctor can sign off and release care', 'Review and sign-off'],
      ['simulated', 'Sign-in runs only in the browser and is not a security control. Production needs facility single sign-on', 'Production stack'],
    ],
  },
  {
    outcome: 'Validation and local population performance',
    items: [
      ['runs', 'Completion, test-retest reliability, sensitivity, specificity, ability to identify meaningful change, false-referral burden and time to assessment are all calculated', 'Tool validation'],
      ['runs', 'Every metric splits by language, age and education, with Wilson intervals, small-group warnings and empty values where nothing can be calculated', 'Tool validation'],
      ['simulated', 'The figures come from 240 synthetic records, so they show the calculations work, not performance', 'Tool validation'],
      ['pilot', 'Real performance in the local target population, against independent qualified assessment', 'Path to pilot'],
    ],
  },
];

const CRITERIA: [string, string][] = [
  ['Health impact and clinical relevance', 'Targets the delay between gradual change and assessment. Reversible causes come first. Function outranks the number. The evidence on screening is stated honestly.'],
  ['Technical depth and architecture', 'Deterministic state machine, versioned formula, typed contracts, per-domain consent, tool-grounded model call with code checks, and unit tests that include published statistical values.'],
  ['Working solution and demonstration quality', 'Every page works offline with no key, the check is playable, a new result re-runs the pipeline, and a guided demo runs the whole story.'],
  ['Responsible AI, safety and data governance', 'Model output cannot set numbers or routes. Missing stays null. Genomics needs separate consent and never changes a route. Practice logs cannot touch a case. The audit log records no case data when permission is refused.'],
  ['Scalability and deployment readiness', 'Static front end plus one small server function. The engine has no UI or network dependency, so it can move behind a service. See the production stack below.'],
  ['Commercial viability and path to pilot', 'Designed to sit inside an existing wellness programme, with a staged pilot and costs carried by the buyer of that programme. See the pilot path below.'],
];

const STACK: [string, string, string][] = [
  ['Interface', 'React and TypeScript, English, Arabic and Indonesian, works offline', 'Accessible web and tablet app, reviewed right-to-left Arabic'],
  ['Orchestration', 'Deterministic 12-stage state machine in code', 'Durable workflow engine with typed state, checkpoints and recovery'],
  ['Measurement', 'Versioned formula with synthetic calibration', 'Tested scoring service, local norms and validated thresholds'],
  ['Language model', 'Optional Claude call: tool use checked in code, schema-checked, number-checked', 'Approved Arabic-capable endpoint in an agreed region, with the same checks'],
  ['Evidence', 'Curated sources S1 to S14', 'Clinician-approved corpus with citation checks'],
  ['Integration', 'Fictional cases, no hospital connection. FHIR R4 Bundle export (download only): verified LOINC codes, structurally validated, every row awaiting clinical review', 'Authorised FHIR R4 exchange profiled to the UAE guide in use (for example Malaffi in Abu Dhabi), under a partner agreement'],
  ['Identity', 'Sign-in stored only in this browser, with doctor and nurse roles', 'Facility single sign-on with server-side sessions'],
  ['Oversight', 'Nurse handover and doctor sign-off, enforced in the interface', 'Authenticated sign-off enforced on the server, and a staffed review queue'],
  ['Operations', 'Audit log, dated record, JSON and PDF export in the browser', 'Monitoring, rollback, agreed hosting and data residency'],
];

const BRIEF: [string, string][] = [
  ['User and task', 'Doctors and nurses in a wellness programme, preparing to discuss and act on possible cognitive or functional change'],
  ['Inputs', 'Repeated brief checks, reported daily function, and authorised health, family and genomic context'],
  ['Output', 'A sourced, editable review draft, a proposed path with its reason, and a plain-language plan after approval'],
  ['Scope', 'Risk identification and preparation. Not diagnosis, and no autonomous care action'],
  ['What we measure', 'The seven validation metrics by language, age and education, plus draft quality and clinician workload in pilot'],
  ['Who reviews it', 'A qualified clinician on each case, and a clinical governance lead on the results'],
];

const PILOT: [string, string][] = [
  ['Co-design', 'Work with Arabic-speaking participants, families and clinicians on items, wording, dialect and accommodations.'],
  ['Measurement validation', 'Silent study: test-retest, local norms by language and education, and independent qualified assessment as the reference. No result reaches care.'],
  ['Integration and staffing', 'Authorised record access, identity, consent registry and a staffed review queue inside one wellness programme.'],
  ['Monitored pilot', 'Limited rollout with stopping rules, subgroup monitoring, and a comparison of time to assessment and false-referral burden against usual care.'],
];

export function Docs() {
  const { t, lang } = useApp();
  return (
    <>
      <PageHead title={t('Documentation', 'التوثيق')}>
        {t('For judges, clinicians and engineers. It separates what runs today from what is proposed.', 'للمحكمين والأطباء والمهندسين. يفصل ما يعمل اليوم عما هو مقترح.')}
      </PageHead>

      {lang !== 'en' && (
        <div className="notice notice-info">
          {t('', 'هذا القسم التقني متاح بالإنجليزية حاليًا. الواجهة والفحص وخطة المريض متاحة بالعربية.', 'Bagian teknis ini saat ini dalam bahasa Inggris. Antarmuka, cek kognitif, dan rencana pasien tersedia dalam bahasa Indonesia.')}
        </div>
      )}

      <div className="stack-lg" dir="ltr" lang="en" style={{ textAlign: 'left' }}>
        <section className="stack">
          <h2>The project brief</h2>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap"><table><tbody>
              {BRIEF.map(([a, b]) => <tr key={a}><td className="strong" style={{ width: 200 }}>{a}</td><td>{b}</td></tr>)}
            </tbody></table></div>
          </div>
        </section>

        <section className="stack">
          <h2>Checklist against the challenge objective and desired outcomes</h2>
          <p className="muted small">The objective: identify meaningful cognitive and functional change earlier, assess it in the person's language and cultural context, integrate health, lifestyle, family-history and genomic risk factors, and connect findings to personalized prevention and timely clinical care. Each line says honestly whether it runs here, is simulated, or needs a pilot.</p>
          {CHECKLIST.map((group) => (
            <div key={group.outcome} className="card" style={{ padding: 0 }}>
              <div className="table-wrap"><table>
                <thead><tr><th colSpan={3} style={{ color: 'var(--text)', fontSize: '0.95rem', paddingTop: 12 }}>{group.outcome}</th></tr></thead>
                <tbody>{group.items.map(([fit, text, where]) => (
                  <tr key={text}>
                    <td style={{ width: 150 }}><span className={`tag ${FIT_LABEL[fit].cls}`}>{FIT_LABEL[fit].text}</span></td>
                    <td>{text}</td>
                    <td className="small muted" style={{ width: 190 }}>{where}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
        </section>

        <section className="stack">
          <h2>Comparing a person with themselves</h2>
          <div className="wide-narrow">
            <div className="formula">
              <span className="dark-sub">Cognitive Change Scoring Agent, stage 06, versioned formula tool</span>
              <span>Baseline: mean of the first 3 comparable visits</span>
              <span>Follow-up: mean of the latest 1 or 2 comparable visits</span>
              <span>Adjusted change = follow-up mean − baseline mean − expected practice gain</span>
              <code>SE = SD × √[(1 − r)(1/n_b + 1/n_f)]</code>
              <span>z = adjusted change ÷ SE</span>
              <span>z ≤ −1.96: review</span>
              <span>−1.96 &lt; z ≤ −1.645: repeat in 2 to 4 weeks</span>
              <span>Fall of 3 or more between two visits: review</span>
            </div>
            <div className="stack">
              <div className="card card-tight"><h3>An illustrative grouped-mean model</h3><p className="small muted">SD, reliability and practice gain are synthetic, set per language and education group. It assumes independent errors and equal error variance.</p></div>
              <div className="card card-tight"><h3>Function outranks the number</h3><p className="small muted">A reported daily-function change goes to review, whatever z says.</p></div>
              <div className="card card-tight card-tint"><h3>Statistics are not clinical significance</h3><p className="small muted">A no-flag result does not rule out impairment. Local validation must address serial correlation and regression to the mean. S1 and S2 give the rationale only.</p></div>
            </div>
          </div>
        </section>

        <section className="stack">
          <h2>The live model call</h2>
          <div className="card">
            <ol className="plain">
              <li>The browser sends a fixed fictional case ID and, at most, numeric live scores. Free text and real records are refused.</li>
              <li>The server rebuilds the case and runs the same pipeline. Stopped or held cases are refused.</li>
              <li>The first model request asks for the <code>calculate_cognitive_change</code> tool. If the arguments differ from the supplied values, the call is rejected.</li>
              <li>Server code runs the formula and returns the result. The second request returns schema-constrained English and Arabic text.</li>
              <li>Code checks every number against the tool result, including Arabic-Indic digits, and rejects disease names or treatment wording.</li>
              <li>Any failure shows the template wording with the reason. A failed call is never labelled live.</li>
            </ol>
            <p className="small muted">The default model is <code>claude-opus-5-5</code>. Set <code>ANTHROPIC_API_KEY</code> on the server to enable it. The key never reaches the browser. Everything else works without it.</p>
          </div>
        </section>

        <section className="stack">
          <h2>From prototype stack to production stack</h2>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap"><table>
              <thead><tr><th>Layer</th><th>Prototype today</th><th>Production candidate (proposed)</th></tr></thead>
              <tbody>{STACK.map(([a, b, c]) => <tr key={a}><td className="strong">{a}</td><td className="muted">{b}</td><td>{c}</td></tr>)}</tbody>
            </table></div>
          </div>
        </section>

        <section className="stack">
          <h2>Path to pilot</h2>
          <div className="grid-4">
            {PILOT.map(([a, b], i) => (
              <div key={a} className="card card-tight">
                <span className="mono sub">{i + 1}</span>
                <h3>{a}</h3>
                <p className="small muted">{b}</p>
              </div>
            ))}
          </div>
          <div className="card card-tight card-sand">
            <h3>Commercial model (proposed, untested)</h3>
            <p className="small muted">The buyer is the operator of a population wellness programme, licensing per enrolled participant per year. The case for buying would rest on measured workload saved and false referrals avoided, which the pilot has to demonstrate. No pricing or demand has been validated.</p>
          </div>
        </section>

        <section className="stack">
          <h2>How this maps to the assessment criteria</h2>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap"><table><tbody>
              {CRITERIA.map(([a, b]) => <tr key={a}><td className="strong" style={{ width: 280 }}>{a}</td><td>{b}</td></tr>)}
            </tbody></table></div>
          </div>
        </section>

        <section className="stack">
          <h2>Honest limits</h2>
          <div className="card">
            <ul className="plain">
              <li>All people, results and cohort records are fictional or synthetic. Nothing here measures real performance.</li>
              <li>The check items are original and unvalidated. They are not MoCA, RUDAS or any other instrument.</li>
              <li>Calibration values are placeholders. Urdu and other languages have none, so the tool withholds numbers for them.</li>
              <li>Arabic and Indonesian text was written for this prototype and needs linguistic and cultural review, across dialects, before any real use.</li>
              <li>Local adaptation notes are design ideas for co-design, not evidence.</li>
              <li>Emoji render differently between devices, which a real instrument could not accept. Licensed or custom artwork would replace them.</li>
              <li>The Safety Triage Agent checks a supplied flag. It does not detect sudden change.</li>
              <li>The calculation trail, audit log and this documentation are in English only.</li>
              <li>Sign-in and roles run only in the browser and are not a security control, so this prototype must not hold real patient data.</li>
              <li>Programme screening scores such as MoCA are shown as supplied values. The instrument is licensed and is not reproduced or scored here.</li>
            </ul>
          </div>
        </section>

        <section className="stack">
          <h2>Sources</h2>
          <div className="card">
            <ul className="plain small">
              {SOURCES.map((s) => (
                <li key={s.id} style={{ marginBottom: 8 }}>
                  <a href={s.url} target="_blank" rel="noreferrer"><span className="mono">{s.id}</span> {s.citation}</a>
                  <div className="muted tiny">{s.use.en}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
