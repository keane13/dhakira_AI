# Dhakira (ذاكرة)

A working research prototype for doctors and nurses, built for the Future Health Digital Innovation Challenge, "Protecting Brain Health Earlier". It compares a patient with their own earlier results, sets the finding beside their authorised health context, and leaves every care decision to a clinician. The interface runs in English, Arabic (right to left) and Indonesian.

**What it helps with:** noticing gradual cognitive and functional change that a clinician may then assess for mild cognitive impairment or dementia, ruling out treatable contributors (mood, sleep, medicines, B12, thyroid, glucose, blood pressure, hearing, vision), and prevention conversations. **What it does not do:** diagnose, treat, choose medicines, or handle emergencies such as stroke or delirium.

**All people and results are fictional or synthetic. This is not a medical device and must not hold real patient data.**

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, choose **Continue as demo doctor** or **Continue as demo nurse**, then press **Demo walkthrough** for the two-minute tour. No key is needed. You can also create an account, which stays only in that browser.

```bash
npm test
npm run build
```

## What is on each page

| Page | What you can do |
|---|---|
| Sign in | Sign in, create an account, or use a demo doctor or nurse |
| Patient queue | See who needs a person first, with your next action on each row by role |
| Summary | Read the proposed path, the result against the patient's expected range, the pre-visit brief and the risk context. Enter medicines and lab results from a lab report, record the reversible-cause work-up, and replay the 12 stages behind it |
| Cognitive check | Give a four-task check in Arabic, English or Indonesian on a device, or on paper with a staff sheet, with accommodations |
| Review and sign-off | Nurses prepare and hand over. Doctors edit, choose the route, and sign off or return. The plan appears in the patient's language |
| Visit record | See the calculation trail, charts, decision and audit log, with JSON, PDF and FHIR R4 Bundle export |
| Monitoring | See dated encounters, sourced flags, 12 weeks of sleep, activity and social contact, and follow-up tasks you can export to Google Calendar, Outlook or Apple Calendar as an .ics file |
| Tool validation | Filter 240 synthetic records by language, age and education, and move the threshold |
| How it works | Inspect the agents, the five gates and where language models are allowed |
| Documentation | Read the checklist against the challenge, the formula, production stack, pilot path, limits and sources |

## The eight paths

| Case | Situation | Path |
|---|---|---|
| Khalid, 71 | Care partner reports daily-function change, z −3.71 | Qualified review |
| Mariam, 66 | Stable, picture-first candidate | Routine follow-up |
| Hessa, 64 | Stable results with a positive mood screen | Qualified review for a high-risk result |
| Priya, 62 | Borderline after poor sleep, z −1.84 | Repeat under the same conditions, then review if flagged again |
| Salem, 68 | Hearing concern with an auditory baseline | Held for audiology and a visual baseline |
| Imran, 59 | Assessed in Urdu, no calibration | Held, number withheld |
| Grace, 58 | Only two visits, context missing | Held until the baseline is complete |
| Noura, 77 | Sudden confusion flag | Stopped, urgent human handoff |

## Architecture

```
src/engine/   Pure TypeScript with no UI or network code
  scoring.ts     Versioned change formula and calibration table
  pipeline.ts    12-stage state machine, gates and routes
  checkin.ts     Alternate forms and scoring for the cognitive check
  queue.ts       Queue order and each role's next action
  cohort.ts      Seeded synthetic cohort and validation metrics
  metrics.ts     Wilson intervals and ICC(A,1)
  explain.ts     Template wording and the checks on model output
  monitoring.ts  Flags, tasks and the change series
  plan.ts        Review draft and plain-language plan
src/auth.ts   Prototype sign-in with salted password hashes, stored in the browser
src/data/     Fictional cases, contributor prompts and verified sources
src/pages/    One file per page
server/       Optional model endpoint, shared by Vite dev and Netlify
tests/        Engine and endpoint tests
```

The rules are deterministic. A language model can only word an explanation of a result the code has already calculated:

- The browser sends a fixed case ID and, at most, numeric scores. Free text is refused.
- The server recomputes everything, and rejects a tool call that changes the supplied values.
- Code checks every number in the model's text against the tool result, including Arabic-Indic digits, and rejects disease names and treatment wording.
- Any failure shows template wording with the reason. A failed call is never labelled live.

