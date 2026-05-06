# Feature Spec — Case-Insensitive Field Matching + Address Substring Rule

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-05

## Goal

Two related refinements to cross-validation, motivated by a careful reading of 27 CFR Part 5 and the TTB Beverage Alcohol Manual:

1. **Case is not regulatory** for the brand-name, bottler-name, and class/type fields — TTB does not require exact case match between an application and a label. Drop the "casing-differs but text matches" warning tier on `brand_name` / `bottler_name` so case-only differences pass cleanly.
2. **Address substring is acceptable** — when the agent's submitted address text appears (case-insensitively) inside the extracted label address, the substantive match is intact even if the label has additional detail (postal code, country). Pass these instead of routing them to similarity tiers and failing.

The goal is to align the validator with what TTB actually regulates instead of what's typographically convenient.

## Background — what's being reversed

The casing-only warning tier in `compareCompanyName` was added intentionally as part of the w03 results redesign (`docs/specs/results-redesign.md`) so case differences would render as yellow REVIEW cards on the new results page. After re-reading the regulations, that tier is over-strict: TTB only mandates ALL CAPS for the `GOVERNMENT WARNING:` prefix (27 CFR 16.21). Brand, bottler, and class designations have legibility / type-size requirements but no exact-case requirement. Most labels print these in ALL CAPS for typography reasons — that's not a compliance signal.

This spec **reverses** the casing-only warning rule for `compareCompanyName`. The BUG-01 strict-match invariant (anything beyond casing/punctuation/whitespace normalization is `fail`) is preserved.

## Per-field rule matrix (after this change)

| Field | Comparator | Casing | Subset (app ⊆ label) | Real text mismatch |
|---|---|---|---|---|
| `brand_name` | `compareCompanyName` | ignored → **pass** | hard fail (e.g. "Old Cypress" vs "Old Cypress Distillery") | hard fail |
| `bottler_name` | `compareCompanyName` | ignored → **pass** | hard fail | hard fail |
| `class_type` | `compareTextField` (unchanged) | already case-insensitive via `normalize()` | similarity tiers — typically falls below 0.6 → **fail** (deliberate; see "Out of scope" below) | hard fail |
| `bottler_address` | new `compareAddressField` | ignored | **pass** when application is a substring of extracted | similarity tiers / fail |
| `abv`, `net_contents`, `country_of_origin`, `government_warning` | unchanged | unchanged | unchanged | unchanged |

## Scope

**In scope:**

- `lib/validators/semantic.ts`:
  - Rewrite `compareCompanyName` to drop the casing-only warning branch. New flow:
    - `extracted` null → `fail "<field> not found on label"`.
    - `submitted` null → `fail "<field> not provided in application"`.
    - `fuzzyEqual(submitted, extracted)` → `pass` (this fold already covers case, whitespace, apostrophe, dash variants via the existing `normalize()` helper).
    - Otherwise → `fail "<field> mismatch: submitted \"<x>\" vs label \"<y>\""`.
  - The function's return type narrows from `'pass' | 'fail' | 'warning'` to `'pass' | 'fail'`. Callers in `spirits.ts` only read `.status`, so the narrower type ripples cleanly.
  - Add `compareAddressField(submitted, extracted, fieldLabel)` with this flow:
    - Null guards mirror `compareTextField`.
    - `fuzzyEqual(submitted, extracted)` → `pass` (full equality after normalize).
    - `fuzzyContains(extracted, submitted)` → `pass` with note `"Application address is contained within the label address — additional detail on label (e.g., postal code, country) is acceptable."`. The directionality is `submitted ⊆ extracted` (haystack=extracted, needle=submitted).
    - Otherwise defer to `compareTextField` (similarity tiers stay) so existing partial-overlap tolerance and tiered warning still applies.

- `lib/validators/spirits.ts`:
  - Replace the `compareTextField(formData.bottler_address, …)` call at line 219 with `compareAddressField(...)`. No other call sites change.

**Out of scope (deliberate non-changes — document in README):**

