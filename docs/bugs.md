# Bug Tracker

Issues uncovered while running the manually-generated label fixtures against the live verifier (`https://cola-verify.vercel.app`). **Do not fix issues from this file in passing — each one needs its own scoped change with evals.**

**Last eval run:** 2026-05-04 (paid-tier Gemini, billing enabled)
**Cases completed:** 27/30 (20 matched expectations, 7 had findings)
**Transient infra failures:** 3 (Gemini 503 — `04-noncompliant-01`, `04-noncompliant-14`, `06-warning-sneaky-02`)

## Severity legend

- **🔴 Critical** — false negative on the core matching loop (system says "match" when it doesn't)
- **🟠 High** — wrong overall verdict on a clean/expected case (impacts agent trust)
- **🟡 Medium** — missing or false-positive advisory; rule logic gap
- **🔵 Low** — eval infrastructure / fixture quality / coverage gaps

---

## Open bugs

### 🟠 BUG-02 — Extraction truncates compound brand names

- **Case:** `01-pass-01` (Old Cypress Distillery bourbon)
- **Symptom:** Submitted `"Old Cypress Distillery"`, extracted `"Old Cypress"`. The label clearly shows "OLD CYPRESS DISTILLERY" but Gemini truncated at the visual hierarchy break.
- **Why it matters:** Cat 1 is the "all green, agent approves in 5 seconds" path. Spurious mismatches force investigation of every clean case.
- **Suspected area:** Brand-name extraction prompt in `lib/gemini.ts` — guidance on "primary trademark" is being interpreted as "visually dominant text," which clips compound brand-as-distillery names.

### 🟡 BUG-03 — `state_of_distillation` advisory fires as false positive

- **Cases observed firing spuriously:** `01-pass-01`, `02-mismatch-05`, `03-noncompliant-02` (and likely more)
- **Symptom:** Advisory "State of distillation not found" fires even when the label clearly shows the state in the production statement (e.g., "DISTILLED AND BOTTLED BY OLD CYPRESS DISTILLERY, LOUISVILLE, KY").
- **Suspected area:** Gemini's `state_of_distillation` field only captures explicit "Distilled in [State]" phrasing, not state names embedded in the address line of the production statement. The compliance rule then sees null and fires.
- **Open question:** Should the rule fall back to parsing state out of `bottler_address` when `state_of_distillation` is null? Or tighten the extraction prompt to harvest state from any production-statement context?
- **Affects:** `checkStateOfDistillation` advisory + Gemini extraction prompt

### 🟡 BUG-06 — Composition-statement advisory misses common liqueur subtypes

- **Case:** `04-noncompliant-09` (Bella Notte **Amaretto**, no composition statement on label)
- **Expected:** Advisory fires — Amaretto is a liqueur and requires a statement of composition under 27 CFR 5.39
- **Actual:** `advisories=0` — the rule didn't trigger
- **Suspected area:** `checkStatementOfComposition` keyword matching is too narrow. Likely matches only literal "liqueur" / "cordial" / "specialty" / "flavored" and misses common liqueur subtypes (Amaretto, Triple Sec, Curaçao, Schnapps, Sambuca, Crème de…).
- **Fix scope:** Expand the trigger list in `lib/validators/compliance.ts` to include the full set of liqueur subtypes already in `APPROVED_CLASS_TYPES`.

### 🟡 BUG-07 — Fanciful-name-as-class submission has no useful path

- **Cases:** `04-noncompliant-18` (Volcano Fire), `04-noncompliant-20` (Mountain Ice)
- **Symptom:** When the agent submits a fanciful name (e.g., "Volcano Fire") in the `class_type` field, Gemini correctly refuses to extract it (per prompt instructions). The validator then sees submitted `"Volcano Fire"` vs extracted `null` and fails cross-validation. No advisory fires to explain *why* the submitted value was rejected.
- **Why it matters:** The agent gets a generic mismatch instead of a clear "this isn't an approved class designation" message. They have no way to know whether the issue is on the label or on the form.
- **Open question:** When the submitted `class_type` is not on `APPROVED_CLASS_TYPES`, should we fire an info-severity advisory explaining the submission is non-standard, separately from the cross-validation result? This is the parallel of `checkFancifulName` for the brand field.
- **Affects:** `lib/validators/compliance.ts` (new check) or extension of existing class-type check

---

## Fixture quality issues

These aren't product bugs — the fixture spec or generated image is internally inconsistent. Update the fixture data, not the code.

### 🔵 FIXTURE-01 — `01-pass-02` image and form_data don't agree

- The image shows: "Imported by Highland Crest Imports, **New York, NY**" with "Product of Scotland"
- The form_data has: `bottler_address: "Glasgow, Scotland"`, `country_of_origin: "Scotland"`
- The label is realistic for a US import (US importer + Scottish origin), but doesn't match the spec
- **Fix:** Update form_data to `bottler_address: "New York, NY"`, keep `country_of_origin: "Scotland"`

### 🔵 FIXTURE-02 — `04-noncompliant-06` missing `aged_years` field

- Test case expects the age-statement advisory to fire on a young bourbon
- Per the compliance-advisories spec, `checkAgeStatement` only fires when `formData.aged_years < 4` (since age can't be inferred from a label image alone)
- The fixture form_data has no `aged_years` field, so the rule can't trigger
- **Fix:** Add `"aged_years": 2` to the form_data so the test exercises the code path

---

## Eval infrastructure issues

### 🔵 INFRA-02 — No result caching between runs

- Every eval invocation re-calls Gemini for every case, wasting budget. If we re-run `01-pass-01` to debug it, all 30 fire again.
- **Fix idea:** `scripts/run-fixture-evals.ts` should append results to a JSON file keyed by `(case_id, image_hash, form_data_hash)` and skip cases with unchanged inputs and an existing result.

### 🔵 INFRA-03 — Default output doesn't show which field failed

- Default shows `failed=1` but not which field. Always need `--verbose` to debug, which means another full eval run.
- **Fix idea:** Always include the failed-field names in default output (e.g., `failed=1 (brand_name)`); reserve `--verbose` for full notes/advisories.

### 🔵 INFRA-05 — Eval script treats per-field `warning` as not-a-failure

- **Symptom:** For Cat 2 (intentional mismatches), the script asserts `failed ≥ 1`. But if the validator returns `warning` for the mismatched field, `failed` is still 0 and the script reports a miss — masking that the validator *did* observe the mismatch (just with the wrong severity).
- **Example:** `02-mismatch-05` shows `failed=0` in the eval output, but the verifier actually returned a `warning` on the bottler field (see BUG-01).
- **Fix idea:** For Cat 2 expectations, count any field with `status !== 'pass'` (fail OR warning) toward the "≥1 mismatch" assertion. Optionally split into a separate "soft mismatch" expectation if we want to distinguish.
- **Affects:** `scripts/run-fixture-evals.ts` — `judge` function

---

## Coverage observations

These categories all worked as designed and need no further action:

- **Cat 2 (JSON mismatches):** 4/5 caught correctly (`02-mismatch-01..04`). Only `02-mismatch-05` missed (BUG-01).
- **Cat 3 (label non-compliant, JSON correct):** all 5 produced expected advisories with no spurious cross-validation failures.
- **Cat 5 (gov warning obviously wrong):** all 4 caught with appropriate FAIL reasons (missing, wrong capitalization, truncated, wrong wording).
- **Cat 6 (gov warning sneaky):** 3 of 4 ran (1 hit 503). All 3 came back PASS under the current 92% Levenshtein threshold:
  - "could cause" instead of "may cause" → PASS
  - "a Surgeon General" instead of "the Surgeon General" → PASS
  - "alcohol beverages" instead of "alcoholic beverages" → PASS
- **Decision (2026-05-04):** Tighten threshold to **100% exact match** after normalization. Bias toward false-positive flags over false-negative passes — the government warning has exact statutory wording, so anything less than perfect should route to human review. Tracked as **BUG-08** below.

---

## Triage notes

**Patterns:**
- Several extraction-related observations (BUG-02, BUG-03) likely share a Gemini prompt root cause. Worth a single prompt-review pass rather than four separate fixes.
- BUG-06 and BUG-07 are both compliance rule logic gaps in `lib/validators/compliance.ts`. Could be one PR.
- BUG-01 is the only confirmed bug in the cross-validation path and the most impactful — small scope, big trust win.

**Suggested order:**
1. Fix the **fixture issues** (FIXTURE-01, FIXTURE-02) and infra retry (INFRA-04). This makes future runs cleaner and avoids re-debugging known fixture flaws.
2. Add result caching (INFRA-02) so subsequent debugging cycles don't burn full eval runs.
3. Fix **BUG-01** (the validator miss) — single, well-scoped change.
4. Tackle **BUG-02 + BUG-03** as a Gemini extraction prompt review.
5. Tackle **BUG-06 + BUG-07** as a compliance-rule expansion in one PR.
6. Re-run the 3 cases that hit 503 (`04-noncompliant-01`, `04-noncompliant-14`, `06-warning-sneaky-02`) once retry handling is in.

---

## Closed bugs

### 🔴 BUG-01 — Shared-suffix mismatches downgraded to "warning" instead of "fail"
- **Resolution:** Replaced the tiered `compareTextField` for `brand_name` and `bottler_name` with a new binary `compareCompanyName` (pass/fail only) in `lib/validators/semantic.ts`. Equality is `fuzzyEqual` (case/whitespace/apostrophe/dash normalized); anything non-equal is `fail`. No warning tier, no suffix stripping, no typo tolerance — the system can't distinguish OCR error from human error at the text-comparison layer, so mismatch always fails. OCR-side discrepancies (truncation, missed words) are deferred to the planned visual-verification feature instead of being papered over in code.
- **Spec:** [`docs/specs/company-name-suffix-strip.md`](specs/company-name-suffix-strip.md). Filename retained from initial scoping; design landed on binary strict-equality after discussion (suffix stripping became dead code under "any mismatch fails").
- **Tests:** 10 new cases in `evals/validators.test.ts` (`compareCompanyName — BUG-01` block) covering BUG-01 case, OCR truncation, suffix typo, core typo, case/whitespace normalization, punctuation strictness, null guards, no-warning invariant. New ground-truth fixture `evals/fixtures/ground-truth/bug-01-bottler-suffix-mismatch.json` for end-to-end pipeline coverage. All 146 tests passing.
- **Live confirmation (2026-05-04, `https://cola-verify.vercel.app`, 4 targeted cases):**
  - `02-mismatch-05` — flipped from `failed=0 REVIEW` to `failed=1 FAIL` on `bottler_name` (`Bottler Name mismatch: submitted "Wrong Distilling Co." vs label "Prairie Wind Distilling Co."`). BUG-01 confirmed fixed.
  - `02-mismatch-01`, `02-mismatch-02` — matched their existing expectations (non-regression).
  - `01-pass-01` — now fails on `brand_name` because Gemini truncated `"Old Cypress Distillery"` to `"Old Cypress"`. **This is BUG-02 being unmasked by the BUG-01 fix**, not a regression introduced here: pre-fix, `compareTextField` passed it with a "minor formatting difference" note (similarity ~0.91); post-fix, `compareCompanyName` correctly surfaces the mismatch. The fixture expectation (Cat 1 PASS) reflects pre-fix permissive behavior; the corrected design intent is to show the agent the discrepancy and let visual verification adjudicate. Cat 1 fixture expectations should be revisited once visual verification ships.

### 🔵 INFRA-04 — No retry on Gemini 503 transient outages
- **Resolution:** Server-side retry on 503 added inside `lib/gemini.ts` around the `generateContent` call. Up to 2 retries on `GEMINI_503_RETRY_DELAYS_MS = [5000, 10000]`, each logged via `console.warn`; original error rethrown unchanged on exhaustion. Non-503 errors are not retried.
- **Spec:** [`docs/specs/gemini-503-retry.md`](specs/gemini-503-retry.md).
- **Tests:** 6 new cases in `evals/gemini-retry.test.ts` covering retry-on-503 (1×, 2×, exhaustion), no-retry-on-non-503, and message-text fallback detection. All 135 tests passing.

### 🟠 BUG-08 — Government warning threshold (two passes)
- **Pass 1 — 100% threshold (initial fix).** Dropped the legacy tiered Levenshtein thresholds (≥0.92 pass / 0.75–0.92 warning / <0.75 fail) in `compareGovernmentWarning`. Replaced with strict equality after normalization: anything non-exact returned `warning`. This caught the cat-6 sneaky one-word substitutions that had been auto-passing.
- **Pass 2 — three-tier distance model (refinement).** The 100%-or-warning rule turned out too coarse: severely truncated warnings (`05-warning-bad-03`) and completely-different wording (`05-warning-bad-04`) routed to REVIEW when they should hard-fail. Split the text-comparison branch into three buckets keyed off Levenshtein distance against the normalized official text:
  - distance 0 → `pass`
  - 1 ≤ distance ≤ `MAX_WARNING_DISTANCE` (10) → `warning`
  - distance > 10 → `fail` ("more than ~5% off official")
  Structural hard fails (null extraction, non-ALL-CAPS prefix) are independent of the distance buckets and unchanged.
- **Spec:** [`docs/specs/govwarn-100pct-threshold.md`](specs/govwarn-100pct-threshold.md) (filename retained from pass 1 as a stable identifier; body describes the three-tier model).
- **Confirmation (2026-05-04 live eval against `https://cola-verify.vercel.app`, 8 targeted cases):**
  - `05-warning-bad-01` (warning entirely missing) → **FAIL** (structural; "Government warning not found on label")
  - `05-warning-bad-02` (title-case prefix) → **FAIL** (structural; "must appear in all capital letters")
  - `05-warning-bad-03` (truncated to first sentence) → **FAIL** (distance 128 chars; "more than ~5% off official")
  - `05-warning-bad-04` (completely different wording) → **FAIL** (distance 205 chars; "more than ~5% off official")
  - `06-warning-sneaky-01` (could/may) → **REVIEW**
  - `06-warning-sneaky-02` (missing "(1)" clause) → **REVIEW**
  - `06-warning-sneaky-03` (a/the Surgeon General) → **REVIEW**
  - `06-warning-sneaky-04` (alcohol/alcoholic beverages) → **REVIEW**
  - Result: cat-5 = FAIL × 4, cat-6 = REVIEW × 4 — matches the design exactly. (One Gemini 503 on the first run for `05-warning-bad-01`; retried cleanly — INFRA-04 still open.)

---

**Process:** When fixing a bug, link the spec/PR back here, move the entry under "Closed bugs" with the resolution and the case ID(s) that confirm the fix. Don't delete entries.