## Optional live model

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`, and `CLAUDE_MODEL` overrides it. The key stays on the server. Requests use the API's server-side refusal fallback, so a declined request can be retried on another model before the app falls back to its template.

## Backend (FastAPI)

The app runs in two modes. **Browser mode** (`npm run dev`) keeps everything in the browser, as before. **Server mode** keeps accounts and clinical records on the FastAPI backend in `backend/`.

The server enforces these rules whatever the client sends:
- Sign-in uses scrypt password hashes and opaque bearer tokens that expire. Only a SHA-256 of each token is stored. Failed sign-ins are rate-limited.
- Only a doctor can approve or return a review.
- Each entry (decision, lab, medicine, tier 2 instrument, check, consent, permission, work-up, habit) passes the same validation as the interface.
- New clinical information clears an earlier sign-off.
- Nothing is deleted: entries are retracted with who and why.
- Every change goes into a hash-chained audit log, which `/api/audit/verify` checks.
- In this prototype, only the fictional identifiers `SYN-nnn` are accepted.

Run both locally:

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # .venv/bin/python on macOS/Linux
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8000
```

Then, from the project root, `npx vite --mode server --port 5174`. Vite proxies the API routes to port 8000. API docs are at `http://localhost:8000/api/docs` (development only).

**Settings** (environment variables):
- `DHAKIRA_ENV=production` turns off the API docs, demo accounts and open sign-up unless `DHAKIRA_ALLOW_DEMO` or `DHAKIRA_ALLOW_REGISTRATION` is set to `true`.
- `DHAKIRA_DATABASE_URL` takes any SQLAlchemy URL. It defaults to SQLite; PostgreSQL needs a driver added.
- `DHAKIRA_CORS_ORIGINS` is a comma-separated list.
- `DHAKIRA_TOKEN_TTL_HOURS` defaults to 12.

**What still runs where:**
- The calculation engine, FHIR export and shadow model run in the browser. The server stores the inputs, and the client recomputes from them.
- Saved dated records, practice logs and Claude explanations stay in the browser.
- `/api/explain` is still the Node handler (Vite in development, Netlify in production). It is not part of the Docker image, so that image uses the template wording.

## Deploy

Two options:

- **One container** (`Dockerfile`): builds the frontend in server mode and serves it, with the API, from FastAPI on port 8000. This suits Azure Container Apps. For a demo, set `DHAKIRA_ALLOW_DEMO=true`. SQLite in a container is lost on restart, so mount a volume at `/data` or point `DHAKIRA_DATABASE_URL` at a managed database. The image has not been built and run yet.
- **Netlify, browser mode:** `netlify.toml` builds the static site, and `netlify/functions/explain.mts` serves `/api/explain`. Set the key in the Netlify environment. Without it, the app still works and labels its wording as a template.

## Honest limits

- The check items are original and unvalidated. They are not MoCA, RUDAS or any other instrument.
- Calibration values are synthetic placeholders, so the validation figures show that the calculations work, not that the tool performs.
- The Arabic and Indonesian were written for this prototype and need linguistic and cultural review. Some Arabic wording uses the masculine form by default. The cognitive check runs in Indonesian, but its change number is withheld until Indonesian norms exist.
- Calendar export is a file, not a live sync. A direct Google Calendar or facility scheduling connection needs OAuth, a data processing agreement and governance approval.
- Habit histories are authored examples. No wearable is connected.
- Lab results are typed from a report, in SI units only. The app ships no reference ranges: high or low comes only from the range on that lab's report. There is no laboratory connection and no file upload.
- The app has no drug list and does not judge single medicines. A clinician or pharmacist marks anticholinergic and CNS-active medicines. The app then applies only two combination counts from the 2023 Beers Criteria, which were written for the United States.
- Brain scans are not uploaded or analysed. Reading imaging is regulated medical-device work. A radiologist's report summary can be added as context in a later version.
- The FHIR R4 export is a download, not an exchange. Mappings are in `docs/fhir-mapping-spec.md`, and every row is marked as awaiting clinical and terminology review. The brief check, function report and consent scopes use local codes, because no standard code exists for them. Context with no agreed code (for example mood, family history, APOE) is left out rather than coded by guess. Entered medicines are exported as MedicationStatement with the name as text only, because no drug code list is connected. Bundles pass structural R4 validation (`python scripts/validate_fhir.py fhir-examples/*.json`). They have not been run through the official HL7 validator or profiled against a UAE implementation guide.
- The calculation trail, audit log and technical documentation are in English only.
- Clinician free text is shown as typed, so it is not translated.
- Local adaptation notes are ideas for co-design, not evidence.
- The Safety Triage Agent checks a supplied flag. It does not detect sudden change.
- In browser mode, sign-in and roles run only in the browser and are not a security control. Server mode enforces them on the server. Its limits:
  - single-instance rate limiting and audit locking;
  - the token is kept in browser storage, not an httpOnly cookie;
  - schema creation instead of migrations;
  - no single sign-on.

  There is no hospital connection, and nothing is booked or sent.
- The logo was drawn for this prototype and has not been checked for trademark conflicts.

## Reference format

The page structure, the stage and gate model and the evaluation layout follow the teaching format shown in the challenge's Inception42 lecture. The name, branding, cases, wording, check items and code here are this project's own.