- **Class/type subset case:** application `"Scotch Whisky"` vs label `"Islay Single Malt Scotch Whisky"` continues to **fail**. The application is required to capture the label's class designation as printed (27 CFR 5.36 — name and address; the class designation is printed text the agent transcribes). An application that understates the label's class designation is an incomplete application, and we want the system to catch this. No code change required; the existing `compareTextField` similarity tier (~0.42) correctly hard-fails this case. Document explicitly so reviewers understand the existing fail is by design, not a bug.
- **Reverse-direction address subset:** application `"Port Ellen, Isle of Islay PA42 7DZ, SCOTLAND"` vs label `"PORT ELLEN, ISLE OF ISLAY"` (label is subset of application). Out of scope for this spec — the only direction handled here is `submitted ⊆ extracted`. The reverse case is rarer (agents typically under-transcribe rather than over-transcribe) and can be added if it surfaces in real evals.
- **Government warning casing:** body case-insensitivity already shipped under `docs/specs/govwarn-case-insensitive-body.md` (BUG-09). The `GOVERNMENT WARNING:` prefix CAPS rule remains a hard fail. Untouched here.
- **Suffix stripping** (the original BUG-01 design): unchanged. The current `compareCompanyName` does not strip company-type suffixes; it relies on strict equality after `normalize()`. The BUG-01 closure note in `docs/specs/company-name-suffix-strip.md` explains why suffix stripping became dead code.

## Approach

### 1. `compareCompanyName` rewrite

Replace lines 70–120 of [`lib/validators/semantic.ts`](../../lib/validators/semantic.ts) with:

