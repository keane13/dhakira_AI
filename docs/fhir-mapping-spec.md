# FHIR R4 mapping spec

Code: `src/engine/fhir.ts` and `src/data/measures.ts`. Tests: `tests/fhir.test.ts`. Validator: `scripts/validate_fhir.py`.

**Status.** Prototype with fictional patients. No row has had clinical or terminology review, so every row is marked ⚠️ and none may go to production. The export is a `collection` Bundle, downloaded to the user's computer. It is never sent to any system.

**Verification done.**
- Every LOINC and HL7 code below was looked up on `tx.fhir.org/r4` (`CodeSystem/$lookup`) on 2026-11-17. All of them returned ACTIVE.
- All 16 example bundles (8 patients, each approved and pending) pass structural R4 4.0.1 validation with `fhir.resources` 6.4.0.
- A negative check confirms that validator rejects an invented element and a missing required element.

**Not yet done.**
- Official HL7 Java validator run. It checks terminology bindings and FHIRPath invariants. Java was not installed here.
- Profiling against a UAE implementation guide (Malaffi in Abu Dhabi, Riayati in other emirates). Those guides were not reviewed. Their required profiles, identifier systems and Emirates ID rules need confirming with the programme.

## Structural and terminology mapping

| # | Source (app field) | FHIR R4 path | Type | Terminology | Required in R4 | Transformation rule | Review status |
|---|---|---|---|---|---|---|---|
| 1 | `Case.id` | `Patient.identifier[0].value` | Identifier | local system `http://example.org/fhir/sid/dhakira-fictional-patient` | No | as is | ⚠️ awaiting review: the real system would be a national or facility identifier |
| 2 | `Case.name` | `Patient.name[0].text`, `.given[0]` | HumanName | none | No | first name only, as supplied | ⚠️ awaiting review |
| 3 | `Case.sex` | `Patient.gender` | code | administrative-gender | No | `F`→`female`, `M`→`male` | ⚠️ awaiting review |
| 4 | `Case.preferredLanguage` | `Patient.communication[0].language` | CodeableConcept | BCP 47 (`ar`, `en`, `id`, `ur`) | language 1..1 within communication | as is, `preferred: true` | ⚠️ awaiting review |
| 5 | visit date of each `Observation` | `Encounter.status`, `.class`, `.period` | Encounter | v3-ActCode `AMB` | status, class | one `finished` ambulatory encounter per distinct date | ⚠️ awaiting review |
| 6 | `Observation.score` (brief check) | `Observation.valueInteger` | integer | **local** `cognitive-check-total` | status, code | null score → `dataAbsentReason` `unknown` | ⚠️ awaiting review: no standard code, see GAP-1 |
| 7 | `Observation.mode`, `.form`, `.administration` | `Observation.method` | CodeableConcept | local `presentation-visual` / `presentation-auditory` | No | form and paper administration as text | ⚠️ awaiting review |
| 8 | `Observation.language` | `Observation.component[0].valueCodeableConcept` | CodeableConcept | BCP 47 | component.code | local component code `assessment-language` | ⚠️ awaiting review |
| 9 | `Observation.conditions` | `Observation.note` | Annotation | none | No | names of the conditions present, as text | ⚠️ awaiting review |
| 10 | `FunctionReport.level` | `Observation.valueCodeableConcept` | CodeableConcept | local `function-none` / `-some` / `-major` | status, code | reporter and note into `note` | ⚠️ awaiting review: see GAP-2 |
| 11 | `run.change.adjustedChange` | `Observation.valueQuantity` | Quantity | local `adjusted-change-from-baseline`, UCUM `{tasks}` | status, code | `status: preliminary`, 3 decimals | ⚠️ awaiting review |
| 12 | `run.change.z`, `.ci95` | `Observation.component[*].valueQuantity` | Quantity | local codes, UCUM `1` and `{tasks}` | component.code | 3 decimals | ⚠️ awaiting review |
| 13 | comparable visits | `Observation.derivedFrom` | Reference | none | No | references to the visits the formula compared | ⚠️ awaiting review |
| 14 | no change estimate (`run.changeNull`) | `Observation.dataAbsentReason` + `note` | CodeableConcept | data-absent-reason `not-performed` | status, code | the number is never written as zero | ⚠️ awaiting review |
| 15 | Validated instrument total (`screen`): authored, or entered on the Check page | `Observation.valueQuantity` | Quantity | **LOINC 72172-0** Total score [MoCA], **72233-0** Total score [Mini-Cog], **98094-6** Total score [RUDAS] (all ACTIVE on tx.fhir.org, 2026-11-17); UCUM `{score}` | status, code | an entered result replaces the authored screen; the clinician's reading goes to the context item, not to an interpretation code | ⚠️ awaiting review |
| 16 | blood pressure (`bp`) | `Observation.component` ×2 | Quantity | **LOINC 85354-9** panel; **8480-6** systolic, **8462-4** diastolic; UCUM `mm[Hg]` | status, code | category `vital-signs` | ⚠️ awaiting review |
| 17 | HbA1c (`hba1c`) | `Observation.valueQuantity` | Quantity | **LOINC 4548-4**, UCUM `%` | status, code | category `laboratory` | ⚠️ awaiting review |
| 18 | daily steps (`steps`) | `Observation.valueQuantity` | Quantity | **LOINC 41950-7**, UCUM `{#}/(24.h)` | status, code | the value is a 30-day average, see GAP-3 | ⚠️ awaiting review |
| 19 | sleep (`sleep`) | `Observation.valueQuantity` | Quantity | **LOINC 93832-4** Sleep duration, UCUM `h` | status, code | only measured durations; "under 5 hours the night before" is not exported | ⚠️ awaiting review: see GAP-3 |
| 19a | Entered lab result (`LabResult`, Summary page) | `Observation.valueQuantity`, `.referenceRange`, `.interpretation` | Quantity | SI-unit LOINC codes, all ACTIVE on tx.fhir.org on 2026-11-17: B12 **14685-2** pmol/L, folate **14732-2** nmol/L, TSH **3016-3** m[IU]/L, free T4 **14920-3** pmol/L, HbA1c **4548-4** %, fasting glucose **14771-0** mmol/L, sodium **2951-2** mmol/L, calcium **2000-8** mmol/L, haemoglobin **718-7** g/L, creatinine **14682-9** umol/L, eGFR CKD-EPI **62238-1** mL/min/{1.73_m2}; interpretation v3-ObservationInterpretation `L` / `H` / `N` | status, code | category `laboratory`; reference range copied from the lab report (at least one bound required); L/H/N derived only from that range; newest sample per test goes to the context | ⚠️ awaiting review: see GAP-7 |
| 19b | Entered medicine (`MedicineEntry`) | `MedicationStatement` | MedicationStatement | none, name as `medicationCodeableConcept.text` | status, medication[x], subject | confirmed → `status: active`, unconfirmed → `status: unknown`; dose as `dosage[0].text`; source, no-prescription and clinician marks as `note`; only with clinical-record consent | ⚠️ awaiting review: see GAP-6 |
| 20 | `Case.consent` | `Consent.provision` | BackboneElement | consentscope `patient-privacy`; category **LOINC 59284-0** | status, scope, category, policy or policyRule | base `permit`, nested `deny` per refused scope (local codes `data-scope-*`) | ⚠️ awaiting review: see GAP-4 |
| 21 | `ClinicianDecision.reviewer` | `Practitioner.name[0].text` | HumanName | none | No | only when a doctor approved | ⚠️ awaiting review: no licence identifier |
| 22 | approved `ClinicianDecision` | `ServiceRequest` | ServiceRequest | route label as `code.text` | status, intent, subject | `status: draft`, `intent: plan`; next step and services as notes | ⚠️ awaiting review: see GAP-5 |
| 23 | monitoring tasks | `Task` | Task | none | status, intent | `status: requested`, `intent: plan`, due date in `restriction.period.end`; follow-up task `focus` is the ServiceRequest | ⚠️ awaiting review |
| 24 | every resource | `meta.tag` | Coding | v3-ActReason `HTEST` | No | always set | ⚠️ awaiting review |

