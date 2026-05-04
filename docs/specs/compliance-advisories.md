# Feature Spec — Compliance Advisories

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Surface TTB regulatory compliance issues as **informational advisories**, separate from the per-field PASS / FAIL / REVIEW cross-validation results. The agent's primary decision (does the application match the label?) stays binary and fast; advisories add a lightweight "things you should also glance at" layer that flags potential rule violations without failing the verification.

## Architectural distinction

The system has two independent output streams. They serve different purposes and must not be conflated:

| | Cross-Validation (existing) | Compliance Advisories (this spec) |
|---|---|---|
| **Question answered** | Does the label match the application? | Does the label itself comply with TTB regulations? |
| **CFR basis** | The application data is the source of truth; we check the label against it | 27 CFR Part 5 rules apply to the label independently |
| **Output type** | `FieldResult[]` — one per COLA field | `ComplianceFlag[]` — one per detected issue |
| **Status values** | `pass` / `fail` / `warning` | `info` / `warning` / `review-required` |
| **Affects overall verdict?** | Yes — drives PASS / FAIL / REVIEW headline | No — surfaces alongside but does not change the headline |
| **Headline behavior** | Green when all fields pass | An advisory does not turn a green header red |
| **Agent action** | Quick approve when green | Glance, decide whether to escalate |

### Why this matters

Today's flow rewards agents for fast approvals when everything matches. Folding compliance issues into the cross-validation result would mean an agent who sees "✅ All Fields Match" might still need to dig — defeating the speed goal. Keeping advisories as a separate, visually distinct section preserves the "5-second approval" path while still surfacing the rule violations a human reviewer would catch by eye.

## Scope

**In scope:**
- New `ComplianceFlag` type in `types/cola.ts`, separate from `FieldResult`
- New module `lib/validators/compliance.ts` — pure rule-based label compliance checks, independent of submitted application data
- New advisory checks for distilled spirits:
  - **Bottle size** — flag if `net_contents` is not on the 27 CFR 5.47 approved fill list
  - **Age statement** — flag young whisky (under 4 years) without an age statement on the label (27 CFR 5.40)
  - **Statement of composition** — flag liqueurs, cordials, and Distilled Spirits Specialty without a composition statement (27 CFR 5.39)
  - **State / country of distillation** — flag "straight" whiskies and imports without a state/country of distillation indicator (27 CFR 5.36)
  - **Production statement type** — flag non-standard wording (anything other than "Distilled by", "Bottled by", "Produced by", "Imported by", or compound forms like "Produced and bottled by") (27 CFR 5.36)
  - **Fanciful name detection** — when Gemini extracts a brand name longer than the submitted brand name, surface the potential fanciful component as an advisory
- Updated `validateSpiritsLabel` orchestrator: returns `{ fields: FieldResult[], advisories: ComplianceFlag[] }` instead of just `fields`
- Updated `AnalysisResponse` to include the new `advisories` array
- New `ComplianceAdvisoriesCard` component (or equivalent section in `ResultsCard`) rendering the advisories list distinctly from the field results
- Eval coverage for each advisory rule — both true-positive and true-negative cases

**Out of scope:**
- Any changes to PASS / FAIL / REVIEW cross-validation logic (`FieldResult` flow stays as-is)
- Permit numbers, formula numbers, applicant identity, or any application-metadata fields — these belong to a separate concern (TTB system integration) that is explicitly not part of this prototype
- Live lookups against TTB databases (permit registry, formula approval) — format-only would not even apply here, since this spec is purely about label content
- Wine and malt beverage compliance rules — covered by `wine.md` and `beer-malt.md`
- Bottle size compliance for wine (different fill list under 27 CFR 4.72) — covered in `wine.md`

## Approach

### New type — `ComplianceFlag`
Add to `types/cola.ts`:

```ts
export type AdvisoryStatus = 'info' | 'warning' | 'review-required';

export interface ComplianceFlag {
  id: string;                  // stable identifier, e.g. "bottle-size-non-standard"
  severity: AdvisoryStatus;
  title: string;               // short, agent-readable headline
  detail: string;              // 1-2 sentence plain-English explanation
  cfrReference: string;        // e.g. "27 CFR 5.47"
  relatedField?: COLAField;    // optional anchor to a specific field for UI highlighting
}
```