```ts
/**
 * Strict-equality comparator for company-name fields (brand_name, bottler_name).
 * Two outcomes only — pass or fail. No similarity band, no casing warning.
 *
 *   pass: fuzzyEqual(submitted, extracted) is true (case/whitespace/apostrophe/
 *         dash differences are absorbed by `normalize()`).
 *   fail: anything else.
 *
 * Case is not regulated by TTB for these fields (27 CFR Part 5; the only
 * mandatory case rule is the "GOVERNMENT WARNING:" prefix in 27 CFR 16.21).
 * Wired only at brand_name and bottler_name call sites in spirits.ts.
 */
export function compareCompanyName(
  submitted: string | null,
  extracted: string | null,
  fieldLabel: string
): { match: boolean; status: 'pass' | 'fail'; note?: string } {
  if (!extracted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not found on label` };
  }
  if (!submitted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not provided in application` };
  }
  if (fuzzyEqual(submitted, extracted)) {
    return { match: true, status: 'pass' };
  }
  return {
    match: false,
    status: 'fail',
    note: `${fieldLabel} mismatch: submitted "${submitted}" vs label "${extracted}"`,
  };
}
```

The previous "byte-equal first, lowercased-equal warning, fuzzyEqual fallback" three-tier check collapses into a single `fuzzyEqual` pass branch. `normalize()` already handles case, whitespace, apostrophes, dashes — that's all the variation TTB compliance allows for these fields.

### 2. New `compareAddressField`

Add to [`lib/validators/semantic.ts`](../../lib/validators/semantic.ts), placed near `compareCompanyName`:

```ts
/**
 * Address-aware comparator for bottler_address. Adds a substring branch on top
 * of the standard tiered comparison: when the application's submitted address
 * appears (case-insensitively) inside the extracted label address, treat as
 * pass — the label has all the substantive info plus more (e.g., postal code,
 * country), which is permitted under 27 CFR 5.36.
 */
export function compareAddressField(
  submitted: string | null,
  extracted: string | null,
  fieldLabel: string
): { match: boolean; status: 'pass' | 'fail' | 'warning'; note?: string } {
  if (!extracted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not found on label` };
  }
  if (!submitted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not provided in application` };
  }
  if (fuzzyEqual(submitted, extracted)) {
    return { match: true, status: 'pass' };
  }
  if (fuzzyContains(extracted, submitted)) {
    return {
      match: true,
      status: 'pass',
      note: 'Application address is contained within the label address — additional detail on the label (e.g., postal code, country) is acceptable.',
    };
  }
  // Fall back to the existing tiered similarity comparator so partial-overlap
  // cases that don't satisfy the substring rule still get the warning band.
  return compareTextField(submitted, extracted, fieldLabel);
}
```

### 3. Wire `compareAddressField` in `spirits.ts`

In [`lib/validators/spirits.ts`](../../lib/validators/spirits.ts) at line 218–227, swap the comparator:

```ts
// 6. Bottler Address — substring-aware (compliance: app ⊆ label = pass)
const bottlerAddrResult = compareAddressField(formData.bottler_address, extraction.bottler_address, 'Bottler Address');
```

Add `compareAddressField` to the import from `./semantic` at the top of the file.

### 4. Test changes

In [`evals/validators.test.ts`](../../evals/validators.test.ts), the `compareCompanyName — BUG-01` block (currently around lines 248–348) needs three updates and one removal:

- **Flip** `warns on case-only difference (results-redesign: surfaced as REVIEW)` (line 279) → rename to `passes on case-only difference (case is not regulated for company-name fields)` and assert `status: 'pass'`. Remove the note assertion.
- **Flip** `warns on case-difference even with extra whitespace` (line 338) → rename to `passes on case-difference combined with extra whitespace` and assert `status: 'pass'`.
- **Remove** `preserves warning note copy used by the w03 wireframe` (line 344) entirely — the note no longer exists.
- **Update** the comment block at lines 234–246 and the inline comment at line 322–325 — remove "Warning is reserved exclusively for casing-only divergence" framing; the comparator is now strictly binary pass/fail.

Add a new `compareAddressField` block:

- `passes on exact address match` — `"Portland, OR 97201"` vs `"Portland, OR 97201"` → pass.
- `passes when application is a substring of label (case-insensitive)` — `"Port Ellen, Isle of Islay"` vs `"PORT ELLEN, ISLE OF ISLAY PA42 7DZ, SCOTLAND"` → pass with the substring note.
- `passes when application is a casing variant of label` — `"port ellen, isle of islay"` vs `"Port Ellen, Isle of Islay"` → pass (fuzzyEqual branch).
- `falls back to similarity tier when neither equality nor substring holds` — `"Louisville, KY"` vs `"Lexington, KY"` → fail (low similarity).
- `fails when extracted is null` — null guard.
- `fails when submitted is null` — null guard.

Update the existing pipeline fixture [`evals/fixtures/ground-truth/brand-name-case-mismatch.json`](../../evals/fixtures/ground-truth/brand-name-case-mismatch.json):
- Change `expectedOverall` from `"REVIEW"` to `"PASS"`.
- Change `expectedFields.brand_name` from `"warning"` to `"pass"`.
- Update the `description` to reflect the new behavior. Suggested copy: `"'STONE'S THROW' on label vs 'Stone's Throw' in application — passes as case-only variation (TTB does not regulate case for brand_name)."`

If pipeline.test.ts has any test asserting `overallStatus === 'REVIEW'` driven by a case-only mismatch on a company-name field, flip its expectation to `PASS`.

### 5. Doc updates

- `docs/specs/results-redesign.md` — append a "**Superseded — 2026-05-05:** the casing-only warning tier was reversed by `docs/specs/case-insensitive-and-address-substring.md`. Field cards no longer show yellow on case-only mismatches; they pass green. The rest of the w03 layout is unaffected." note. Don't gut the existing copy.
- `docs/specs/company-name-suffix-strip.md` — add a similar note about the casing-warning reversal.
- `docs/technical-reference.md` — update the Semantic Validator section to add `compareAddressField`, and update the `compareCompanyName` description to drop the warning tier.
- `docs/bugs.md` — add a new closed-bug entry (suggested ID **BUG-10** — case-only company-name mismatches surface as REVIEW instead of PASS) with this spec linked as resolution. Also add a note next to BUG-01's closed entry pointing forward to BUG-10's case-rule reversal so the journey is traceable.
- `docs/tracker.md` — bump test count after implementation.

### 6. README documentation block (for the agent to add to the project README)

```markdown
## Compliance interpretation — case sensitivity and address strictness

The validator is intentionally strict in some places and lenient in others, based on a reading of 27 CFR Part 5:

**Case-insensitive (label and application can use different casing):**
- Brand name, bottler/producer name, and class/type designation all pass when the only difference is letter case. TTB does not mandate exact case match for these fields; the only mandatory case rule is the `GOVERNMENT WARNING:` prefix (27 CFR 16.21), which the system enforces.

**Application address as a substring of label address passes:**
- If the agent submits `"Port Ellen, Isle of Islay"` and the label shows `"PORT ELLEN, ISLE OF ISLAY PA42 7DZ, SCOTLAND"`, the system passes the field. The label is fully compliant; the application is just less detailed. This pattern is common for foreign products where the label adds postal code and country.

**Class/type designation must match the label exactly (in substance, not case):**
- If the agent submits `"Scotch Whisky"` but the label shows `"Islay Single Malt Scotch Whisky"`, the system fails the field. The label has a more specific designation (which is itself compliant), but the application has not captured what the label actually says. The agent must transcribe the label's full class designation. This is enforced because an incomplete application is a compliance miss under 27 CFR 5.36 (name and address; class designation is required as printed). The system intentionally surfaces this as `fail` so the agent corrects the application before submission.

**Government warning is statutorily exact:**
- See `docs/specs/govwarn-100pct-threshold.md` for the three-tier distance model. Body casing is folded (per BUG-09); wording deviations route to warning or fail by character distance.
```

## Acceptance criteria

- [ ] `compareCompanyName` returns `'pass' | 'fail'` only — no `'warning'` member of the return union.
- [ ] `compareAddressField` exists in `lib/validators/semantic.ts` and is wired at the bottler_address call site in `spirits.ts`.
- [ ] All `compareCompanyName` casing tests pass with `status === 'pass'` (formerly `'warning'`); the wireframe-note test is removed.
- [ ] New `compareAddressField` tests cover exact match, application-substring-of-label, casing variant, similarity fallback, and both null guards.
- [ ] `brand-name-case-mismatch.json` fixture's expected status updates to `PASS`.
- [ ] No pipeline test still asserts `REVIEW` driven by a case-only mismatch on a company-name field.
- [ ] BUG-01 strict-match invariant preserved: shared-suffix mismatches, OCR truncation, typos all still hard-fail.
- [ ] `npm test` and `npm run build` both green.
- [ ] Live smoke check: a label with case-only differences on brand/bottler returns `overallStatus: 'PASS'`; a label with `"Port Ellen, Isle of Islay"` submitted vs `"PORT ELLEN, ISLE OF ISLAY PA42 7DZ, SCOTLAND"` extracted returns `bottler_address: 'pass'`; a label with `"Scotch Whisky"` submitted vs `"Islay Single Malt Scotch Whisky"` extracted still returns `class_type: 'fail'` (no change).

## Evals

Land alongside the implementation in the same change.

**`compareCompanyName` (renamed/flipped from results-redesign casing block):**
- `passes on case-only difference` — `"OLD TOM DISTILLERY"` vs `"Old Tom Distillery"` → pass.
- `passes on case-difference combined with extra whitespace` — `"OLD CYPRESS  DISTILLERY"` vs `"Old Cypress Distillery"` → pass.
- All BUG-01 invariant tests retained: shared-suffix mismatch → fail, OCR truncation → fail, suffix typo → fail, core-name typo → fail, real-text mismatch → fail.

**`compareAddressField` (new):**
- `passes on exact address match`.
- `passes when application is a substring of label (case-insensitive)` — case 5 in the conversation; assert pass + the additional-detail note.
- `passes when application is a casing variant of label`.
- `falls back to similarity tier on partial-overlap`.
- `fails when extracted is null`.
- `fails when submitted is null`.

**Pipeline:**
- Update `brand-name-case-mismatch.json` (see above).
- Optional: add a new fixture for the address substring case (e.g., `bottler-address-substring.json`) so end-to-end coverage exists.

**Class/type non-change documentation:**
- The existing `compareTextField` test for class/type subset behavior already fails — no test changes required, but the README note above documents the choice.

## Open questions

- **Reverse-direction address subset** (label ⊆ application): out of scope here; can be added if real evals surface it.
- **Class/type subset acceptance:** this spec deliberately keeps strict matching for class/type, treating subset cases as `fail`. If the user wants to soften this later (e.g., to `warning` with a note "label has a more specific designation"), it's a separate follow-up.

## Notes

- The casing-only warning rule shipped in `docs/specs/results-redesign.md` was a UX-led choice, not a compliance-led one. This spec corrects that by aligning with the regulatory reading. The visual treatment of REVIEW cards in the w03 layout still applies whenever a real warning fires (e.g., on `bottler_address` similarity-band cases or on `government_warning` distance-band cases).
- BUG-01's strict-match property is preserved: the only widening here is `'warning' → 'pass'` for the casing-only case. Real text mismatches still hard-fail.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