## Gaps

```
GAP-1: Observation.code for the brief cognitive check has no standard code
Source: original, unvalidated 10-item check written for this prototype
Impact: receiving systems cannot recognise the result without the local code system
Options:
  A. Use a validated instrument that has a LOINC panel (accurate, changes the check)
  B. Request a LOINC code once the instrument is validated (slow)
  C. Keep the local code with full text (limited, current choice)
Recommendation: A or B before any real use; C only for the prototype
```

```
GAP-2: function report has no agreed code
Source: one care partner or self-report question with three levels
Impact: exported as local codes only
Options: map to an established informant instrument after clinical choice of one (for example a validated informant questionnaire)
Recommendation: clinical team chooses the instrument, then a terminologist maps it
```

```
GAP-3: wearable summaries are averages, the LOINC codes describe single measurements
Source: 30-day wearable summary (steps, sleep)
Impact: 41950-7 and 93832-4 may be read as one day's value
Options:
  A. Export each day as its own Observation (needs raw daily data, not supplied)
  B. Keep the average with effectivePeriod and a statistic note (needs review of the right representation)
Recommendation: A when daily data are authorised; until then each row stays ⚠️
```

```
GAP-4: consent scopes (clinical, wearable, family, genomic) have no standard codes
Source: four app-level permission switches
Impact: deny provisions use local codes; policy.uri is a placeholder
Options: map to the programme's consent policy and the code system the UAE guide requires
Recommendation: confirm with the programme's privacy officer and the relevant UAE implementation guide
```

```
GAP-5: ServiceRequest.code has text only
Source: proposed route labels (qualified review, repeat, routine, urgent)
Impact: no machine-readable referral type; the request stays a draft
Options: SNOMED CT referral concepts chosen by a clinician and checked by a terminologist
Recommendation: clinical review before any referral is ever sent
```

```
GAP-6: MedicationStatement.medication has text only
Source: medicine names typed from the packet or the patient's account
Impact: receiving systems cannot match the medicine; no interaction or dose checks are possible
Options:
  A. Pick from the UAE national drug code list at entry (needs the list and a licence check)
  B. Map to RxNorm or ATC afterwards, reviewed by a pharmacist
Recommendation: A in a pilot, with pharmacist review of anything entered as free text
```

```
GAP-7: lab units are fixed to SI
Source: one unit per test (for example B12 in pmol/L)
Impact: a report in mass units (pg/mL, mg/dL) must be converted by hand, or entered under the wrong code
Options: offer both unit kinds per test, each with its own verified LOINC code (for example B12 2132-9 for pg/mL)
Recommendation: add mass-unit codes after checking which units the partner laboratories report
```

**Not exported, by design.** Items with no agreed code are left out of the Bundle rather than given a guessed one:
- LDL (method unknown)
- the authored B12, thyroid and medicine summaries (entered lab results and medicines are exported, rows 19a and 19b)
- mood screen
- tobacco and social contact
- hearing and vision screens
- family history
- APOE genotype

Each needs a clinician-chosen code (LOINC, SNOMED CT or a FamilyMemberHistory / genomics profile) before it can be added. Context the patient did not authorise is never exported.

**Not inferred.** `Patient.birthDate` is left out because only age is known.