`AnalysisResponse` becomes:
```ts
export interface AnalysisResponse {
  jobId: string;
  processingMs: number;
  fields: FieldResult[];           // existing — drives overall verdict
  advisories: ComplianceFlag[];    // NEW — informational only
  overallStatus: OverallStatus;    // unchanged — derived from `fields` only
  extraction: ExtractionResult;
  error?: string;
}
```

### New module — `lib/validators/compliance.ts`
Pure functions, one per advisory rule. Each takes the relevant slice of `ExtractionResult` and `ApplicationData` and returns `ComplianceFlag | null`.

```ts
export function checkBottleSize(extraction: ExtractionResult): ComplianceFlag | null;
export function checkAgeStatement(extraction: ExtractionResult, formData: ApplicationData): ComplianceFlag | null;
export function checkStatementOfComposition(extraction: ExtractionResult): ComplianceFlag | null;
export function checkStateOfDistillation(extraction: ExtractionResult, formData: ApplicationData): ComplianceFlag | null;
export function checkProductionStatement(extraction: ExtractionResult): ComplianceFlag | null;
export function checkFancifulName(extraction: ExtractionResult, formData: ApplicationData): ComplianceFlag | null;

export function runComplianceChecks(formData: ApplicationData, extraction: ExtractionResult): ComplianceFlag[];
```

`runComplianceChecks` calls each individual check and filters out the nulls.

### Approved bottle sizes — 27 CFR 5.47
Constant in `lib/validators/compliance.ts`:
```ts
const APPROVED_SPIRITS_FILL_SIZES_ML = [50, 100, 200, 355, 375, 500, 700, 750, 1000, 1750];
```
`checkBottleSize` parses `extraction.net_contents` to mL, normalizes (mL ↔ L), and compares against the list. Returns a `warning` advisory if no exact match (allow ±2 mL tolerance for OCR noise).

### Age statement detection
- Add `age_statement` field to `ExtractionResult` so Gemini explicitly returns any "Aged X years" text it finds
- `checkAgeStatement` runs **only** when class is whisky/whiskey AND `formData` includes a known-young indicator (see open questions — agent-submitted age, or absent age statement on a class that conventionally requires one)
- Returns a `review-required` flag when the conditions match but no age statement is found

### Statement of composition
- Add `statement_of_composition` field to `ExtractionResult`
- Triggered by class membership — liqueur, cordial, distilled spirits specialty, flavored variants
- Returns a `warning` if the trigger class matches and no composition text is found

### State / country of distillation
- Add `state_of_distillation` field to `ExtractionResult`
- Triggered when class includes "straight" AND extracted state appears to span multiple states OR is missing, or when `formData.is_import = true` and extracted state-of-origin is missing
- Returns `warning` advisory

### Production statement type
- Add `production_statement` field to `ExtractionResult`
- Approved phrasings (case-insensitive): "distilled by", "bottled by", "produced by", "imported by", "distilled and bottled by", "produced and bottled by", "manufactured by", "blended by"
- Anything else extracted near a producer name returns an `info` advisory ("Non-standard production statement: 'Made by'")

### Fanciful name detection
- Compares `extraction.brand_name` against `formData.brand_name`
- If the extracted brand text contains additional words after the submitted brand, surfaces those words as a potential fanciful name (e.g., extracted "Jack Daniel's Tennessee Fire" minus submitted "Jack Daniel's" → fanciful candidate "Tennessee Fire")
- Returns `info` advisory inviting the agent to confirm

### Gemini prompt changes
Extend `lib/gemini.ts` extraction prompt to capture the new label fields:
- `age_statement` — "Aged X years" or similar age-on-label text; null if absent
- `statement_of_composition` — descriptive sentences near the class designation; null if absent
- `state_of_distillation` — "Distilled in [state/country]" or "Product of [country]"; null if absent
- `production_statement` — the literal phrase used to attribute production ("Distilled by...", "Bottled by..."); null if absent

These extend `ExtractionResult` as optional `string | null` fields.

### UI — `components/ResultsCard.tsx`
- Keep the existing per-field results card unchanged
- Add a sibling section below: **Compliance Advisories** (only renders if `advisories.length > 0`)
- Severity-keyed visual treatment:
  - `info` — neutral grey/blue accent, info icon
  - `warning` — yellow accent, warning icon
  - `review-required` — orange accent, magnifier icon
- Each advisory displays: title, 1-2 sentence detail, CFR reference (small, dim), and an optional "anchor" affordance scrolling the related field into view
- Counter chip in section header: "Compliance Advisories (3)"
- Empty state when there are no advisories: omit the section entirely (do not render a "no issues" banner — that would dilute the meaning of the header status)

### Overall status logic
- `overallStatus` continues to be derived **only** from `FieldResult[]`
- An advisory **never** flips `PASS` to `REVIEW` or `FAIL`
- This is a deliberate UX choice: agents who see green header should be able to one-click approve. Advisories are a "by the way" layer the agent reads when they choose to.

## Acceptance criteria
- [ ] `ComplianceFlag` type exists in `types/cola.ts` with the documented shape
- [ ] `AnalysisResponse` exposes both `fields` and `advisories`
- [ ] `lib/validators/compliance.ts` module exists with one exported function per advisory rule
- [ ] All 6 advisory checks (bottle size, age statement, statement of composition, state of distillation, production statement, fanciful name) are wired up
- [ ] `validateSpiritsLabel` returns the new shape; existing 8-field cross-validation behavior is unchanged
- [ ] `overallStatus` is unaffected by advisories — a green PASS verdict can still co-exist with multiple advisories
- [ ] UI renders advisories as a separate, visually distinct section below the field results
- [ ] Empty advisories list does not render the section at all
- [ ] Gemini extraction prompt captures the new label fields
- [ ] All evals listed below pass
- [ ] No regressions in existing test suite

## Evals

**Bottle size (`checkBottleSize`):**
- `bottle_750ml_no_advisory` — net contents "750 mL" → null
- `bottle_700ml_no_advisory` — "700 mL" → null (added to approved list in 2020)
- `bottle_600ml_warning` — "600 mL" → warning advisory referencing 27 CFR 5.47
- `bottle_1L_no_advisory` — "1 L" normalized to 1000 mL → null
- `bottle_unit_normalization` — "1.75 L" matches 1750 mL → null
- `bottle_ocr_tolerance` — "751 mL" within ±2 mL tolerance → null
- `bottle_mL_outside_tolerance` — "760 mL" → warning

**Age statement (`checkAgeStatement`):**
- `age_young_bourbon_no_label_age_warning` — class "Bourbon Whiskey", agent indicates aged 2 years, no age on label → review-required
- `age_old_bourbon_no_advisory` — class "Bourbon Whiskey", aged 8 years, no age on label → null
- `age_non_whisky_no_advisory` — class "Vodka" → null regardless of age

**Statement of composition (`checkStatementOfComposition`):**
- `composition_liqueur_with_text_no_advisory` — class "Cinnamon Liqueur", extraction has "Cinnamon-flavored whisky with natural flavors" → null
- `composition_liqueur_missing_warning` — class "Cinnamon Liqueur", no composition text → warning
- `composition_specialty_missing_warning` — class "Distilled Spirits Specialty", no composition text → warning
- `composition_bourbon_no_advisory` — class "Bourbon Whiskey" → null (not required)

**State of distillation (`checkStateOfDistillation`):**
- `state_straight_with_state_no_advisory` — "Kentucky Straight Bourbon", extraction "Kentucky" → null
- `state_straight_missing_warning` — "Straight Rye Whiskey", no state extracted → warning
- `state_imported_with_country_no_advisory` — `is_import: true`, extraction "Product of Scotland" → null
- `state_imported_missing_warning` — `is_import: true`, no country extracted → warning

**Production statement (`checkProductionStatement`):**
- `production_distilled_by_no_advisory` — "Distilled by Old Tom Distillery" → null
- `production_produced_and_bottled_by_no_advisory` — "Produced and bottled by..." → null
- `production_imported_by_no_advisory` — "Imported by..." → null
- `production_made_by_info` — "Made by..." → info advisory ("non-standard production statement")
- `production_missing_warning` — no production statement extracted near producer name → warning

**Fanciful name detection (`checkFancifulName`):**
- `fanciful_jack_daniels_tennessee_fire` — submitted "Jack Daniel's", extracted "Jack Daniel's Tennessee Fire" → info advisory with candidate "Tennessee Fire"
- `fanciful_exact_match_no_advisory` — submitted "Tito's Vodka", extracted "Tito's Vodka" → null
- `fanciful_extracted_subset_no_advisory` — submitted "Jack Daniel's Old No. 7", extracted "Jack Daniel's" → null (extracted is shorter, not longer)

**Orchestrator (`runComplianceChecks`):**
- `orchestrator_no_advisories_returns_empty` — clean label and form → empty array
- `orchestrator_multiple_advisories_returned` — label with non-standard size, no age statement on young whisky, and missing composition → 3 advisories returned

**End-to-end pipeline (extend `evals/pipeline.test.ts`):**
- `pipeline_passing_label_with_one_advisory` — all 8 fields PASS but bottle size 600 mL → response has `overallStatus: 'PASS'` AND one advisory in `advisories[]`
- `pipeline_failing_label_with_advisories_independent` — one field FAIL plus two advisories — `overallStatus: 'FAIL'`, advisories independent
- `pipeline_no_advisories_for_perfect_label` — Old Tom Distillery fixture → `advisories: []`

**UI rendering:**
- `ui_advisories_section_hidden_when_empty` — fixture with empty `advisories` does not render the section
- `ui_advisories_severity_styling` — `warning` advisories render with yellow accent, `info` with neutral, `review-required` with orange
- `ui_overall_verdict_unaffected_by_advisories` — passing label with advisories still shows green header

**Regression:**
- `existing_field_results_unchanged` — all current 81 tests still pass after this spec ships

## Open questions

- **Age statement trigger:** the regulation says under 4 years requires the statement. We can't know the actual age from a label image — should the advisory fire (a) only when the agent submits an explicit age via a new optional `aged_years` form field, (b) always for whisky classes when no age statement is found (overzealous, will create noise), or (c) never (defer to the agent)? **Lean: (a)** — add an optional `aged_years` numeric field to `ApplicationData`; advisory fires only when the agent indicates age < 4 and no on-label statement was found.
- **Bottle size OCR tolerance:** ±2 mL feels right for catching OCR noise on standard sizes. Should we widen to ±5 mL given Gemini's occasional misreads? **Lean: keep tight (±2)**, since the approved list has gaps (e.g., 600 mL is genuinely non-compliant — we want to flag, not hide). Add a separate eval for "750 mL extracted as 75 mL" → still flag, since it's clearly a misread, not a compliant size.
- **Fanciful name confidence:** simple length-based diff might surface false positives when Gemini's brand extraction is slightly off ("Jack Daniel's Old No. 7 Tennessee Whiskey" — is "Old No. 7" a fanciful name or part of the class?). **Lean: ship the simple diff with `info` severity only**; tighten heuristic later if false positives become noise.
- **Severity calibration:** "info" vs "warning" vs "review-required" — three levels enough? Or just two (info / warning)? **Lean: three** — `review-required` is meaningfully distinct because it tells the agent "I found something that *might* be a real violation, you need to look at the actual label." `warning` is "label clearly violates a rule." `info` is "FYI, here's something I noticed."
- **Empty advisories — render or not?** Showing "✅ No advisories" might feel reassuring but could fatigue the agent into ignoring the section entirely. **Lean: hide entirely when empty.** The presence of the section *is* the signal.

## Notes
- This spec is the **#2 layer** of the system. The **#3 layer** (cross-validation, drives PASS/FAIL/REVIEW) stays untouched.
- 27 CFR references for the rules:
  - 5.36 — Name and address; production statements; state/country of distillation
  - 5.39 — Statement of composition
  - 5.40 — Age statements (whisky)
  - 5.47 — Standards of fill (bottle sizes)
- After this ships, future advisory rules can be added by appending a single function to `compliance.ts` and registering it in `runComplianceChecks` — the type, UI, and orchestration are reusable.
- Update `tracker.md` once approved: move from Future to Done, add new `ComplianceFlag` type to `technical-reference.md`, document the architectural distinction (cross-validation vs. advisories) in the architecture section.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
